import React from 'react';
import { X, AlertTriangle, Trash2, CheckCircle2 } from 'lucide-react';

interface DiscardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmDiscard: () => void;
  worktreeBranch?: string;
}

export const DiscardModal: React.FC<DiscardModalProps> = ({
  isOpen,
  onClose,
  onConfirmDiscard,
  worktreeBranch = 'ai-coder/7a82f',
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#121620] border border-[#30363d] rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col text-slate-200 text-xs">
        <div className="px-4 py-3 bg-[#0d1118] border-b border-[#21262d] flex items-center justify-between">
          <div className="flex items-center gap-2 text-rose-400">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-semibold text-sm text-slate-100">Discard Task Changes</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-slate-300">
            Are you sure you want to discard all pending unmerged changes in worktree{' '}
            <code className="bg-[#17202e] text-blue-300 px-1 py-0.5 rounded font-mono">{worktreeBranch}</code>?
          </p>
          <div className="p-3 bg-[#0d121b] border border-slate-800 rounded-lg space-y-1.5 text-[11px] text-slate-400">
            <div className="text-slate-300 font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
              <span>Safety Guarantee:</span>
            </div>
            <p>
              A byte-exact checkpoint was recorded before editing and remains preserved in{' '}
              <span className="font-mono text-slate-300">.ai-coder/checkpoints</span> if you ever need to restore it.
            </p>
          </div>
        </div>

        <div className="px-4 py-3 bg-[#0d1118] border-t border-[#21262d] flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirmDiscard();
              onClose();
            }}
            className="px-4 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Discard Changes</span>
          </button>
        </div>
      </div>
    </div>
  );
};
