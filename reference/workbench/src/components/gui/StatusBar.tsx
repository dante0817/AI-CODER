import React from 'react';
import { GitBranch, FolderGit2, Cpu, Database, Bell, CheckCircle2 } from 'lucide-react';

interface StatusBarProps {
  onOpenModelRouter: () => void;
  onOpenContextEngine: () => void;
  worktreeName?: string;
  contextUsage?: string;
  modelName?: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  onOpenModelRouter,
  onOpenContextEngine,
  worktreeName = 'ai-coder/7a82f',
  contextUsage = '51 KB / 80 KB',
  modelName = 'GPT-5.6 Sol (Auto)',
}) => {
  return (
    <footer className="h-6 bg-[#090d14] border-t border-[#1c222e] flex items-center justify-between px-3 text-[11px] font-mono text-slate-400 select-none shrink-0 z-30">
      {/* Left side items */}
      <div className="flex items-center gap-3">
        {/* Agent ready */}
        <div className="flex items-center gap-1.5 text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>Agent ready</span>
        </div>

        {/* Main branch: clean */}
        <div className="flex items-center gap-1.5 hover:text-white cursor-pointer transition-colors">
          <GitBranch className="w-3 h-3 text-slate-400" />
          <span>Main branch: clean</span>
        </div>

        {/* Worktree: ai-coder/7a82f */}
        <div className="flex items-center gap-1.5 hover:text-white cursor-pointer transition-colors text-blue-300">
          <FolderGit2 className="w-3 h-3 text-blue-400" />
          <span>Worktree: {worktreeName}</span>
        </div>

        {/* Context usage */}
        <button
          onClick={onOpenContextEngine}
          className="flex items-center gap-1.5 hover:text-white transition-colors"
          title="Inspect Smart Context Graph"
        >
          <Database className="w-3 h-3 text-slate-400" />
          <span>Context: {contextUsage}</span>
        </button>

        {/* Model info */}
        <button
          onClick={onOpenModelRouter}
          className="flex items-center gap-1.5 hover:text-white transition-colors text-slate-200"
          title="Inspect Model Router"
        >
          <Cpu className="w-3 h-3 text-indigo-400" />
          <span>Model: {modelName}</span>
        </button>
      </div>

      {/* Right side items */}
      <div className="flex items-center gap-3 text-slate-400">
        <span className="hover:text-white cursor-pointer">Windows (CRLF)</span>
        <span className="hover:text-white cursor-pointer">Python 3.11</span>
        <span className="hover:text-white cursor-pointer">UTF-8</span>
        <button className="hover:text-white transition-colors">
          <Bell className="w-3 h-3 text-slate-400" />
        </button>
      </div>
    </footer>
  );
};
