'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { rankWorkspaceCandidates } = require('../src/core/contextEngine');
const { ModelRegistry, unknownModel } = require('../src/core/modelRegistry');
const { discoverModelCatalog } = require('../src/core/modelDiscovery');
const { selectExecutionProfile } = require('../src/core/router');
const { mergePendingChanges, reviewedWorktreeStateMatches, checkpointRecoveryEligible } = require('../src/core/taskWorktreeState');

const SPEC = path.resolve(__dirname, '..', '..', '..', 'spec', 'behavior');
function load(name) { return JSON.parse(fs.readFileSync(path.join(SPEC, name), 'utf8')); }

test('shared context ranking v2 symbol vectors', () => {
  for (const c of load('context-ranking-v2.json').cases) {
    const ranked = rankWorkspaceCandidates(c.paths, {
      activeRel: c.activeRel, activeText: c.activeText, taskText: c.taskText,
      modifiedPaths: new Set(c.modifiedPaths), symbolHits: c.symbolHits || {}
    });
    assert.deepEqual(ranked.map(x => x.path), c.expectedOrder, c.name);
    const byPath = new Map(ranked.map(x => [x.path, x]));
    for (const [rel, reason] of Object.entries(c.expectedReasons || {})) assert.equal(byPath.get(rel).reasons[0], reason, `${c.name}: ${rel}`);
  }
});

test('shared task-state and recovery vectors', () => {
  const spec = load('task-state-v1.json');
  for (const c of spec.mergeCases) assert.deepEqual(mergePendingChanges(c.previous, { files: c.files }), c.expected, c.name);
  for (const c of spec.reviewCases) assert.equal(reviewedWorktreeStateMatches(c.record, c.reviewedWorktree, c.reviewedPending), c.expected, c.name);
  for (const c of spec.recoveryCases) assert.equal(checkpointRecoveryEligible(c.state, { afterBytesVerified: c.afterBytesVerified }), c.expected, c.name);
});

test('model discovery preserves registry evidence and unknown capability provenance', async () => {
  const adapter = {
    async listModels() { return ['gpt-5.6-sol', 'future-coder']; },
    async capabilityMetadata(model) { return model === 'future-coder' ? { structuredOutput: 'supported' } : {}; }
  };
  const snapshot = await discoverModelCatalog(new ModelRegistry(), { 'openai-compatible': adapter });
  const models = new Map(snapshot.models.map(m => [m.modelId, m]));
  assert.equal(models.get('gpt-5.6-sol').capabilityStates.reasoning, 'supported');
  assert.equal(models.get('gpt-5.6-sol').capabilitySources.reasoning, 'registry');
  assert.equal(models.get('future-coder').capabilityStates.tools, 'unknown');
  assert.equal(models.get('future-coder').capabilitySources.tools, 'provider-catalog-id');
  assert.equal(models.get('future-coder').capabilityStates.structuredOutput, 'supported');
  assert.equal(models.get('future-coder').capabilitySources.structuredOutput, 'provider-capability-probe');
});

test('auto write rejects unknown structured output while explicit manual model stays an override', () => {
  const registry = new ModelRegistry([unknownModel('openai-compatible', 'future-coder', 'provider-catalog-id')], { includeDefaults: false });
  assert.throws(() => selectExecutionProfile({
    text: 'Fix the bug', registry, availableProviders: new Set(['openai-compatible']), provider: 'auto', model: 'auto'
  }), /structured-output/);
  const manual = selectExecutionProfile({ text: 'Fix the bug', registry: new ModelRegistry(), provider: 'openai-compatible', model: 'future-coder' });
  assert.equal(manual.capabilitySource, 'unverified-manual');
  assert.equal(manual.capabilityEvidence.structuredOutput.state, 'unknown');
});

test('smart context scans symbol references from real files', async () => {
  const os = require('os');
  const { buildContext } = require('../src/core/contextEngine');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-symbol-context-'));
  try {
    fs.mkdirSync(path.join(root, 'src')); fs.mkdirSync(path.join(root, 'lib'));
    const active = path.join(root, 'src', 'controller.js');
    fs.writeFileSync(active, 'class SessionManager {}\nclass CleanupPolicy {}\n');
    fs.writeFileSync(path.join(root, 'src', 'helper.js'), 'export function helper() { return 1; }\n');
    fs.writeFileSync(path.join(root, 'lib', 'usage.js'), 'export function use(manager /* SessionManager */, policy /* CleanupPolicy */) { return manager; }\n');
    const rootFolder = { uri: { scheme: 'file', fsPath: root } };
    const files = ['src/controller.js', 'src/helper.js', 'lib/usage.js'];
    const mock = {
      window: { activeTextEditor: { document: { uri: { scheme: 'file', fsPath: active }, isDirty: false, getText: () => fs.readFileSync(active, 'utf8') }, selection: { isEmpty: true } } },
      workspace: {
        workspaceFolders: [rootFolder], getWorkspaceFolder: () => rootFolder,
        asRelativePath: target => path.relative(root, target.fsPath || target).replace(/\\/g, '/'),
        findFiles: async () => files.map(rel => ({ scheme: 'file', fsPath: path.join(root, rel) }))
      }
    };
    const result = await buildContext(mock, { maxChars: 20000, includeWorkspace: true, taskText: 'Fix SessionManager CleanupPolicy behavior' });
    assert.equal(result.items.find(x => x.source === 'lib/usage.js').reason, 'symbol-match');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
