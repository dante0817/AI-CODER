import React from 'react';
import { X, BookOpen, CheckCircle, ShieldCheck, ArrowRight, Layers, Cpu, GitBranch } from 'lucide-react';

interface ArchitectureGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ArchitectureGuideModal: React.FC<ArchitectureGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                AI-CODER Desktop v0.4.7 / v0.5 Architecture Review &amp; Priorities
              </h3>
              <div className="text-xs text-slate-400 mt-0.5">
                Strategic Blueprint: Preserve Core Invariants Before Expanding Autonomous Freedom
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 space-y-6 overflow-y-auto text-xs text-slate-300 leading-relaxed">
          {/* Executive Strategy Banner */}
          <div className="p-4 bg-indigo-950/30 border border-indigo-800/60 rounded-xl space-y-2">
            <div className="font-semibold text-indigo-200 text-sm">
              Core Architectural Strategy
            </div>
            <p className="text-slate-300">
              The current v0.4.6 code has already solved difficult problems unusually well: pre-write review, byte-exact checkpoints, rollback, isolated worktrees, stale-change detection, main-project conflict detection, sensitive-data exclusion, command restrictions, and Windows handle-based safe I/O.
            </p>
            <p className="text-indigo-300 font-medium">
              Therefore, the next stage must <strong>NOT</strong> be &quot;give the agent more freedom.&quot; It should be:
              <br />
              <span className="text-white font-mono mt-1 block">
                make model selection &amp; context selection smarter → improve lifecycle/reliability → establish Code-OSS parity → then expand agent capabilities.
              </span>
            </p>
          </div>

          {/* Revised Priority Matrix Table */}
          <div className="space-y-2">
            <div className="font-semibold text-slate-200 text-sm">Revised Priority Matrix</div>
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium">
                  <tr>
                    <th className="px-4 py-2.5">Topic</th>
                    <th className="px-4 py-2.5">Review Verdict</th>
                    <th className="px-4 py-2.5 text-right">Priority</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-slate-200">Dynamic / latest model discovery</td>
                    <td className="px-4 py-2.5 text-slate-300">Strongly keep; separate model availability from verified capabilities. Unknown means unknown.</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-400">P1</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-slate-200">Improve Auto model routing</td>
                    <td className="px-4 py-2.5 text-slate-300">Two-stage engine: Stage 1 hard eligibility filter, Stage 2 soft preferences. Eliminate penalty bypasses.</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-400">P1</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-slate-200">Improve codebase/context selection</td>
                    <td className="px-4 py-2.5 text-slate-300">Replace naive alphabetical rglob(*) with symbol, import graph &amp; test adjacency relevance ranking.</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-400">P1</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-slate-200">Code-OSS migration</td>
                    <td className="px-4 py-2.5 text-slate-300">Treat as product migration; freeze behavioral contract via shared security-vectors.json first.</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-indigo-400">P1 Strategic</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-slate-200">Settings persistence &amp; concurrency</td>
                    <td className="px-4 py-2.5 text-slate-300">In-process mutex + temp file + atomic os.replace() to prevent race conditions during multi-task runs.</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-indigo-400">P1/P2</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-slate-200">Richer patch/edit operations</td>
                    <td className="px-4 py-2.5 text-slate-300">Granular in-memory compiler + base SHA-256 staleness check. Preserve all safety pipelines.</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-400">P2</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-slate-200">Task &amp; worktree lifecycle</td>
                    <td className="px-4 py-2.5 text-slate-300">Archive/delete flow, orphan cleanup, and main-branch conflict gate before full Git UI.</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-400">P2</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-slate-200">Streaming &amp; cancellation</td>
                    <td className="px-4 py-2.5 text-slate-300">Granular per-stage cancellation state machine.</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-400">P2</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-slate-200">Autonomous test/fix loops</td>
                    <td className="px-4 py-2.5 text-slate-300">Bound to max 3 iterations; requires provenance and recovery states first.</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-500">P3</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-slate-200">Language services in Tkinter</td>
                    <td className="px-4 py-2.5 text-slate-300">Do not invest heavily in Tkinter LSP. Inherit natively from Code-OSS.</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-600">Skip</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Non-Negotiable Invariants */}
          <div className="space-y-2">
            <div className="font-semibold text-slate-200 text-sm">Non-Negotiable Safety Invariants</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                <span className="font-semibold text-slate-200">1. Model Never Writes Directly</span>
                <p className="text-slate-400 text-[11px] mt-1">
                  Every proposed edit is compiled in-memory into an exact inspectable postimage before touching disk.
                </p>
              </div>
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                <span className="font-semibold text-slate-200">2. Pre-Write Review &amp; Checkpoints</span>
                <p className="text-slate-400 text-[11px] mt-1">
                  No disk write occurs without user review. Every write captures a byte-exact rollback checkpoint file.
                </p>
              </div>
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                <span className="font-semibold text-slate-200">3. Base SHA-256 Staleness Gate</span>
                <p className="text-slate-400 text-[11px] mt-1">
                  Patches include a base hash; if the file changes concurrently, the write is immediately rejected.
                </p>
              </div>
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                <span className="font-semibold text-slate-200">4. Worktree-to-Main Conflict Gate</span>
                <p className="text-slate-400 text-[11px] mt-1">
                  Applying worktree modifications to the main branch requires a second review gate if main changed.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-900/60 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
