'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { CrossProcessProjectLock } = require('../src/core/crossProcessLock');
const { TaskStore } = require('../src/core/taskStore');
const { ActivityStore } = require('../src/core/activityStore');
const { rankWorkspaceCandidates, collectWorkspaceSymbolHits } = require('../src/core/contextEngine');
const { normalizeCapabilityRecord, normalizeOllamaCapabilities, mapReasoningEffort } = require('../src/core/providerContract');

const SPEC = path.resolve(__dirname, '..', '..', '..', 'spec', 'behavior');
function load(name) { return JSON.parse(fs.readFileSync(path.join(SPEC, name), 'utf8')); }
function stateContext() {
  const data = new Map();
  return { workspaceState: { get(k, f) { return data.has(k) ? data.get(k) : f; }, async update(k, v) { data.set(k, JSON.parse(JSON.stringify(v))); } } };
}

function runNode(code, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = cp.spawn(process.execPath, ['-e', code, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', x => { stdout += String(x); });
    child.stderr.on('data', x => { stderr += String(x); });
    child.on('error', reject);
    child.on('close', codeValue => codeValue === 0 ? resolve(stdout) : reject(new Error(`child failed ${codeValue}: ${stderr}`)));
  });
}

test('shared provider normalization vectors match Python semantics', () => {
  const spec = load('provider-normalization-v1.json');
  const canonical = value => Object.fromEntries(Object.entries(value).map(([k,v]) => [k === 'structuredOutput' ? 'structured_output' : k, v]));
  for (const c of spec.capabilityCases) assert.deepEqual(canonical(normalizeCapabilityRecord(c.raw)), c.expected, c.name);
  for (const c of spec.ollamaCases) assert.deepEqual(canonical(normalizeOllamaCapabilities(c.raw)), c.expected, c.name);
  for (const c of spec.effortCases) assert.equal(mapReasoningEffort(c.effort, c.baseUrl), c.expected, c.name);
});

test('shared context ranking v4 workspace-symbol vectors', () => {
  for (const c of load('context-ranking-v4.json').cases) {
    const ranked = rankWorkspaceCandidates(c.paths, {
      activeRel: c.activeRel, activeText: c.activeText, taskText: c.taskText,
      modifiedPaths: new Set(c.modifiedPaths), symbolHits: c.symbolHits || {},
      semanticPaths: new Set(c.semanticPaths || []), workspaceSymbolHits: c.workspaceSymbolHits || {}
    });
    assert.deepEqual(ranked.map(x => x.path), c.expectedOrder, c.name);
    const byPath = new Map(ranked.map(x => [x.path, x]));
    for (const [rel, reason] of Object.entries(c.expectedReasons || {})) assert.equal(byPath.get(rel).reasons[0], reason, `${c.name}: ${rel}`);
  }
});

