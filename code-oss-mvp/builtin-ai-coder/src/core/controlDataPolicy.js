'use strict';

const { readWorkspaceFile, writeWorkspaceFile, decodeUtf8Text } = require('./workspacePaths');

const MANAGED = [
  '# AI-CODER managed runtime/private state',
  '/code-oss/',
  '/threads/',
  '/checkpoints/',
  '/activity.jsonl'
];

function ensureRuntimeGitignore(folder) {
  const rel = '.ai-coder/.gitignore';
  let existing = '';
  try { existing = decodeUtf8Text(readWorkspaceFile(folder, rel, { allowControl: true }), { source: rel, maxBytes: 256 * 1024, rejectNul: true }); }
  catch (error) {
    if (!/ENOENT|not found|does not exist|cannot find/i.test(String(error?.message || error))) throw error;
  }
  const lines = existing.replace(/\r\n/g, '\n').split('\n');
  const normalized = new Set(lines.map(x => x.trim()));
  const missing = MANAGED.filter(x => !normalized.has(x));
  if (!missing.length) return false;
  let next = existing.replace(/\s*$/, '');
  if (next) next += '\n\n';
  next += missing.join('\n') + '\n';
  writeWorkspaceFile(folder, rel, Buffer.from(next, 'utf8'), { allowControl: true });
  return true;
}

module.exports = { MANAGED, ensureRuntimeGitignore };
