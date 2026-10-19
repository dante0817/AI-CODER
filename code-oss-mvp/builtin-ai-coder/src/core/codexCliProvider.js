'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');


function isRegularFile(file) {
  try { return fs.statSync(file).isFile(); } catch (_) { return false; }
}

function npmWrapperCommand(wrapperPath) {
  if (!wrapperPath) return null;
  const ext = path.extname(wrapperPath).toLowerCase();
  if (!['.cmd', '.bat'].includes(ext)) return null;
  const prefix = path.dirname(path.resolve(wrapperPath));
  const candidates = [
    path.join(prefix, 'node_modules', '@openai', 'codex', 'bin', 'codex.js'),
    path.join(prefix, '..', 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
  ];
  for (const script of candidates) if (isRegularFile(script)) return { executable: process.execPath, prefixArgs: [script], source: 'npm-wrapper' };
  return null;
}

function whereCandidates(name, spawnSync = childProcess.spawnSync) {
  try {
    const result = spawnSync('where.exe', [name], { shell: false, windowsHide: true, encoding: 'utf8' });
    if (Number(result?.status ?? 1) !== 0) return [];
    return String(result.stdout || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  } catch (_) { return []; }
}

function resolveCodexCommand({ executable = null, env = process.env, platform = process.platform, spawnSync = childProcess.spawnSync } = {}) {
  const configured = String(executable || env.CODEX_CLI_PATH || '').trim();
  if (configured) {
    const ext = path.extname(configured).toLowerCase();
    if (platform === 'win32' && ['.cmd', '.bat'].includes(ext)) {
      const wrapper = npmWrapperCommand(configured);
      if (wrapper) return wrapper;
      throw new Error('CODEX_CLI_PATH points to a .cmd/.bat wrapper whose @openai/codex JavaScript entry point could not be resolved. Point CODEX_CLI_PATH to the native codex.exe instead.');
    }
    if (ext === '.js') return { executable: process.execPath, prefixArgs: [path.resolve(configured)], source: 'javascript-entry' };
    return { executable: configured, prefixArgs: [], source: executable ? 'explicit' : 'CODEX_CLI_PATH' };
  }
  if (platform !== 'win32') return { executable: 'codex', prefixArgs: [], source: 'PATH' };

  for (const candidate of whereCandidates('codex.exe', spawnSync)) {
    if (isRegularFile(candidate)) return { executable: candidate, prefixArgs: [], source: 'PATH-native' };
  }
  for (const candidate of whereCandidates('codex', spawnSync)) {
    if (/\.exe$/i.test(candidate) && isRegularFile(candidate)) return { executable: candidate, prefixArgs: [], source: 'PATH-native' };
    const wrapper = npmWrapperCommand(candidate);
    if (wrapper) return wrapper;
  }
  throw new Error('Codex CLI could not be resolved without a shell. Install/update @openai/codex, or set CODEX_CLI_PATH to the native codex.exe.');
}


function codexEnvironment(source = process.env) {
  // Do not leak arbitrary parent-process secrets to an agentic subprocess. Keep only
  // OS/runtime paths required for authentication, native execution, locale, and temp use.
  const allowed = new Set([
    'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'HOME', 'USERPROFILE',
    'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)',
    'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM',
    'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'CODEX_HOME',
    'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS'
  ]);
  const out = {};
  for (const [key, value] of Object.entries(source || {})) {
    if (allowed.has(String(key).toUpperCase()) && value !== undefined) out[key] = String(value);
  }
  return out;
}

function normalizeEffort(effort) {
  const value = String(effort || 'auto').trim().toLowerCase();
  if (value === 'auto') return null;
  if (value === 'extra-high') return 'xhigh';
  return ['minimal', 'low', 'medium', 'high', 'xhigh'].includes(value) ? value : null;
}

function buildPrompt(messages) {
  const parts = [];
  for (const message of messages || []) {
    const role = String(message?.role || 'user').toUpperCase();
    const content = String(message?.content ?? '');
    parts.push(`${role}:\n${content}`);
  }
  return parts.join('\n\n');
}

function spawnCapture(executable, args, { cwd, input = '', timeoutMs = 180000, spawn = childProcess.spawn, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(executable, args, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...(env || {}) }
    });
    let stdout = '';
    let stderr = '';
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => {
      try { child.kill(); } catch (_) {}
      finish(new Error(`Codex CLI timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);
    child.once('error', error => finish(new Error(`Codex CLI could not start: ${error.message}`)));
    child.stdout?.on('data', chunk => { stdout += String(chunk); if (stdout.length > 8 * 1024 * 1024) stdout = stdout.slice(-8 * 1024 * 1024); });
    child.stderr?.on('data', chunk => { stderr += String(chunk); if (stderr.length > 2 * 1024 * 1024) stderr = stderr.slice(-2 * 1024 * 1024); });
    child.once('close', code => finish(null, { code: Number(code ?? 1), stdout, stderr }));
    if (child.stdin) {
      child.stdin.write(String(input || ''));
      child.stdin.end();
    }
  });
}

class CodexCliProvider {
  constructor({ runtimeDir, executable = null, spawn = childProcess.spawn, spawnSync = childProcess.spawnSync, env = process.env, platform = process.platform } = {}) {
    this.runtimeDir = path.resolve(runtimeDir || path.join(process.cwd(), '.ai-coder-codex-runtime'));
    this.executableOverride = executable;
    this.env = env;
    this.childEnv = codexEnvironment(env);
    this.platform = platform;
    this.spawnSync = spawnSync;
    this.command = null;
    this.spawn = spawn;
    fs.mkdirSync(this.runtimeDir, { recursive: true });
  }

  _command() {
    if (!this.command) this.command = resolveCodexCommand({ executable: this.executableOverride, env: this.env, platform: this.platform, spawnSync: this.spawnSync });
    return this.command;
  }

  async status() {
    let command;
    try { command = this._command(); }
    catch (error) { return { installed: false, connected: false, detail: error.message || String(error) }; }
    const version = await spawnCapture(command.executable, [...(command.prefixArgs || []), '--version'], { cwd: this.runtimeDir, timeoutMs: 10000, spawn: this.spawn, env: this.childEnv }).catch(error => ({ code: 127, stdout: '', stderr: error.message }));
    if (version.code !== 0) return { installed: false, connected: false, detail: (version.stderr || 'Codex CLI is not installed or not on PATH.').trim(), commandSource: command.source };
    const result = await spawnCapture(command.executable, [...(command.prefixArgs || []), 'login', 'status'], { cwd: this.runtimeDir, timeoutMs: 15000, spawn: this.spawn, env: this.childEnv }).catch(error => ({ code: 1, stdout: '', stderr: error.message }));
    const detail = `${result.stdout}\n${result.stderr}`.trim();
    const connected = result.code === 0 && /logged in|authenticated|chatgpt|api key|workload identity/i.test(detail);
    return { installed: true, connected, detail: detail || (connected ? 'Codex account session is active.' : 'Codex CLI is installed but not signed in.'), version: version.stdout.trim(), commandSource: command.source };
  }

  async health() { return (await this.status()).connected; }

  terminalInvocation(args = []) {
    const command = this._command();
    return { executable: command.executable, args: [...(command.prefixArgs || []), ...args], source: command.source };
  }

  async chat({ model, messages, effort = 'auto', signal, outputSchema = null } = {}) {
    if (signal?.aborted) throw new Error('Codex request cancelled.');
    const command = this._command();
    const args = [
      'exec', '--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--ignore-rules',
      '--sandbox', 'read-only',
      '-c', 'approval_policy="never"',
      '-c', 'web_search="disabled"',
      '-c', 'features.hooks=false',
      '-c', 'features.apps=false',
      '-c', 'features.multi_agent=false',
      '-c', 'features.goals=false'
    ];
    if (model && !['auto', 'codex-default'].includes(String(model))) args.push('--model', String(model));
    const normalizedEffort = normalizeEffort(effort);
    if (normalizedEffort) args.push('-c', `model_reasoning_effort="${normalizedEffort}"`);
    if (outputSchema) {
      const schemaPath = path.join(this.runtimeDir, 'agent-output-schema.json');
      fs.writeFileSync(schemaPath, JSON.stringify(outputSchema, null, 2), { encoding: 'utf8', mode: 0o600 });
      args.push('--output-schema', schemaPath);
    }
    // Explicit '-' forces the complete prompt to come from stdin. This keeps authorized
    // project context out of the process argument list and avoids non-TTY stdin ambiguity.
    args.push('-');
    const prompt = buildPrompt(messages);
    const result = await spawnCapture(command.executable, [...(command.prefixArgs || []), ...args], { cwd: this.runtimeDir, input: prompt, timeoutMs: 300000, spawn: this.spawn, env: this.childEnv });
    if (result.code !== 0) throw new Error(`Codex CLI failed (exit ${result.code}): ${(result.stderr || result.stdout).trim().slice(-4000)}`);
    return { text: result.stdout.trim(), usage: null, raw: { stderr: result.stderr.trim() } };
  }

  async logout() {
    const command = this._command();
    const result = await spawnCapture(command.executable, [...(command.prefixArgs || []), 'logout'], { cwd: this.runtimeDir, timeoutMs: 15000, spawn: this.spawn, env: this.childEnv });
    if (result.code !== 0) throw new Error(`Codex logout failed: ${(result.stderr || result.stdout).trim()}`);
    return result;
  }
}

module.exports = { CodexCliProvider, buildPrompt, normalizeEffort, spawnCapture, resolveCodexCommand, npmWrapperCommand, codexEnvironment };
