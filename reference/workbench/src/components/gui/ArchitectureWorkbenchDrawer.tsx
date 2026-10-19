import React from 'react';
import { X, Sparkles, Sliders, Database, Code, FolderGit2, ShieldCheck, Cpu, BookOpen } from 'lucide-react';
import { ModelCatalogView } from '../ModelCatalogView';
import { RouterView } from '../RouterView';
import { ContextRetrievalView } from '../ContextRetrievalView';
import { PatchCompilerView } from '../PatchCompilerView';
import { LifecycleView } from '../LifecycleView';
import { ConformanceView } from '../ConformanceView';
import { ConcurrencyView } from '../ConcurrencyView';
import { ModelMetadata, TaskWorktree, RepoFile } from '../../types';

export type WorkbenchTab = 
  | 'discovery'
  | 'router'
  | 'context'
  | 'patch'
  | 'lifecycle'
  | 'conformance'
  | 'concurrency';

interface ArchitectureWorkbenchDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: WorkbenchTab;
  onTabChange: (tab: WorkbenchTab) => void;
  models: ModelMetadata[];
  onUpdateModels: (models: ModelMetadata[]) => void;
  lastRefreshed: string;
  tasks: TaskWorktree[];
  onUpdateTasks: (tasks: TaskWorktree[]) => void;
  files: RepoFile[];
  onOpenArchGuide: () => void;
}

export const ArchitectureWorkbenchDrawer: React.FC<ArchitectureWorkbenchDrawerProps> = ({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  models,
  onUpdateModels,
  lastRefreshed,
  tasks,
  onUpdateTasks,
  files,
  onOpenArchGuide,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 sm:p-6">
      <div className="bg-[#0e131d] border border-slate-700/80 rounded-2xl w-full max-w-6xl h-[92vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Top Header */}
        <div className="px-6 py-3.5 border-b border-[#21262d] flex items-center justify-between bg-[#111724]">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded bg-blue-600/30 border border-blue-500/50 flex items-center justify-center text-blue-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <span>AI-CODER Architecture &amp; Connections Workbench</span>
                <span className="text-[11px] font-mono text-emerald-400 font-normal px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60">
                  v0.4.7 Spec
                </span>
              </h2>
              <div className="text-xs text-slate-400 mt-0.5">
                Runtime model routing, import-graph context selection, safe in-memory patches &amp; conformance suite
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenArchGuide}
              className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-[#192234] hover:bg-[#202c42] border border-slate-700/60 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <BookOpen className="w-3.5 h-3.5 text-blue-400" />
              <span>Roadmap &amp; Priority Matrix</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a2232] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Strip */}
        <div className="px-6 py-2 border-b border-[#21262d] bg-[#0c1017] flex items-center gap-1 overflow-x-auto text-xs font-medium">
          <button
            onClick={() => onTabChange('router')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'router'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#151c28]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Two-Stage Router Lab (P1)</span>
          </button>

          <button
            onClick={() => onTabChange('context')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'context'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#151c28]'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Smart Context Engine (P1)</span>
          </button>

          <button
            onClick={() => onTabChange('discovery')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'discovery'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#151c28]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Dynamic Discovery &amp; Capabilities</span>
          </button>

          <button
            onClick={() => onTabChange('patch')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'patch'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#151c28]'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>In-Memory Patch Compiler</span>
          </button>

          <button
            onClick={() => onTabChange('lifecycle')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'lifecycle'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#151c28]'
            }`}
          >
            <FolderGit2 className="w-3.5 h-3.5" />
            <span>Worktrees &amp; Tasks</span>
          </button>

          <button
            onClick={() => onTabChange('conformance')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'conformance'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#151c28]'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Security Parity Vectors</span>
          </button>

          <button
            onClick={() => onTabChange('concurrency')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'concurrency'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#151c28]'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Atomic Mutex Simulator</span>
          </button>
        </div>

        {/* Tab Content Panel */}
        <div className="flex-1 p-6 overflow-y-auto bg-[#0a0e16]">
          {activeTab === 'router' && <RouterView models={models} />}
          {activeTab === 'context' && <ContextRetrievalView files={files} />}
          {activeTab === 'discovery' && (
            <ModelCatalogView
              models={models}
              onUpdateModels={onUpdateModels}
              lastRefreshed={lastRefreshed}
            />
          )}
          {activeTab === 'patch' && <PatchCompilerView />}
          {activeTab === 'lifecycle' && (
            <LifecycleView tasks={tasks} onUpdateTasks={onUpdateTasks} />
          )}
          {activeTab === 'conformance' && <ConformanceView />}
          {activeTab === 'concurrency' && <ConcurrencyView />}
        </div>
      </div>
    </div>
  );
};
