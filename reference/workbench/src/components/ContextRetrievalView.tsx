import React, { useState } from 'react';
import { RepoFile } from '../types';
import { runSmartContextRetrieval } from '../lib/contextEngine';
import { FileCode, Search, ShieldAlert, CheckCircle2, AlertTriangle, Layers, Database } from 'lucide-react';

interface ContextRetrievalViewProps {
  files: RepoFile[];
}

export const ContextRetrievalView: React.FC<ContextRetrievalViewProps> = ({ files }) => {
  const [prompt, setPrompt] = useState('fix the concurrency race condition in OrderService and check test_order_service');
  const [activeFile, setActiveFile] = useState('src/checkout/order_service.py');
  const [selectedSnippet, setSelectedSnippet] = useState('def process_checkout(self, order_id: str, amount_cents: int, user_id: str):');
  const [budgetChars, setBudgetChars] = useState(40000); // 40k chars budget to illustrate contrast

  const retrievalResult = runSmartContextRetrieval(files, {
    prompt,
    activeFilePath: activeFile,
    selectedText: selectedSnippet,
    maxCharsBudget: budgetChars
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-100">
            Smart Context Retrieval &amp; Relevance Ranking
          </h2>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
            <span>High-Priority Improvement (P1)</span>
            <span aria-hidden="true">·</span>
            <span>Symbol &amp; Import Graph Traversal</span>
            <span aria-hidden="true">·</span>
            <span>Zero-Leak Sensitive Data Boundary</span>
          </div>
        </div>

        {/* Quick query presets */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Presets:</span>
          <button
            onClick={() => {
              setPrompt('fix the concurrency race condition in OrderService and check test_order_service');
              setActiveFile('src/checkout/order_service.py');
              setSelectedSnippet('def process_checkout(self, order_id: str, amount_cents: int, user_id: str):');
            }}
            className="px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded transition-colors"
          >
            Checkout Concurrency Bug
          </button>
          <button
            onClick={() => {
              setPrompt('update payment gateway tokenized auth idempotency');
              setActiveFile('src/checkout/payment_gateway.py');
              setSelectedSnippet('def authorize_charge(self, order_id: str, amount_cents: int)');
            }}
            className="px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded transition-colors"
          >
            Payment Adapter
          </button>
        </div>
      </div>

      {/* Query & Active File Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Search className="w-4 h-4 text-indigo-400" />
              <span>Context Extraction Inputs</span>
            </h3>
            <span className="text-xs text-slate-500 font-mono">Dynamic Graph Scoring</span>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1.5">User Prompt</label>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2 text-xs text-slate-200 font-mono focus:border-indigo-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Active Editor File</label>
              <select
                value={activeFile}
                onChange={(e) => setActiveFile(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono outline-none"
              >
                {files.filter(f => !f.isSensitive && !f.isControlFile).map(f => (
                  <option key={f.path} value={f.path}>{f.path}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">
                Context Budget Limit ({budgetChars.toLocaleString()} characters)
              </label>
              <input
                type="range"
                min={15000}
                max={90000}
                step={5000}
                value={budgetChars}
                onChange={(e) => setBudgetChars(Number(e.target.value))}
                className="w-full mt-2 accent-indigo-500 cursor-pointer"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">
              Active Selection Snippet (Optional Focus)
            </label>
            <textarea
              rows={2}
              value={selectedSnippet}
              onChange={(e) => setSelectedSnippet(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:border-indigo-500 outline-none resize-none"
            />
          </div>

          {/* Extracted Signals Display */}
          <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center gap-3 text-xs">
            <span className="text-slate-500 font-medium">Extracted Symbols:</span>
            {retrievalResult.extractedSymbols.length > 0 ? (
              retrievalResult.extractedSymbols.map(sym => (
                <span key={sym} className="px-2 py-0.5 bg-indigo-950/60 border border-indigo-800/60 text-indigo-300 rounded font-mono text-[11px]">
                  {sym}
                </span>
              ))
            ) : (
              <span className="text-slate-600">None detected</span>
            )}
          </div>
        </div>

        {/* Naive vs Smart Architectural Contrast */}
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-4 flex flex-col justify-between">
          <div>
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
              Retrieval Quality Comparison
            </div>

            {/* Naive Box */}
            <div className="p-3 bg-rose-950/20 border border-rose-900/40 rounded-lg mb-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-rose-300">v0.4.6 Naive Alphabetical</span>
                <span className="text-[10px] text-rose-400 font-mono">rglob(*) Sorted</span>
              </div>
              <p className="text-[11px] text-slate-300 mt-2 leading-relaxed">
                Wasted <strong className="text-rose-300 tabular-nums">{retrievalResult.comparisonWithNaiveAlphabetical.naiveWastedBudgetOnDocsOrArchive.toLocaleString()}</strong> characters reading obsolete <code className="text-slate-300">backend/archive/</code> and <code className="text-slate-300">docs/</code> before ever seeing the active checkout service!
              </p>
              {retrievalResult.comparisonWithNaiveAlphabetical.naiveMissedRelevantFiles.length > 0 && (
                <div className="mt-2 text-[10px] text-rose-400">
                  Missed critical files: {retrievalResult.comparisonWithNaiveAlphabetical.naiveMissedRelevantFiles.join(', ')}
                </div>
              )}
            </div>

            {/* Smart Context Box */}
            <div className="p-3 bg-emerald-950/20 border border-emerald-900/40 rounded-lg">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-emerald-300">v0.4.7 Smart Context Engine</span>
                <span className="text-[10px] text-emerald-400 font-mono">Import + Symbol Graph</span>
              </div>
              <p className="text-[11px] text-slate-300 mt-2 leading-relaxed">
                Prioritized active file, direct imports, companion unit test, and module siblings. Packed <strong className="text-emerald-300 tabular-nums">{retrievalResult.filesIncludedCount}</strong> high-signal files within the {retrievalResult.totalCharsBudget.toLocaleString()} char budget.
              </p>
            </div>
          </div>

          {/* Budget Meter */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Budget Usage</span>
              <span className="font-mono tabular-nums text-slate-200">
                {retrievalResult.usedCharsBudget.toLocaleString()} / {retrievalResult.totalCharsBudget.toLocaleString()} chars ({Math.round(retrievalResult.usedCharsBudget / retrievalResult.totalCharsBudget * 100)}%)
              </span>
            </div>
            <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
              <div
                className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, (retrievalResult.usedCharsBudget / retrievalResult.totalCharsBudget) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Sensitive Exclusions Alert */}
      {retrievalResult.excludedSensitiveFiles.length > 0 && (
        <div className="p-3.5 bg-amber-950/20 border border-amber-900/40 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Zero-Leak Boundary Active:</strong> Automatically shielded {retrievalResult.excludedSensitiveFiles.length} file(s) from LLM context:
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 font-mono text-[11px] text-amber-400">
            {retrievalResult.excludedSensitiveFiles.map(path => (
              <span key={path} className="px-2 py-0.5 bg-amber-950/60 border border-amber-800/60 rounded">
                {path.split(' ')[0]}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Ranked Files Table */}
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
        <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-200">
            Ranked Codebase Context Candidates ({retrievalResult.rankedFiles.length} files evaluated)
          </div>
          <div className="text-xs text-slate-400">
            In Context: {retrievalResult.filesIncludedCount} of {retrievalResult.rankedFiles.length}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-4 py-2.5 font-medium">Rank &amp; File Path</th>
                <th className="px-4 py-2.5 font-medium">Relevance Score</th>
                <th className="px-4 py-2.5 font-medium">Relevance Reasons</th>
                <th className="px-4 py-2.5 font-medium text-right">Characters</th>
                <th className="px-4 py-2.5 font-medium text-right">Context Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {retrievalResult.rankedFiles.map((item, idx) => (
                <tr
                  key={item.file.path}
                  className={`transition-colors ${
                    item.includedInBudget
                      ? 'hover:bg-slate-900/40'
                      : 'bg-slate-950/70 opacity-60'
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-500 tabular-nums">#{idx + 1}</span>
                      <FileCode className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="font-mono font-medium text-slate-200">{item.file.path}</span>
                    </div>
                  </td>

                  <td className="px-4 py-3 font-mono tabular-nums">
                    <span className={`font-semibold ${item.relevanceScore > 400 ? 'text-emerald-400' : item.relevanceScore > 100 ? 'text-indigo-300' : 'text-slate-500'}`}>
                      {item.relevanceScore} pts
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {item.reasons.map((r, rIdx) => (
                        <span key={rIdx} className="text-[11px] text-slate-300">
                          {r}{rIdx < item.reasons.length - 1 ? ' · ' : ''}
                        </span>
                      ))}
                    </div>
                  </td>

                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-400">
                    {item.file.characters.toLocaleString()} chars
                  </td>

                  <td className="px-4 py-3 text-right">
                    {item.includedInBudget ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Included</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-500 text-xs font-mono">
                        <span>Budget Cap Exceeded</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
