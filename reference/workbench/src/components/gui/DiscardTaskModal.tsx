import React from 'react';
import { X, AlertTriangle, Trash2, ShieldCheck, FileCode } from 'lucide-react';

interface DiscardTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmDiscard: () => void;
}

export const DiscardTaskModal: React.FC<DiscardTaskModalProps> = ({
  isOpen,
  onClose,
  onConfirmDiscard,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 select-none">
      <div className="bg-[#101520] border border-slate-700/80 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#21262d] flex items-center justify-between bg-[#0d121a]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Discard Task Changes</h3>
              <p className="text-[11px] text-slate-400">Reset worktree modifications to base commit</p>
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
          <p className="text-slate-300 leading-relaxed">
            Are you sure you want to discard the pending modifications in worktree <code className="text-emerald-300 font-mono">ai-coder/7a82f</code>?
          </p>

          <div className="p-3 bg-[#131924] border border-slate-800 rounded-xl space-y-2">
            <span className="text-[11px] font-semibold text-slate-400">Modifications to discard:</span>
            <div className="space-y-1 font-mono text-[11px]">
              <div className="flex items-center justify-between text-slate-300">
                <span className="flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-blue-400" />
                  src/auth/session.py
                </span>
                <span className="text-rose-400">-18 +6</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                  tests/test_auth.py
                </span>
                <span className="text-rose-400">-42 +0</span>
              </div>
            </div>
          </div>

          <div className="p-3 bg-emerald-950/20 border border-emerald-900/40 rounded-xl flex items-start gap-2.5 text-[11px]">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-slate-300 leading-relaxed">
              <strong className="text-emerald-300">Safety Guarantee:</strong> A byte-exact checkpoint snapshot (<code className="font-mono text-emerald-400">chk_9f2a7d1</code>) remains safe in <code className="font-mono text-slate-200">.ai-coder/checkpoints</code>. You can restore this state at any time.
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-[#182030] hover:bg-[#222c42] text-slate-300 transition-colors"
            >
              Keep Changes
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirmDiscard();
                onClose();
              }}
              className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Confirm Discard</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
