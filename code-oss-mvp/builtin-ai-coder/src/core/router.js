'use strict';

const { unknownModel } = require('./modelRegistry');

function analyzeTask(text = '') {
  const s = text.toLowerCase();
  let type = 'general';
  let complexity = 'medium';
  if (/architecture|design|review.*app|review.*codebase|entire.*project/.test(s)) { type = 'architecture'; complexity = 'high'; }
  else if (/bug|debug|exception|error|failing|race|deadlock|timeout/.test(s)) { type = 'debugging'; complexity = /intermittent|race|deadlock|concurrency|root cause/.test(s) ? 'high' : 'medium'; }
  else if (/readme|document|docs|comment|explain/.test(s)) { type = 'documentation'; complexity = 'medium'; }
  else if (/rename|typo|small change|one line|simple/.test(s)) { type = 'quick_edit'; complexity = 'low'; }

  const requiresWrite = /fix|implement|change|edit|refactor|add|remove|create|update/.test(s);
  const requiresTools = requiresWrite || /test|run|build|lint|diagnostic/.test(s);
  return { type, complexity, requiresWrite, requiresTools };
}

function chooseEffort(task, requested = 'auto') {
  if (requested !== 'auto') return requested;
  if (task.complexity === 'high') return 'high';
  if (task.complexity === 'low') return 'low';
  return 'medium';
}

function scoreModel(model, task, routingMode) {
  let score = (model.profiles && model.profiles[task.type]) || 0.5;
  if (task.requiresTools && model.capabilityStates?.tools === 'unsupported') score -= 0.35;
  if (routingMode === 'quality') score += model.costClass === 'high' ? 0.08 : 0;
  if (routingMode === 'fast') score += model.latencyClass === 'fast' ? 0.15 : -0.03;
  if (routingMode === 'low-cost') score += model.costClass === 'low' || model.costClass === 'local' ? 0.18 : -0.10;
  if (routingMode === 'local-only') score += model.provider === 'ollama' ? 1 : -10;
  return score;
}

function autoEligible(model, task) {
  if (task.requiresWrite && (model.capabilityStates?.structuredOutput || 'unknown') !== 'supported') return false;
  return true;
}

function selectExecutionProfile({ text, provider = 'auto', model = 'auto', effort = 'auto', routingMode = 'balanced', registry, availableProviders = null }) {
  const task = analyzeTask(text);
  let candidates = registry.list();
  if (availableProviders) candidates = candidates.filter(m => availableProviders.has(m.provider));
  if (provider !== 'auto') candidates = candidates.filter(m => m.provider === provider);
  const explicitManualModel = model !== 'auto' && provider !== 'auto';
  if (model !== 'auto') {
    const exact = candidates.filter(m => m.modelId === model);
    if (exact.length) candidates = exact;
    else if (provider !== 'auto') candidates = [unknownModel(provider, model, 'unverified-manual')];
  }
  if (routingMode === 'local-only') candidates = candidates.filter(m => m.provider === 'ollama');
  if (!explicitManualModel) candidates = candidates.filter(m => autoEligible(m, task));
  if (!candidates.length) {
    const detail = task.requiresWrite && !explicitManualModel ? ' Auto routing requires verified structured-output support for write tasks.' : '';
    throw new Error('No compatible model candidates. Check provider/model settings.' + detail);
  }

  candidates = candidates.map(m => ({ ...m, _score: scoreModel(m, task, routingMode) })).sort((a, b) => b._score - a._score);
  const chosen = candidates[0];
  const capabilityEvidence = {};
  for (const name of Object.keys(chosen.capabilityStates || {})) {
    capabilityEvidence[name] = { state: chosen.capabilityStates[name], source: chosen.capabilitySources?.[name] || chosen.discoverySource || 'unknown' };
  }
  return {
    task,
    provider: chosen.provider,
    model: chosen.modelId,
    displayName: chosen.displayName,
    effort: chooseEffort(task, effort),
    routingMode,
    reason: buildReason(task, routingMode, chosen, explicitManualModel),
    capabilities: { ...(chosen.capabilities || {}) },
    capabilityEvidence,
    capabilitySource: chosen.discoverySource || 'registry',
    alternatives: candidates.slice(1, 3).map(m => ({ provider: m.provider, model: m.modelId, displayName: m.displayName }))
  };
}

function buildReason(task, routingMode, model, explicitManualModel = false) {
  const bits = [`${task.type} task`, `${task.complexity} complexity`, `${routingMode} routing`];
  if (task.requiresTools) bits.push('tool-capable workflow preferred');
  if (task.requiresWrite) bits.push(explicitManualModel ? 'manual model override' : 'verified structured output required');
  if (model.provider === 'ollama') bits.push('local provider selected');
  return bits.join('; ');
}

module.exports = { analyzeTask, chooseEffort, scoreModel, selectExecutionProfile };
