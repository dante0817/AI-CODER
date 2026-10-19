import React, { useState } from 'react';
import { X, ShieldCheck, CheckCircle2, History, RotateCcw, FileText, Check } from 'lucide-react';

interface CheckpointInspectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRollbackComplete?: () => void;
}

export const CheckpointInspectionModal: React.FC<CheckpointInspectionModalProps> = ({
  isOpen,
  onClose,
  onRollbackComplete,
}) => {
  const [restored, setRestored] = useState(false);

  if (!isOpen) return null;

  const handleRollback = () => {
    setRestored(true);
    setTimeout(() => {
      onRollbackComplete?.();
      setRestored(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#111722] border border-[#30363d] rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col text-slate-200 text-xs">
        <div className="px-5 py-3.5 bg-[#0d121a] border-b border-[#21262d] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold text-sm text-slate-100">Byte-Exact Checkpoint Inspector</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="p-3 bg-[#151c28] border border-slate-800 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-blue-400 font-semibold">chk_7a82f_pre_auth_fix.bak</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800">
                SHA-256 MATCH
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Captured prior to in-memory patch write · SHA-256: <code className="text-slate-300">8f2b4c10...9e3a</code>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-300">Included Pre-Change Files:</div>
            <div className="space-y-1 font-mono text-[11px] bg-[#0c1017] p-3 rounded border border-slate-800">
              <div className="flex items-center justify-between text-slate-300">
                <span>src/auth/session.py</span>
                <span className="text-slate-500">1,420 bytes</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>tests/test_auth.py</span>
                <span className="text-slate-500">2,180 bytes</span>
              </div>
            </div>
          </div>

          {restored && (
            <div className="p-3 bg-emerald-950/80 border border-emerald-600 rounded-lg text-emerald-200 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>Byte-exact state successfully restored to working copy!</span>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 bg-[#0d121a] border-t border-[#21262d] flex items-center justify-between">
          <span className="text-[11px] text-slate-400">Safe Windows handle-based I/O active</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleRollback}
              disabled={restored}
              className="px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore Pre-Write State</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
