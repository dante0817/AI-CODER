import React, { useState } from 'react';
import { PatchOperation, PatchCompilationResult } from '../types';
import { compileInMemoryPatch, computeSha256 } from '../lib/patchCompiler';
import { MOCK_REPOSITORY_FILES } from '../data/mockData';
import { Code, CheckCircle, AlertTriangle, RotateCcw, FileDiff, ShieldCheck, Play, ArrowRight } from 'lucide-react';

export const PatchCompilerView: React.FC = () => {
  const initialFile = MOCK_REPOSITORY_FILES.find(f => f.path === 'src/checkout/order_service.py')!;
  
  const [targetPath, setTargetPath] = useState(initialFile.path);
  const [currentFileContent, setCurrentFileContent] = useState(initialFile.content);
  const [opType, setOpType] = useState<PatchOperation['type']>('replace_exact_text');
  
  // Patch parameters
  const [searchTarget, setSearchTarget] = useState(
`        available = self.inventory.check_stock(order_id)
        if not available:
            raise ValueError("Item out of stock")

        auth_result = self.gateway.authorize_charge(order_id, amount_cents)`
  );

  const [replacementContent, setReplacementContent] = useState(
`        # v0.4.7 Atomic lock hold around inventory deduction & card authorization
        with self._lock:
            available = self.inventory.check_stock(order_id)
            if not available:
                raise ValueError("Item out of stock")

            auth_result = self.gateway.authorize_charge(order_id, amount_cents)
            if auth_result.status != PaymentStatus.AUTHORIZED:
                return {"status": "failed", "reason": auth_result.error_code}

            self.inventory.decrement_stock(order_id)
            return {"status": "success", "tx_id": auth_result.transaction_id}`
  );

  const currentSha = computeSha256(currentFileContent);
  const [providedBaseSha, setProvidedBaseSha] = useState(currentSha);
  const [compilationResult, setCompilationResult] = useState<PatchCompilationResult | null>(null);
  const [appliedHistory, setAppliedHistory] = useState<string[]>([]);

  const handleRunCompile = () => {
    const op: PatchOperation = {
      id: `op-${Date.now()}`,
      type: opType,
      path: targetPath,
      baseSha256: providedBaseSha,
      searchTarget,
      replacementContent
    };

    const res = compileInMemoryPatch(currentFileContent, op);
    setCompilationResult(res);
  };

  const handleCommitSafeWrite = () => {
    if (!compilationResult || !compilationResult.success) return;
    setAppliedHistory([compilationResult.checkpointBackupId, ...appliedHistory]);
    setCurrentFileContent(compilationResult.compiledContent);
    const newHash = computeSha256(compilationResult.compiledContent);
    setProvidedBaseSha(newHash);
    setCompilationResult(null);
  };

  const handleSimulateStaleDiskChange = () => {
    // Modify disk content behind model's back to simulate another developer editing the file
    const modified = currentFileContent + '\n# Modified by concurrent branch or developer\n';
    setCurrentFileContent(modified);
    // Note: providedBaseSha remains unchanged, so next compile will hit staleness rejection!
  };

  const handleResetFile = () => {
    setCurrentFileContent(initialFile.content);
    setProvidedBaseSha(computeSha256(initialFile.content));
    setCompilationResult(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-100">
            In-Memory Patch Compiler &amp; Safe I/O Studio
          </h2>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
            <span>Safety Pipeline (P2)</span>
            <span aria-hidden="true">·</span>
            <span>Smaller AI Output Payload</span>
            <span aria-hidden="true">·</span>
            <span>Base SHA-256 Staleness Gate</span>
            <span aria-hidden="true">·</span>
            <span>Byte-Exact Checkpoints</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleSimulateStaleDiskChange}
            className="px-3 py-1.5 text-xs font-medium text-amber-300 hover:text-white bg-amber-950/60 hover:bg-amber-900 border border-amber-800/80 rounded-lg transition-colors flex items-center gap-1.5"
            title="Simulate disk modification behind model's back"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Simulate Stale Disk Change</span>
          </button>

          <button
            onClick={handleResetFile}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Content</span>
          </button>
        </div>
      </div>

      {/* Architecture Rationale Callout */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Core Safety Invariant: The model NEVER gains direct editor write authority</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Instead of unrestricted command loops or blind replacements, the model outputs a compact patch operation coupled with a Base SHA-256 hash. AI-CODER compiles the patch <strong>in-memory</strong>, validates hashes, runs preview diffing, captures a byte-exact rollback checkpoint, and only then performs safe Windows handle-based safe I/O.
        </p>
      </div>

      {/* Editor & Operation Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Input Patch Definition */}
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Code className="w-4 h-4 text-indigo-400" />
              <span>Compact Model Patch Proposal</span>
            </h3>
            <span className="text-[11px] font-mono text-slate-400">Target: {targetPath}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">Patch Operation Type</label>
              <select
                value={opType}
                onChange={(e) => setOpType(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono outline-none"
              >
                <option value="replace_exact_text">replace_exact_text</option>
                <option value="replace_range">replace_range (lines)</option>
                <option value="insert_after">insert_after</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">Base SHA-256 Header</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={providedBaseSha}
                  onChange={(e) => setProvidedBaseSha(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-300 font-mono truncate outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">
              Search Target (Exact Match Block)
            </label>
            <textarea
              rows={5}
              value={searchTarget}
              onChange={(e) => setSearchTarget(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-300 font-mono leading-relaxed outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">
              Replacement Content (Postimage Block)
            </label>
            <textarea
              rows={7}
              value={replacementContent}
              onChange={(e) => setReplacementContent(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-emerald-300/90 font-mono leading-relaxed outline-none"
            />
          </div>

          <button
            onClick={handleRunCompile}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Compile In-Memory &amp; Verify Hashes</span>
          </button>
        </div>

        {/* Right: Base File State & Compilation Result */}
        <div className="space-y-4">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">Disk File State</span>
              <span className="font-mono text-slate-400">Actual SHA: {currentSha.slice(0, 16)}...</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-400">Match Status:</span>
              {providedBaseSha === currentSha ? (
                <span className="inline-flex items-center gap-1 text-emerald-400 font-mono">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Base Hash Synchronized</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-rose-400 font-mono font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>STALE MISMATCH DETECTED</span>
                </span>
              )}
            </div>
          </div>

          {/* Compilation Output Card */}
          {compilationResult ? (
            <div className={`p-4 border rounded-xl space-y-3 ${
              compilationResult.success 
                ? 'bg-slate-900 border-slate-800' 
                : 'bg-rose-950/30 border-rose-900/60'
            }`}>
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold flex items-center gap-2">
                  <FileDiff className="w-4 h-4 text-indigo-400" />
                  <span className={compilationResult.success ? 'text-slate-200' : 'text-rose-300'}>
                    {compilationResult.success ? 'In-Memory Compilation Succeeded' : 'Compilation Rejected'}
                  </span>
                </div>
                {compilationResult.success && (
                  <span className="text-[11px] font-mono text-emerald-400">
                    Checkpoint: {compilationResult.checkpointBackupId}
                  </span>
                )}
              </div>

              {compilationResult.error ? (
                <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-lg text-xs text-rose-300 font-mono leading-relaxed">
                  {compilationResult.error}
                </div>
              ) : (
                <>
                  <div className="text-xs text-slate-400">
                    Calculated postimage SHA: <span className="font-mono text-slate-300">{compilationResult.compiledSha256.slice(0, 20)}...</span>
                  </div>

                  {/* Diff Hunks Preview */}
                  <div className="border border-slate-800 rounded-lg overflow-hidden max-h-64 overflow-y-auto font-mono text-xs">
                    {compilationResult.diffHunks.map((hunk, i) => (
                      <div
                        key={i}
                        className={`px-3 py-1 flex items-start gap-3 ${
                          hunk.type === 'added'
                            ? 'bg-emerald-950/40 text-emerald-300 border-l-2 border-emerald-500'
                            : hunk.type === 'removed'
                            ? 'bg-rose-950/40 text-rose-300 border-l-2 border-rose-500'
                            : 'text-slate-400 hover:bg-slate-900/30'
                        }`}
                      >
                        <span className="w-6 shrink-0 text-slate-600 text-right select-none">
                          {hunk.lineNew || hunk.lineOld || ''}
                        </span>
                        <span className="shrink-0 select-none">
                          {hunk.type === 'added' ? '+' : hunk.type === 'removed' ? '-' : ' '}
                        </span>
                        <pre className="font-mono whitespace-pre-wrap">{hunk.content}</pre>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">
                      Pre-write review complete. Safe write will capture byte-exact checkpoint first.
                    </span>
                    <button
                      onClick={handleCommitSafeWrite}
                      className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Commit Safe Write to Disk</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="p-8 border border-dashed border-slate-800 rounded-xl text-center text-xs text-slate-500">
              Click &quot;Compile In-Memory &amp; Verify Hashes&quot; to dry-run the patch and generate the diff review.
            </div>
          )}

          {/* Applied Checkpoint History */}
          {appliedHistory.length > 0 && (
            <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl space-y-2">
              <div className="text-xs font-medium text-slate-300">Active Checkpoint Log</div>
              <div className="space-y-1">
                {appliedHistory.map((chk) => (
                  <div key={chk} className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
                    <span>.ai-coder/checkpoints/{chk}.bak</span>
                    <span className="text-emerald-400">Byte-exact snapshot preserved</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
