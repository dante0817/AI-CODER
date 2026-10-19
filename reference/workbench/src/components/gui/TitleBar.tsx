import React from 'react';
import { Search, Sparkles, Settings as SettingsIcon, Minus, Square, X, ChevronDown } from 'lucide-react';

interface TitleBarProps {
  projectName?: string;
  isConnected?: boolean;
  onOpenCommandPalette: () => void;
  onOpenAIConnections: () => void;
  onOpenSettings: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  projectName = 'AI-CODER-Desktop-MVP',
  isConnected = true,
  onOpenCommandPalette,
  onOpenAIConnections,
  onOpenSettings,
}) => {
  return (
    <div className="h-10 bg-[#0d1117] border-b border-[#21262d] flex items-center justify-between px-3 select-none shrink-0 text-xs text-slate-300">
      {/* Left: AI-CODER Icon & Project Dropdown */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {/* Logo badge */}
          <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center text-white shadow-xs">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-none stroke-current stroke-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="font-bold tracking-tight text-white font-mono text-[13px]">AI-CODER</span>
        </div>

        {/* Project Selector Dropdown matching image */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-[#161c28] text-slate-200 cursor-pointer font-medium transition-colors">
          <span>{projectName}</span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </div>
      </div>

      {/* Center: Search / Command Palette Bar */}
      <button
        onClick={onOpenCommandPalette}
        className="flex items-center gap-2 bg-[#161b22] hover:bg-[#1f242c] text-slate-400 hover:text-slate-200 border border-[#30363d] rounded-md px-3 py-1 text-xs w-72 md:w-96 justify-between transition-colors shadow-2xs"
      >
        <div className="flex items-center gap-2 truncate">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="truncate">Search files, tasks, or commands...</span>
        </div>
        <kbd className="bg-[#21262d] text-slate-400 px-1.5 py-0.5 rounded text-[10px] font-mono border border-slate-700/60">
          Ctrl+K
        </kbd>
      </button>

      {/* Right Controls: Status, AI Connections, Settings, Window buttons */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-slate-300">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
          <span className="hidden md:inline">{isConnected ? 'Connected' : 'Offline'}</span>
        </div>

        <button
          onClick={onOpenAIConnections}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-slate-200 text-xs font-medium transition-colors border border-slate-700/50"
          title="Open AI Connections & Architecture Engine"
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          <span className="hidden sm:inline">AI Connections</span>
        </button>

        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-[#21262d] text-slate-300 hover:text-white transition-colors"
          title="Settings"
        >
          <SettingsIcon className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden lg:inline text-xs">Settings</span>
        </button>

        <div className="flex items-center ml-2 border-l border-slate-700/50 pl-2 text-slate-400">
          <button className="p-1 hover:text-white hover:bg-slate-800 rounded">
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button className="p-1 hover:text-white hover:bg-slate-800 rounded">
            <Square className="w-3 h-3" />
          </button>
          <button className="p-1 hover:text-white hover:bg-rose-600 rounded">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
