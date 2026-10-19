import React from 'react';
import { X, FolderArchive, GitBranch, GitFork, ShieldCheck, Terminal, Copy, Check } from 'lucide-react';

interface WorktreeModalProps {
  isOpen: boolean;
  onClose: () => void;
  worktreeName?: string;
}

export const WorktreeModal: React.FC<WorktreeModalProps> = ({
  isOpen,
  onClose,
  worktreeName = 'ai-coder/7a82f',
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

  const worktreePath = `~/.ai-coder/worktrees/${worktreeName.replace('ai-coder/', '')}`;

  const handleCopyPath = () => {
    navigator.clipboard.writeText(worktreePath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 select-none">
      <div className="bg-[#101520] border border-slate-700/80 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#21262d] flex items-center justify-between bg-[#0d121a]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <FolderArchive className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Isolated Git Worktree Inspector</h3>
              <p className="text-[11px] text-slate-400">Hardware-isolated filesystem sandbox for autonomous agent execution</p>
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
          <div className="p-3 bg-[#131924] border border-slate-800 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">Worktree Branch:</span>
              <span className="font-mono text-emerald-300 font-semibold px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-[11px]">
                {worktreeName}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">Filesystem Path:</span>
              <div className="flex items-center gap-1.5 font-mono text-slate-200 text-[11px]">
                <span>{worktreePath}</span>
                <button
                  onClick={handleCopyPath}
                  className="p-1 hover:text-white text-slate-400"
                  title="Copy path"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">Main Branch Isolation:</span>
              <span className="text-emerald-400 font-semibold text-[11px]">100% Isolated (zero disk impact on main)</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">Git Command Allowlist:</span>
              <span className="font-mono text-blue-300 text-[11px]">git status, diff, log, checkout</span>
            </div>
          </div>

          <div className="p-3 bg-[#0d121c] border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-slate-300 font-semibold text-[11px]">
              <Terminal className="w-3.5 h-3.5 text-blue-400" />
              <span>Active Worktree Shell Commands:</span>
            </div>
            <pre className="font-mono text-[11px] text-slate-400 bg-[#090d14] p-2.5 rounded-lg overflow-x-auto leading-relaxed">
              <span className="text-blue-400"># Verify isolated branches:</span>{'\n'}
              git worktree list{'\n'}
              <span className="text-slate-500">/workspace              6f2c41e [main]</span>{'\n'}
              <span className="text-emerald-400">~/.ai-coder/worktrees/7a82f  7a82fe1 [ai-coder/7a82f]</span>{'\n\n'}
              <span className="text-blue-400"># Inspect diff against main:</span>{'\n'}
              git diff main...HEAD
            </pre>
          </div>

          <div className="p-3 bg-emerald-950/20 border border-emerald-900/40 rounded-xl flex items-start gap-2.5 text-[11px]">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-slate-300 leading-relaxed">
              <strong className="text-emerald-300">Stale Change &amp; Conflict Prevention:</strong> If anyone modifies <code className="text-blue-300 font-mono">main</code> while the agent is running, the second-stage review gate detects the divergence and refuses to overwrite main without explicit re-basing.
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-sm transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
