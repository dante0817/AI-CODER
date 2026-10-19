'use strict';

const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function run(args, cwd, timeout = 60000) {
  const result = childProcess.spawnSync(args[0], args.slice(1), {
    cwd, encoding: 'utf8', shell: false, timeout, windowsHide: true, maxBuffer: 2 * 1024 * 1024
  });
  if (result.error) return { code: result.status ?? 1, stdout: result.stdout || '', stderr: result.error.message || String(result.error) };
  return { code: result.status ?? 0, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function isGitRepository(root) {
  try { return run(['git', 'rev-parse', '--show-toplevel'], root, 10000).code === 0; }
  catch (_) { return false; }
}

class WorktreeManager {
  constructor(projectRoot, storageRoot) {
    this.projectRoot = fs.realpathSync(projectRoot);
    const digest = crypto.createHash('sha256').update(this.projectRoot).digest('hex').slice(0, 16);
    this.base = path.join(storageRoot, 'worktrees', digest);
    fs.mkdirSync(this.base, { recursive: true });
  }

  pathFor(taskId) { return path.join(this.base, String(taskId).slice(0, 12)); }

  ensure(taskId) {
    if (!isGitRepository(this.projectRoot)) return { enabled: false, reason: 'Project is not a Git repository.' };
    const target = this.pathFor(taskId);
    let branch = `ai-coder/${String(taskId).slice(0, 8)}`;
    if (fs.existsSync(target) && fs.existsSync(path.join(target, '.git'))) {
      const base = run(['git', 'rev-parse', branch], this.projectRoot, 10000);
      return { enabled: true, path: target, branch, baseCommit: base.code === 0 ? base.stdout.trim() : '', existing: true };
    }
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    const base = run(['git', 'rev-parse', 'HEAD'], this.projectRoot, 10000);
    const baseCommit = base.code === 0 ? base.stdout.trim() : '';
    let created = run(['git', 'worktree', 'add', '-b', branch, target, 'HEAD'], this.projectRoot, 90000);
    if (created.code !== 0 && /already exists/i.test(created.stderr || '')) {
      const suffix = String(taskId).replace(/-/g, '').slice(8, 14) || 'retry';
      branch = `${branch}-${suffix}`;
      created = run(['git', 'worktree', 'add', '-b', branch, target, 'HEAD'], this.projectRoot, 90000);
    }
    if (created.code !== 0) return { enabled: false, reason: (created.stderr || created.stdout || 'git worktree failed').trim().slice(0, 1200) };
    return { enabled: true, path: target, branch, baseCommit, existing: false };
  }

  conflictingPaths(baseCommit, paths) {
    if (!baseCommit) return [...paths];
    const conflicts = [];
    for (const rel of paths) {
      try {
        const existsAtBase = run(['git', 'cat-file', '-e', `${baseCommit}:${rel}`], this.projectRoot, 10000).code === 0;
        const current = path.join(this.projectRoot, ...String(rel).split('/'));
        if (!existsAtBase) { if (fs.existsSync(current)) conflicts.push(rel); continue; }
        if (run(['git', 'diff', '--quiet', baseCommit, '--', rel], this.projectRoot, 15000).code !== 0) conflicts.push(rel);
      } catch (_) { conflicts.push(rel); }
    }
    return conflicts;
  }

  changedPaths(worktree) {
    const tracked = run(['git', 'diff', 'HEAD', '--name-only', '-z', '--'], worktree, 20000);
    if (tracked.code !== 0) throw new Error((tracked.stderr || tracked.stdout || 'Unable to inspect worktree diff').trim());
    const untracked = run(['git', 'ls-files', '--others', '--exclude-standard', '-z'], worktree, 20000);
    if (untracked.code !== 0) throw new Error((untracked.stderr || untracked.stdout || 'Unable to inspect untracked files').trim());
    return new Set(`${tracked.stdout}\0${untracked.stdout}`.split('\0').filter(Boolean).map(x => x.replace(/\\/g, '/')));
  }

  remove(taskId, force = false) {
    const target = this.pathFor(taskId);
    if (!fs.existsSync(target)) return { ok: true, message: 'No worktree exists.' };
    const args = ['git', 'worktree', 'remove'];
    if (force) args.push('--force');
    args.push(target);
    const result = run(args, this.projectRoot, 60000);
    return result.code === 0 ? { ok: true, message: 'Worktree removed.' } : { ok: false, message: (result.stderr || result.stdout).trim() };
  }
}

module.exports = { WorktreeManager, isGitRepository, run };
