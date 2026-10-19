import React, { useState } from 'react';
import { TaskWorktree, TaskLifecycleState } from '../types';
import { performLifecycleSafetyAudit, transitionTaskState, simulateSafeWorktreeRemoval } from '../lib/lifecycleManager';
import { GitBranch, FolderCheck, AlertTriangle, Archive, Trash2, CheckCircle2, GitMerge, ShieldAlert } from 'lucide-react';

interface LifecycleViewProps {
  tasks: TaskWorktree[];
  onUpdateTasks: (tasks: TaskWorktree[]) => void;
}

export const LifecycleView: React.FC<LifecycleViewProps> = ({ tasks, onUpdateTasks }) => {
  const [selectedTaskId, setSelectedTaskId] = useState(tasks[0]?.id || '');
  const [deleteGitBranch, setDeleteGitBranch] = useState(false);
  const [auditFeedback, setAuditFeedback] = useState<string | null>(null);

  const selectedTask = tasks.find(t => t.id === selectedTaskId) || tasks[0];
  const audit = selectedTask ? performLifecycleSafetyAudit(selectedTask) : null;

  const handleStateChange = (newState: TaskLifecycleState) => {
    if (!selectedTask) return;
    const updated = transitionTaskState(selectedTask, newState);
    onUpdateTasks(tasks.map(t => t.id === selectedTask.id ? updated : t));
    setAuditFeedback(`Task '${selectedTask.id}' transitioned to ${newState.toUpperCase()}.`);
    setTimeout(() => setAuditFeedback(null), 3500);
  };

  const handleSafeArchive = () => {
    if (!selectedTask) return;
    const res = simulateSafeWorktreeRemoval(selectedTask, deleteGitBranch);
    const updated = transitionTaskState(selectedTask, 'archived');
    onUpdateTasks(tasks.map(t => t.id === selectedTask.id ? updated : t));
    setAuditFeedback(`${res.message} Records preserved: ${res.retainedRecords.join(', ')}`);
  };

  const handleApplyToMainGate = () => {
    if (!selectedTask) return;
    if (selectedTask.mainBranchConflictRisk === 'high_conflict_detected') {
      alert('CONFLICT GATE HALT: Main branch was modified concurrently while this task worktree ran. Review diff hunks before merging!');
      return;
    }
    const updated = transitionTaskState(selectedTask, 'applied');
    onUpdateTasks(tasks.map(t => t.id === selectedTask.id ? updated : t));
    setAuditFeedback(`Second Review Gate passed: Task '${selectedTask.id}' applied cleanly to main.`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-100">
            Task &amp; Worktree Lifecycle Management
          </h2>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
            <span>Core Reliability (P1/P2)</span>
            <span aria-hidden="true">·</span>
            <span>Orphan Worktree Cleanup</span>
            <span aria-hidden="true">·</span>
            <span>Second Review Gate for Main Merge</span>
            <span aria-hidden="true">·</span>
            <span>Checkpoint Preservation</span>
          </div>
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Worktree Storage: ~/.ai-coder/worktrees/
        </div>
      </div>

      {auditFeedback && (
        <div className="p-3 bg-indigo-950/40 border border-indigo-800/60 rounded-lg text-xs text-indigo-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{auditFeedback}</span>
        </div>
      )}

      {/* Task Grid & Inspector Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Task Worktrees List */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Active &amp; Archived Tasks ({tasks.length})
          </div>

          <div className="space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                onClick={() => setSelectedTaskId(task.id)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  selectedTask.id === task.id
                    ? 'bg-slate-900 border-indigo-500 shadow-sm'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-slate-200">{task.id}</span>
                  <span className={`text-[11px] font-mono px-2 py-0.5 rounded capitalize ${
                    task.state === 'active' ? 'bg-amber-950/60 text-amber-300 border border-amber-800/60' :
                    task.state === 'review' ? 'bg-indigo-950/60 text-indigo-300 border border-indigo-800/60' :
                    task.state === 'applied' ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60' :
                    task.state === 'completed' ? 'bg-blue-950/60 text-blue-300 border border-blue-800/60' :
                    'bg-slate-900 text-slate-500 border border-slate-800'
                  }`}>
                    {task.state}
                  </span>
                </div>
                <div className="text-xs text-slate-300 font-medium mt-1.5 truncate">
                  {task.title}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-2 font-mono">
                  <GitBranch className="w-3 h-3 text-slate-400" />
                  <span className="truncate">{task.branchName}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Selected Task Lifecycle Inspector & Safety Audit */}
        {selectedTask && audit && (
          <div className="lg:col-span-2 space-y-5">
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-semibold text-slate-100">{selectedTask.title}</h3>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">
                    ID: {selectedTask.id} · Branch: {selectedTask.branchName}
                  </div>
                </div>

                {/* State Transition Dropdown */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Current State:</span>
                  <select
                    value={selectedTask.state}
                    onChange={(e) => handleStateChange(e.target.value as TaskLifecycleState)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono outline-none"
                  >
                    <option value="active">Active</option>
                    <option value="review">Review</option>
                    <option value="applied">Applied</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              {/* Worktree Directory & Git Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="text-slate-500 font-medium">Worktree Path</div>
                  <div className="font-mono text-slate-300 mt-0.5">{selectedTask.worktreePath}</div>
                </div>
                <div>
                  <div className="text-slate-500 font-medium">Modified Files</div>
                  <div className="font-mono text-slate-300 mt-0.5">{selectedTask.filesModified.join(', ')}</div>
                </div>
              </div>

              {/* Main-Branch Conflict Gate */}
              <div className={`p-3.5 rounded-lg border flex items-center justify-between gap-3 ${
                selectedTask.mainBranchConflictRisk === 'high_conflict_detected'
                  ? 'bg-rose-950/20 border-rose-900/60 text-rose-300'
                  : 'bg-slate-950/60 border-slate-800 text-slate-300'
              }`}>
                <div className="flex items-center gap-2 text-xs">
                  <GitMerge className="w-4 h-4 text-indigo-400 shrink-0" />
                  <div>
                    <div className="font-semibold">Second Review Gate (Worktree → Main)</div>
                    <div className="text-[11px] text-slate-400">
                      {selectedTask.mainBranchConflictRisk === 'high_conflict_detected'
                        ? 'High conflict detected: Main branch changed while worktree ran.'
                        : 'Clean merge preview: No unmerged modifications on target files in main.'}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleApplyToMainGate}
                  disabled={selectedTask.state === 'applied'}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-colors shrink-0"
                >
                  {selectedTask.state === 'applied' ? 'Already Applied' : 'Run Second Review Gate'}
                </button>
              </div>

              {/* Safety Audit Box */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                  <ShieldAlert className="w-4 h-4 text-indigo-400" />
                  <span>Pre-Cleanup Safety Audit</span>
                </div>

                {audit.warnings.length > 0 ? (
                  <div className="space-y-1.5">
                    {audit.warnings.map((w, idx) => (
                      <div key={idx} className="text-xs text-amber-300 flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>All safety checks passed. Clean for archiving.</span>
                  </div>
                )}

                {audit.blockers.length > 0 && (
                  <div className="p-2.5 bg-rose-950/40 border border-rose-900/60 rounded text-xs text-rose-300">
                    {audit.blockers.join(' ')}
                  </div>
                )}
              </div>

              {/* Safe Cleanup Actions */}
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deleteGitBranch}
                    onChange={(e) => setDeleteGitBranch(e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                  />
                  <span>Also prune Git branch <code className="font-mono text-slate-400">({selectedTask.branchName})</code></span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSafeArchive}
                    className="px-3.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <Archive className="w-3.5 h-3.5 text-slate-400" />
                    <span>Safe Unmount &amp; Archive</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
