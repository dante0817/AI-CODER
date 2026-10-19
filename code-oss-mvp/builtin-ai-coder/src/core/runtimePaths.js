'use strict';

const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');

function userRuntimeRoot({ env = process.env, home = os.homedir(), platform = process.platform } = {}) {
  let base;
  if (platform === 'win32') base = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  else if (platform === 'darwin') base = path.join(home, 'Library', 'Application Support');
  else base = env.XDG_STATE_HOME || path.join(home, '.local', 'state');
  const root = platform === 'win32' || platform === 'darwin'
    ? path.join(base, 'AI-CODER', 'runtime')
    : path.join(base, 'ai-coder', 'runtime');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  return root;
}

function canonicalProjectPath(folder) {
  if (!folder?.uri?.fsPath) return '';
  let root;
  try { root = fs.realpathSync(folder.uri.fsPath); }
  catch (_) { root = path.resolve(folder.uri.fsPath); }
  return process.platform === 'win32' ? root.toLowerCase() : root;
}

function projectDigest(folder) {
  const key = canonicalProjectPath(folder);
  return key ? crypto.createHash('sha256').update(key).digest('hex') : '';
}

module.exports = { userRuntimeRoot, canonicalProjectPath, projectDigest };
