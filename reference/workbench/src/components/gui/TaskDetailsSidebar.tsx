import React, { useState } from 'react';
import { 
  X, 
  Edit2, 
  ChevronDown, 
  ChevronUp, 
  FileCode, 
  Folder, 
  FolderArchive, 
  CheckCircle2, 
  RefreshCw, 
  Trash2, 
  ArrowRight, 
  MoreHorizontal, 
  ShieldCheck, 
  ExternalLink 
} from 'lucide-react';

interface TaskDetailsSidebarProps {
  onClose: () => void;
  onOpenContextInspect: () => void;
  onOpenCheckpointView: () => void;
  onApplyToMain: () => void;
  onDiscardChanges: () => void;
  onOpenRouterDetails: () => void;
  taskTitle?: string;
  status?: string;
}

export const TaskDetailsSidebar: React.FC<TaskDetailsSidebarProps> = ({
  onClose,
  onOpenContextInspect,
  onOpenCheckpointView,
  onApplyToMain,
  onDiscardChanges,
  onOpenRouterDetails,
  taskTitle = 'Fix authentication issue',
  status = 'Running',
}) => {
  const [isWhyModelOpen, setIsWhyModelOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [currentTitle, setCurrentTitle] = useState(taskTitle);

  return (
    <aside className="w-80 bg-[#10151f] border-l border-[#21262d] flex flex-col h-full select-none shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#21262d] flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-200">Task Details</span>
        <button
          onClick={onClose}
          className="p-1 hover:text-white hover:bg-[#1a2232] rounded text-slate-400 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-4 space-y-5 text-xs text-slate-300">
        {/* Task Title & Meta */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            {isEditingTitle ? (
              <input
                type="text"
                value={currentTitle}
                onChange={(e) => setCurrentTitle(e.target.value)}
                onBlur={() => setIsEditingTitle(false)}
                autoFocus
                className="bg-[#161c28] border border-blue-500 rounded px-2 py-0.5 text-xs text-white outline-none w-full"
              />
            ) : (
              <h2 className="font-semibold text-sm text-slate-100 truncate flex-1">
                {currentTitle}
              </h2>
            )}
            <button
              onClick={() => setIsEditingTitle(!isEditingTitle)}
              className="p-1 hover:text-white text-slate-400 ml-2"
              title="Edit Task Title"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
            <div>
              Status:{' '}
              <span className="inline-flex items-center gap-1 font-medium text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                {status}
              </span>
            </div>
            <div>
              Mode: <span className="text-slate-200 font-medium">Agent</span>
            </div>
            <div>Created: <span className="text-slate-300">Nov 15, 2024 10:23 AM</span></div>
            <div>Updated: <span className="text-slate-300">2 minutes ago</span></div>
          </div>
        </div>

        {/* Section: Model & Routing */}
        <div className="pt-3 border-t border-[#1f2636] space-y-2">
          <div className="font-semibold text-slate-200 text-xs">Model &amp; Routing</div>
          <div className="grid grid-cols-2 gap-y-1.5 text-[11px]">
            <div className="text-slate-400">Provider</div>
            <div className="text-slate-200 font-medium text-right">Auto</div>
            <div className="text-slate-400">Model</div>
            <div className="text-slate-200 font-medium text-right font-mono">GPT-5.6 Sol</div>
            <div className="text-slate-400">Effort</div>
            <div className="text-slate-200 font-medium text-right">High</div>
            <div className="text-slate-400">Routing</div>
            <div className="text-slate-200 font-medium text-right">Quality</div>
          </div>

          {/* Accordion: Why this model? */}
          <div className="pt-1">
            <button
              onClick={() => setIsWhyModelOpen(!isWhyModelOpen)}
              className="w-full flex items-center justify-between text-[11px] text-slate-400 hover:text-slate-200 py-1"
            >
              <span>Why this model?</span>
              {isWhyModelOpen ? (
                <ChevronUp className="w-3 h-3 text-slate-400" />
              ) : (
                <ChevronDown className="w-3 h-3 text-slate-400" />
              )}
            </button>

            {isWhyModelOpen && (
              <div className="p-2.5 bg-[#141a26] border border-slate-800 rounded-lg text-[11px] text-slate-300 space-y-1.5 mt-1">
                <div className="font-semibold text-emerald-400">Two-Stage Router Gate:</div>
                <p className="text-slate-400 leading-relaxed">
                  Stage 1 verified hard requirements (structured JSON agent output, 128k context). Stage 2 scored #1 for debugging depth (0.96) and quality preference.
                </p>
                <button
                  onClick={onOpenRouterDetails}
                  className="text-blue-400 hover:text-blue-300 font-mono text-[10px] inline-flex items-center gap-1"
                >
                  <span>Open Router Lab</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Section: Context */}
        <div className="pt-3 border-t border-[#1f2636] space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-200">Context</span>
            <span className="text-[11px] text-slate-400 font-mono">18 files / 51 KB</span>
          </div>

          {/* Progress bar (64%) */}
          <div className="w-full bg-[#182030] rounded-full h-1.5 overflow-hidden border border-slate-800">
            <div className="bg-blue-500 h-full rounded-full" style={{ width: '64%' }} />
          </div>

          <button
            onClick={onOpenContextInspect}
            className="w-full py-1.5 px-3 rounded bg-[#172030] hover:bg-[#202a3f] border border-slate-700/60 text-slate-200 text-xs font-medium transition-colors"
          >
            Inspect Context
          </button>
        </div>

        {/* Section: Worktree */}
        <div className="pt-3 border-t border-[#1f2636] space-y-2">
          <div className="font-semibold text-slate-200 text-xs">Worktree</div>
          <div className="flex items-center justify-between p-2 bg-[#141a26] border border-slate-800 rounded-lg">
            <div className="flex items-center gap-2 truncate">
              <FolderArchive className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="truncate">
                <div className="font-mono text-[11px] text-slate-200 font-semibold truncate">
                  ai-coder/7a82f
                </div>
                <div className="text-[10px] text-slate-400">Isolated from main</div>
              </div>
            </div>

            <button
              onClick={() => alert('Worktree directory: ~/.ai-coder/worktrees/7a82f\nAll changes isolated safely from main repository.')}
              className="px-2 py-1 rounded bg-[#1f293d] hover:bg-[#28354e] text-slate-200 text-[11px] transition-colors shrink-0"
            >
              Open Folder
            </button>
          </div>
        </div>

        {/* Section: Changes */}
        <div className="pt-3 border-t border-[#1f2636] space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-200">Changes</span>
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="text-slate-400">2 files (approved)</span>
              <span className="text-emerald-400 font-bold">+60</span>
              <span className="text-rose-400 font-bold">-6</span>
            </div>
          </div>

          <div className="space-y-1 font-mono text-[11px]">
            <div className="flex items-center justify-between p-1.5 rounded hover:bg-[#151c28]">
              <div className="flex items-center gap-1.5 text-slate-300 truncate">
                <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="truncate">src/auth/session.py</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-emerald-400">+18</span>
                <span className="text-rose-400">-6</span>
              </div>
            </div>

            <div className="flex items-center justify-between p-1.5 rounded hover:bg-[#151c28]">
              <div className="flex items-center gap-1.5 text-slate-300 truncate">
                <FileCode className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">tests/test_auth.py</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-emerald-400">+42</span>
                <span className="text-slate-500">-0</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section: Verification */}
        <div className="pt-3 border-t border-[#1f2636] space-y-2">
          <div className="font-semibold text-slate-200 text-xs">Verification</div>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center gap-2 text-slate-300">
              <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></span>
              <span>Running tests...</span>
            </div>
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Lint (completed)</span>
            </div>
          </div>
        </div>

        {/* Section: Checkpoint */}
        <div className="pt-3 border-t border-[#1f2636] space-y-2">
          <div className="font-semibold text-slate-200 text-xs">Checkpoint</div>
          <div className="flex items-center justify-between p-2 bg-[#141a26] border border-slate-800 rounded-lg text-[11px]">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Available</span>
            </div>
            <button
              onClick={onOpenCheckpointView}
              className="px-2 py-0.5 rounded bg-[#1f293d] hover:bg-[#28354e] text-slate-200 transition-colors"
            >
              View
            </button>
          </div>
        </div>

        {/* Section: Actions */}
        <div className="pt-3 border-t border-[#1f2636] space-y-2">
          <div className="font-semibold text-slate-200 text-xs">Actions</div>
          
          <button
            onClick={onDiscardChanges}
            className="w-full py-1.5 px-3 rounded bg-[#182030] hover:bg-rose-950/60 hover:text-rose-200 hover:border-rose-800 border border-slate-700/60 text-slate-300 text-xs font-medium transition-colors"
          >
            Discard Task Changes
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={onApplyToMain}
              className="flex-1 py-2 px-3 rounded-l-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-colors"
            >
              <span>Apply to Main Project...</span>
            </button>
            <button
              onClick={onApplyToMain}
              className="py-2 px-2.5 rounded-r-md bg-blue-700 hover:bg-blue-600 text-white text-xs transition-colors"
              title="Second Review Conflict Gate & Merge Options"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
