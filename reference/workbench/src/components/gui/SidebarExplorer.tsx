import React, { useState } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  Folder, 
  FolderOpen, 
  FileCode, 
  Plus, 
  Sparkles, 
  LayoutGrid, 
  Check, 
  AlertCircle, 
  XCircle, 
  Clock,
  Search as SearchIcon,
  GitBranch,
  GitCommit,
  RotateCcw,
  CheckCircle2,
  FileText
} from 'lucide-react';
import { ActivityBarItem } from './ActivityBar';

export interface TaskItem {
  id: string;
  title: string;
  status: 'running' | 'ready' | 'review_required' | 'completed' | 'failed';
  mode: 'Agent' | 'Chat';
  createdAt: string;
  updatedAt: string;
  targetFile: string;
}

interface SidebarExplorerProps {
  tasks: TaskItem[];
  activeTaskId: string;
  onSelectTask: (taskId: string) => void;
  onNewTask: () => void;
  activeFilePath: string;
  onSelectFile: (filePath: string) => void;
  activeActivityItem?: ActivityBarItem;
}

// Custom Python icon matching the desktop IDE
const PythonIcon = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none">
    <path
      d="M11.9 2C6.4 2 6.8 4.4 6.8 4.4L6.8 6.9H12v.8H5.1S2 7.3 2 12.8s2.7 5.4 2.7 5.4h1.6v-2.3s-.1-2.7 2.7-2.7h5.1s2.6.1 2.6-2.6V5.4S17.4 2 11.9 2z"
      fill="#3776ab"
    />
    <path
      d="M12.1 22c5.5 0 5.1-2.4 5.1-2.4v-2.5H12v-.8h6.9s3.1.4 3.1-5.1-2.7-5.4-2.7-5.4h-1.6v2.3s.1 2.7-2.7 2.7H9.9s-2.6-.1-2.6 2.6v5.2S6.6 22 12.1 22z"
      fill="#ffd438"
    />
    <circle cx="9" cy="4.5" r="0.8" fill="#fff" />
    <circle cx="15" cy="19.5" r="0.8" fill="#fff" />
  </svg>
);

