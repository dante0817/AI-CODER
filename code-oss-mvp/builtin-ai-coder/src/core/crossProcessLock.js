'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function ownerAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  if (n === process.pid) return true;
  try { process.kill(n, 0); return true; }
  catch (error) {
    if (error && error.code === 'ESRCH') return false;
    // EPERM means the process exists but cannot be signalled by this process.
    return true;
  }
}

function canonicalProjectKey(folder) {
  if (!folder?.uri?.fsPath) return '';
  let root;
  try { root = fs.realpathSync(folder.uri.fsPath); }
  catch (_) { root = path.resolve(folder.uri.fsPath); }
  return process.platform === 'win32' ? root.toLowerCase() : root;
}

class CrossProcessProjectLock {
  constructor(folderProvider, lockRoot, {
    namespace = 'durable-state', timeoutMs = 10000, retryMs = 25, staleMs = 60000,
    now = () => Date.now(), alive = ownerAlive
  } = {}) {
    this.folderProvider = folderProvider;
    this.lockRoot = path.resolve(String(lockRoot || ''));
    this.namespace = String(namespace || 'durable-state');
    this.timeoutMs = Math.max(250, Number(timeoutMs) || 10000);
    this.retryMs = Math.max(5, Number(retryMs) || 25);
    this.staleMs = Math.max(1000, Number(staleMs) || 60000);
    this.now = now;
    this.alive = alive;
  }

  folder() { return typeof this.folderProvider === 'function' ? this.folderProvider() : this.folderProvider; }

  _path() {
    const key = canonicalProjectKey(this.folder());
    if (!key) return null;
    const digest = crypto.createHash('sha256').update(`${this.namespace}\0${key}`).digest('hex');
    const dir = path.join(this.lockRoot, 'project-locks');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    return path.join(dir, `${digest}.lock`);
  }

  _read(lockPath) {
    try {
      const text = fs.readFileSync(lockPath, 'utf8');
      const parsed = JSON.parse(text);
      const st = fs.statSync(lockPath);
      return { ...parsed, mtimeMs: st.mtimeMs };
    } catch (_) { return null; }
  }

  _tryBreakStale(lockPath) {
    let st;
    try { st = fs.statSync(lockPath); } catch (error) { return error?.code === 'ENOENT'; }
    const record = this._read(lockPath);
    const age = Math.max(0, this.now() - Number(record?.createdAtMs || st.mtimeMs || 0));
    const stale = record?.pid ? !this.alive(record.pid) : age >= this.staleMs;
    if (!stale) return false;
    try {
      // Re-read immediately before removal so a newly acquired lock is not deleted.
      const current = this._read(lockPath);
      if (record?.token && current?.token && record.token !== current.token) return false;
      if (!record?.token && current && Math.max(0, this.now() - Number(current.createdAtMs || current.mtimeMs || 0)) < this.staleMs) return false;
      fs.unlinkSync(lockPath);
      return true;
    } catch (error) { return error?.code === 'ENOENT'; }
  }

  async acquire() {
    const lockPath = this._path();
    if (!lockPath) return async () => {};
    const started = this.now();
    const token = crypto.randomUUID();
    while (true) {
      let fd = null;
      try {
        fd = fs.openSync(lockPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
        const record = { formatVersion: 1, pid: process.pid, token, namespace: this.namespace, createdAtMs: this.now(), createdAt: new Date().toISOString() };
        fs.writeFileSync(fd, JSON.stringify(record));
        fs.fsyncSync(fd);
        fs.closeSync(fd); fd = null;
        return async () => {
          try {
            const current = this._read(lockPath);
            if (!current || current.token !== token) return;
            fs.unlinkSync(lockPath);
          } catch (error) { if (error?.code !== 'ENOENT') throw error; }
        };
      } catch (error) {
        if (fd !== null) { try { fs.closeSync(fd); } catch (_) {} }
        if (error?.code !== 'EEXIST') throw error;
        if (this._tryBreakStale(lockPath)) continue;
        if ((this.now() - started) >= this.timeoutMs) {
          const holder = this._read(lockPath);
          const detail = holder?.pid ? ` held by PID ${holder.pid}` : '';
          throw new Error(`Timed out waiting for the AI-CODER project-state lock${detail}. Close the other AI-CODER window or retry.`);
        }
        await sleep(this.retryMs);
      }
    }
  }

  async runExclusive(fn) {
    const release = await this.acquire();
    try { return await fn(); }
    finally { await release(); }
  }
}

module.exports = { CrossProcessProjectLock, canonicalProjectKey, ownerAlive };
