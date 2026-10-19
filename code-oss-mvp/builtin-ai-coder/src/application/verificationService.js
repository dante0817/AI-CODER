'use strict';

const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const { classifyCommand } = require('../core/policy');

function existing(paths) { return paths.find(p => p && fs.existsSync(p)) || null; }

function resolveVerificationInvocation(argv, {
  platform = process.platform, execPath = process.execPath, env = process.env, projectRoot = process.cwd()
} = {}) {
  if (!Array.isArray(argv) || !argv.length) return { ok: false, reason: 'No approved argv is available.' };
  if (platform !== 'win32') return { ok: true, executable: argv[0], args: argv.slice(1), source: 'direct-approved-argv' };
  const command = String(argv[0]).toLowerCase();
  if (command === 'npm') {
    const nodeDir = path.dirname(execPath);
    const npmCli = existing([
      path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      env.APPDATA ? path.join(env.APPDATA, 'npm', 'node_modules', 'npm', 'bin', 'npm-cli.js') : null,
      env.ProgramFiles ? path.join(env.ProgramFiles, 'nodejs', 'node_modules', 'npm', 'bin', 'npm-cli.js') : null
    ]);
    return npmCli
      ? { ok: true, executable: execPath, args: [npmCli, ...argv.slice(1)], source: 'node-npm-cli' }
      : { ok: false, reason: 'Trusted npm-cli.js launcher was not found; run this verification manually in a trusted terminal.' };
  }
  if (command === 'tsc') {
    const tscJs = existing([
      path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
      path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc.js')
    ]);
    return tscJs
      ? { ok: true, executable: execPath, args: [tscJs, ...argv.slice(1)], source: 'project-typescript-js' }
      : { ok: false, reason: 'Trusted project-local TypeScript launcher was not found; run this verification manually in a trusted terminal.' };
  }
  // Python, git, and other fixed allowlisted native executables do not require a shell wrapper.
  return { ok: true, executable: argv[0], args: argv.slice(1), source: 'direct-approved-argv' };
}

function killProcessTree(child, { platform = process.platform, spawn = cp.spawn } = {}) {
  if (!child?.pid) return;
  try {
    if (platform === 'win32') {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
      if (killer && typeof killer.unref === 'function') killer.unref();
    } else {
      try { process.kill(-child.pid, 'SIGKILL'); }
      catch (_) { try { child.kill('SIGKILL'); } catch (_) {} }
    }
  } catch (_) { try { child.kill('SIGKILL'); } catch (_) {} }
}

class VerificationService {
  constructor({ spawn = cp.spawn, timeoutMs = 120000, maxBuffer = 2 * 1024 * 1024, platform = process.platform } = {}) {
    this.spawn = spawn; this.timeoutMs = timeoutMs; this.maxBuffer = maxBuffer; this.platform = platform;
  }

  async run(command, folder, { signal = null } = {}) {
    const verdict = classifyCommand(command);
    if (!verdict.allowed) return { command, status: 'skipped', skipped: true, reason: verdict.reason };
    const projectRoot = folder?.uri?.fsPath || process.cwd();
    const invocation = resolveVerificationInvocation(verdict.argv, { platform: this.platform, projectRoot });
    if (!invocation.ok) return { command, status: 'launcher_unavailable', skipped: true, reason: invocation.reason };
    if (signal?.aborted) return { command, status: 'cancelled', skipped: true, reason: 'Verification cancelled before launch.' };

    return await new Promise(resolve => {
      let stdout = '', stderr = '', settled = false, timedOut = false, cancelled = false;
      const child = this.spawn(invocation.executable, invocation.args, {
        cwd: projectRoot, shell: false, windowsHide: true, detached: this.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe']
      });
      const append = (current, data) => (current + String(data || '')).slice(-this.maxBuffer);
      child.stdout?.on('data', d => { stdout = append(stdout, d); });
      child.stderr?.on('data', d => { stderr = append(stderr, d); });
      const finish = result => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener?.('abort', onAbort); resolve(result); };
      const onAbort = () => { cancelled = true; killProcessTree(child, { platform: this.platform, spawn: this.spawn }); };
      signal?.addEventListener?.('abort', onAbort, { once: true });
      const timer = setTimeout(() => { timedOut = true; killProcessTree(child, { platform: this.platform, spawn: this.spawn }); }, this.timeoutMs);
      child.on('error', error => finish({ command, status: 'failed', code: 1, stdout: stdout.slice(-12000), stderr: (stderr || error.message || String(error)).slice(-12000), launcher: invocation.source }));
      child.on('close', code => {
        const status = cancelled ? 'cancelled' : timedOut ? 'timed_out' : Number(code || 0) === 0 ? 'passed' : 'failed';
        finish({ command, status, code: Number(code ?? 1), stdout: stdout.slice(-12000), stderr: stderr.slice(-12000), launcher: invocation.source });
      });
    });
  }
}

module.exports = { VerificationService, resolveVerificationInvocation, killProcessTree };
