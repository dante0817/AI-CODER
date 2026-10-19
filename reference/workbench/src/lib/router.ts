import { ModelMetadata, RoutingTask, EligibilityResult, SoftScoreBreakdown, CandidateEvaluation, RoutingDecision } from '../types';

export function evaluateEligibility(model: ModelMetadata, task: RoutingTask): EligibilityResult {
  const hardDisqualifications: string[] = [];
  const passedChecks: string[] = [];

  // Check 1: Provider availability
  if (!model.isAvailable) {
    hardDisqualifications.push(`Provider endpoint (${model.provider}) is unreachable or offline.`);
  } else {
    passedChecks.push(`Provider (${model.provider}) is online and connected.`);
  }

  // Check 2: Local-only policy enforcement
  if (task.localOnlyPolicy) {
    const isLocal = model.provider === 'ollama' || (model.providerEndpoint && (model.providerEndpoint.includes('localhost') || model.providerEndpoint.includes('127.0.0.1')));
    if (!isLocal) {
      hardDisqualifications.push(`Disqualified by local-only privacy policy: Model relies on external cloud infrastructure (${model.provider}).`);
    } else {
      passedChecks.push(`Complies with local-only privacy policy.`);
    }
  }

  // Check 3: Structured Agent Plan (Agent output format)
  if (task.requiresStructuredAgentPlan) {
    if (model.capabilities.structured_agent_plan === 'unsupported') {
      hardDisqualifications.push(`Model cannot produce reliable structured agent plans/JSON schemas.`);
    } else if (model.capabilities.structured_agent_plan === 'unknown') {
      hardDisqualifications.push(`Model capability for structured agent plans is UNVERIFIED/UNKNOWN (unverified models cannot satisfy hard requirements).`);
    } else {
      passedChecks.push(`Verified support for structured agent plans.`);
    }
  }

  // Check 4: Deep reasoning
  if (task.requiresReasoning) {
    if (model.capabilities.reasoning === 'unsupported') {
      hardDisqualifications.push(`Task requires deep chain-of-thought reasoning, but model does not support reasoning mode.`);
    } else if (model.capabilities.reasoning === 'unknown') {
      hardDisqualifications.push(`Reasoning capability is unverified.`);
    } else {
      passedChecks.push(`Model supports deep reasoning & reasoning effort controls.`);
    }
  }

  // Check 5: Multimodal / Image Input
  if (task.requiresImageInput) {
    if (model.capabilities.image_input !== 'supported') {
      hardDisqualifications.push(`Task involves screenshots or UI images, but model has no vision capability.`);
    } else {
      passedChecks.push(`Multimodal vision input supported.`);
    }
  }

  // Check 6: Context Window Capacity
  if (model.contextCapacityTokens < task.minContextTokens) {
    hardDisqualifications.push(`Context capacity (${model.contextCapacityTokens.toLocaleString()} tokens) is below required minimum (${task.minContextTokens.toLocaleString()} tokens).`);
  } else {
    passedChecks.push(`Context capacity (${model.contextCapacityTokens.toLocaleString()} tokens) satisfies task requirement.`);
  }

  return {
    isEligible: hardDisqualifications.length === 0,
    hardDisqualifications,
    passedChecks
  };
}

export function calculateSoftScores(model: ModelMetadata, task: RoutingTask): SoftScoreBreakdown {
  // Base scores by profile
  let codingQuality = 0.70;
  let debuggingQuality = 0.70;

  if (model.codingProfile === 'specialized_coder') {
    codingQuality = 0.94;
    debuggingQuality = 0.90;
  } else if (model.codingProfile === 'general_flagship') {
    codingQuality = 0.96;
    debuggingQuality = 0.95;
  } else {
    codingQuality = 0.78;
    debuggingQuality = 0.74;
  }

  // Latency score
  let latencyScore = 0.7;
  if (model.latencyClass === 'ultra-low') latencyScore = 0.98;
  else if (model.latencyClass === 'balanced') latencyScore = 0.82;
  else if (model.latencyClass === 'deep-reasoning') latencyScore = 0.55;

  // Cost score
  let costScore = 0.7;
  if (model.costClass === 'free-local') costScore = 1.0;
  else if (model.costClass === 'budget') costScore = 0.88;
  else if (model.costClass === 'standard') costScore = 0.65;
  else if (model.costClass === 'premium') costScore = 0.40;

  // Reasoning score
  let reasoningScore = model.capabilities.reasoning === 'supported' ? 0.95 : 0.40;

  // Context capacity score
  let contextCapacityScore = Math.min(1.0, model.contextCapacityTokens / 200000);

  // Preference adjustments
  let userPreferenceAdjustment = 0;
  if (task.userPreference === 'prefer-speed') {
    userPreferenceAdjustment = (latencyScore - 0.7) * 0.4;
  } else if (task.userPreference === 'prefer-low-cost') {
    userPreferenceAdjustment = (costScore - 0.7) * 0.4;
  } else if (task.userPreference === 'prefer-quality') {
    userPreferenceAdjustment = ((codingQuality + debuggingQuality) / 2 - 0.7) * 0.4;
  }

  // Weighted total score (normalized between 0 and 1)
  const totalScore = (
    codingQuality * 0.35 +
    debuggingQuality * 0.25 +
    latencyScore * 0.15 +
    costScore * 0.10 +
    reasoningScore * 0.10 +
    contextCapacityScore * 0.05 +
    userPreferenceAdjustment
  );

  return {
    codingQuality: Number(codingQuality.toFixed(2)),
    debuggingQuality: Number(debuggingQuality.toFixed(2)),
    latencyScore: Number(latencyScore.toFixed(2)),
    costScore: Number(costScore.toFixed(2)),
    reasoningScore: Number(reasoningScore.toFixed(2)),
    contextCapacityScore: Number(contextCapacityScore.toFixed(2)),
    userPreferenceAdjustment: Number(userPreferenceAdjustment.toFixed(2)),
    totalScore: Number(Math.max(0, Math.min(1, totalScore)).toFixed(3))
  };
}

