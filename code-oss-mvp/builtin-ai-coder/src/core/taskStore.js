'use strict';

const crypto = require('crypto');
const workspaceIo = require('./workspacePaths');
const { IndexedProjectCollection, ProjectJsonFile, clone } = require('./projectStateStore');
const { normalizeTaskStatus, assertTransition } = require('./taskLifecycle');

function normalizeMessage(message) {
  if (!message || typeof message !== 'object') return { role: 'assistant', content: String(message || '') };
  const out = { ...clone(message) };
  out.role = String(out.role || 'assistant');
  out.content = String(out.content ?? out.text ?? '');
  delete out.text;
  return out;
}

function normalizeTask(record) {
  const out = clone(record || {});
  out.formatVersion = 2;
  out.schemaVersion = 1;
  out.messages = Array.isArray(out.messages) ? out.messages.map(normalizeMessage) : [];
  out.execution = out.execution && typeof out.execution === 'object' ? out.execution : {};
  out.worktree = out.worktree && typeof out.worktree === 'object' ? out.worktree : {};
  out.pendingChanges = out.pendingChanges && typeof out.pendingChanges === 'object' ? out.pendingChanges : {};
  out.appliedWorktreeChanges = out.appliedWorktreeChanges && typeof out.appliedWorktreeChanges === 'object' ? out.appliedWorktreeChanges : {};
  out.lastChanges = Array.isArray(out.lastChanges) ? out.lastChanges : [];
  out.actionHistory = Array.isArray(out.actionHistory) ? out.actionHistory : [];
  out.verification = out.verification && typeof out.verification === 'object' ? out.verification : {};
  out.lastError = String(out.lastError || '');
  out.status = normalizeTaskStatus(out.status || 'ready');
  return out;
}

class TaskStore {
  constructor(context, {
    key = 'aiCoder.tasks.v1', activeKey = 'aiCoder.activeTask.v1', folderProvider = () => null,
    io = workspaceIo, baseDir = '.ai-coder/code-oss/tasks', projectLock = null
  } = {}) {
    this.context = context;
    this.key = key;
    this.activeKey = activeKey;
    this.folderProvider = folderProvider;
    this.collection = new IndexedProjectCollection(folderProvider, baseDir, io);
    this.meta = new ProjectJsonFile(folderProvider, '.ai-coder/code-oss/task-state.json', io);
    this._queue = Promise.resolve();
    this.projectLock = projectLock;
    this._migrateLegacyIfNeeded();
  }

  _legacyRecords() {
    const value = this.context.workspaceState.get(this.key, []);
    return Array.isArray(value) ? value.map(normalizeTask) : [];
  }

  _migrateLegacyIfNeeded() {
    if (!this.collection.available() || this.collection.migrationDone()) return;
    const existing = this.collection.list();
    if (!existing.length) {
      for (const record of this._legacyRecords()) {
        if (record.id) this.collection.put(normalizeTask(record));
      }
      const active = this.context.workspaceState.get(this.activeKey, null);
      if (active) this.meta.write({ formatVersion: 1, activeTaskId: active, migratedAt: new Date().toISOString() });
    }
    this.collection.markMigration();
  }

  _records() {
    this._migrateLegacyIfNeeded();
    if (this.collection.available()) return this.collection.list().map(normalizeTask);
    return this._legacyRecords();
  }

