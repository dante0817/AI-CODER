import React from 'react';
import { Terminal, Shield, Play, BookOpen } from 'lucide-react';

export type ActiveTab = 
  | 'discovery'
  | 'router'
  | 'context'
  | 'patch'
  | 'lifecycle'
  | 'conformance'
  | 'concurrency';

interface HeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onOpenRunner: () => void;
  onOpenArchGuide: () => void;
  modelsCount: number;
  activeTasksCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  onOpenRunner,
  onOpenArchGuide,
  modelsCount,
  activeTasksCount
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-950 px-6 py-3.5 flex items-center justify-between sticky top-0 z-30">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <a 
          href="/" 
          onClick={(e) => { e.preventDefault(); onTabChange('router'); }}
          className="text-base font-semibold tracking-tight text-slate-100 flex items-center gap-2 hover:text-white"
        >
          <div className="w-7 h-7 rounded bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Terminal className="w-4 h-4" />
          </div>
          <span>AI-CODER</span>
          <span className="text-xs text-slate-500 font-mono font-normal">v0.4.7 Architecture Workbench</span>
        </a>
      </div>

      {/* Zone 2: Navigation Links / Segmented Functional Tabs */}
      <nav className="hidden lg:flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
        <button
          onClick={() => onTabChange('discovery')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'discovery'
              ? 'bg-slate-800 text-slate-100 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Dynamic Discovery
          <span className="ml-1.5 text-[11px] text-slate-500 font-mono tabular-nums">({modelsCount})</span>
        </button>

        <button
          onClick={() => onTabChange('router')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'router'
              ? 'bg-slate-800 text-slate-100 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Two-Stage Router
        </button>

        <button
          onClick={() => onTabChange('context')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'context'
              ? 'bg-slate-800 text-slate-100 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Smart Context
        </button>

        <button
          onClick={() => onTabChange('patch')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'patch'
              ? 'bg-slate-800 text-slate-100 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          In-Memory Patch
        </button>

        <button
          onClick={() => onTabChange('lifecycle')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'lifecycle'
              ? 'bg-slate-800 text-slate-100 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Worktrees &amp; Tasks
          <span className="ml-1.5 text-[11px] text-slate-500 font-mono tabular-nums">({activeTasksCount})</span>
        </button>

        <button
          onClick={() => onTabChange('conformance')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'conformance'
              ? 'bg-slate-800 text-slate-100 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            Security Parity
          </span>
        </button>

        <button
          onClick={() => onTabChange('concurrency')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'concurrency'
              ? 'bg-slate-800 text-slate-100 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Atomic Persistence
        </button>
      </nav>

      {/* Zone 3: Primary Actions */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={onOpenArchGuide}
          className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
          title="Inspect v0.4.7 Architecture Blueprint & Priority Matrix"
        >
          <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
          <span>v0.4.7 Review &amp; Priorities</span>
        </button>

        <button
          onClick={onOpenRunner}
          className="px-3.5 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm whitespace-nowrap"
          title="Simulate Active Task Execution with Per-Stage Cancellation"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Execute Task Run</span>
        </button>
      </div>
    </header>
  );
};
