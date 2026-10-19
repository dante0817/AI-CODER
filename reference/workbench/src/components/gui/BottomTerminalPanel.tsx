import React, { useState } from 'react';
import { Terminal as TerminalIcon, CheckCircle2, Trash2, Plus, MoreHorizontal, ShieldCheck, AlertCircle } from 'lucide-react';

interface BottomTerminalPanelProps {
  onOpenCheckpointsModal: () => void;
  onOpenVerificationModal: () => void;
}

export const BottomTerminalPanel: React.FC<BottomTerminalPanelProps> = ({
  onOpenCheckpointsModal,
  onOpenVerificationModal,
}) => {
  const [activeTab, setActiveTab] = useState<'terminal' | 'verification' | 'problems' | 'activity' | 'checkpoints'>('terminal');
  const [terminalInput, setTerminalInput] = useState('');
  const [customHistory, setCustomHistory] = useState<string[]>([]);

  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInput.trim()) return;
    const cmd = terminalInput.trim();
    if (cmd === 'clear') {
      setCustomHistory([]);
    } else if (cmd.includes('pytest')) {
      setCustomHistory(prev => [
        ...prev,
        `PS C:\\AI-CODER> ${cmd}`,
        `==================== test session starts ====================`,
        `collected 36 items`,
        `.................................... 36 passed in 2.18s`,
        `==================== 36 passed in 2.18s ====================`
      ]);
    } else if (cmd.includes('git status')) {
      setCustomHistory(prev => [
        ...prev,
        `PS C:\\AI-CODER> ${cmd}`,
        `On branch ai-coder/7a82f (worktree)`,
        `Changes not staged for commit:`,
        `  modified:   src/auth/session.py`,
        `  modified:   tests/test_auth.py`,
        `no changes added to commit (use "git add" to stage)`
      ]);
    } else {
      setCustomHistory(prev => [
        ...prev,
        `PS C:\\AI-CODER> ${cmd}`,
        `Executed verification command in isolated worktree (~/.ai-coder/worktrees/7a82f)`
      ]);
    }
    setTerminalInput('');
  };

  return (
    <div className="h-56 bg-[#0c1017] border-t border-[#21262d] flex flex-col shrink-0 select-none overflow-hidden">
      {/* Top Tab Bar */}
      <div className="h-8 bg-[#0a0d14] border-b border-[#21262d] flex items-center justify-between px-3 text-xs">
        <div className="flex items-center gap-4 h-full">
          {/* Terminal Tab */}
          <button
            onClick={() => setActiveTab('terminal')}
            className={`flex items-center gap-1.5 h-full border-b-2 font-medium transition-colors ${
              activeTab === 'terminal'
                ? 'border-blue-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Terminal</span>
          </button>

          {/* Verification Tab with badge */}
          <button
            onClick={() => setActiveTab('verification')}
            className={`flex items-center gap-1.5 h-full border-b-2 font-medium transition-colors ${
              activeTab === 'verification'
                ? 'border-blue-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Verification</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-600 text-white">
              2
            </span>
          </button>

          {/* Problems */}
          <button
            onClick={() => setActiveTab('problems')}
            className={`flex items-center gap-1.5 h-full border-b-2 font-medium transition-colors ${
              activeTab === 'problems'
                ? 'border-blue-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Problems</span>
            <span className="text-slate-500 text-[11px] font-mono">0</span>
          </button>

          {/* AI Activity */}
          <button
            onClick={() => setActiveTab('activity')}
            className={`flex items-center gap-1.5 h-full border-b-2 font-medium transition-colors ${
              activeTab === 'activity'
                ? 'border-blue-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>AI Activity</span>
          </button>

          {/* Checkpoints with badge */}
          <button
            onClick={() => setActiveTab('checkpoints')}
            className={`flex items-center gap-1.5 h-full border-b-2 font-medium transition-colors ${
              activeTab === 'checkpoints'
                ? 'border-blue-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Checkpoints</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-600 text-white">
              1
            </span>
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2 text-slate-400">
          <button
            onClick={() => setCustomHistory([])}
            className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[#1a2230] text-slate-300 text-[11px] transition-colors"
          >
            <Plus className="w-3 h-3" />
            <span>New Terminal</span>
          </button>
          <button
            onClick={() => setCustomHistory([])}
            className="p-1 hover:text-white hover:bg-[#1a2230] rounded transition-colors"
            title="Clear Terminal"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button className="p-1 hover:text-white hover:bg-[#1a2230] rounded transition-colors">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Body with Right Status Cards */}
      <div className="flex-1 flex overflow-hidden">
        {/* Terminal Text Area */}
        <div className="flex-1 p-3 font-mono text-[12px] leading-5 text-slate-300 overflow-y-auto select-text bg-[#090d14]">
          {activeTab === 'terminal' && (
            <div className="space-y-1">
              <div>
                <span className="text-blue-400 font-semibold">PS C:\AI-CODER&gt;</span>{' '}
                <span className="text-amber-300 font-semibold">python -m pytest</span>
              </div>
              <div className="text-slate-400 font-medium">
                ==================== test session starts ====================
              </div>
              <div className="text-slate-300">collected 36 items</div>
              <div className="text-emerald-400 font-bold">
                .................................... <span className="text-emerald-300 font-normal">36 passed in 2.31s</span>
              </div>
              <div className="text-emerald-400 font-semibold">
                ==================== 36 passed in 2.31s ====================
              </div>

              {customHistory.map((item, idx) => (
                <div key={idx} className="text-slate-300">
                  {item}
                </div>
              ))}

              <form onSubmit={handleTerminalSubmit} className="flex items-center pt-1">
                <span className="text-blue-400 font-semibold shrink-0 mr-2">PS C:\AI-CODER&gt;</span>
                <input
                  type="text"
                  value={terminalInput}
                  onChange={(e) => setTerminalInput(e.target.value)}
                  placeholder="type verification command (e.g. python -m pytest)..."
                  className="bg-transparent text-slate-100 outline-none w-full font-mono text-xs"
                />
              </form>
            </div>
          )}

          {activeTab === 'verification' && (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-200">
                Verification Test Suite (Allowlisted Commands Only)
              </div>
              <div className="p-3 bg-[#111723] border border-slate-800 rounded-lg space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-emerald-400">pytest tests/test_auth.py</span>
                  <span className="text-emerald-400 font-semibold">PASSED (2.31s)</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  All 36 authentication and token validity assertions passed without regression.
                </div>
              </div>
              <div className="p-3 bg-[#111723] border border-slate-800 rounded-lg space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-emerald-400">flake8 src/auth/session.py</span>
                  <span className="text-emerald-400 font-semibold">0 ISSUES</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Syntax, typing, and PEP-8 conventions clean.
                </div>
              </div>
            </div>
          )}

          {activeTab === 'checkpoints' && (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-200 flex items-center justify-between">
                <span>Byte-Exact Rollback Checkpoints (1 Available)</span>
                <button 
                  onClick={onOpenCheckpointsModal}
                  className="text-xs text-blue-400 hover:text-blue-300 font-normal"
                >
                  Inspect Raw Checkpoint Bytes
                </button>
              </div>
              <div className="p-3 bg-[#111723] border border-slate-800 rounded-lg flex items-center justify-between">
                <div>
                  <div className="font-mono text-xs text-slate-200 font-semibold">chk_7a82f_pre_auth_fix.bak</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Captured prior to in-memory patch write · SHA-256 verified · 100% rollback guarantee
                  </div>
                </div>
                <button
                  onClick={onOpenCheckpointsModal}
                  className="px-2.5 py-1 text-xs font-medium text-amber-300 bg-amber-950/60 border border-amber-800 rounded hover:bg-amber-900 transition-colors"
                >
                  Rollback Now
                </button>
              </div>
            </div>
          )}

          {activeTab === 'problems' && (
            <div className="text-xs text-slate-400 p-2">
              No problems detected in workspace or isolated worktree.
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-1 text-xs text-slate-300">
              <div className="text-slate-500">[10:24:02] Task started: Fix authentication issue</div>
              <div className="text-slate-400">[10:24:05] Smart Context Engine selected 18 files (51 KB)</div>
              <div className="text-slate-400">[10:24:08] In-Memory Patch Compiler verified base SHA-256 for session.py</div>
              <div className="text-emerald-400">[10:24:14] Verification pytest completed: 36 passed in 2.31s</div>
            </div>
          )}
        </div>

        {/* Right Status Cards (Matching image: "Tests Passed" and "Lint Passed" with View Details) */}
        <div className="w-64 border-l border-[#21262d] bg-[#0c1017] p-3 flex flex-col justify-between shrink-0">
          <div className="space-y-2.5">
            {/* Tests Passed Card */}
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-emerald-950 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-200">Tests Passed</div>
                <div className="text-[11px] text-slate-400">36 passed in 2.31s</div>
              </div>
            </div>

            {/* Lint Passed Card */}
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-emerald-950 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-200">Lint Passed</div>
                <div className="text-[11px] text-slate-400">0 issues</div>
              </div>
            </div>
          </div>

          <button
            onClick={onOpenVerificationModal}
            className="w-full py-1.5 px-3 rounded bg-[#161c28] hover:bg-[#202838] border border-slate-700/60 text-slate-200 text-xs font-medium transition-colors"
          >
            View Details
          </button>
        </div>
      </div>
    </div>
  );
};
