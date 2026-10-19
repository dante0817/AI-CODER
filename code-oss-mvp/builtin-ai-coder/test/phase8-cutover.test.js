'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { canTransition, isTransientState, normalizeTaskStatus } = require('../src/core/taskLifecycle');
const { TaskExecutionLease } = require('../src/core/taskExecutionLease');
const { userRuntimeRoot } = require('../src/core/runtimePaths');
const { requireSingleLocalWorkspace } = require('../src/core/workspaceScope');

const SPEC = path.resolve(__dirname, '..', '..', '..', 'spec', 'behavior');
function load(name) { return JSON.parse(fs.readFileSync(path.join(SPEC, name), 'utf8')); }

function runNode(code, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = cp.spawn(process.execPath, ['-e', code, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', x => { stdout += String(x); }); child.stderr.on('data', x => { stderr += String(x); });
    child.on('error', reject); child.on('close', c => c === 0 ? resolve(stdout) : reject(new Error(`child failed ${c}: ${stderr}`)));
  });
}

test('shared task lifecycle vectors match the Python reference contract', () => {
  const spec = load('task-lifecycle-v1.json');
  for (const c of spec.cases) assert.equal(canTransition(c.from, c.to), c.allowed, c.name);
  for (const s of spec.transientStates) assert.equal(isTransientState(s), true, s);
  assert.equal(normalizeTaskStatus('unknown-old-status'), 'recovery_required');
});

test('TaskExecutionLease prevents the same task executing in two processes', async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-lease-project-'));
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-lease-runtime-'));
  const readyFile = path.join(runtime, 'ready');
  const releaseFile = path.join(runtime, 'release');
  try {
    const modulePath = path.resolve(__dirname, '../src/core/taskExecutionLease.js');
    const code = String.raw`
      const fs = require('fs');
      const { TaskExecutionLease } = require(process.argv[1]);
      const project = process.argv[2], runtime = process.argv[3], ready = process.argv[4], release = process.argv[5];
      const folder = { uri: { scheme: 'file', fsPath: project } };
      const lease = new TaskExecutionLease(() => folder, runtime).acquire('task-one', { mode: 'agent' });
      fs.writeFileSync(ready, '1');
      const timer = setInterval(() => { if (fs.existsSync(release)) { clearInterval(timer); lease.release(); process.exit(0); } }, 10);
    `;
    const child = cp.spawn(process.execPath, ['-e', code, modulePath, project, runtime, readyFile, releaseFile], { stdio: ['ignore','pipe','pipe'] });
    for (let i = 0; i < 200 && !fs.existsSync(readyFile); i++) await new Promise(r => setTimeout(r, 10));
    assert.equal(fs.existsSync(readyFile), true, 'child should own the task lease');
    const folder = { uri: { scheme: 'file', fsPath: project } };
    const second = new TaskExecutionLease(() => folder, runtime);
    assert.throws(() => second.acquire('task-one', { mode: 'undo' }), /already executing/i);
    fs.writeFileSync(releaseFile, '1');
    await new Promise((resolve, reject) => { child.once('close', c => c === 0 ? resolve() : reject(new Error(`lease child exited ${c}`))); });
    const reacquired = second.acquire('task-one', { mode: 'agent' });
    assert.equal(reacquired.record.taskId, 'task-one');
    reacquired.release();
  } finally { fs.rmSync(project, { recursive: true, force: true }); fs.rmSync(runtime, { recursive: true, force: true }); }
});

test('abandoned task execution lease is recognized and can be cleared', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-abandoned-project-'));
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-abandoned-runtime-'));
  try {
    const folder = { uri: { scheme: 'file', fsPath: project } };
    const lease = new TaskExecutionLease(() => folder, runtime, { alive: () => false });
    const held = lease.acquire('task-abandoned');
    // Simulate a dead owner without calling release; the custom alive probe now reports dead.
    const state = lease.inspect('task-abandoned');
    assert.equal(state.abandoned, true);
    assert.equal(lease.clearAbandoned('task-abandoned'), true);
    // release is token-safe and harmless after stale cleanup.
    assert.equal(held.release(), false);
  } finally { fs.rmSync(project, { recursive: true, force: true }); fs.rmSync(runtime, { recursive: true, force: true }); }
});

