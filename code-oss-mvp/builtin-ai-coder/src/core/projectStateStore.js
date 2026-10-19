'use strict';

const workspaceIo = require('./workspacePaths');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function safeId(value) {
  const id = String(value || '');
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Invalid durable-state record id.');
  return id;
}

class ProjectJsonFile {
  constructor(folderProvider, relPath, io = workspaceIo) {
    this.folderProvider = folderProvider;
    this.relPath = relPath;
    this.io = io;
  }
  folder() { return typeof this.folderProvider === 'function' ? this.folderProvider() : this.folderProvider; }
  read(fallback = null) {
    const folder = this.folder();
    if (!folder) return clone(fallback);
    try {
      const raw = this.io.readWorkspaceFile(folder, this.relPath, { allowControl: true });
      return JSON.parse(this.io.decodeUtf8Text(raw, { source: this.relPath, maxBytes: 64 * 1024 * 1024, rejectNul: true }));
    } catch (error) {
      if (error && error.code === 'ENOENT') return clone(fallback);
      if (/ENOENT|not found|does not exist|cannot find/i.test(String(error && error.message || error))) return clone(fallback);
      throw error;
    }
  }
  write(value) {
    const folder = this.folder();
    if (!folder) throw new Error('No workspace is available for durable project state.');
    const text = JSON.stringify(value, null, 2);
    this.io.writeWorkspaceFile(folder, this.relPath, Buffer.from(text, 'utf8'), { allowControl: true });
  }
  remove() {
    const folder = this.folder();
    if (!folder) return;
    try { this.io.deleteWorkspaceFile(folder, this.relPath, { allowControl: true }); }
    catch (error) { if (!/ENOENT|not found|does not exist|cannot find/i.test(String(error && error.message || error))) throw error; }
  }
}

class IndexedProjectCollection {
  constructor(folderProvider, baseDir, io = workspaceIo, { fault = null } = {}) {
    this.folderProvider = folderProvider;
    this.baseDir = String(baseDir).replace(/\/+$/g, '');
    this.io = io;
    this.fault = typeof fault === 'function' ? fault : null;
    this.indexFile = new ProjectJsonFile(folderProvider, `${this.baseDir}/index.json`, io);
    this.metaFile = new ProjectJsonFile(folderProvider, `${this.baseDir}/meta.json`, io);
    this.transactionFile = new ProjectJsonFile(folderProvider, `${this.baseDir}/transaction.json`, io);
    this._reconciling = false;
  }
  available() { return !!(typeof this.folderProvider === 'function' ? this.folderProvider() : this.folderProvider); }
  _recordFile(id) { return new ProjectJsonFile(this.folderProvider, `${this.baseDir}/${safeId(id)}.json`, this.io); }
  _rawIndex() {
    const data = this.indexFile.read({ formatVersion: 2, ids: [] });
    const ids = Array.isArray(data && data.ids) ? data.ids.map(String).filter(x => /^[A-Za-z0-9_-]+$/.test(x)) : [];
    return { formatVersion: 2, ids: [...new Set(ids)] };
  }
  _writeIndex(ids) { this.indexFile.write({ formatVersion: 2, ids: [...new Set(ids.map(safeId))] }); }
  _fault(stage, tx) { if (this.fault) this.fault(stage, clone(tx)); }
  _reconcile() {
    if (this._reconciling || !this.available()) return;
    const tx = this.transactionFile.read(null);
    if (!tx || typeof tx !== 'object' || tx.formatVersion !== 1) return;
    this._reconciling = true;
    try {
      const id = safeId(tx.id);
      const index = this._rawIndex();
      if (tx.op === 'put') {
        if (!tx.record || typeof tx.record !== 'object' || Array.isArray(tx.record)) throw new Error('Invalid durable-state put transaction.');
        this._recordFile(id).write(tx.record);
        if (!index.ids.includes(id)) { index.ids.push(id); this._writeIndex(index.ids); }
      } else if (tx.op === 'remove') {
        this._recordFile(id).remove();
        const next = index.ids.filter(x => x !== id);
        if (next.length !== index.ids.length) this._writeIndex(next);
      } else {
        throw new Error(`Unknown durable-state transaction operation: ${tx.op}`);
      }
      this.transactionFile.remove();
    } finally { this._reconciling = false; }
  }
  _index() { this._reconcile(); return this._rawIndex(); }
  ids() { return this._index().ids; }
  get(id) {
    this._reconcile();
    id = safeId(id);
    const value = this._recordFile(id).read(null);
    return value && typeof value === 'object' && !Array.isArray(value) ? clone(value) : null;
  }
  list() {
    const out = [];
    for (const id of this.ids()) {
      try { const value = this.get(id); if (value) out.push(value); } catch (_) {}
    }
    return out;
  }
  put(record) {
    this._reconcile();
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Durable-state record must be an object.');
    const id = safeId(record.id);
    const tx = { formatVersion: 1, op: 'put', id, record: clone(record), createdAt: new Date().toISOString() };
    this.transactionFile.write(tx); this._fault('afterTransaction', tx);
    this._recordFile(id).write(record); this._fault('afterRecord', tx);
    const index = this._rawIndex();
    if (!index.ids.includes(id)) { index.ids.push(id); this._writeIndex(index.ids); }
    this._fault('afterIndex', tx);
    this.transactionFile.remove();
    return clone(record);
  }
  remove(id) {
    this._reconcile();
    id = safeId(id);
    const tx = { formatVersion: 1, op: 'remove', id, createdAt: new Date().toISOString() };
    this.transactionFile.write(tx); this._fault('afterTransaction', tx);
    this._recordFile(id).remove(); this._fault('afterRecord', tx);
    const index = this._rawIndex();
    const next = index.ids.filter(x => x !== id);
    if (next.length !== index.ids.length) this._writeIndex(next);
    this._fault('afterIndex', tx);
    this.transactionFile.remove();
  }
  replaceAll(records) {
    this._reconcile();
    const wanted = new Set();
    for (const record of records || []) {
      if (!record || typeof record !== 'object' || !record.id) continue;
      wanted.add(safeId(record.id));
      this.put(record);
    }
    const current = this.ids();
    for (const id of current) if (!wanted.has(id)) this.remove(id);
  }
  migrationDone(name = 'legacyWorkspaceStateV1') {
    this._reconcile();
    const meta = this.metaFile.read({ formatVersion: 2 });
    return !!(meta && meta[name]);
  }
  markMigration(name = 'legacyWorkspaceStateV1') {
    this._reconcile();
    const meta = this.metaFile.read({ formatVersion: 2 }) || { formatVersion: 2 };
    meta.formatVersion = 2;
    meta[name] = true;
    meta.updatedAt = new Date().toISOString();
    this.metaFile.write(meta);
  }
}

module.exports = { ProjectJsonFile, IndexedProjectCollection, clone };
