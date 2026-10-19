import React, { useState, useEffect } from 'react';
import { Search, X, FileCode, Sparkles, Terminal, Shield, ArrowRight } from 'lucide-react';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTask: (taskId: string) => void;
  onSelectFile: (file: string) => void;
  onOpenWorkbench: (tab: string) => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  onSelectTask,
  onSelectFile,
  onOpenWorkbench,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else onClose(); // parent can toggle
      }
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const commands = [
    { type: 'file', label: 'session.py', path: 'src/auth/session.py', category: 'Files' },
    { type: 'file', label: 'test_auth.py', path: 'tests/test_auth.py', category: 'Files' },
    { type: 'file', label: 'models.py', path: 'src/auth/models.py', category: 'Files' },
    { type: 'task', label: 'Fix authentication issue', id: 'task-101', category: 'AI Tasks' },
    { type: 'task', label: 'Refactor API client', id: 'task-102', category: 'AI Tasks' },
    { type: 'bench', label: 'Two-Stage Model Router Lab', tab: 'router', category: 'Architecture' },
    { type: 'bench', label: 'Smart Context Retrieval Engine', tab: 'context', category: 'Architecture' },
    { type: 'bench', label: 'In-Memory Patch Compiler', tab: 'patch', category: 'Architecture' },
    { type: 'bench', label: 'Security Conformance Suite (security-vectors.json)', tab: 'conformance', category: 'Architecture' },
  ];

  const filtered = commands.filter(c => 
    c.label.toLowerCase().includes(query.toLowerCase()) ||
    (c.path && c.path.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/70 backdrop-blur-xs p-4">
      <div className="bg-[#111622] border border-slate-700/80 rounded-xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col">
        {/* Search header */}
        <div className="px-4 py-3 border-b border-[#21262d] flex items-center gap-3">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, file name, or task..."
            autoFocus
            className="w-full bg-transparent text-slate-100 placeholder:text-slate-500 text-xs outline-none"
          />
          <kbd className="bg-[#1f2636] text-slate-400 px-1.5 py-0.5 rounded text-[10px] font-mono">
            ESC
          </kbd>
        </div>

        {/* List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500">
              No matching files or commands found.
            </div>
          ) : (
            filtered.map((item, idx) => (
              <div
                key={idx}
                onClick={() => {
                  if (item.type === 'file' && item.path) {
                    onSelectFile(item.path);
                  } else if (item.type === 'task' && item.id) {
                    onSelectTask(item.id);
                  } else if (item.type === 'bench' && item.tab) {
                    onOpenWorkbench(item.tab);
                  }
                  onClose();
                }}
                className="px-3 py-2 rounded-lg hover:bg-[#1a2334] cursor-pointer flex items-center justify-between text-xs text-slate-200 transition-colors"
              >
                <div className="flex items-center gap-2.5 truncate">
                  {item.type === 'file' && <FileCode className="w-4 h-4 text-blue-400 shrink-0" />}
                  {item.type === 'task' && <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />}
                  {item.type === 'bench' && <Shield className="w-4 h-4 text-purple-400 shrink-0" />}
                  <span className="font-medium truncate">{item.label}</span>
                  {item.path && <span className="text-[11px] text-slate-500 font-mono">({item.path})</span>}
                </div>
                <span className="text-[10px] text-slate-500 font-mono uppercase shrink-0">
                  {item.category}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
