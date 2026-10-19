'use strict';

const workspaceIo = require('./workspacePaths');
const { ProjectJsonFile, clone } = require('./projectStateStore');

class ActivityStore {
  constructor(context, {
    folderProvider = () => null, projectLock = null, io = workspaceIo,
    relPath = '.ai-coder/code-oss/activity.json', legacyKey = 'aiCoder.activity'
  } = {}) {
    this.context = context;
    this.legacyKey = legacyKey;
    this.folderProvider = folderProvider;
    this.projectLock = projectLock;
    this.file = new ProjectJsonFile(folderProvider, relPath, io);
    this._queue = Promise.resolve();
    this._migrateLegacyIfNeeded();
  }

  available() { return !!(typeof this.folderProvider === 'function' ? this.folderProvider() : this.folderProvider); }

  _migrateLegacyIfNeeded() {
    if (!this.available()) return;
    const existing = this.file.read(null);
    if (existing && existing.formatVersion === 1) return;
    const legacy = this.context.workspaceState.get(this.legacyKey, []);
    const events = Array.isArray(legacy) ? legacy.slice(0, 200).map(clone) : [];
    this.file.write({ formatVersion: 1, events, migratedAt: new Date().toISOString() });
  }

  list() {
    this._migrateLegacyIfNeeded();
    if (this.available()) {
      const data = this.file.read({ formatVersion: 1, events: [] });
      return Array.isArray(data?.events) ? data.events.map(clone) : [];
    }
    const value = this.context.workspaceState.get(this.legacyKey, []);
    return Array.isArray(value) ? value.map(clone) : [];
  }

  async add(event) {
    const run = this._queue.then(async () => {
      const execute = async () => {
        const list = this.list();
        list.unshift({ at: new Date().toISOString(), ...clone(event || {}) });
        const next = list.slice(0, 200);
        if (this.available()) this.file.write({ formatVersion: 1, events: next, updatedAt: new Date().toISOString() });
        else await this.context.workspaceState.update(this.legacyKey, next);
      };
      return this.projectLock ? this.projectLock.runExclusive(execute) : execute();
    });
    this._queue = run.catch(() => {});
    return run;
  }
}
module.exports = { ActivityStore };
