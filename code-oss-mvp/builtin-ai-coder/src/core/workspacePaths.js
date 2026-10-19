'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { TextDecoder } = require('util');
const { validateWorkspacePath, isSensitivePath, isControlPath } = require('./policy');
const windowsSafeIo = require('./windowsSafeIo');

function within(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

function resolveWorkspacePath(folder, relPath, { allowSensitive = false, allowControl = false } = {}) {
  if (folder.uri.scheme !== 'file') throw new Error('This security boundary supports local workspaces only.');
  const rel = validateWorkspacePath(relPath, { allowSensitive, allowControl });
  if (process.platform === 'win32') {
    const target = windowsSafeIo.validatePath(folder.uri.fsPath, rel, { allowControl });
    if (!allowSensitive && isSensitivePath(rel)) throw new Error(`Sensitive target blocked: ${rel}`);
    if (!allowControl && isControlPath(rel)) throw new Error(`Control target blocked: ${rel}`);
    return target;
  }
  const root = fs.realpathSync(folder.uri.fsPath);
  const alias = path.resolve(root, ...rel.split('/'));
  let ancestor = alias;
  const missing = [];
  while (true) {
    try { fs.lstatSync(ancestor); break; } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw new Error(`Invalid workspace path: ${rel}`);
    missing.unshift(path.basename(ancestor));
    ancestor = parent;
  }
  const target = path.resolve(fs.realpathSync(ancestor), ...missing);
  if (!within(root, target)) throw new Error(`Path leaves workspace: ${rel}`);
  if (!allowSensitive && isSensitivePath(path.relative(root, target))) throw new Error(`Sensitive target blocked: ${rel}`);
  if (!allowControl && isControlPath(path.relative(root, target))) throw new Error(`Control target blocked: ${rel}`);
  return target;
}

function uriFor(vscode, folder, relPath, options) {
  return vscode.Uri.file(resolveWorkspacePath(folder, relPath, options));
}

function checkedTarget(folder, relPath, options, create = false) {
  if (process.platform === 'win32') throw new Error('checkedTarget is POSIX-only; use Windows safe I/O.');
  const target = resolveWorkspacePath(folder, relPath, options);
  if (create) {
    const root = fs.realpathSync(folder.uri.fsPath);
    const parent = path.dirname(target);
    const segments = path.relative(root, parent).split(path.sep).filter(Boolean);
    let current = root;
    for (const segment of segments) {
      current = path.join(current, segment);
      try { fs.mkdirSync(current); } catch (e) { if (e.code !== 'EEXIST') throw e; }
      if (fs.lstatSync(current).isSymbolicLink() || fs.realpathSync(current) !== current)
        throw new Error(`Workspace directory link blocked: ${current}`);
    }
  }
  if (resolveWorkspacePath(folder, relPath, options) !== target) throw new Error('Workspace path changed');
  return target;
}

function readWorkspaceFile(folder, relPath, options = {}) {
  const allowControl = options && options.allowControl === true;
  const rel = validateWorkspacePath(relPath, options);
  if (process.platform === 'win32') return windowsSafeIo.readFile(folder.uri.fsPath, rel, { allowControl });
  const target = checkedTarget(folder, rel, options);
  const fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const st = fs.fstatSync(fd);
    if (st.isFile() && st.nlink > 1) {
      throw new Error(`Hard-linked files are not supported: ${rel} (link count: ${st.nlink})`);
    }
    return fs.readFileSync(fd);
  } finally { fs.closeSync(fd); }
}

function decodeUtf8Text(data, { source = 'file', maxBytes = null, rejectNul = true } = {}) {
  const buf = Buffer.from(data);
  if (maxBytes !== null && buf.byteLength > maxBytes)
    throw new Error(`${source} is too large for safe text editing (${buf.byteLength} bytes; limit ${maxBytes} bytes).`);
  if (rejectNul && buf.includes(0))
    throw new Error(`${source} contains NUL bytes and is treated as unsupported/binary content.`);
  // Preserve an initial UTF-8 BOM as U+FEFF so previews and proposed content
  // use the same byte representation on both sides of a checkpoint.
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf); }
  catch (_) { throw new Error(`${source} is not valid UTF-8 text; binary or unsupported encodings are not editable by AI-CODER.`); }
}

function encodeUtf8Text(text, { source = 'text', maxBytes = null, rejectNul = true } = {}) {
  const value = String(text);
  if (rejectNul && value.includes('\0')) throw new Error(`${source} contains NUL characters and is unsupported.`);
  const buf = Buffer.from(value, 'utf8');
  const roundTrip = decodeUtf8Text(buf, { source, maxBytes, rejectNul });
  if (roundTrip !== value) throw new Error(`${source} contains invalid Unicode surrogate data and cannot be encoded losslessly as UTF-8.`);
  return buf;
}

function writeWorkspaceFile(folder, relPath, data, options = {}) {
  const allowControl = options && options.allowControl === true;
  const rel = validateWorkspacePath(relPath, options);
  const payload = Buffer.from(data);
  if (process.platform === 'win32') {
    windowsSafeIo.writeFile(folder.uri.fsPath, rel, payload, { allowControl });
    return;
  }
  const target = checkedTarget(folder, rel, options, true);
  let mode = 0o666;
  try {
    const st = fs.statSync(target);
    if (st.isFile() && st.nlink > 1) {
      throw new Error(`Hard-linked files are not supported: ${rel} (link count: ${st.nlink})`);
    }
    mode = st.mode & 0o7777;
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const temp = path.join(path.dirname(target), `.${path.basename(target)}.ai-coder-${process.pid}-${crypto.randomBytes(8).toString('hex')}.tmp`);
  let fd = null;
  try {
    fd = fs.openSync(temp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), mode);
    fs.writeFileSync(fd, payload);
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = null;
    try { fs.chmodSync(temp, mode); } catch (_) {}
    if (checkedTarget(folder, rel, options, true) !== target) throw new Error('Workspace path changed before replacement');
    fs.renameSync(temp, target);
    let dirFd = null;
    try { dirFd = fs.openSync(path.dirname(target), fs.constants.O_RDONLY); fs.fsyncSync(dirFd); }
    catch (_) { /* directory fsync is not supported on every filesystem */ }
    finally { if (dirFd !== null) fs.closeSync(dirFd); }
  } finally {
    if (fd !== null) fs.closeSync(fd);
    try { fs.unlinkSync(temp); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}

function deleteWorkspaceFile(folder, relPath, options = {}) {
  const allowControl = options && options.allowControl === true;
  const rel = validateWorkspacePath(relPath, options);
  if (process.platform === 'win32') {
    windowsSafeIo.deleteFile(folder.uri.fsPath, rel, { allowControl });
    return;
  }
  const target = checkedTarget(folder, rel, options);
  try { fs.unlinkSync(target); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}

module.exports = {
  resolveWorkspacePath, uriFor, within, readWorkspaceFile, decodeUtf8Text, encodeUtf8Text,
  writeWorkspaceFile, deleteWorkspaceFile,
  registerWindowsWorkspace: windowsSafeIo.registerWorkspaceRoot
};