test('workspace symbol collector converts bounded language-service results into safe path hit counts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-workspace-symbols-'));
  try {
    fs.mkdirSync(path.join(root, 'lib')); fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'lib', 'session.ts'), 'export class SessionManager {}\n');
    fs.writeFileSync(path.join(root, 'src', 'other.ts'), 'export const other = 1;\n');
    const calls = [];
    const vscode = { commands: { async executeCommand(name, query) {
      calls.push([name, query]);
      if (name !== 'vscode.executeWorkspaceSymbolProvider') return [];
      return [
        { name: 'SessionManager', location: { uri: { scheme: 'file', fsPath: path.join(root, 'lib', 'session.ts') } } },
        { name: 'outside', location: { uri: { scheme: 'file', fsPath: path.join(root, '..', 'outside.ts') } } }
      ];
    } } };
    const hits = await collectWorkspaceSymbolHits(vscode, { uri: { scheme: 'file', fsPath: root } }, {
      activeText: 'class SessionManager {}', taskText: 'Fix SessionManager', selection: '', maxQueries: 2, maxResults: 10
    });
    assert.equal(hits['lib/session.ts'] >= 1, true);
    assert.equal(Object.keys(hits).some(x => x.includes('outside')), false);
    assert.equal(calls.every(x => x[0] === 'vscode.executeWorkspaceSymbolProvider'), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('cross-process project lock prevents lost TaskStore updates across two Node processes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-xproc-state-'));
  const lockRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-xproc-lock-'));
  try {
    const folder = { uri: { scheme: 'file', fsPath: root } };
    const projectLock = new CrossProcessProjectLock(() => folder, lockRoot, { timeoutMs: 15000, retryMs: 5 });
    const parentStore = new TaskStore(stateContext(), { folderProvider: () => folder, projectLock });
    const task = await parentStore.create('Cross process');
    const taskStorePath = path.resolve(__dirname, '../src/core/taskStore.js');
    const lockPath = path.resolve(__dirname, '../src/core/crossProcessLock.js');
    const code = String.raw`
      const { TaskStore } = require(process.argv[1]);
      const { CrossProcessProjectLock } = require(process.argv[2]);
      const root = process.argv[3], lockRoot = process.argv[4], taskId = process.argv[5];
      const folder = { uri: { scheme: 'file', fsPath: root } };
      const data = new Map();
      const context = { workspaceState: { get(k,f){ return data.has(k) ? data.get(k) : f; }, async update(k,v){ data.set(k, JSON.parse(JSON.stringify(v))); } } };
      const lock = new CrossProcessProjectLock(() => folder, lockRoot, { timeoutMs: 15000, retryMs: 5 });
      const store = new TaskStore(context, { folderProvider: () => folder, projectLock: lock });
      (async () => { for (let i=0;i<35;i++) await store.mutate(taskId, r => { r.execution.counter = Number(r.execution.counter || 0) + 1; return r; }); })()
        .then(() => process.exit(0)).catch(e => { console.error(e && e.stack || e); process.exit(1); });
    `;
    await Promise.all([
      runNode(code, [taskStorePath, lockPath, root, lockRoot, task.id], __dirname),
      runNode(code, [taskStorePath, lockPath, root, lockRoot, task.id], __dirname)
    ]);
    const reopened = new TaskStore(stateContext(), { folderProvider: () => folder, projectLock });
    assert.equal(reopened.get(task.id).execution.counter, 70);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(lockRoot, { recursive: true, force: true });
  }
});

test('durable ActivityStore preserves concurrent records through the shared project lock', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-activity-state-'));
  const lockRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-activity-lock-'));
  try {
    const folder = { uri: { scheme: 'file', fsPath: root } };
    const lock = new CrossProcessProjectLock(() => folder, lockRoot, { retryMs: 5 });
    const store = new ActivityStore(stateContext(), { folderProvider: () => folder, projectLock: lock });
    await Promise.all(Array.from({ length: 40 }, (_, i) => store.add({ action: 'test', seq: i })));
    const reopened = new ActivityStore(stateContext(), { folderProvider: () => folder, projectLock: lock });
    assert.equal(reopened.list().length, 40);
    assert.equal(new Set(reopened.list().map(x => x.seq)).size, 40);
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(lockRoot, { recursive: true, force: true }); }
});

test('runtime qualification report distinguishes pinned branded builds from development runs', () => {
  const { buildRuntimeQualificationReport } = require('../src/core/runtimeQualification');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-runtime-report-'));
  try {
    const extensionPath = path.join(root, 'extensions', 'ai-coder');
    fs.mkdirSync(path.join(extensionPath, 'native'), { recursive: true });
    fs.writeFileSync(path.join(extensionPath, 'package.json'), JSON.stringify({ version: '0.5.6' }));
    fs.writeFileSync(path.join(extensionPath, 'native', 'windows-safeio.exe'), Buffer.from('helper'));
    fs.writeFileSync(path.join(root, 'AI-CODER-UPSTREAM.json'), JSON.stringify({ aiCoderVersion: '0.5.6', resolvedCommit: 'abc123' }));
    const folder = { uri: { scheme: 'file', fsPath: root } };
    const vscode = { env: { appRoot: root, appName: 'AI-CODER' }, workspace: { workspaceFolders: [folder], isTrusted: true } };
    const report = buildRuntimeQualificationReport(vscode, { extensionPath }, {
      projectStateLock: {}, taskExecutionLease: {}, runtimeRoot: path.join(root, 'runtime'), tasks: { collection: { available: () => true } },
      checkpoints: { collection: { available: () => true } }, activity: { available: () => true }
    });
    assert.equal(report.runtime.brandedPinnedBuild, true);
    assert.equal(report.workspace.crossProcessProjectStateLock, true);
    assert.equal(report.workspace.durableActivity, true);
    assert.equal(report.qualification.sourceCandidate, true);
    assert.equal(report.qualification.candidate, true);
    assert.deepEqual(report.qualification.warnings, []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
