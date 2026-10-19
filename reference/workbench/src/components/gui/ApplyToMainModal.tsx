import React, { useState } from 'react';
import { X, ShieldCheck, CheckCircle2, AlertTriangle, ArrowRight, GitBranch, GitCommit, FileCode, Lock } from 'lucide-react';

interface ApplyToMainModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmApply: () => void;
}

export const ApplyToMainModal: React.FC<ApplyToMainModalProps> = ({
  isOpen,
  onClose,
  onConfirmApply,
}) => {
  const [dryRunDone, setDryRunDone] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [appliedSuccess, setAppliedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleApply = () => {
    setIsApplying(true);
    setTimeout(() => {
      setIsApplying(false);
      setAppliedSuccess(true);
      setTimeout(() => {
        onConfirmApply();
        onClose();
        setAppliedSuccess(false);
        setDryRunDone(false);
      }, 1500);
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 select-none">
      <div className="bg-[#101520] border border-slate-700/80 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#21262d] flex items-center justify-between bg-[#0d121a]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Second-Stage Review &amp; Conflict Gate</h3>
              <p className="text-[11px] text-slate-400">Verifies invariants before merging isolated worktree into main repository</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs text-slate-300">
          {appliedSuccess ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/60 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6 animate-bounce" />
              </div>
              <h4 className="text-base font-semibold text-white">Cleanly Merged to Main!</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                All changes from worktree <code className="text-emerald-300 font-mono">ai-coder/7a82f</code> have been atomically applied to <code className="text-blue-300 font-mono">main</code>. Byte-exact checkpoint snapshot remains stored in <code className="text-slate-300 font-mono">.ai-coder/checkpoints</code>.
              </p>
            </div>
          ) : (
            <>
              {/* Branch & Worktree routing banner */}
              <div className="p-3 bg-[#131924] border border-slate-800 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="px-2 py-1 rounded bg-[#1c2434] font-mono text-[11px] text-emerald-300 border border-emerald-800/40">
                    worktree: ai-coder/7a82f
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  <div className="px-2 py-1 rounded bg-[#1c2434] font-mono text-[11px] text-blue-300 border border-blue-800/40">
                    branch: main (clean)
                  </div>
                </div>
                <span className="text-[11px] text-slate-400">Commit: 7a82fe1</span>
              </div>

              {/* 4 Invariant Verification Gates */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                  Automated Pre-Merge Invariant Checks:
                </span>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  {/* Gate 1 */}
                  <div className="p-2.5 rounded-lg bg-[#0d121c] border border-emerald-900/40 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-emerald-300">Base SHA-256 Verified</div>
                      <div className="text-[10px] text-slate-400">session.py disk hash matches pre-write state. Zero stale write collision.</div>
                    </div>
                  </div>

                  {/* Gate 2 */}
                  <div className="p-2.5 rounded-lg bg-[#0d121c] border border-emerald-900/40 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-emerald-300">36/36 Tests Passing</div>
                      <div className="text-[10px] text-slate-400">Full pytest verification suite ran cleanly in isolated worktree sandbox.</div>
                    </div>
                  </div>

                  {/* Gate 3 */}
                  <div className="p-2.5 rounded-lg bg-[#0d121c] border border-emerald-900/40 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-emerald-300">Zero Concurrent Git Changes</div>
                      <div className="text-[10px] text-slate-400">Main repository working tree is clean. Fast-forward merge guaranteed.</div>
                    </div>
                  </div>

                  {/* Gate 4 */}
                  <div className="p-2.5 rounded-lg bg-[#0d121c] border border-emerald-900/40 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-emerald-300">Checkpoint Snapshot Preserved</div>
                      <div className="text-[10px] text-slate-400">chk_9f2a7d1 recorded with byte-exact rollback capability.</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Files to merge */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-semibold text-slate-400">Files to be updated on main branch:</span>
                <div className="space-y-1 font-mono text-[11px]">
                  <div className="flex items-center justify-between p-2 rounded bg-[#141a27] border border-slate-800">
                    <div className="flex items-center gap-2">
                      <FileCode className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-slate-200">src/auth/session.py</span>
                    </div>
                    <span className="text-emerald-400 font-semibold">+18 -6 (Replace exact session lookup block)</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-[#141a27] border border-slate-800">
                    <div className="flex items-center gap-2">
                      <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-slate-200">tests/test_auth.py</span>
                    </div>
                    <span className="text-emerald-400 font-semibold">+42 -0 (Add invalid session regression tests)</span>
                  </div>
                </div>
              </div>

              {/* Dry run status */}
              {dryRunDone && (
                <div className="p-2.5 bg-blue-950/40 border border-blue-800/60 rounded-lg text-[11px] text-blue-300 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>Dry-run merge succeeded: 0 conflicts detected. Tree hash 9b441f matches cleanly.</span>
                </div>
              )}

              {/* Buttons */}
              <div className="pt-3 border-t border-[#21262d] flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setDryRunDone(true)}
                  className="px-3 py-1.5 rounded-lg bg-[#151c2a] hover:bg-[#1f283d] text-slate-300 text-xs border border-slate-700/60 transition-colors"
                >
                  {dryRunDone ? '✓ Dry Run Verified' : 'Run Dry-Run Merge Preview'}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-1.5 rounded-lg bg-[#182030] hover:bg-[#222c42] text-slate-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isApplying}
                    onClick={handleApply}
                    className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>{isApplying ? 'Applying Atomic Merge...' : 'Apply to Main Project'}</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
