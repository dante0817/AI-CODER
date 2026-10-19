'use strict';

const fs = require('fs');
const path = require('path');

function hasPendingChanges(record) {
  return Object.keys(record?.pendingChanges || {}).length > 0;
}

function validRecordedWorktree(worktree, exists = fs.existsSync) {
  if (!worktree || !worktree.enabled || !worktree.path) return false;
  try {
    return exists(worktree.path) && exists(path.join(worktree.path, '.git'));
  } catch (_) {
    return false;
  }
}

/**
 * Decide how a task created by an older AI-CODER runtime should handle its
 * recorded worktree after the global runtime/worktree root changes.
 *
 * We deliberately never "migrate" worktree bytes behind Git's back. A valid
 * old worktree remains authoritative for that task. If it is missing while
 * reviewed pending changes still exist, the task must enter recovery rather
 * than silently creating a different worktree and orphaning evidence.
 */
function decideRecordedWorktree(record, { exists = fs.existsSync } = {}) {
  const wt = record?.worktree || {};
  if (validRecordedWorktree(wt, exists)) {
    return { action: 'reuse', worktree: { ...wt }, reason: 'Recorded task worktree is still valid.' };
  }
  if (wt.enabled && wt.path && hasPendingChanges(record)) {
    return {
      action: 'recovery_required',
      worktree: { ...wt },
      reason: 'The recorded task worktree is missing while reviewed pending changes still exist.'
    };
  }
  return {
    action: 'create',
    worktree: wt.enabled ? { ...wt } : null,
    reason: wt.enabled && wt.path ? 'Recorded task worktree is unavailable and no reviewed pending changes would be orphaned.' : 'No recorded task worktree exists.'
  };
}

module.exports = { decideRecordedWorktree, validRecordedWorktree, hasPendingChanges };
