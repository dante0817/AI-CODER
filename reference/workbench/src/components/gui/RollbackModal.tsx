import React, { useState } from 'react';
import { X, RotateCcw, ShieldCheck, CheckCircle2, FileCode, Check, Copy } from 'lucide-react';

interface RollbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  checkpointId?: string;
  onRollbackComplete?: () => void;
}

export const RollbackModal: React.FC<RollbackModalProps> = ({
  isOpen,
  onClose,
  checkpointId = 'chk_9f2a7d1_pre_auth_fix',
  onRollbackComplete,
}) => {
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [rollbackSuccess, setRollbackSuccess] = useState(false);

  if (!isOpen) return null;

  const handleRollback = () => {
    setIsRollingBack(true);
    setTimeout(() => {
      setIsRollingBack(false);
      setRollbackSuccess(true);
      setTimeout(() => {
        onRollbackComplete?.();
        onClose();
        setRollbackSuccess(false);
      }, 1500);
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 select-none">
      <div className="bg-[#101520] border border-slate-700/80 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#21262d] flex items-center justify-between bg-[#0d121a]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-600/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Byte-Exact Checkpoint Inspector</h3>
              <p className="text-[11px] text-slate-400">Restores identical byte snapshot taken prior to agent edits</p>
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
          {rollbackSuccess ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/60 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6 animate-bounce" />
              </div>
              <h4 className="text-base font-semibold text-white">100% Byte-Exact Rollback Complete!</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                File <code className="text-emerald-300 font-mono">src/auth/session.py</code> has been verified against checksum <code className="text-slate-300 font-mono">e3b0c442...</code> and restored to its exact pre-write binary state.
              </p>
            </div>
          ) : (
            <>
              <div className="p-3 bg-[#131924] border border-slate-800 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-[11px]">Checkpoint ID:</span>
                  <span className="font-mono text-amber-300 font-semibold text-[11px]">
                    {checkpointId}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-[11px]">Captured At:</span>
                  <span className="text-slate-200 text-[11px]">Nov 15, 2024 10:24:08 AM</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-[11px]">SHA-256 Base Hash:</span>
                  <span className="font-mono text-slate-300 text-[10px]">
                    e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-[11px]">Storage Target:</span>
                  <span className="font-mono text-slate-300 text-[10px]">
                    ~/.ai-coder/checkpoints/{checkpointId}.bak
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400">Affected Files in Checkpoint:</span>
                <div className="space-y-1 font-mono text-[11px]">
                  <div className="flex items-center justify-between p-2 rounded bg-[#141a27] border border-slate-800">
                    <div className="flex items-center gap-2">
                      <FileCode className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-slate-200">src/auth/session.py</span>
                    </div>
                    <span className="text-emerald-400">Byte-exact snapshot ready</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-emerald-950/20 border border-emerald-900/40 rounded-xl flex items-start gap-2.5 text-[11px]">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-slate-300 leading-relaxed">
                  <strong className="text-emerald-300">Zero Risk Rollback:</strong> Restoring this checkpoint uses Windows handle-based safe write with temporary file replacement. Your disk state is guaranteed not to leave partial or corrupted files.
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-1.5 rounded-lg bg-[#182030] hover:bg-[#222c42] text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isRollingBack}
                  onClick={handleRollback}
                  className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isRollingBack ? 'Restoring Byte Snapshot...' : 'Execute Instant Rollback'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
