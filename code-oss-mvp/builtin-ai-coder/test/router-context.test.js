'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ModelRegistry } = require('../src/core/modelRegistry');
const { selectExecutionProfile } = require('../src/core/router');
const { buildContext } = require('../src/core/contextEngine');

function folder(dir) { return { uri: { scheme: 'file', fsPath: dir } }; }

test('auto routing filters providers by verified availability', () => {
  const profile = selectExecutionProfile({
    text: 'Explain this module',
    provider: 'auto',
    model: 'auto',
    registry: new ModelRegistry(),
    availableProviders: new Set(['ollama'])
  });
  assert.equal(profile.provider, 'ollama');
});

test('manual unknown model does not receive invented capabilities', () => {
  const profile = selectExecutionProfile({
    text: 'Explain this module',
    provider: 'openai-compatible',
    model: 'future-model-not-in-registry',
    registry: new ModelRegistry()
  });
  assert.equal(profile.model, 'future-model-not-in-registry');
  assert.equal(profile.capabilitySource, 'unverified-manual');
  assert.deepEqual(profile.capabilities, { tools: false, reasoning: false, images: false, structuredOutput: false });
});

test('context builder emits real manifest entries for selection and active file', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-context-manifest-'));
  try {
    const file = path.join(root, 'main.js');
    fs.writeFileSync(file, 'const answer = 42;\n');
    const uri = { scheme: 'file', fsPath: file };
    const mock = {
      window: {
        activeTextEditor: {
          document: { uri, isDirty: false, getText: () => 'const answer = 42;\n' },
          selection: { isEmpty: false }
        }
      },
      workspace: {
        workspaceFolders: [folder(root)],
        getWorkspaceFolder: () => folder(root),
        asRelativePath: () => 'main.js',
        findFiles: async () => []
      }
    };
    mock.window.activeTextEditor.document.getText = sel => sel ? 'answer' : 'const answer = 42;\n';
    const result = await buildContext(mock, { maxChars: 1000, includeWorkspace: false });
    assert.equal(result.items[0].reason, 'selected-text');
    assert.equal(result.items[1].reason, 'active-file');
    assert.ok(result.chars > 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('context builder reads active file from isolated execution folder when supplied', async () => {
  const main = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-context-main-'));
  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-context-worktree-'));
  try {
    const mainFile = path.join(main, 'main.js');
    fs.writeFileSync(mainFile, 'main-version\n');
    fs.writeFileSync(path.join(worktree, 'main.js'), 'worktree-version\n');
    const uri = { scheme: 'file', fsPath: mainFile };
    const mainFolder = folder(main);
    const execFolder = folder(worktree);
    const mock = {
      window: { activeTextEditor: { document: { uri, isDirty: false, getText: () => 'main-version\n' }, selection: { isEmpty: true } } },
      workspace: {
        workspaceFolders: [mainFolder],
        getWorkspaceFolder: () => mainFolder,
        asRelativePath: () => 'main.js',
        findFiles: async () => []
      }
    };
    const result = await buildContext(mock, { maxChars: 1000, executionFolder: execFolder, projectFolder: mainFolder });
    assert.match(result.text, /worktree-version/);
    assert.doesNotMatch(result.text, /main-version/);
    assert.equal(result.items.find(x => x.source === 'main.js').reason, 'active-file-worktree');
  } finally {
    fs.rmSync(main, { recursive: true, force: true });
    fs.rmSync(worktree, { recursive: true, force: true });
  }
});

test('smart context clips an oversized active file and still includes ranked dependencies', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-context-ranked-'));
  try {
    fs.mkdirSync(path.join(root, 'src'));
    const mainFile = path.join(root, 'src', 'session.js');
    fs.writeFileSync(mainFile, "import { token } from '../token-helper';\n" + 'const x = 1;\n'.repeat(12000));
    fs.writeFileSync(path.join(root, 'token-helper.js'), 'export const token = 1;\n');
    fs.writeFileSync(path.join(root, 'unrelated.js'), 'export const other = 1;\n');
    const uri = { scheme: 'file', fsPath: mainFile };
    const rootFolder = folder(root);
    const files = ['src/session.js', 'token-helper.js', 'unrelated.js'];
    const mock = {
      window: { activeTextEditor: { document: { uri, isDirty: false, getText: () => fs.readFileSync(mainFile, 'utf8') }, selection: { isEmpty: true } } },
      workspace: {
        workspaceFolders: [rootFolder],
        getWorkspaceFolder: () => rootFolder,
        asRelativePath: target => path.relative(root, target.fsPath || target).replace(/\\/g, '/'),
        findFiles: async () => files.map(rel => ({ scheme: 'file', fsPath: path.join(root, rel) }))
      }
    };
    const result = await buildContext(mock, { maxChars: 12000, includeWorkspace: true, taskText: 'fix session token bug' });
    assert.ok(result.chars <= 12000);
    const active = result.items.find(x => x.reason === 'active-file');
    assert.equal(active.truncated, true);
    const dep = result.items.find(x => x.source === 'token-helper.js');
    assert.ok(dep);
    assert.equal(dep.reason, 'direct-dependency');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
