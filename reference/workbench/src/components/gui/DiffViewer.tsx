import React, { useState } from 'react';
import { Columns, AlignLeft, Maximize2, FileCode, Check, X, ChevronRight, Layers } from 'lucide-react';

interface DiffViewerProps {
  activeFile: 'session.py' | 'test_auth.py';
  onSelectFile: (file: 'session.py' | 'test_auth.py') => void;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ activeFile, onSelectFile }) => {
  const [diffMode, setDiffMode] = useState<'split' | 'unified'>('split');
  const [isWrap, setIsWrap] = useState(true);

  return (
    <div className="flex flex-col h-full bg-[#10151f] border-t border-[#21262d] overflow-hidden select-none">
      {/* 1. File Tab Bar & Diff Controls */}
      <div className="h-9 bg-[#0e131b] border-b border-[#21262d] flex items-center justify-between px-2 text-xs">
        {/* File tabs */}
        <div className="flex items-center gap-1 h-full">
          <button
            onClick={() => onSelectFile('session.py')}
            className={`flex items-center gap-1.5 px-3 h-full border-t-2 text-xs font-mono transition-colors ${
              activeFile === 'session.py'
                ? 'bg-[#151c28] border-blue-500 text-white font-medium shadow-xs'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#121822]'
            }`}
          >
            <FileCode className="w-3.5 h-3.5 text-blue-400" />
            <span>session.py</span>
            <span className="text-slate-500 hover:text-white ml-1 text-xs">✕</span>
          </button>

          <button
            onClick={() => onSelectFile('test_auth.py')}
            className={`flex items-center gap-1.5 px-3 h-full border-t-2 text-xs font-mono transition-colors ${
              activeFile === 'test_auth.py'
                ? 'bg-[#151c28] border-blue-500 text-white font-medium shadow-xs'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#121822]'
            }`}
          >
            <FileCode className="w-3.5 h-3.5 text-emerald-400" />
            <span>test_auth.py</span>
          </button>
        </div>

        {/* Diff view controls */}
        <div className="flex items-center gap-2 text-slate-400">
          <select
            value={diffMode}
            onChange={(e) => setDiffMode(e.target.value as any)}
            className="bg-[#161d28] border border-slate-700/60 rounded px-2 py-0.5 text-[11px] text-slate-300 outline-none"
          >
            <option value="split">Side-by-Side</option>
            <option value="unified">Unified Diff</option>
          </select>

          <button 
            onClick={() => setDiffMode(diffMode === 'split' ? 'unified' : 'split')}
            className="p-1 hover:text-white hover:bg-[#1c2432] rounded transition-colors"
            title="Toggle Diff Mode (Side-by-Side / Unified)"
          >
            <Columns className="w-3.5 h-3.5" />
          </button>

          <button 
            onClick={() => setIsWrap(!isWrap)}
            className={`p-1 rounded transition-colors ${isWrap ? 'text-blue-400 bg-[#1c2432]' : 'hover:text-white hover:bg-[#1c2432]'}`}
            title="Toggle Word Wrap"
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>

          <button 
            className="p-1 hover:text-white hover:bg-[#1c2432] rounded transition-colors"
            title="Hunk Overview"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Column Headers (Side-by-side mode) */}
      {diffMode === 'split' && (
        <div className="h-6 bg-[#131924] border-b border-[#21262d] grid grid-cols-2 text-[11px] font-medium text-slate-400 px-4 items-center">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-500"></span>
            <span>Current (main/worktree base)</span>
          </div>
          <div className="pl-4 border-l border-[#21262d] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            <span>Proposed changes (atomic hunk)</span>
          </div>
        </div>
      )}

      {/* 3. Diff Content Body */}
      <div className="flex-1 overflow-y-auto font-mono text-[11.5px] leading-5 select-text bg-[#0e131b]">
        {diffMode === 'split' ? (
          /* Split View */
          activeFile === 'session.py' ? (
            <div className="grid grid-cols-2 divide-x divide-[#21262d] min-w-full">
              {/* Left Column: Current */}
              <div className="bg-[#0f141d] text-slate-300">
                <div className="px-3 py-1 bg-[#141b26] text-[10px] text-slate-500 font-mono border-b border-[#21262d]">
                  @@ -74,7 +74,10 @@ def validate_session(token)
                </div>
                {/* Line 74 */}
                <div className="flex items-start px-2 py-0.5 hover:bg-[#161c28]">
                  <span className="w-8 shrink-0 text-slate-500 text-right pr-3 select-none">74</span>
                  <span className="text-purple-300">def</span>&nbsp;<span className="text-blue-300">validate_session</span>(token: <span className="text-emerald-300">str</span>):
                </div>
                {/* Line 75 (Removed) */}
                <div className="flex items-start px-2 py-0.5 bg-rose-950/40 text-rose-200 border-l-2 border-rose-500">
                  <span className="w-8 shrink-0 text-rose-400 text-right pr-3 select-none">75</span>
                  <span className="text-rose-400 select-none mr-1.5">-</span>
                  <span className="pl-2"><span className="text-rose-300">return</span> lookup_session(token)</span>
                </div>
                {/* Spacers */}
                <div className="flex items-start px-2 py-0.5 text-transparent select-none bg-slate-950/20">
                  <span className="w-8 shrink-0 text-slate-700 text-right pr-3 select-none">76</span>
                  <span>&nbsp;</span>
                </div>
                <div className="flex items-start px-2 py-0.5 text-transparent select-none bg-slate-950/20">
                  <span className="w-8 shrink-0 text-slate-700 text-right pr-3 select-none">77</span>
                  <span>&nbsp;</span>
                </div>
                <div className="flex items-start px-2 py-0.5 text-transparent select-none bg-slate-950/20">
                  <span className="w-8 shrink-0 text-slate-700 text-right pr-3 select-none">78</span>
                  <span>&nbsp;</span>
                </div>
                {/* Line 79 */}
                <div className="flex items-start px-2 py-0.5 hover:bg-[#161c28]">
                  <span className="w-8 shrink-0 text-slate-500 text-right pr-3 select-none">79</span>
                  <span className="text-purple-300">def</span>&nbsp;<span className="text-blue-300">get_user_from_session</span>(token: <span className="text-emerald-300">str</span>):
                </div>
                {/* Line 80 */}
                <div className="flex items-start px-2 py-0.5 hover:bg-[#161c28]">
                  <span className="w-8 shrink-0 text-slate-500 text-right pr-3 select-none">80</span>
                  <span className="pl-4"><span className="text-purple-300">if</span> session:</span>
                </div>
                {/* Line 81 */}
                <div className="flex items-start px-2 py-0.5 hover:bg-[#161c28]">
                  <span className="w-8 shrink-0 text-slate-500 text-right pr-3 select-none">81</span>
                  <span className="pl-8"><span className="text-purple-300">return</span> session.user</span>
                </div>
                {/* Line 82 */}
                <div className="flex items-start px-2 py-0.5 hover:bg-[#161c28]">
                  <span className="w-8 shrink-0 text-slate-500 text-right pr-3 select-none">82</span>
                  <span className="pl-4"><span className="text-purple-300">return</span> <span className="text-blue-300">None</span></span>
                </div>
              </div>

              {/* Right Column: Proposed */}
              <div className="bg-[#0f141d] text-slate-300">
                <div className="px-3 py-1 bg-[#141b26] text-[10px] text-slate-500 font-mono border-b border-[#21262d]">
                  @@ -74,7 +74,10 @@ def validate_session(token)
                </div>
                {/* Line 74 */}
                <div className="flex items-start px-2 py-0.5 hover:bg-[#161c28]">
                  <span className="w-8 shrink-0 text-slate-500 text-right pr-3 select-none">74</span>
                  <span className="text-purple-300">def</span>&nbsp;<span className="text-blue-300">validate_session</span>(token: <span className="text-emerald-300">str</span>):
                </div>
                {/* Line 75 (Added) */}
                <div className="flex items-start px-2 py-0.5 bg-emerald-950/40 text-emerald-200 border-l-2 border-emerald-500">
                  <span className="w-8 shrink-0 text-emerald-400 text-right pr-3 select-none">75</span>
                  <span className="text-emerald-400 select-none mr-1.5">+</span>
                  <span className="pl-2">session = lookup_session(token)</span>
                </div>
                {/* Line 76 (Added) */}
                <div className="flex items-start px-2 py-0.5 bg-emerald-950/40 text-emerald-200 border-l-2 border-emerald-500">
                  <span className="w-8 shrink-0 text-emerald-400 text-right pr-3 select-none">76</span>
                  <span className="text-emerald-400 select-none mr-1.5">+</span>
                  <span className="pl-2"><span className="text-purple-300">if</span> session <span className="text-purple-300">is</span> <span className="text-blue-300">None</span>:</span>
                </div>
                {/* Line 77 (Added) */}
                <div className="flex items-start px-2 py-0.5 bg-emerald-950/40 text-emerald-200 border-l-2 border-emerald-500">
                  <span className="w-8 shrink-0 text-emerald-400 text-right pr-3 select-none">77</span>
                  <span className="text-emerald-400 select-none mr-1.5">+</span>
                  <span className="pl-6"><span className="text-purple-300">raise</span> InvalidSession(<span className="text-amber-200">&quot;Session not found&quot;</span>)</span>
                </div>
                {/* Line 78 (Added) */}
                <div className="flex items-start px-2 py-0.5 bg-emerald-950/40 text-emerald-200 border-l-2 border-emerald-500">
                  <span className="w-8 shrink-0 text-emerald-400 text-right pr-3 select-none">78</span>
                  <span className="text-emerald-400 select-none mr-1.5">+</span>
                  <span className="pl-2"><span className="text-purple-300">return</span> session</span>
                </div>
                {/* Line 79 */}
                <div className="flex items-start px-2 py-0.5 hover:bg-[#161c28]">
                  <span className="w-8 shrink-0 text-slate-500 text-right pr-3 select-none">79</span>
                  <span className="text-purple-300">def</span>&nbsp;<span className="text-blue-300">get_user_from_session</span>(token: <span className="text-emerald-300">str</span>):
                </div>
                {/* Line 80 */}
                <div className="flex items-start px-2 py-0.5 hover:bg-[#161c28]">
                  <span className="w-8 shrink-0 text-slate-500 text-right pr-3 select-none">80</span>
                  <span className="pl-4"><span className="text-purple-300">if</span> session:</span>
                </div>
                {/* Line 81 */}
                <div className="flex items-start px-2 py-0.5 hover:bg-[#161c28]">
                  <span className="w-8 shrink-0 text-slate-500 text-right pr-3 select-none">81</span>
                  <span className="pl-8"><span className="text-purple-300">return</span> session.user</span>
                </div>
                {/* Line 82 */}
                <div className="flex items-start px-2 py-0.5 hover:bg-[#161c28]">
                  <span className="w-8 shrink-0 text-slate-500 text-right pr-3 select-none">82</span>
                  <span className="pl-4"><span className="text-purple-300">return</span> <span className="text-blue-300">None</span></span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-2 text-slate-300">
              <div className="text-emerald-400 font-semibold mb-2 flex items-center justify-between">
                <span># tests/test_auth.py (+42 lines added, 0 removed)</span>
                <span className="text-xs text-slate-400">Target worktree: ai-coder/7a82f</span>
              </div>
              <pre className="text-emerald-300/90 bg-[#0f141d] p-3.5 rounded-lg border border-emerald-900/40 text-xs leading-relaxed">
{`import pytest
from src.auth.session import validate_session, InvalidSession

def test_validate_session_missing_raises_exception():
    """Verify that an invalid session token properly raises InvalidSession."""
    with pytest.raises(InvalidSession, match="Session not found"):
        validate_session("invalid-token-xyz")

def test_validate_session_valid_success():
    """Verify valid session resolves correctly without regression."""
    session = validate_session("valid-token-admin")
    assert session is not None
    assert session.user == "admin"

def test_session_sliding_window_refresh():
    """Verify session expiration is renewed upon user activity."""
    session = validate_session("valid-token-admin")
    initial_exp = session.expires_at
    session.refresh()
    assert session.expires_at > initial_exp`}
              </pre>
            </div>
          )
        ) : (
          /* Unified Diff View */
          <div className="p-3 text-slate-300 space-y-0.5">
            <div className="p-2 bg-[#141b26] text-slate-400 text-xs border-b border-[#21262d] font-mono">
              --- a/src/auth/session.py (base SHA-256 e3b0c442...){'\n'}
              +++ b/src/auth/session.py (worktree ai-coder/7a82f)
            </div>
            <div className="px-3 py-1 bg-[#17202f] text-blue-400 text-[11px] font-mono">
              @@ -74,7 +74,10 @@ def validate_session(token: str):
            </div>
            <div className="px-2 py-0.5 text-slate-400 flex items-center">
              <span className="w-12 text-slate-600 select-none">74  74</span>
              <span className="pl-4">def validate_session(token: str):</span>
            </div>
            <div className="px-2 py-0.5 bg-rose-950/40 text-rose-300 border-l-2 border-rose-500 flex items-center">
              <span className="w-12 text-rose-500 select-none">75    </span>
              <span className="pl-4">-    return lookup_session(token)</span>
            </div>
            <div className="px-2 py-0.5 bg-emerald-950/40 text-emerald-300 border-l-2 border-emerald-500 flex items-center">
              <span className="w-12 text-emerald-500 select-none">    75</span>
              <span className="pl-4">+    session = lookup_session(token)</span>
            </div>
            <div className="px-2 py-0.5 bg-emerald-950/40 text-emerald-300 border-l-2 border-emerald-500 flex items-center">
              <span className="w-12 text-emerald-500 select-none">    76</span>
              <span className="pl-4">+    if session is None:</span>
            </div>
            <div className="px-2 py-0.5 bg-emerald-950/40 text-emerald-300 border-l-2 border-emerald-500 flex items-center">
              <span className="w-12 text-emerald-500 select-none">    77</span>
              <span className="pl-4">+        raise InvalidSession("Session not found")</span>
            </div>
            <div className="px-2 py-0.5 bg-emerald-950/40 text-emerald-300 border-l-2 border-emerald-500 flex items-center">
              <span className="w-12 text-emerald-500 select-none">    78</span>
              <span className="pl-4">+    return session</span>
            </div>
            <div className="px-2 py-0.5 text-slate-400 flex items-center">
              <span className="w-12 text-slate-600 select-none">76  79</span>
              <span className="pl-4">def get_user_from_session(token: str):</span>
            </div>
            <div className="px-2 py-0.5 text-slate-400 flex items-center">
              <span className="w-12 text-slate-600 select-none">77  80</span>
              <span className="pl-4">    if session:</span>
            </div>
            <div className="px-2 py-0.5 text-slate-400 flex items-center">
              <span className="w-12 text-slate-600 select-none">78  81</span>
              <span className="pl-4">        return session.user</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
