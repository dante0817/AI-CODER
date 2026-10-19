import { TaskWorktree, TaskLifecycleState } from '../types';

export interface CleanupSafetyCheck {
  canSafeArchive: boolean;
  canSafeDelete: boolean;
  warnings: string[];
  blockers: string[];
  checkpointCount: number;
}

export function performLifecycleSafetyAudit(task: TaskWorktree): CleanupSafetyCheck {
  const warnings: string[] = [];
  const blockers: string[] = [];

  // Check 1: Pending unreviewed changes
  if (task.pendingChangesCount > 0) {
    warnings.push(`Task has ${task.pendingChangesCount} pending proposed change(s) that have not been accepted or rejected.`);
  }

  // Check 2: Unapplied modifications in isolated worktree
  if (task.unappliedWorktreeModifications) {
    warnings.push(`Worktree '${task.worktreePath}' contains unmerged file modifications that have not been synced to main.`);
  }

  // Check 3: Recovery checkpoints
  if (task.hasRecoveryCheckpoints) {
    warnings.push(`Task maintains active byte-exact recovery checkpoints (.ai-coder/checkpoints). Safe cleanup should retain recovery records.`);
  }

  // Check 4: Main branch conflict risk
  if (task.mainBranchConflictRisk === 'high_conflict_detected') {
    warnings.push(`Branch '${task.branchName}' has diverged with unmerged conflicts against main repository.`);
  }

  // Blocker conditions: Cannot hard delete if active without user confirming purge
  if (task.state === 'active' && task.unappliedWorktreeModifications) {
    blockers.push('Task is actively in progress with uncommitted worktree changes. Complete or transition state first.');
  }

  return {
    canSafeArchive: true, // Archiving is always safe as it preserves history
    canSafeDelete: blockers.length === 0,
    warnings,
    blockers,
    checkpointCount: task.hasRecoveryCheckpoints ? 2 : 0
  };
}

export function transitionTaskState(task: TaskWorktree, newState: TaskLifecycleState): TaskWorktree {
  return {
    ...task,
    state: newState,
    updatedAt: new Date().toLocaleTimeString()
  };
}

export function simulateSafeWorktreeRemoval(task: TaskWorktree, deleteGitBranch = false): {
  success: boolean;
  message: string;
  retainedRecords: string[];
} {
  const retained: string[] = [];

  if (task.hasRecoveryCheckpoints) {
    retained.push(`.ai-coder/checkpoints/${task.id}.bak (Preserved for disaster recovery)`);
  }

  if (!deleteGitBranch) {
    retained.push(`Git branch '${task.branchName}' (Preserved to prevent unmerged work loss)`);
  }

  return {
    success: true,
    message: `Isolated worktree '${task.worktreePath}' safely unmounted and removed from ~/.ai-coder/worktrees.`,
    retainedRecords: retained
  };
}
