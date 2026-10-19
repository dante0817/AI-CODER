'use strict';

const ALLOWED_COMMANDS = Object.freeze({
  'npm test': ['npm', 'test'],
  'npm run test': ['npm', 'run', 'test'],
  'npm run lint': ['npm', 'run', 'lint'],
  'npm run build': ['npm', 'run', 'build'],
  'npm run typecheck': ['npm', 'run', 'typecheck'],
  'node --test': ['node', '--test'],
  'pytest': ['pytest'],
  'python -m pytest': ['python', '-m', 'pytest'],
  'python3 -m pytest': ['python3', '-m', 'pytest'],
  'tsc --noEmit': ['tsc', '--noEmit'],
  'git status': ['git', 'status'],
  'git diff': ['git', 'diff']
});

function classifyCommand(command) {
  const cmd = String(command || '').trim();
  if (!cmd) return { level: 0, allowed: false, reason: 'Empty command' };
  const argv = Object.hasOwn(ALLOWED_COMMANDS, cmd) ? ALLOWED_COMMANDS[cmd] : null;
  if (argv) return { level: 1, allowed: true, reason: 'Known verification command; project scripts may execute code', argv };
  return { level: 2, allowed: false, reason: 'Command is not an exact MVP verification command' };
}

function isSensitivePath(relPath) {
  const parts = String(relPath || '').replace(/\\/g, '/').toLowerCase().split('/');
  const name = parts.at(-1);
  return parts.some(x => ['.aws', '.ssh', '.azure'].includes(x))
    || /^(\.env(?:\..*)?|id_rsa|id_ed25519|credentials(?:\..*)?|secrets?(?:\..*)?|.*\.pem|.*\.key)$/.test(name);
}

const RESERVED_DOS_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'COM¹', 'COM²', 'COM³',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
  'LPT¹', 'LPT²', 'LPT³'
]);

function isReservedDosName(name) {
  const stem = String(name || '').split('.')[0].trim().toUpperCase();
  return RESERVED_DOS_NAMES.has(stem);
}

function validateWindowsComponent(part) {
  if (!part || part === '.' || part === '..') throw new Error(`Unsafe path component: ${part}`);
  if (part.endsWith('.') || part.endsWith(' ')) throw new Error(`Unsafe trailing dot/space in path component: ${part}`);
  if (part.startsWith(' ')) throw new Error(`Unsafe leading space in path component: ${part}`);
  if (isReservedDosName(part)) throw new Error(`Reserved DOS device name blocked: ${part}`);
  if (/[<>"|?*]/.test(part) || [...part].some(c => c.charCodeAt(0) < 32))
    throw new Error(`Invalid character in path component: ${part}`);
}

function isControlPath(relPath) {
  const parts = String(relPath || '').replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.some(p => p.toLowerCase().replace(/[. ]+$/, '') === '.ai-coder');
}

function validateWorkspacePath(relPath, { allowSensitive = false, allowControl = false } = {}) {
  const p = String(relPath || '').replace(/\\/g, '/');
  if (p !== p.trim()) throw new Error(`Unsafe whitespace in path: ${relPath}`);
  if (!p || p.startsWith('/') || p.includes('\0') || p.includes(':')) throw new Error(`Unsafe workspace path: ${relPath}`);
  const parts = p.split('/');
  if (parts.includes('..')) throw new Error(`Unsafe workspace path: ${relPath}`);
  for (const part of parts) {
    validateWindowsComponent(part);
  }
  if (!allowControl && isControlPath(p)) throw new Error(`Control data blocked: ${relPath}`);
  if (!allowSensitive && isSensitivePath(p)) throw new Error(`Sensitive path blocked: ${relPath}`);
  return p;
}

module.exports = {
  classifyCommand,
  isSensitivePath,
  isControlPath,
  isReservedDosName,
  validateWindowsComponent,
  validateWorkspacePath,
};
