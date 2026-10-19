'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const { TaskStore } = require('../src/core/taskStore');
const { WorktreeManager } = require('../src/core/worktreeManager');

function stateContext() {
  const data = new Map();
  return {
    workspaceState: {
      get(key, fallback) { return data.has(key) ? data.get(key) : fallback; },
      async update(key, value) { data.set(key, JSON.parse(JSON.stringify(value))); }
    }
  };
}

function git(root, ...args) {
  return childProcess.execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function initRepo(root) {
  git(root, 'init');
  git(root, 'config', 'user.email', 'ai-coder-test@example.invalid');
  git(root, 'config', 'user.name', 'AI-CODER Test');
  fs.writeFileSync(path.join(root, 'a.txt'), 'base\n');
  git(root, 'add', 'a.txt');
  git(root, 'commit', '-m', 'base');
}

test('TaskStore persists task-local messages and serializes concurrent mutations', async () => {
  const context = stateContext();
  const store = new TaskStore(context);
  const task = await store.create('Concurrent task');
  await Promise.all(Array.from({ length: 20 }, (_, i) => store.addMessage(task.id, 'user', `message-${i}`)));
  const loaded = store.get(task.id);
  assert.equal(loaded.messages.length, 20);
  assert.deepEqual(new Set(loaded.messages.map(x => x.content)), new Set(Array.from({ length: 20 }, (_, i) => `message-${i}`)));
  assert.equal(store.activeId(), task.id);

  await store.patchRecovery(task.id, { status: 'review', pendingChanges: { 'a.txt': { before: 'a', after: 'b' } } });
  const reopened = new TaskStore(context);
  assert.equal(reopened.get(task.id).status, 'review');
  assert.equal(reopened.get(task.id).pendingChanges['a.txt'].after, 'b');
});

test('WorktreeManager creates isolated task worktree and detects main-project divergence', { skip: !process.env.PATH }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-js-git-'));
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-js-storage-'));
  try {
    initRepo(root);
    const manager = new WorktreeManager(root, storage);
    const info = manager.ensure('12345678-abcdef');
    assert.equal(info.enabled, true, info.reason || 'worktree should be enabled');
    assert.ok(fs.existsSync(path.join(info.path, 'a.txt')));
    fs.writeFileSync(path.join(info.path, 'a.txt'), 'task-change\n');
    assert.deepEqual([...manager.changedPaths(info.path)], ['a.txt']);
    assert.deepEqual(manager.conflictingPaths(info.baseCommit, ['a.txt']), []);

    fs.writeFileSync(path.join(root, 'a.txt'), 'main-change\n');
    assert.deepEqual(manager.conflictingPaths(info.baseCommit, ['a.txt']), ['a.txt']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(storage, { recursive: true, force: true });
  }
});

test('WorktreeManager declines non-Git projects without pretending isolation exists', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-js-nongit-'));
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-js-storage-'));
  try {
    const manager = new WorktreeManager(root, storage);
    const info = manager.ensure('deadbeef-task');
    assert.equal(info.enabled, false);
    assert.match(info.reason, /not a Git repository/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(storage, { recursive: true, force: true });
  }
});

test('task main conflict check permits repeated AI-CODER applies but blocks later external edits', () => {
  const { taskMainConflicts } = require('../src/core/taskWorktreeState');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-js-repeat-main-'));
  try {
    fs.writeFileSync(path.join(root, 'a.txt'), 'after-one');
    const record = {
      worktree: { baseCommit: 'base' },
      appliedWorktreeChanges: { 'a.txt': { before: 'before', after: 'after-one' } }
    };
    const manager = { conflictingPaths: (_base, paths) => paths.includes('a.txt') ? ['a.txt'] : [] };
    const mainFolder = { uri: { scheme: 'file', fsPath: root } };
    assert.deepEqual(taskMainConflicts(record, manager, ['a.txt'], mainFolder), []);
    fs.writeFileSync(path.join(root, 'a.txt'), 'external-edit');
    assert.deepEqual(taskMainConflicts(record, manager, ['a.txt'], mainFolder), ['a.txt']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('reviewed worktree state rejects pending or worktree changes while diff is open', () => {
  const { reviewedWorktreeStateMatches } = require('../src/core/taskWorktreeState');
  const reviewedWorktree = { enabled: true, path: '/tmp/task', branch: 'ai-coder/task', baseCommit: 'abc123' };
  const pending = { 'a.txt': { before: 'one', after: 'two' } };
  const record = { worktree: { ...reviewedWorktree }, pendingChanges: JSON.parse(JSON.stringify(pending)) };
  assert.equal(reviewedWorktreeStateMatches(record, reviewedWorktree, pending), true);

  record.pendingChanges['b.txt'] = { before: null, after: 'new' };
  assert.equal(reviewedWorktreeStateMatches(record, reviewedWorktree, pending), false);
  delete record.pendingChanges['b.txt'];
  record.worktree.baseCommit = 'different';
  assert.equal(reviewedWorktreeStateMatches(record, reviewedWorktree, pending), false);
});

test('TaskStore migrates workspaceState tasks to durable project-local storage', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-js-durable-task-'));
  try {
    const folder = { uri: { scheme: 'file', fsPath: root } };
    const legacy = stateContext();
    await legacy.workspaceState.update('aiCoder.tasks.v1', [{
      id: 'legacy_task_1', title: 'Legacy task', status: 'ready', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      messages: [{ role: 'user', text: 'legacy text' }], execution: {}, worktree: {}, pendingChanges: {}, appliedWorktreeChanges: {}, actionHistory: []
    }]);
    await legacy.workspaceState.update('aiCoder.activeTask.v1', 'legacy_task_1');
    const store = new TaskStore(legacy, { folderProvider: () => folder });
    const migrated = await store.ensureDefault();
    assert.equal(migrated.messages[0].content, 'legacy text');
    assert.equal(store.activeId(), 'legacy_task_1');

    const freshContext = stateContext();
    const reopened = new TaskStore(freshContext, { folderProvider: () => folder });
    assert.equal(reopened.get('legacy_task_1').title, 'Legacy task');
    assert.equal(reopened.get('legacy_task_1').messages[0].content, 'legacy text');
    assert.equal(reopened.activeId(), 'legacy_task_1');
    assert.ok(fs.existsSync(path.join(root, '.ai-coder', 'code-oss', 'tasks', 'legacy_task_1.json')));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
