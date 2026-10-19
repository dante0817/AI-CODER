'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { canonicalProjectKey, ownerAlive } = require('./crossProcessLock');

function safeTaskId(value) {
  const id = String(value || '');
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) throw new Error('Invalid task id for execution lease.');
  return id;
}

class TaskExecutionLease {
  constructor(folderProvider, runtimeRoot, { alive = ownerAlive, now = () => Date.now() } = {}) {
    this.folderProvider = folderProvider;
    this.runtimeRoot = path.resolve(String(runtimeRoot || ''));
    this.alive = alive;
    this.now = now;
  }
  folder() { return typeof this.folderProvider === 'function' ? this.folderProvider() : this.folderProvider; }
  _path(taskId) {
    const project = canonicalProjectKey(this.folder());
    if (!project) throw new Error('No local project is available for a task execution lease.');
    const digest = crypto.createHash('sha256').update(`${project}\0${safeTaskId(taskId)}`).digest('hex');
    const dir = path.join(this.runtimeRoot, 'task-leases');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    return path.join(dir, `${digest}.lease`);
  }
  _read(leasePath) {
    try { return JSON.parse(fs.readFileSync(leasePath, 'utf8')); }
    catch (_) { return null; }
  }
  inspect(taskId) {
    const leasePath = this._path(taskId);
    const record = this._read(leasePath);
    if (!record) return { active: false, abandoned: false, record: null };
    const active = !!record.pid && this.alive(record.pid);
    return { active, abandoned: !active, record };
  }
  clearAbandoned(taskId) {
    const leasePath = this._path(taskId);
    const state = this.inspect(taskId);
    if (!state.abandoned) return false;
    try {
      const current = this._read(leasePath);
      if (state.record?.token && current?.token !== state.record.token) return false;
      fs.unlinkSync(leasePath);
      return true;
    } catch (error) { return error?.code === 'ENOENT'; }
  }
  acquire(taskId, { mode = 'task' } = {}) {
    taskId = safeTaskId(taskId);
    const leasePath = this._path(taskId);
    this.clearAbandoned(taskId);
    const token = crypto.randomUUID();
    let fd;
    try {
      fd = fs.openSync(leasePath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
    } catch (error) {
      if (error?.code === 'EEXIST') {
        const holder = this.inspect(taskId).record;
        const detail = holder?.pid ? ` (PID ${holder.pid}, mode ${holder.mode || 'task'})` : '';
        const e = new Error(`Task ${taskId} is already executing in another AI-CODER window${detail}.`);
        e.code = 'AI_CODER_TASK_ALREADY_RUNNING';
        throw e;
      }
      throw error;
    }
    const record = {
      formatVersion: 1, taskId, pid: process.pid, token, mode: String(mode || 'task'),
      createdAtMs: this.now(), createdAt: new Date().toISOString(), project: canonicalProjectKey(this.folder())
    };
    try { fs.writeFileSync(fd, JSON.stringify(record)); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    return {
      record,
      release: () => {
        try {
          const current = this._read(leasePath);
          if (!current || current.token !== token) return false;
          fs.unlinkSync(leasePath); return true;
        } catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
      }
    };
  }
  async runExclusive(taskId, options, fn) {
    const lease = this.acquire(taskId, options || {});
    try { return await fn(lease.record); }
    finally { lease.release(); }
  }
}

module.exports = { TaskExecutionLease, safeTaskId };
