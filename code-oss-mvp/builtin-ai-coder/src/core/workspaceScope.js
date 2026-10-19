'use strict';

function requireSingleLocalWorkspace(vscode, { requireTrusted = false } = {}) {
  const folders = vscode.workspace.workspaceFolders || [];
  if (folders.length !== 1) {
    const error = new Error(folders.length ? 'AI-CODER v0.6 supports exactly one workspace folder for task execution.' : 'Open one local workspace folder before using AI-CODER.');
    error.code = 'AI_CODER_WORKSPACE_SCOPE';
    throw error;
  }
  const folder = folders[0];
  if (folder.uri?.scheme !== 'file') {
    const error = new Error(`AI-CODER v0.6 task execution supports local file: workspaces only; received ${folder.uri?.scheme || 'unknown'}:.`);
    error.code = 'AI_CODER_REMOTE_WORKSPACE_UNSUPPORTED';
    throw error;
  }
  if (requireTrusted && vscode.workspace.isTrusted !== true) {
    const error = new Error('Trust this workspace before using AI-CODER Agent, verification, worktrees, or project mutation.');
    error.code = 'AI_CODER_WORKSPACE_UNTRUSTED';
    throw error;
  }
  return folder;
}

module.exports = { requireSingleLocalWorkspace };
