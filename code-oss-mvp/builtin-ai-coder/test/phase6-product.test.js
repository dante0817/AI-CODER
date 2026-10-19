'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const { CodexCliProvider, resolveCodexCommand } = require('../src/core/codexCliProvider');
const { manualOnlyProviderEligible } = require('../src/core/providerPolicy');
const { AGENT_OUTPUT_SCHEMA } = require('../src/core/agentEngine');
const { ModelCatalogCache, cacheKey } = require('../src/core/modelCatalogCache');
const { rankWorkspaceCandidates, collectSemanticReferencePaths } = require('../src/core/contextEngine');
const { TaskStore } = require('../src/core/taskStore');

const SPEC = path.resolve(__dirname, '..', '..', '..', 'spec', 'behavior');
function load(name) { return JSON.parse(fs.readFileSync(path.join(SPEC, name), 'utf8')); }

function fakeSpawnFactory(invocations) {
  return (exe, args, opts) => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    let input = '';
    child.stdin.on('data', chunk => { input += String(chunk); });
    child.kill = () => {};
    invocations.push({ exe, args: [...args], opts, get input() { return input; } });
    process.nextTick(() => {
      if (args[0] === '--version') child.stdout.write('codex-cli 0.test\n');
      else if (args[0] === 'login' && args[1] === 'status') child.stdout.write('Logged in using ChatGPT\n');
      else child.stdout.write('Codex final response\n');
      child.stdout.end(); child.stderr.end(); child.emit('close', 0);
    });
    return child;
  };
}

function stateContext() {
  const data = new Map();
  return { workspaceState: { get(k, f) { return data.has(k) ? data.get(k) : f; }, async update(k, v) { data.set(k, JSON.parse(JSON.stringify(v))); } } };
}

test('Codex CLI provider uses ChatGPT login status and sends authorized context over stdin', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-codex-provider-'));
  try {
    const calls = [];
    const provider = new CodexCliProvider({
      runtimeDir: root, spawn: fakeSpawnFactory(calls),
      env: { PATH: process.env.PATH || '', HOME: process.env.HOME || root, AI_CODER_API_KEY: 'do-not-leak', SECRET_TOKEN: 'also-do-not-leak' }
    });
    const status = await provider.status();
    assert.equal(status.installed, true);
    assert.equal(status.connected, true);
    const response = await provider.chat({ model: 'codex-default', effort: 'extra-high', outputSchema: AGENT_OUTPUT_SCHEMA, messages: [
      { role: 'system', content: 'AUTHORIZED PROJECT CONTEXT:\nsecret-ish project text' },
      { role: 'user', content: 'Review it.' }
    ] });
    assert.equal(response.text, 'Codex final response');
    const run = calls.find(x => x.args[0] === 'exec');
    assert.ok(run, 'codex exec should be invoked');
    assert.ok(run.args.includes('--ephemeral'));
    assert.ok(run.args.includes('--ignore-user-config'));
    assert.ok(run.args.includes('--ignore-rules'));
    assert.ok(run.args.includes('read-only'));
    assert.equal(run.args.at(-1), '-');
    assert.ok(run.args.some(x => String(x).includes('model_reasoning_effort="xhigh"')));
    const schemaFlag = run.args.indexOf('--output-schema');
    assert.ok(schemaFlag >= 0, 'Agent mode should constrain Codex with an output schema');
    const schemaPath = run.args[schemaFlag + 1];
    assert.equal(path.dirname(schemaPath), root);
    assert.deepEqual(JSON.parse(fs.readFileSync(schemaPath, 'utf8')), AGENT_OUTPUT_SCHEMA);
    assert.ok(!run.args.join(' ').includes('secret-ish project text'), 'project context must not appear in argv');
    assert.match(run.input, /secret-ish project text/);
    assert.equal(run.opts.env.AI_CODER_API_KEY, undefined);
    assert.equal(run.opts.env.SECRET_TOKEN, undefined);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});