  list() { return this._records().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))); }
  get(id) {
    this._migrateLegacyIfNeeded();
    if (this.collection.available()) {
      const value = this.collection.get(id);
      return value ? normalizeTask(value) : null;
    }
    return this._legacyRecords().find(x => x.id === id) || null;
  }
  activeId() {
    this._migrateLegacyIfNeeded();
    if (this.collection.available()) {
      const value = this.meta.read({ formatVersion: 1, activeTaskId: null });
      return value && value.activeTaskId || null;
    }
    return this.context.workspaceState.get(this.activeKey, null);
  }

  async setActive(id) {
    return this._enqueue(() => this._withProjectLock(() => this._setActiveUnlocked(id)));
  }

  _enqueue(fn) {
    const run = this._queue.then(fn, fn);
    this._queue = run.catch(() => {});
    return run;
  }

  _withProjectLock(fn) { return this.projectLock ? this.projectLock.runExclusive(fn) : fn(); }

  async _setActiveUnlocked(id) {
    if (id !== null && !this.get(id)) throw new Error('Task not found.');
    if (this.collection.available()) {
      const value = this.meta.read({ formatVersion: 1 }) || { formatVersion: 1 };
      value.activeTaskId = id;
      value.updatedAt = new Date().toISOString();
      this.meta.write(value);
    } else {
      await this.context.workspaceState.update(this.activeKey, id);
    }
    return id;
  }

  async _saveLegacy(records) { await this.context.workspaceState.update(this.key, clone(records)); }

  async create(title = 'New task') {
    return this._enqueue(() => this._withProjectLock(async () => {
      this._migrateLegacyIfNeeded();
      const now = new Date().toISOString();
      const record = normalizeTask({
        id: crypto.randomUUID(), title: String(title || 'New task').trim().slice(0, 120) || 'New task',
        status: 'ready', createdAt: now, updatedAt: now, messages: [], execution: {}, worktree: {},
        pendingChanges: {}, appliedWorktreeChanges: {}, lastChanges: [], lastCheckpoint: null,
        mainProjectCheckpoint: null, lastCheckpointScope: null, actionHistory: [], verification: {}, lastError: ''
      });
      if (this.collection.available()) this.collection.put(record);
      else {
        const records = this._legacyRecords(); records.push(record); await this._saveLegacy(records);
      }
      await this._setActiveUnlocked(record.id);
      return clone(record);
    }));
  }

  async mutate(id, mutator, { allowRecoveryTransition = false } = {}) {
    return this._enqueue(() => this._withProjectLock(async () => {
      this._migrateLegacyIfNeeded();
      let record;
      if (this.collection.available()) record = this.collection.get(id);
      else record = this._legacyRecords().find(x => x.id === id) || null;
      if (!record) throw new Error('Task not found.');
      record = normalizeTask(record);
      const previousStatus = normalizeTaskStatus(record.status || 'ready');
      const updated = normalizeTask(await mutator(record) || record);
      if (!updated || typeof updated !== 'object' || Array.isArray(updated)) throw new Error('Task mutator must preserve an object record.');
      if (updated.status !== previousStatus && !allowRecoveryTransition) assertTransition(previousStatus, updated.status);
      updated.id = id;
      updated.updatedAt = new Date().toISOString();
      if (this.collection.available()) this.collection.put(updated);
      else {
        const records = this._legacyRecords();
        const index = records.findIndex(x => x.id === id);
        if (index < 0) throw new Error('Task not found.');
        records[index] = updated;
        await this._saveLegacy(records);
      }
      return clone(updated);
    }));
  }

  patch(id, changes) { return this.mutate(id, record => Object.assign(record, clone(changes || {}))); }
  patchRecovery(id, changes) { return this.mutate(id, record => Object.assign(record, clone(changes || {})), { allowRecoveryTransition: true }); }

  addMessage(id, role, text, meta = {}) {
    return this.mutate(id, record => {
      record.messages ??= [];
      record.messages.push({ role, content: String(text || ''), at: new Date().toISOString(), ...clone(meta) });
      if (record.messages.length > 80) record.messages = record.messages.slice(-80);
      return record;
    });
  }

  async rename(id, title) { return this.patch(id, { title: String(title || 'New task').trim().slice(0, 120) || 'New task' }); }

  async remove(id) {
    return this._enqueue(() => this._withProjectLock(async () => {
      this._migrateLegacyIfNeeded();
      if (this.collection.available()) this.collection.remove(id);
      else await this._saveLegacy(this._legacyRecords().filter(x => x.id !== id));
      if (this.activeId() === id) {
        const records = this.list();
        await this._setActiveUnlocked(records[0]?.id || null);
      }
    }));
  }

  async ensureDefault() {
    this._migrateLegacyIfNeeded();
    let id = this.activeId();
    let task = id ? this.get(id) : null;
    if (!task) {
      const list = this.list();
      task = list[0] || await this.create('New task');
      await this.setActive(task.id);
    }
    return task;
  }
}

module.exports = { TaskStore, normalizeTask, normalizeMessage };
