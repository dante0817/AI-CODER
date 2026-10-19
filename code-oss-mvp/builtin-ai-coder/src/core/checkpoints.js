'use strict';

const crypto = require('crypto');
const { validateWorkspacePath } = require('./policy');
const workspaceIo = require('./workspacePaths');
const path = require('path');
const fs = require('fs');
const { IndexedProjectCollection } = require('./projectStateStore');

const MAX_CHECKPOINT_TEXT_BYTES = 2 * 1024 * 1024;

function sha256(buf) { return buf === null ? null : crypto.createHash('sha256').update(buf).digest('hex'); }
function b64(buf) { return buf === null ? null : Buffer.from(buf).toString('base64'); }
function unb64(value) { return value === null || value === undefined ? null : Buffer.from(String(value), 'base64'); }

class CheckpointStore {
  constructor(vscode, context, io = workspaceIo, { folderProvider = () => ((vscode && vscode.workspace && vscode.workspace.workspaceFolders) || [])[0] || null, baseDir = '.ai-coder/code-oss/checkpoints', projectLock = null } = {}) {
    this.vscode = vscode;
    this.context = context;
    this.io = io;
    this.key = 'aiCoder.checkpoints';
    this.folderProvider = folderProvider;
    this.collection = new IndexedProjectCollection(folderProvider, baseDir, io);
    this._stateQueue = Promise.resolve();
    this.projectLock = projectLock;
    this._migrateLegacyIfNeeded();
  }

  _migrateLegacyIfNeeded() {
    if (!this.collection.available() || this.collection.migrationDone()) return;
    const legacy = this.context.workspaceState.get(this.key, []);
    if (!this.collection.list().length && Array.isArray(legacy)) {
      for (const item of legacy.slice(0, 50)) if (item && item.id) this.collection.put(item);
    }
    this.collection.markMigration();
  }

