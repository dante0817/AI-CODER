import React, { useState } from 'react';
import { X, Sparkles, Folder, FileCode, Check, Cpu } from 'lucide-react';
import { TaskItem } from './SidebarExplorer';

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateTask: (task: TaskItem) => void;
}

export const NewTaskModal: React.FC<NewTaskModalProps> = ({
  isOpen,
  onClose,
  onCreateTask,
}) => {
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<'Agent' | 'Chat'>('Agent');
  const [targetFile, setTargetFile] = useState('src/auth/session.py');
  const [agentRole, setAgentRole] = useState('Debug');
  const [provider, setProvider] = useState('OpenAI');
  const [model, setModel] = useState('GPT-5.6 Sol');
  const [effort, setEffort] = useState('High');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newTask: TaskItem = {
      id: `task-${Date.now().toString().slice(-3)}`,
      title: title.trim(),
      status: 'running',
      mode,
      createdAt: 'Just now',
      updatedAt: 'Just now',
      targetFile,
    };

    onCreateTask(newTask);
    setTitle('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#121722] border border-[#30363d] rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col text-slate-200 text-xs">
        {/* Header */}
        <div className="px-4 py-3 bg-[#0d111a] border-b border-[#21262d] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-blue-600/30 border border-blue-500/50 flex items-center justify-center text-blue-400">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <span className="font-semibold text-sm text-slate-100">Create New AI Task</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-slate-300 font-medium">Task Goal / Description</label>
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Fix session timeout bug and verify tests"
              className="w-full bg-[#182030] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-500 text-xs focus:border-blue-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as any)}
                className="w-full bg-[#182030] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-xs outline-none"
              >
                <option value="Agent">Agent (Worktree isolated edits)</option>
                <option value="Chat">Chat (Advisory and explanations)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Target File</label>
              <select
                value={targetFile}
                onChange={(e) => setTargetFile(e.target.value)}
                className="w-full bg-[#182030] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-xs font-mono outline-none"
              >
                <option value="src/auth/session.py">src/auth/session.py</option>
                <option value="src/auth/token.py">src/auth/token.py</option>
                <option value="src/core/router.py">src/core/router.py</option>
                <option value="tests/test_auth.py">tests/test_auth.py</option>
                <option value="src/ui/theme.py">src/ui/theme.py</option>
                <option value="README.md">README.md</option>
              </select>
            </div>
          </div>

          <div className="p-3 bg-[#0d121b] border border-slate-800 rounded-lg space-y-2">
            <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
              Runtime Model Routing Configuration
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-400 block mb-1">Agent Role:</span>
                <select
                  value={agentRole}
                  onChange={(e) => setAgentRole(e.target.value)}
                  className="w-full bg-[#182030] border border-slate-700 rounded p-1.5 text-slate-200 outline-none"
                >
                  <option value="Debug">Debug (Error tracing & fixes)</option>
                  <option value="Architect">Architect (Systems structure)</option>
                  <option value="Coder">Coder (Feature implementation)</option>
                  <option value="Reviewer">Reviewer (Auditing & tests)</option>
                </select>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Provider:</span>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full bg-[#182030] border border-slate-700 rounded p-1.5 text-slate-200 outline-none"
                >
                  <option value="OpenAI">OpenAI</option>
                  <option value="Google Gemini">Google Gemini</option>
                  <option value="Anthropic">Anthropic</option>
                  <option value="Ollama (Local)">Ollama (Local)</option>
                </select>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Model:</span>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-[#182030] border border-slate-700 rounded p-1.5 text-slate-200 outline-none font-mono"
                >
                  <option value="GPT-5.6 Sol">GPT-5.6 Sol (Cloud)</option>
                  <option value="gemini-3.5-flash">gemini-3.5-flash (Fast)</option>
                  <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview (Complex)</option>
                  <option value="Qwen3 Coder">Qwen3 Coder (Local)</option>
                  <option value="Codex">Codex (CLI default)</option>
                </select>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Effort:</span>
                <select
                  value={effort}
                  onChange={(e) => setEffort(e.target.value)}
                  className="w-full bg-[#182030] border border-slate-700 rounded p-1.5 text-slate-200 outline-none"
                >
                  <option value="Low">Low (Instant answer)</option>
                  <option value="Medium">Medium (Balanced)</option>
                  <option value="High">High (Deep inspection)</option>
                  <option value="Max">Max (Reasoning CoT)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Spawn Task in Worktree</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