test('user runtime root is stable across profiles and not extension-global storage', () => {
  const root = userRuntimeRoot({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\Test\\AppData\\Local' }, home: 'C:\\Users\\Test' });
  assert.equal(root.replaceAll('\\','/'), 'C:/Users/Test/AppData/Local/AI-CODER/runtime');
});

test('workspace scope fails closed for multi-root, remote, and untrusted mutation', () => {
  const local = { uri: { scheme: 'file', fsPath: '/tmp/project' } };
  assert.equal(requireSingleLocalWorkspace({ workspace: { workspaceFolders: [local], isTrusted: true } }, { requireTrusted: true }), local);
  assert.throws(() => requireSingleLocalWorkspace({ workspace: { workspaceFolders: [local, local], isTrusted: true } }), /exactly one workspace/i);
  assert.throws(() => requireSingleLocalWorkspace({ workspace: { workspaceFolders: [{ uri: { scheme: 'vscode-remote', fsPath: '/tmp/project' } }], isTrusted: true } }), /local file/i);
  assert.throws(() => requireSingleLocalWorkspace({ workspace: { workspaceFolders: [local], isTrusted: false } }, { requireTrusted: true }), /Trust this workspace/i);
});

test('runtime control-data gitignore protects private task state without hiding project profile', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-control-ignore-'));
  try {
    const { ensureRuntimeGitignore } = require('../src/core/controlDataPolicy');
    const folder = { uri: { scheme: 'file', fsPath: root } };
    assert.equal(ensureRuntimeGitignore(folder), true);
    const text = fs.readFileSync(path.join(root, '.ai-coder', '.gitignore'), 'utf8');
    assert.match(text, /\/code-oss\//);
    assert.match(text, /\/threads\//);
    assert.doesNotMatch(text, /project\.json/);
    assert.equal(ensureRuntimeGitignore(folder), false, 'second run should be idempotent');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('ApplicationApi validates and normalizes webview messages before they reach trusted orchestration', () => {
  const { validateInboundMessage } = require('../src/applicationApi');
  const submit = validateInboundMessage({
    type: 'submit', text: ' Fix the bug ', mode: 'Agent', routingMode: 'balanced', provider: 'auto',
    model: 'auto', effort: 'high', includeWorkspace: true, useWorktree: true, unexpected: 'discarded'
  });
  assert.equal(submit.text, 'Fix the bug'); assert.equal(submit.mode, 'agent'); assert.equal(submit.unexpected, undefined);
  assert.throws(() => validateInboundMessage({ type: 'submit', text: 'x', mode: 'shell', provider: 'auto', routingMode: 'balanced', effort: 'auto' }), /Unsupported mode/);
  assert.throws(() => validateInboundMessage({ type: 'selectTask', taskId: '../escape' }), /Invalid task id/);
  assert.throws(() => validateInboundMessage({ type: 'madeUpAction' }), /Unknown AI-CODER/);
});

test('durable indexed store reconciles a crash after record write but before index update', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-journal-put-'));
  try {
    const { IndexedProjectCollection } = require('../src/core/projectStateStore');
    const folder = { uri: { scheme: 'file', fsPath: root } };
    const crashing = new IndexedProjectCollection(() => folder, '.ai-coder/code-oss/journal-test', undefined, {
      fault(stage) { if (stage === 'afterRecord') throw new Error('simulated crash'); }
    });
    assert.throws(() => crashing.put({ id: 'task1', value: 42 }), /simulated crash/);
    const reopened = new IndexedProjectCollection(() => folder, '.ai-coder/code-oss/journal-test');
    assert.deepEqual(reopened.ids(), ['task1']);
    assert.equal(reopened.get('task1').value, 42);
    assert.equal(fs.existsSync(path.join(root, '.ai-coder', 'code-oss', 'journal-test', 'transaction.json')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('durable indexed store reconciles a crash after record removal but before index update', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-journal-remove-'));
  try {
    const { IndexedProjectCollection } = require('../src/core/projectStateStore');
    const folder = { uri: { scheme: 'file', fsPath: root } };
    const setup = new IndexedProjectCollection(() => folder, '.ai-coder/code-oss/journal-test');
    setup.put({ id: 'task1', value: 42 });
    const crashing = new IndexedProjectCollection(() => folder, '.ai-coder/code-oss/journal-test', undefined, {
      fault(stage) { if (stage === 'afterRecord') throw new Error('simulated crash'); }
    });
    assert.throws(() => crashing.remove('task1'), /simulated crash/);
    const reopened = new IndexedProjectCollection(() => folder, '.ai-coder/code-oss/journal-test');
    assert.deepEqual(reopened.ids(), []);
    assert.equal(reopened.get('task1'), null);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Windows verification resolver avoids shell wrappers for npm and project tsc', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-verify-resolve-'));
  try {
    const { resolveVerificationInvocation } = require('../src/application/verificationService');
    const node = path.join(root, 'node.exe'); fs.writeFileSync(node, '');
    const npmCli = path.join(root, 'node_modules', 'npm', 'bin', 'npm-cli.js'); fs.mkdirSync(path.dirname(npmCli), { recursive: true }); fs.writeFileSync(npmCli, '');
    const tsc = path.join(root, 'project', 'node_modules', 'typescript', 'bin', 'tsc'); fs.mkdirSync(path.dirname(tsc), { recursive: true }); fs.writeFileSync(tsc, '');
    const npm = resolveVerificationInvocation(['npm', 'test'], { platform: 'win32', execPath: node, env: {}, projectRoot: path.join(root, 'project') });
    assert.equal(npm.ok, true); assert.equal(npm.executable, node); assert.equal(npm.args[0], npmCli); assert.deepEqual(npm.args.slice(1), ['test']);
    const ts = resolveVerificationInvocation(['tsc', '--noEmit'], { platform: 'win32', execPath: node, env: {}, projectRoot: path.join(root, 'project') });
    assert.equal(ts.ok, true); assert.equal(ts.executable, node); assert.equal(ts.args[0], tsc); assert.deepEqual(ts.args.slice(1), ['--noEmit']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Windows verification resolver fails closed when trusted JS launcher is unavailable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-verify-missing-'));
  try {
    const { resolveVerificationInvocation } = require('../src/application/verificationService');
    const result = resolveVerificationInvocation(['npm', 'test'], { platform: 'win32', execPath: path.join(root, 'node.exe'), env: {}, projectRoot: root });
    assert.equal(result.ok, false); assert.match(result.reason, /launcher was not found/i);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('v0.5.6 recorded worktree is reused when it still exists', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-old-worktree-'));
  try {
    fs.writeFileSync(path.join(root, '.git'), 'gitdir: legacy');
    const { decideRecordedWorktree } = require('../src/core/worktreeMigration');
    const record = { worktree: { enabled: true, path: root, branch: 'ai-coder/legacy', baseCommit: 'abc' }, pendingChanges: { 'a.py': { after: 'x' } } };
    const decision = decideRecordedWorktree(record);
    assert.equal(decision.action, 'reuse');
    assert.equal(decision.worktree.path, root);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('missing legacy worktree with pending reviewed changes requires recovery', () => {
  const { decideRecordedWorktree } = require('../src/core/worktreeMigration');
  const record = { worktree: { enabled: true, path: path.join(os.tmpdir(), 'definitely-missing-ai-coder-worktree') }, pendingChanges: { 'a.py': { after: 'x' } } };
  const decision = decideRecordedWorktree(record, { exists: () => false });
  assert.equal(decision.action, 'recovery_required');
  assert.match(decision.reason, /pending changes/i);
});

test('missing legacy worktree without pending changes may create stable replacement', () => {
  const { decideRecordedWorktree } = require('../src/core/worktreeMigration');
  const record = { worktree: { enabled: true, path: path.join(os.tmpdir(), 'missing-ai-coder-worktree') }, pendingChanges: {} };
  const decision = decideRecordedWorktree(record, { exists: () => false });
  assert.equal(decision.action, 'create');
});

test('v0.6 opens a v0.5.6 project-local TaskStore fixture without losing messages or pending state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-v056-fixture-'));
  try {
    const base = path.join(root, '.ai-coder', 'code-oss', 'tasks');
    fs.mkdirSync(base, { recursive: true });
    fs.writeFileSync(path.join(base, 'index.json'), JSON.stringify({ formatVersion: 1, ids: ['legacy056'] }, null, 2));
    fs.writeFileSync(path.join(base, 'meta.json'), JSON.stringify({ formatVersion: 1, legacyWorkspaceStateV1: true }, null, 2));
    fs.writeFileSync(path.join(base, 'legacy056.json'), JSON.stringify({
      id: 'legacy056', title: 'v0.5.6 task', status: 'review', createdAt: '2026-09-28T00:00:00Z', updatedAt: '2026-09-28T00:00:00Z',
      messages: [{ role: 'user', text: 'old message field' }, { role: 'assistant', text: 'old answer' }],
      execution: { provider: 'ollama', model: 'legacy-model' },
      worktree: { enabled: true, path: path.join(root, 'legacy-worktree'), branch: 'ai-coder/legacy056', baseCommit: 'abc' },
      pendingChanges: { 'src/a.js': { before: 'one', after: 'two' } }, appliedWorktreeChanges: {}, actionHistory: []
    }, null, 2));
    fs.mkdirSync(path.join(root, 'legacy-worktree')); fs.writeFileSync(path.join(root, 'legacy-worktree', '.git'), 'gitdir: legacy');
    fs.writeFileSync(path.join(root, '.ai-coder', 'code-oss', 'task-state.json'), JSON.stringify({ formatVersion: 1, activeTaskId: 'legacy056' }, null, 2));

    const { TaskStore } = require('../src/core/taskStore');
    const data = new Map();
    const context = { workspaceState: { get(k, f) { return data.has(k) ? data.get(k) : f; }, async update(k, v) { data.set(k, JSON.parse(JSON.stringify(v))); } } };
    const folder = { uri: { scheme: 'file', fsPath: root } };
    const store = new TaskStore(context, { folderProvider: () => folder });
    const record = store.get('legacy056');
    assert.equal(record.formatVersion, 2);
    assert.equal(record.schemaVersion, 1);
    assert.equal(record.messages[0].content, 'old message field');
    assert.equal(record.messages[0].text, undefined);
    assert.equal(record.pendingChanges['src/a.js'].after, 'two');
    assert.equal(store.activeId(), 'legacy056');
    const { decideRecordedWorktree } = require('../src/core/worktreeMigration');
    assert.equal(decideRecordedWorktree(record).action, 'reuse');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