/**
 * Simulates the old flawed v0.4.6 routing behavior where hard requirements were merely treated
 * as soft penalty deductions (e.g. `score -= 0.35`). This caused models lacking tool/reasoning
 * capabilities (like Qwen3 Coder) to win anyway when local-only was active, and outputted
 * contradictory explanations.
 */
export function simulateOldFlawedRouter(models: ModelMetadata[], task: RoutingTask): {
  selectedModel: ModelMetadata;
  score: number;
  reason: string;
} {
  let highestScore = -999;
  let winner = models[0];
  let winnerReason = '';

  for (const model of models) {
    let score = 0.80; // default base score in old router

    if (model.codingProfile === 'specialized_coder') score += 0.25;
    if (model.codingProfile === 'general_flagship') score += 0.30;

    // FLAW: If local-only was requested, old router penalized cloud models, boosting local ones
    if (task.localOnlyPolicy) {
      const isLocal = model.provider === 'ollama';
      if (!isLocal) score -= 0.60;
      else score += 0.30;
    }

    // FLAW: Missing tool/reasoning was ONLY a 0.35 penalty instead of a hard disqualifier!
    if (task.requiresStructuredAgentPlan && model.capabilities.structured_agent_plan !== 'supported') {
      score -= 0.35;
    }
    if (task.requiresReasoning && model.capabilities.reasoning !== 'supported') {
      score -= 0.35;
    }

    // If candidate still wins:
    if (score > highestScore) {
      highestScore = score;
      winner = model;
    }
  }

  // The old flawed router then emitted a stock template explanation:
  winnerReason = `Selected ${winner.name} (score: ${highestScore.toFixed(2)}). Note: Workflow preferred tool/reasoning capable model, yet selected candidate has missing verified capabilities.`;

  return {
    selectedModel: winner,
    score: highestScore,
    reason: winnerReason
  };
}

/**
 * Executes the Refined Two-Stage Router for AI-CODER Desktop v0.4.7:
 * Stage 1: HARD ELIGIBILITY FILTER
 * Stage 2: SOFT PREFERENCE RANKING (Only over eligible candidates)
 */
export function executeTwoStageRouter(models: ModelMetadata[], task: RoutingTask): RoutingDecision {
  const evaluations: CandidateEvaluation[] = models.map(model => {
    const eligibility = evaluateEligibility(model, task);
    const softScores = calculateSoftScores(model, task);
    return {
      model,
      eligibility,
      softScores
    };
  });

  // Filter to strictly eligible candidates
  const eligibleCandidates = evaluations.filter(e => e.eligibility.isEligible);

  // Sort eligible candidates by soft total score descending
  eligibleCandidates.sort((a, b) => b.softScores.totalScore - a.softScores.totalScore);

  const selectedCandidate = eligibleCandidates.length > 0 ? eligibleCandidates[0] : null;

  // Run old router for side-by-side architectural demonstration
  const oldResult = simulateOldFlawedRouter(models, task);

  let explanation = '';
  if (!selectedCandidate) {
    explanation = `Routing failed: No candidate model satisfied the hard eligibility criteria. All ${models.length} models were disqualified by hard filters (such as local-only privacy, required reasoning, or minimum context size).`;
  } else {
    explanation = `Selected ${selectedCandidate.model.name} via Two-Stage Gate. Stage 1 verified all hard constraints (${selectedCandidate.eligibility.passedChecks.length} passed, 0 hard violations). Stage 2 ranked model #1 with score ${selectedCandidate.softScores.totalScore.toFixed(3)} (Coding: ${selectedCandidate.softScores.codingQuality}, Debugging: ${selectedCandidate.softScores.debuggingQuality}, Latency: ${selectedCandidate.softScores.latencyScore}).`;
  }

  return {
    task,
    evaluatedCandidates: evaluations,
    selectedModel: selectedCandidate ? selectedCandidate.model : null,
    routingExplanation: explanation,
    comparisonWithOldRouter: {
      oldSelectedModelId: oldResult.selectedModel.id,
      oldSelectedModelName: oldResult.selectedModel.name,
      flawedReason: oldResult.reason
    }
  };
}
