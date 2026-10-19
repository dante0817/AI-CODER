'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const rootIdentities = new Map();
const HELPER = path.resolve(__dirname, '..', '..', 'native', 'windows-safeio.exe');
const MAX_HELPER_OUTPUT = 8 * 1024 * 1024;

function rootKey(root) {
  // path.resolve is lexical; do not realpath the selected workspace before the
  // native helper opens and validates the root object itself.
  return path.resolve(root);
}

function helperError(error) {
  if (error && error.status === 4) {
    const notFound = new Error(Buffer.isBuffer(error.stderr) ? error.stderr.toString('utf8').trim() : String(error.stderr || 'Workspace path does not exist'));
    notFound.code = 'ENOENT';
    return notFound;
  }
  const stderr = error && error.stderr
    ? (Buffer.isBuffer(error.stderr) ? error.stderr.toString('utf8') : String(error.stderr)).trim()
    : '';
  return new Error(stderr || (error && error.message) || 'Windows safe-I/O helper failed.');
}

function run(args, { input = undefined, encoding = null } = {}) {
  if (!fs.existsSync(HELPER)) throw new Error(`Windows safe-I/O helper is missing: ${HELPER}`);
  try {
    return childProcess.execFileSync(HELPER, args, {
      input,
      encoding,
      windowsHide: true,
      maxBuffer: MAX_HELPER_OUTPUT,
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch (error) {
    throw helperError(error);
  }
}

function registerWorkspaceRoot(root, { force = false } = {}) {
  if (process.platform !== 'win32') return null;
  const key = rootKey(root);
  if (!force && rootIdentities.has(key)) return rootIdentities.get(key);
  const identity = String(run(['identity', '--root', key], { encoding: 'utf8' })).trim();
  if (!identity) throw new Error('Windows safe-I/O helper returned an empty workspace identity.');
  rootIdentities.set(key, identity);
  return identity;
}

function forgetWorkspaceRoot(root) {
  rootIdentities.delete(rootKey(root));
}

function argsFor(root, relPath, { allowControl = false } = {}) {
  const key = rootKey(root);
  const identity = registerWorkspaceRoot(key);
  const args = ['--root', key, '--expected-root-id', identity, '--rel', relPath];
  if (allowControl) args.push('--allow-control');
  return args;
}

function validatePath(root, relPath, options) {
  return String(run(['validate', ...argsFor(root, relPath, options)], { encoding: 'utf8' })).trim();
}

function readFile(root, relPath, options) {
  return Buffer.from(run(['read', ...argsFor(root, relPath, options)]));
}

function writeFile(root, relPath, data, options) {
  run(['write', ...argsFor(root, relPath, options)], { input: Buffer.from(data) });
}

function appendFile(root, relPath, data, options) {
  run(['append', ...argsFor(root, relPath, options)], { input: Buffer.from(data) });
}

function deleteFile(root, relPath, options) {
  try { run(['delete', ...argsFor(root, relPath, options)]); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function ensureDirectory(root, relPath, options = { allowControl: true }) {
  return String(run(['mkdir', ...argsFor(root, relPath, options)], { encoding: 'utf8' })).trim();
}

module.exports = {
  HELPER,
  registerWorkspaceRoot,
  forgetWorkspaceRoot,
  validatePath,
  readFile,
  writeFile,
  appendFile,
  deleteFile,
  ensureDirectory
};
