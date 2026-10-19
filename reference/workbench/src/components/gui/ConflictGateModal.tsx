import React, { useState } from 'react';
import { X, ShieldCheck, CheckCircle2, AlertTriangle, ArrowRight, FileCode, GitBranch, RefreshCw } from 'lucide-react';

interface ConflictGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmApply: () => void;
  worktreeBranch?: string;
}

export const ConflictGateModal: React.FC<ConflictGateModalProps> = ({
  isOpen,
  onClose,
  onConfirmApply,
  worktreeBranch = 'ai-coder/7a82f',
}) => {
  const [isVerifying, setIsVerifying] = useState(false);
  const [appliedSuccess, setAppliedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleApply = () => {
    setIsVerifying(true);
    setTimeout(() => {
      setIsVerifying(false);
      setAppliedSuccess(true);
      setTimeout(() => {
        onConfirmApply();
        onClose();
      }, 1400);
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#111722] border border-[#30363d] rounded-xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col text-slate-200 text-xs">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#0d121a] border-b border-[#21262d] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-blue-600/20 border border-blue-500/50 flex items-center justify-center text-blue-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-sm text-slate-100">Second Review Conflict Gate</div>
              <div className="text-[11px] text-slate-400">
                Verifying pre-conditions prior to applying changes into main branch
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Status banner */}
          <div className="p-3 bg-emerald-950/40 border border-emerald-800/80 rounded-lg flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-emerald-300">Clean Merge Candidate Identified</div>
              <div className="text-slate-300 text-[11px] mt-0.5">
                Isolated worktree <code className="text-emerald-400 bg-emerald-950/80 px-1 py-0.5 rounded font-mono">{worktreeBranch}</code> has completed all verification suites with zero detected regressions.
              </div>
            </div>
          </div>

          {/* Conflict Checklist */}
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
              Verification &amp; Invariants Audit
            </div>

            <div className="space-y-1.5 font-mono text-[11px] bg-[#0c1017] p-3 rounded-lg border border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">1. Base SHA-256 vs Current Main Disk:</span>
                <span className="text-emerald-400 font-semibold">MATCH (No Stale Edits)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">2. Pytest Regression Test Suite:</span>
                <span className="text-emerald-400 font-semibold">36/36 PASSED (2.31s)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">3. Flake8 Style &amp; PEP-8 Syntax:</span>
                <span className="text-emerald-400 font-semibold">CLEAN (0 Issues)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">4. Byte-Exact Checkpoint Snapshot:</span>
                <span className="text-blue-400 font-semibold">STORED (.ai-coder/checkpoints)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">5. Main Git Status:</span>
                <span className="text-emerald-400 font-semibold">CLEAN (Fast-Forward Ready)</span>
              </div>
            </div>
          </div>

          {/* Files to be applied */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-300">Files to be applied:</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-[#161c28] border border-slate-700/60 rounded flex items-center justify-between font-mono">
                <span className="text-slate-300 truncate">src/auth/session.py</span>
                <span className="text-emerald-400 shrink-0">+18 / -6</span>
              </div>
              <div className="p-2 bg-[#161c28] border border-slate-700/60 rounded flex items-center justify-between font-mono">
                <span className="text-slate-300 truncate">tests/test_auth.py</span>
                <span className="text-emerald-400 shrink-0">+42 / -0</span>
              </div>
            </div>
          </div>

          {appliedSuccess && (
            <div className="p-3 bg-emerald-900/60 border border-emerald-600 rounded-lg text-emerald-200 font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-300" />
              <span>Successfully applied into main branch! Worktree state archived.</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-[#0d121a] border-t border-[#21262d] flex items-center justify-between">
          <div className="text-[11px] text-slate-400">
            Byte-exact checkpoint preserved for safe 1-click rollback.
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isVerifying}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={isVerifying || appliedSuccess}
              className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
            >
              {isVerifying ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying &amp; Merging...</span>
                </>
              ) : (
                <>
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Apply Changes to Main</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