test('Windows Codex resolution avoids spawning npm .cmd wrappers directly', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-codex-win-'));
  try {
    const wrapper = path.join(root, 'codex.cmd');
    const script = path.join(root, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.writeFileSync(wrapper, '@echo off\r\n');
    fs.writeFileSync(script, '// official npm wrapper entry placeholder\n');
    const resolved = resolveCodexCommand({ executable: wrapper, platform: 'win32', env: {} });
    assert.equal(resolved.executable, process.execPath);
    assert.deepEqual(resolved.prefixArgs, [script]);
    assert.equal(resolved.source, 'npm-wrapper');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('provider catalog cache is bounded by TTL and preserves snapshot evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-catalog-cache-'));
  try {
    let now = 1000;
    const cache = new ModelCatalogCache(root, { ttlMs: 100, now: () => now });
    const key = cacheKey({ provider: 'auto', baseUrl: 'openai=x', codexConnected: true });
    const snapshot = { models: [{ provider: 'x', modelId: 'm', capabilityStates: { structuredOutput: 'unknown' }, capabilitySources: { structuredOutput: 'provider-catalog-id' } }], providers: [{ provider: 'x', reachable: true, models: ['m'] }] };
    cache.put(key, snapshot);
    assert.equal(cache.get(key).snapshot.models[0].capabilitySources.structuredOutput, 'provider-catalog-id');
    now += 101;
    assert.equal(cache.get(key), null);
    assert.equal(cache.get(key, { allowStale: true }).stale, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('shared context ranking v3 semantic vectors', () => {
  for (const c of load('context-ranking-v3.json').cases) {
    const ranked = rankWorkspaceCandidates(c.paths, {
      activeRel: c.activeRel, activeText: c.activeText, taskText: c.taskText,
      modifiedPaths: new Set(c.modifiedPaths), symbolHits: c.symbolHits || {}, semanticPaths: new Set(c.semanticPaths || [])
    });
    assert.deepEqual(ranked.map(x => x.path), c.expectedOrder, c.name);
    const byPath = new Map(ranked.map(x => [x.path, x]));
    for (const [rel, reason] of Object.entries(c.expectedReasons || {})) assert.equal(byPath.get(rel).reasons[0], reason, `${c.name}: ${rel}`);
  }
});

test('LSP/reference collector turns language-service locations into safe relative context hints', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-lsp-context-'));
  try {
    fs.mkdirSync(path.join(root, 'src')); fs.mkdirSync(path.join(root, 'lib'));
    fs.writeFileSync(path.join(root, 'src', 'main.ts'), 'function runSession() {}\n');
    fs.writeFileSync(path.join(root, 'lib', 'session.ts'), 'export class Session {}\n');
    const uri = { scheme: 'file', fsPath: path.join(root, 'src', 'main.ts') };
    const range = { start: { line: 0, character: 9 }, contains: () => true };
    const vscode = { commands: { async executeCommand(name) {
      if (name === 'vscode.executeDocumentSymbolProvider') return [{ name: 'runSession', range, selectionRange: range, children: [] }];
      if (name === 'vscode.executeReferenceProvider') return [{ uri: { scheme: 'file', fsPath: path.join(root, 'lib', 'session.ts') } }];
      return [];
    } } };
    const editor = { document: { uri }, selection: { active: range.start, start: range.start } };
    const refs = await collectSemanticReferencePaths(vscode, editor, { uri: { scheme: 'file', fsPath: root } });
    assert.deepEqual([...refs], ['lib/session.ts']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('durable TaskStore serializes high-contention multi-task mutations', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-task-concurrency-'));
  try {
    const folder = { uri: { scheme: 'file', fsPath: root } };
    const store = new TaskStore(stateContext(), { folderProvider: () => folder });
    const tasks = await Promise.all(Array.from({ length: 6 }, (_, i) => store.create(`Task ${i}`)));
    await Promise.all(tasks.flatMap(task => Array.from({ length: 30 }, () => store.mutate(task.id, record => {
      record.execution.counter = Number(record.execution.counter || 0) + 1;
      return record;
    }))));
    for (const task of tasks) assert.equal(store.get(task.id).execution.counter, 30, task.id);
    const reopened = new TaskStore(stateContext(), { folderProvider: () => folder });
    assert.equal(reopened.list().length, 6);
    for (const task of tasks) assert.equal(reopened.get(task.id).execution.counter, 30, `reopened ${task.id}`);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});


test('shared manual-only provider policy keeps Codex out of Auto routing', () => {
  for (const c of load('provider-policy-v1.json').cases) {
    assert.equal(manualOnlyProviderEligible(c.requestedProvider, c.providerName, c.connected), c.eligible, c.name);
  }
});