export const SidebarExplorer: React.FC<SidebarExplorerProps> = ({
  tasks,
  activeTaskId,
  onSelectTask,
  onNewTask,
  activeFilePath,
  onSelectFile,
  activeActivityItem = 'workspace',
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    root: true,
    src: true,
    auth: true,
    '.ai-coder': false,
    core: false,
    ui: false,
    tests: false,
    docs: false,
  });

  const [isTasksSectionOpen, setIsTasksSectionOpen] = useState(true);
  const [isExplorerSectionOpen, setIsExplorerSectionOpen] = useState(true);

  // Search state when Search tab is active
  const [searchQuery, setSearchQuery] = useState('');

  // Source Control commit state
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitted, setIsCommitted] = useState(false);

  const toggleFolder = (folderKey: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderKey]: !prev[folderKey],
    }));
  };

  const renderStatusBadge = (status: TaskItem['status']) => {
    switch (status) {
      case 'running':
        return (
          <span className="w-3.5 h-3.5 rounded-full bg-emerald-500/20 border border-emerald-500/60 flex items-center justify-center shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          </span>
        );
      case 'ready':
        return (
          <span className="w-3.5 h-3.5 rounded-full bg-slate-700/50 flex items-center justify-center shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
          </span>
        );
      case 'review_required':
        return (
          <span className="w-3.5 h-3.5 rounded-full bg-amber-500/20 border border-amber-500/60 flex items-center justify-center shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
          </span>
        );
      case 'completed':
        return (
          <span className="w-3.5 h-3.5 rounded-full bg-emerald-500/20 border border-emerald-500/60 flex items-center justify-center text-emerald-400 shrink-0">
            <Check className="w-2.5 h-2.5" />
          </span>
        );
      case 'failed':
        return (
          <span className="w-3.5 h-3.5 rounded-full bg-rose-500/20 border border-rose-500/60 flex items-center justify-center text-rose-400 shrink-0">
            <XCircle className="w-2.5 h-2.5" />
          </span>
        );
    }
  };

  // If ActivityBarItem is 'search'
  if (activeActivityItem === 'search') {
    return (
      <aside className="w-72 bg-[#0e131b] border-r border-[#21262d] flex flex-col h-full select-none shrink-0 overflow-y-auto">
        <div className="px-4 py-2.5 text-xs font-semibold text-slate-300 border-b border-[#21262d]">
          Search Codebase
        </div>
        <div className="p-3 space-y-3 text-xs">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search symbols, functions..."
              className="w-full bg-[#141a27] border border-slate-700 rounded-lg px-3 py-1.5 text-white placeholder:text-slate-500 text-xs outline-none"
            />
          </div>

          <div className="space-y-1.5 pt-2">
            <span className="text-[11px] font-semibold text-slate-400">Matching Results (4 files):</span>
            <div className="space-y-1 font-mono text-[11px]">
              <div 
                onClick={() => onSelectFile('src/auth/session.py')}
                className="p-2 rounded hover:bg-[#161c28] cursor-pointer text-slate-300 border border-slate-800"
              >
                <div className="font-semibold text-blue-300 flex items-center gap-1">
                  <FileCode className="w-3.5 h-3.5" />
                  <span>src/auth/session.py</span>
                </div>
                <div className="text-[10px] text-slate-400 pl-4 mt-1">line 74: def validate_session(token: str):</div>
              </div>

              <div 
                onClick={() => onSelectFile('tests/test_auth.py')}
                className="p-2 rounded hover:bg-[#161c28] cursor-pointer text-slate-300 border border-slate-800"
              >
                <div className="font-semibold text-emerald-300 flex items-center gap-1">
                  <FileCode className="w-3.5 h-3.5" />
                  <span>tests/test_auth.py</span>
                </div>
                <div className="text-[10px] text-slate-400 pl-4 mt-1">line 12: def test_validate_session_valid():</div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  // If ActivityBarItem is 'source_control'
  if (activeActivityItem === 'source_control') {
    return (
      <aside className="w-72 bg-[#0e131b] border-r border-[#21262d] flex flex-col h-full select-none shrink-0 overflow-y-auto">
        <div className="px-4 py-2.5 text-xs font-semibold text-slate-300 border-b border-[#21262d] flex items-center justify-between">
          <span>Source Control</span>
          <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
            ai-coder/7a82f
          </span>
        </div>

        <div className="p-3 space-y-3 text-xs">
          <div className="p-2.5 bg-[#141a27] border border-slate-800 rounded-lg space-y-2">
            <span className="text-[11px] font-medium text-slate-400">Worktree Commit:</span>
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Commit message (e.g. fix: token TTL refresh)"
              className="w-full bg-[#0d121c] border border-slate-700 rounded px-2.5 py-1 text-slate-200 text-xs outline-none"
            />
            <button
              onClick={() => {
                if (commitMessage) {
                  setIsCommitted(true);
                  setTimeout(() => setIsCommitted(false), 2000);
                  setCommitMessage('');
                }
              }}
              disabled={!commitMessage}
              className="w-full py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium text-xs transition-colors"
            >
              {isCommitted ? '✓ Committed to Worktree!' : 'Commit to Worktree'}
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold">
              <span>Working Tree Changes (2)</span>
              <span className="text-emerald-400">+60 -6</span>
            </div>

            <div className="space-y-1 font-mono text-[11px]">
              <div 
                onClick={() => onSelectFile('src/auth/session.py')}
                className="flex items-center justify-between p-2 rounded hover:bg-[#161c28] cursor-pointer text-slate-300 bg-[#131924] border border-slate-800"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="truncate">session.py</span>
                </div>
                <span className="text-amber-400 font-bold">M</span>
              </div>

              <div 
                onClick={() => onSelectFile('tests/test_auth.py')}
                className="flex items-center justify-between p-2 rounded hover:bg-[#161c28] cursor-pointer text-slate-300 bg-[#131924] border border-slate-800"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <FileCode className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">test_auth.py</span>
                </div>
                <span className="text-emerald-400 font-bold">A</span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  // Default: Project Explorer + AI Tasks (Matching image.png)
  return (
    <aside className="w-72 bg-[#0e131b] border-r border-[#21262d] flex flex-col h-full select-none shrink-0 overflow-y-auto">
      {/* 1. Project Explorer Section */}
      <div className="flex flex-col border-b border-[#21262d]">
        <div 
          onClick={() => setIsExplorerSectionOpen(!isExplorerSectionOpen)}
          className="px-3 py-2 flex items-center justify-between text-xs text-slate-400 hover:text-white cursor-pointer group"
        >
          <div className="flex items-center gap-1.5 font-semibold tracking-wider text-[11px] uppercase text-slate-300">
            {isExplorerSectionOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span>Project Explorer</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNewTask();
            }}
            className="p-1 hover:text-white text-slate-500 rounded hover:bg-[#1a2230] transition-colors"
            title="Create New Task"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {isExplorerSectionOpen && (
          <div className="pb-2 text-xs font-mono text-slate-300 select-none">
            {/* Root folder: AI-CODER-Desktop-MVP */}
            <div 
              onClick={() => toggleFolder('root')}
              className="flex items-center gap-1.5 px-3 py-1 hover:bg-[#141a24] cursor-pointer text-slate-200"
            >
              {expandedFolders.root ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              )}
              {expandedFolders.root ? (
                <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
              ) : (
                <Folder className="w-3.5 h-3.5 text-blue-400" />
              )}
              <span className="font-semibold text-slate-100">AI-CODER-Desktop-MVP</span>
            </div>

            {expandedFolders.root && (
              <div className="pl-4 space-y-0.5">
                {/* .ai-coder directory */}
                <div 
                  onClick={() => toggleFolder('.ai-coder')}
                  className="flex items-center gap-1.5 px-2 py-0.5 hover:bg-[#141a24] cursor-pointer text-slate-400"
                >
                  {expandedFolders['.ai-coder'] ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  <Folder className="w-3.5 h-3.5 text-amber-500/70" />
                  <span>.ai-coder</span>
                </div>

                {/* src directory */}
                <div 
                  onClick={() => toggleFolder('src')}
                  className="flex items-center gap-1.5 px-2 py-0.5 hover:bg-[#141a24] cursor-pointer text-slate-200"
                >
                  {expandedFolders.src ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  {expandedFolders.src ? (
                    <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                  ) : (
                    <Folder className="w-3.5 h-3.5 text-blue-400" />
                  )}
                  <span>src</span>
                </div>

                {expandedFolders.src && (
                  <div className="pl-4 space-y-0.5">
                    {/* src/auth directory */}
                    <div 
                      onClick={() => toggleFolder('auth')}
                      className="flex items-center gap-1.5 px-2 py-0.5 hover:bg-[#141a24] cursor-pointer text-slate-200"
                    >
                      {expandedFolders.auth ? (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                      )}
                      {expandedFolders.auth ? (
                        <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                      ) : (
                        <Folder className="w-3.5 h-3.5 text-blue-400" />
                      )}
                      <span>auth</span>
                    </div>

                    {expandedFolders.auth && (
                      <div className="pl-5 space-y-0.5">
                        <div 
                          onClick={() => onSelectFile('src/auth/session.py')}
                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition-colors ${
                            activeFilePath === 'src/auth/session.py'
                              ? 'bg-blue-600/20 text-blue-300 font-medium'
                              : 'hover:bg-[#141a24] text-slate-300'
                          }`}
                        >
                          <PythonIcon />
                          <span>session.py</span>
                        </div>
                        <div 
                          onClick={() => onSelectFile('src/auth/token.py')}
                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition-colors ${
                            activeFilePath === 'src/auth/token.py'
                              ? 'bg-blue-600/20 text-blue-300 font-medium'
                              : 'hover:bg-[#141a24] text-slate-400'
                          }`}
                        >
                          <PythonIcon />
                          <span>token.py</span>
                        </div>
                      </div>
                    )}

                    {/* src/db directory */}
                    <div 
                      onClick={() => toggleFolder('core')}
                      className="flex items-center gap-1.5 px-2 py-0.5 hover:bg-[#141a24] cursor-pointer text-slate-400"
                    >
                      {expandedFolders.core ? (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                      )}
                      <Folder className="w-3.5 h-3.5 text-blue-400/70" />
                      <span>db</span>
                    </div>
                  </div>
                )}

                {/* tests directory */}
                <div 
                  onClick={() => toggleFolder('tests')}
                  className="flex items-center gap-1.5 px-2 py-0.5 hover:bg-[#141a24] cursor-pointer text-slate-300"
                >
                  {expandedFolders.tests ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  {expandedFolders.tests ? (
                    <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Folder className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span>tests</span>
                </div>

                {expandedFolders.tests && (
                  <div className="pl-5 space-y-0.5">
                    <div 
                      onClick={() => onSelectFile('tests/test_auth.py')}
                      className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition-colors ${
                        activeFilePath === 'tests/test_auth.py'
                          ? 'bg-blue-600/20 text-blue-300 font-medium'
                          : 'hover:bg-[#141a24] text-slate-300'
                      }`}
                    >
                      <PythonIcon />
                      <span>test_auth.py</span>
                    </div>
                  </div>
                )}

                {/* README.md */}
                <div 
                  onClick={() => onSelectFile('README.md')}
                  className="flex items-center gap-1.5 px-2 py-0.5 hover:bg-[#141a24] cursor-pointer text-slate-400"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-400 ml-4" />
                  <span>README.md</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. AI Tasks Section (Matching image.png) */}
      <div className="flex-1 flex flex-col min-h-0">
        <div 
          onClick={() => setIsTasksSectionOpen(!isTasksSectionOpen)}
          className="px-3 py-2 flex items-center justify-between text-xs text-slate-400 hover:text-white cursor-pointer border-b border-[#21262d] bg-[#0c1017]"
        >
          <div className="flex items-center gap-1.5 font-semibold tracking-wider text-[11px] uppercase text-slate-300">
            {isTasksSectionOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span>AI Tasks ({tasks.length})</span>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onNewTask();
            }}
            className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 font-normal px-1.5 py-0.5 rounded hover:bg-[#141a27] transition-colors"
          >
            <Plus className="w-3 h-3" />
            <span>New Task</span>
          </button>
        </div>

        {isTasksSectionOpen && (
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {tasks.map((task) => {
              const isActive = task.id === activeTaskId;
              return (
                <div
                  key={task.id}
                  onClick={() => onSelectTask(task.id)}
                  className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                    isActive
                      ? 'bg-[#151d2b] border-blue-500/70 text-white shadow-sm'
                      : 'bg-[#111620] border-slate-800/80 text-slate-300 hover:bg-[#161c28] hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-xs leading-snug line-clamp-2">
                      {task.title}
                    </span>
                    {renderStatusBadge(task.status)}
                  </div>

                  <div className="flex items-center justify-between mt-2 pt-1 border-t border-[#1c2434] text-[10px] text-slate-400">
                    <span className="font-mono text-slate-400">{task.mode}</span>
                    <span className="text-slate-500">{task.updatedAt}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};