  list() {
    this._migrateLegacyIfNeeded();
    const list = this.collection.available() ? this.collection.list() : this.context.workspaceState.get(this.key, []);
    return (Array.isArray(list) ? list : []).slice().sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0)).slice(0, 50);
  }
  async _saveList(list) {
    this._migrateLegacyIfNeeded();
    const next = (list || []).slice(0, 50);
    if (this.collection.available()) this.collection.replaceAll(next);
    else await this.context.workspaceState.update(this.key, next);
  }
  async _mutateList(mutator) {
    const run = this._stateQueue.then(async () => {
      const execute = async () => {
        const list = this.list().map(item => ({ ...item }));
        const updated = await mutator(list) || list;
        await this._saveList(updated);
        return updated;
      };
      return this.projectLock ? this.projectLock.runExclusive(execute) : execute();
    });
    this._stateQueue = run.catch(() => {});
    return run;
  }

  _upgrade(cp) {
    const upgraded = { ...cp, files: [] };
    let exact = true;
    for (const original of cp.files || []) {
      const file = { ...original };
      if (!Object.hasOwn(file, 'beforeBytes')) {
        file.beforeBytes = file.before === null || file.before === undefined ? null : b64(Buffer.from(String(file.before), 'utf8'));
        exact = false;
      }
      if (!Object.hasOwn(file, 'afterBytes')) {
        file.afterBytes = b64(Buffer.from(String(file.after ?? ''), 'utf8'));
        exact = false;
      }
      file.beforeSha256 ??= sha256(unb64(file.beforeBytes));
      file.afterSha256 ??= sha256(unb64(file.afterBytes));
      upgraded.files.push(file);
    }
    upgraded.formatVersion ??= exact ? 2 : 1;
    upgraded.byteExact ??= exact;
    upgraded.state ??= 'applied';
    return upgraded;
  }

  preview(workspaceFolder, changes) {
    const files = [];
    const seenTargets = new Set();
    for (const change of changes) {
      const relPath = validateWorkspacePath(change.path);
      const target = this.io.resolveWorkspacePath(workspaceFolder, relPath);
      const resolvedPath = path.relative(fs.realpathSync(workspaceFolder.uri.fsPath), target).replace(/\\/g, '/');
      if (seenTargets.has(resolvedPath)) throw new Error(`Multiple proposed changes target the same file: ${change.path}`);
      seenTargets.add(resolvedPath);

      let beforeBytes = null;
      let before = null;
      try {
        beforeBytes = this.io.readWorkspaceFile(workspaceFolder, resolvedPath);
        before = this.io.decodeUtf8Text(beforeBytes, { source: change.path, maxBytes: MAX_CHECKPOINT_TEXT_BYTES, rejectNul: true });
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }

      const after = String(change.content ?? '');
      if (after.includes('\0')) throw new Error(`Proposed content for ${change.path} contains NUL characters.`);
      const afterBytes = this.io.encodeUtf8Text(after, { source: change.path, maxBytes: MAX_CHECKPOINT_TEXT_BYTES, rejectNul: true });

      files.push({
        path: relPath, resolvedPath, before, after,
        beforeBytes: b64(beforeBytes), afterBytes: b64(afterBytes),
        beforeSha256: sha256(beforeBytes), afterSha256: sha256(afterBytes)
      });
    }
    return {
      id: crypto.randomUUID(), createdAt: new Date().toISOString(), createdAtMs: Date.now(),
      formatVersion: 2, byteExact: true, state: 'preview', files
    };
  }

  async create(workspaceFolder, changes, expected = null, metadata = null) {
    const cp = this.preview(workspaceFolder, changes);
    if (expected) {
      const snapshot = files => JSON.stringify(Object.fromEntries(files.map(f => [f.path, [f.resolvedPath, f.beforeBytes, f.afterBytes]])));
      if (snapshot(cp.files) !== snapshot(expected.files)) throw new Error('A file changed after diff review. Review the updated diff before applying.');
      cp.id = expected.id;
      cp.createdAtMs = expected.createdAtMs || cp.createdAtMs;
    }
    cp.state = 'ready';
    if (metadata) cp.metadata = { ...metadata };
    await this._mutateList(list => {
      const filtered = list.filter(item => item.id !== cp.id);
      filtered.unshift(cp);
      return filtered;
    });
    return cp;
  }

  async _replaceCheckpoint(cp) {
    await this._mutateList(list => {
      const index = list.findIndex(item => item.id === cp.id);
      if (index >= 0) list[index] = cp; else list.unshift(cp);
      return list;
    });
  }

  async _removeCheckpoint(id) {
    await this._mutateList(list => list.filter(item => item.id !== id));
  }

  _currentBytes(workspaceFolder, file) {
    const rel = file.resolvedPath || file.path;
    try { return this.io.readWorkspaceFile(workspaceFolder, rel); }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  }

  verify(workspaceFolder, checkpoint, useAfter) {
    const cp = this._upgrade(checkpoint);
    for (const file of cp.files) {
      const current = this._currentBytes(workspaceFolder, file);
      const expected = useAfter ? unb64(file.afterBytes) : unb64(file.beforeBytes);
      const same = current === null ? expected === null : expected !== null && Buffer.from(current).equals(expected);
      if (!same) throw new Error(`${file.path} changed after review; operation cancelled.`);
    }
  }

  _affected(workspaceFolder, checkpoint, useAfter) {
    const affected = [];
    for (const file of checkpoint.files) {
      try {
        const current = this._currentBytes(workspaceFolder, file);
        const expected = useAfter ? unb64(file.afterBytes) : unb64(file.beforeBytes);
        const same = current === null ? expected === null : expected !== null && Buffer.from(current).equals(expected);
        if (!same) affected.push(file.path);
      } catch (_) { affected.push(file.path); }
    }
    return affected;
  }

  async apply(workspaceFolder, checkpoint) {
    const cp = this._upgrade(checkpoint);
    this.verify(workspaceFolder, cp, false);
    const attempted = [];
    let currentFile = null;
    try {
      for (const file of cp.files) {
        currentFile = file;
        attempted.push(file); // include a write that may throw after the replacement happened
        this.io.writeWorkspaceFile(workspaceFolder, file.resolvedPath || file.path, unb64(file.afterBytes));
        currentFile = null;
      }
    } catch (error) {
      const rollbackErrors = [];
      for (const file of [...attempted].reverse()) {
        try {
          const before = unb64(file.beforeBytes);
          if (before === null) this.io.deleteWorkspaceFile(workspaceFolder, file.resolvedPath || file.path);
          else this.io.writeWorkspaceFile(workspaceFolder, file.resolvedPath || file.path, before);
        } catch (rollbackError) { rollbackErrors.push(`${file.path}: ${rollbackError.message}`); }
      }
      const affected = this._affected(workspaceFolder, cp, false);
      if (!affected.length) {
        await this._removeCheckpoint(cp.id);
        const warnings = rollbackErrors.length ? ` Rollback warnings: ${rollbackErrors.join('; ')}` : '';
        throw new Error(`Apply failed; all attempted files were verified back at their original bytes: ${error.message}.${warnings}`);
      }
      cp.state = 'recovery-needed';
      cp.recoveryOperation = 'apply';
      cp.recoveryError = error.message;
      cp.affectedPaths = affected;
      if (currentFile) cp.currentPath = currentFile.path;
      try { await this._replaceCheckpoint(cp); } catch (_) {}
      const detail = rollbackErrors.length ? ` Rollback errors: ${rollbackErrors.join('; ')}` : '';
      throw new Error(`Apply failed and exact-byte recovery could not be confirmed. Recovery needed for: ${affected.join(', ')}. ${error.message}.${detail}`);
    }
    cp.state = 'applied';
    delete cp.affectedPaths; delete cp.currentPath; delete cp.recoveryError;
    try { await this._replaceCheckpoint(cp); }
    catch (metadataError) {
      // File replacement already completed. Keep the persisted pre-apply checkpoint rather than
      // misreporting a successful apply as a file-write failure.
      cp.metadataWarning = metadataError.message;
    }
  }

  get(id) {
    const raw = this.list().find(item => item.id === id);
    return raw ? this._upgrade(raw) : null;
  }

  async markState(id, state, details = {}) {
    const cp = this.get(id);
    if (!cp) return null;
    Object.assign(cp, details, { state });
    await this._replaceCheckpoint(cp);
    return cp;
  }

  verifyCheckpointState(workspaceFolder, id, useAfter) {
    const cp = this.get(id);
    if (!cp) return null;
    this.verify(workspaceFolder, cp, useAfter);
    return cp;
  }

  async finalizeUndo(id) { await this._removeCheckpoint(id); }

  async undoLast(workspaceFolder) {
    const cp = this.list()[0];
    return cp ? this.undoCheckpoint(workspaceFolder, cp.id) : null;
  }

  async undoCheckpoint(workspaceFolder, id, { remove = true } = {}) {
    const list = this.list();
    const raw = list.find(item => item.id === id);
    if (!raw) return null;
    const cp = this._upgrade(raw);
    this.verify(workspaceFolder, cp, true);
    const attempted = [];
    let currentFile = null;
    try {
      for (const file of cp.files) {
        currentFile = file;
        attempted.push(file);
        const before = unb64(file.beforeBytes);
        if (before === null) this.io.deleteWorkspaceFile(workspaceFolder, file.resolvedPath || file.path);
        else this.io.writeWorkspaceFile(workspaceFolder, file.resolvedPath || file.path, before);
        currentFile = null;
      }
    } catch (error) {
      const rollbackErrors = [];
      for (const file of [...attempted].reverse()) {
        try { this.io.writeWorkspaceFile(workspaceFolder, file.resolvedPath || file.path, unb64(file.afterBytes)); }
        catch (rollbackError) { rollbackErrors.push(`${file.path}: ${rollbackError.message}`); }
      }
      const affected = this._affected(workspaceFolder, cp, true);
      if (!affected.length) {
        cp.state = 'applied';
        try { await this._replaceCheckpoint(cp); } catch (_) {}
        const warnings = rollbackErrors.length ? ` Rollback warnings: ${rollbackErrors.join('; ')}` : '';
        throw new Error(`Undo failed; the applied bytes were restored and the checkpoint was retained: ${error.message}.${warnings}`);
      }
      cp.state = 'recovery-needed';
      cp.recoveryOperation = 'undo';
      cp.recoveryError = error.message;
      cp.affectedPaths = affected;
      if (currentFile) cp.currentPath = currentFile.path;
      try { await this._replaceCheckpoint(cp); } catch (_) {}
      const detail = rollbackErrors.length ? ` Rollback errors: ${rollbackErrors.join('; ')}` : '';
      throw new Error(`Undo failed and exact-byte recovery could not be confirmed. Recovery needed for: ${affected.join(', ')}. ${error.message}.${detail}`);
    }
    cp.state = remove ? 'undone' : 'undone-pending-history';
    if (remove) await this._removeCheckpoint(id); else await this._replaceCheckpoint(cp);
    return cp;
  }
}

module.exports = { CheckpointStore, MAX_CHECKPOINT_TEXT_BYTES };
