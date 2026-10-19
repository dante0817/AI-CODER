import React, { useState } from 'react';
import { ModelMetadata, RoutingTask } from '../types';
import { executeTwoStageRouter } from '../lib/router';
import { ShieldCheck, ArrowRight, CheckCircle, XCircle, Sliders, Play, AlertCircle, ArrowUpRight } from 'lucide-react';

interface RouterViewProps {
  models: ModelMetadata[];
}

export const RouterView: React.FC<RouterViewProps> = ({ models }) => {
  // Configurable Task Input
  const [prompt, setPrompt] = useState('fix the bug and run tests in OrderService');
  const [requiresStructuredPlan, setRequiresStructuredPlan] = useState(true);
  const [requiresReasoning, setRequiresReasoning] = useState(false);
  const [requiresImageInput, setRequiresImageInput] = useState(false);
  const [localOnlyPolicy, setLocalOnlyPolicy] = useState(true); // Default to local-only to demonstrate the exact case!
  const [minContextTokens, setMinContextTokens] = useState(32000);
  const [userPreference, setUserPreference] = useState<'balanced' | 'prefer-quality' | 'prefer-speed' | 'prefer-low-cost'>('prefer-quality');

  const currentTask: RoutingTask = {
    id: 'task-test',
    prompt,
    requiresStructuredAgentPlan: requiresStructuredPlan,
    requiresReasoning,
    requiresImageInput,
    requiresLargeContext: minContextTokens > 64000,
    minContextTokens,
    localOnlyPolicy,
    userPreference,
  };

  const decision = executeTwoStageRouter(models, currentTask);

  const loadPreset = (presetName: 'user_case' | 'multimodal' | 'deep_reasoning' | 'fast_cloud') => {
    if (presetName === 'user_case') {
      setPrompt('fix the bug and run tests in OrderService');
      setRequiresStructuredPlan(true);
      setRequiresReasoning(false);
      setRequiresImageInput(false);
      setLocalOnlyPolicy(true);
      setMinContextTokens(32000);
      setUserPreference('prefer-quality');
    } else if (presetName === 'multimodal') {
      setPrompt('fix UI broken layout in checkout modal matching screenshot');
      setRequiresStructuredPlan(true);
      setRequiresReasoning(false);
      setRequiresImageInput(true);
      setLocalOnlyPolicy(false);
      setMinContextTokens(64000);
      setUserPreference('prefer-quality');
    } else if (presetName === 'deep_reasoning') {
      setPrompt('derive algorithmic lock-free queue concurrency proof and stress tests');
      setRequiresStructuredPlan(true);
      setRequiresReasoning(true);
      setRequiresImageInput(false);
      setLocalOnlyPolicy(false);
      setMinContextTokens(128000);
      setUserPreference('prefer-quality');
    } else {
      setPrompt('quick docstring and typo cleanup');
      setRequiresStructuredPlan(true);
      setRequiresReasoning(false);
      setRequiresImageInput(false);
      setLocalOnlyPolicy(false);
      setMinContextTokens(16000);
      setUserPreference('prefer-speed');
    }
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-100">
            Two-Stage Routing Engine Lab
          </h2>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
            <span>Refined Architecture (P1)</span>
            <span aria-hidden="true">·</span>
            <span>Stage 1: Hard Eligibility Filter</span>
            <span aria-hidden="true">·</span>
            <span>Stage 2: Soft Preference Ranking</span>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Presets:</span>
          <button
            onClick={() => loadPreset('user_case')}
            className="px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded transition-colors"
          >
            Review Case (Local-Only)
          </button>
          <button
            onClick={() => loadPreset('multimodal')}
            className="px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded transition-colors"
          >
            Vision Task
          </button>
          <button
            onClick={() => loadPreset('deep_reasoning')}
            className="px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded transition-colors"
          >
            Deep Reasoning
          </button>
        </div>
      </div>

      {/* Task Configuration Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span>Simulated Task &amp; Routing Constraints</span>
            </h3>
            <span className="text-xs text-slate-500 font-mono">Real-time reactive evaluation</span>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <label className="flex items-start gap-2.5 p-3 bg-slate-950/70 border border-slate-800 rounded-lg cursor-pointer hover:border-slate-700">
              <input
                type="checkbox"
                checked={localOnlyPolicy}
                onChange={(e) => setLocalOnlyPolicy(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-0"
              />
              <div>
                <div className="text-xs font-medium text-slate-200">Local-Only Policy</div>
                <div className="text-[11px] text-slate-400 leading-tight">Hard-disqualifies all external cloud APIs</div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-3 bg-slate-950/70 border border-slate-800 rounded-lg cursor-pointer hover:border-slate-700">
              <input
                type="checkbox"
                checked={requiresStructuredPlan}
                onChange={(e) => setRequiresStructuredPlan(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-0"
              />
              <div>
                <div className="text-xs font-medium text-slate-200">Requires Structured Plan</div>
                <div className="text-[11px] text-slate-400 leading-tight">Strict JSON patch output format</div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-3 bg-slate-950/70 border border-slate-800 rounded-lg cursor-pointer hover:border-slate-700">
              <input
                type="checkbox"
                checked={requiresReasoning}
                onChange={(e) => setRequiresReasoning(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-0"
              />
              <div>
                <div className="text-xs font-medium text-slate-200">Requires Deep Reasoning</div>
                <div className="text-[11px] text-slate-400 leading-tight">Chain-of-thought algorithmic proof</div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-3 bg-slate-950/70 border border-slate-800 rounded-lg cursor-pointer hover:border-slate-700">
              <input
                type="checkbox"
                checked={requiresImageInput}
                onChange={(e) => setRequiresImageInput(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-0"
              />
              <div>
                <div className="text-xs font-medium text-slate-200">Requires Vision/Multimodal</div>
                <div className="text-[11px] text-slate-400 leading-tight">Screenshot or mockup input</div>
              </div>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">
                Context Window Requirement
              </label>
              <select
                value={minContextTokens}
                onChange={(e) => setMinContextTokens(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono outline-none"
              >
                <option value={16000}>16,000 tokens (Compact file)</option>
                <option value={32000}>32,000 tokens (Standard task)</option>
                <option value={64000}>64,000 tokens (Large codebase)</option>
                <option value={128000}>128,000 tokens (Massive repository)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">
                Soft Ranking Preference
              </label>
              <select
                value={userPreference}
                onChange={(e) => setUserPreference(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none"
              >
                <option value="prefer-quality">Prefer Quality &amp; Debugging Depth</option>
                <option value="prefer-speed">Prefer Ultra-Low Latency</option>
                <option value="prefer-low-cost">Prefer Zero/Low Cost</option>
                <option value="balanced">Balanced</option>
              </select>
            </div>
          </div>
        </div>

        {/* Side-by-Side Comparison: Old Flawed vs Refined Router */}
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-4 flex flex-col justify-between">
          <div>
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
              Architectural Contrast
            </div>

            {/* Old Flawed Router Box */}
            <div className="p-3 bg-rose-950/20 border border-rose-900/40 rounded-lg mb-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-rose-300">v0.4.6 Old Router (Flawed)</span>
                <span className="text-[10px] text-rose-400 font-mono">Penalty Subtraction</span>
              </div>
              <div className="mt-2 text-xs text-slate-200 font-medium">
                Winner: {decision.comparisonWithOldRouter.oldSelectedModelName}
              </div>
              <div className="text-[11px] text-rose-300/80 mt-1 leading-relaxed">
                {decision.comparisonWithOldRouter.flawedReason}
              </div>
            </div>

            {/* New Two-Stage Router Box */}
            <div className="p-3 bg-emerald-950/20 border border-emerald-900/40 rounded-lg">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-emerald-300">v0.4.7 Two-Stage Router (Refined)</span>
                <span className="text-[10px] text-emerald-400 font-mono">Stage 1 Hard Filter</span>
              </div>
              <div className="mt-2 text-xs text-slate-200 font-medium">
                {decision.selectedModel ? (
                  <span className="text-emerald-300 font-semibold">{decision.selectedModel.name}</span>
                ) : (
                  <span className="text-amber-400 font-semibold">No Eligible Model</span>
                )}
              </div>
              <div className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                {decision.routingExplanation}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-800">
            Note: In v0.4.7, AI-CODER desktop executes writes &amp; verification commands itself. The model only needs verified <code className="font-mono text-slate-400">structured_agent_plan</code> capabilities, not provider-native execution tools.
          </div>
        </div>
      </div>

      {/* Candidate Evaluation Grid */}
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
        <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-200">
            Candidate Pipeline Evaluation ({decision.evaluatedCandidates.length} models tested)
          </div>
          <div className="text-xs text-slate-400">
            Eligible for ranking: {decision.evaluatedCandidates.filter(c => c.eligibility.isEligible).length} of {decision.evaluatedCandidates.length}
          </div>
        </div>

        <div className="divide-y divide-slate-800/80">
          {decision.evaluatedCandidates.map((candidate) => {
            const isWinner = decision.selectedModel?.id === candidate.model.id;
            const isEligible = candidate.eligibility.isEligible;

            return (
              <div
                key={candidate.model.id}
                className={`p-4 transition-colors ${
                  isWinner
                    ? 'bg-indigo-950/20 border-l-4 border-l-indigo-500'
                    : isEligible
                    ? 'hover:bg-slate-900/30'
                    : 'bg-slate-950/60 opacity-75'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-100">{candidate.model.name}</span>
                      <span className="text-xs text-slate-400 font-mono">({candidate.model.provider})</span>
                      {isWinner && (
                        <span className="px-2 py-0.5 text-[10px] font-semibold text-emerald-300 bg-emerald-950 border border-emerald-800 rounded">
                          SELECTED WINNER
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      Context: {candidate.model.contextCapacityTokens.toLocaleString()} tokens · Profile: {candidate.model.codingProfile} · Cost: {candidate.model.costClass}
                    </div>
                  </div>

                  {/* Stage 1 & 2 Status */}
                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                    <div>
                      <span className="text-slate-500 mr-1.5">Stage 1 (Eligibility):</span>
                      {isEligible ? (
                        <span className="text-emerald-400 font-semibold inline-flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>PASSED</span>
                        </span>
                      ) : (
                        <span className="text-rose-400 font-semibold inline-flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>DISQUALIFIED</span>
                        </span>
                      )}
                    </div>

                    {isEligible && (
                      <div>
                        <span className="text-slate-500 mr-1.5">Stage 2 (Score):</span>
                        <span className="text-indigo-300 font-semibold tabular-nums">
                          {candidate.softScores.totalScore.toFixed(3)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Details Breakdown */}
                <div className="mt-3 pt-2.5 border-t border-slate-900 text-xs">
                  {isEligible ? (
                    <div className="flex flex-wrap items-center gap-4 text-slate-400">
                      <span>Coding: <strong className="text-slate-200 tabular-nums">{candidate.softScores.codingQuality}</strong></span>
                      <span aria-hidden="true">·</span>
                      <span>Debugging: <strong className="text-slate-200 tabular-nums">{candidate.softScores.debuggingQuality}</strong></span>
                      <span aria-hidden="true">·</span>
                      <span>Latency: <strong className="text-slate-200 tabular-nums">{candidate.softScores.latencyScore}</strong></span>
                      <span aria-hidden="true">·</span>
                      <span>Cost: <strong className="text-slate-200 tabular-nums">{candidate.softScores.costScore}</strong></span>
                      <span aria-hidden="true">·</span>
                      <span>Preference Adj: <strong className="text-slate-200 tabular-nums">{candidate.softScores.userPreferenceAdjustment > 0 ? `+${candidate.softScores.userPreferenceAdjustment}` : candidate.softScores.userPreferenceAdjustment}</strong></span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {candidate.eligibility.hardDisqualifications.map((reason, idx) => (
                        <div key={idx} className="text-rose-400/90 text-xs flex items-center gap-1.5">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          <span>{reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
