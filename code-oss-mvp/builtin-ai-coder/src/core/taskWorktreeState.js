'use strict';

const { isDeepStrictEqual } = require('util');
const { readWorkspaceFile, decodeUtf8Text } = require('./workspacePaths');

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function mergePendingChanges(previous, preview) {
  const merged = clone(previous || {});
  for (const file of preview.files || []) {
    const baseline = Object.hasOwn(merged, file.path) ? merged[file.path].before : file.before;
    if (file.after === baseline) delete merged[file.path];
    else merged[file.path] = { before: baseline, after: file.after };
  }
  return merged;
}

function newTaskAction({ checkpointId, scope, record, pendingBefore = {}, pendingAfter = {}, appliedBefore = {}, appliedAfter = {}, statusBefore = 'ready', statusAfter, lastChangesAfter = [] }) {
  return {
    checkpointId, scope, createdAtMs: Date.now(),
    pendingBefore: clone(pendingBefore), pendingAfter: clone(pendingAfter),
    appliedBefore: clone(appliedBefore), appliedAfter: clone(appliedAfter),
    statusBefore, statusAfter,
    lastChangesBefore: clone(record.lastChanges || []), lastChangesAfter: clone(lastChangesAfter), stateComplete: true
  };
}


function sameWorktreeIdentity(current = {}, reviewed = {}) {
  return !!current.enabled
    && current.path === reviewed.path
    && String(current.branch || '') === String(reviewed.branch || '')
    && String(current.baseCommit || '') === String(reviewed.baseCommit || '');
}

function reviewedWorktreeStateMatches(record, reviewedWorktree, reviewedPending) {
  return sameWorktreeIdentity(record?.worktree || {}, reviewedWorktree || {})
    && isDeepStrictEqual(record?.pendingChanges || {}, reviewedPending || {});
}

function taskMainConflicts(record, manager, paths, mainFolder) {
  const previouslyApplied = record.appliedWorktreeChanges || {};
  const conflicts = [];
  const baseChecked = [];
  for (const rel of paths) {
    if (!Object.hasOwn(previouslyApplied, rel)) { baseChecked.push(rel); continue; }
    try {
      const current = decodeUtf8Text(readWorkspaceFile(mainFolder, rel), { source: rel, maxBytes: 2 * 1024 * 1024, rejectNul: true });
      if (current !== previouslyApplied[rel].after) conflicts.push(rel);
    } catch (_) { conflicts.push(rel); }
  }
  if (baseChecked.length) {
    if (manager) conflicts.push(...manager.conflictingPaths(String(record.worktree?.baseCommit || ''), baseChecked));
    else conflicts.push(...baseChecked);
  }
  return [...new Set(conflicts)].sort();
}

function checkpointRecoveryEligible(state, { afterBytesVerified = false } = {}) {
  state = state || 'applied';
  if (['applied', 'history-recovery-needed'].includes(state)) return true;
  if (state === 'ready') return !!afterBytesVerified;
  return false;
}

module.exports = { mergePendingChanges, newTaskAction, taskMainConflicts, sameWorktreeIdentity, reviewedWorktreeStateMatches, checkpointRecoveryEligible, clone };
