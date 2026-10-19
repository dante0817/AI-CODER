'use strict';

const CAPABILITY_NAMES = ['tools', 'reasoning', 'images', 'structuredOutput'];
const CAPABILITY_STATES = new Set(['supported', 'unsupported', 'unknown']);

function normalizeModel(model, fallbackSource = 'registry') {
  const out = { ...model };
  out.capabilities = { ...(out.capabilities || {}) };
  out.capabilityStates = { ...(out.capabilityStates || {}) };
  out.capabilitySources = { ...(out.capabilitySources || {}) };
  out.discoverySource = out.discoverySource || fallbackSource;
  for (const name of CAPABILITY_NAMES) {
    let state = out.capabilityStates[name];
    if (!CAPABILITY_STATES.has(state)) state = out.capabilities[name] ? 'supported' : 'unsupported';
    out.capabilityStates[name] = state;
    out.capabilitySources[name] = out.capabilitySources[name] || out.discoverySource;
    out.capabilities[name] = state === 'supported';
  }
  return out;
}

function unknownModel(provider, modelId, source = 'provider-catalog') {
  return normalizeModel({
    provider, modelId, displayName: modelId,
    profiles: { quick_edit: 0.55, debugging: 0.55, architecture: 0.55, documentation: 0.60, general: 0.55 },
    capabilities: { tools: false, reasoning: false, images: false, structuredOutput: false },
    capabilityStates: { tools: 'unknown', reasoning: 'unknown', images: 'unknown', structuredOutput: 'unknown' },
    capabilitySources: { tools: source, reasoning: source, images: source, structuredOutput: source },
    contextClass: 'unknown', latencyClass: 'unknown', costClass: 'unknown', discoverySource: source
  }, source);
}

const DEFAULT_MODELS = [
  normalizeModel({
    provider: 'codex',
    modelId: 'codex-default',
    displayName: 'Codex (ChatGPT account)',
    profiles: { quick_edit: 0.93, debugging: 0.99, architecture: 0.99, documentation: 0.92, general: 0.97 },
    capabilities: { tools: true, reasoning: true, images: true, structuredOutput: true },
    contextClass: 'large', latencyClass: 'medium', costClass: 'account'
  }),
  normalizeModel({
    provider: 'openai-compatible',
    modelId: 'gpt-5.6-sol',
    displayName: 'GPT-5.6 Sol',
    profiles: { quick_edit: 0.82, debugging: 0.95, architecture: 0.97, documentation: 0.90, general: 0.94 },
    capabilities: { tools: true, reasoning: true, images: true, structuredOutput: true },
    contextClass: 'large', latencyClass: 'medium', costClass: 'high'
  }),
  normalizeModel({
    provider: 'openai-compatible',
    modelId: 'gpt-5.6-luna',
    displayName: 'GPT-5.6 Luna',
    profiles: { quick_edit: 0.96, debugging: 0.76, architecture: 0.72, documentation: 0.88, general: 0.84 },
    capabilities: { tools: true, reasoning: true, images: true, structuredOutput: true },
    contextClass: 'medium', latencyClass: 'fast', costClass: 'low'
  }),
  normalizeModel({
    provider: 'ollama',
    modelId: 'qwen3-coder',
    displayName: 'Qwen3 Coder (local example)',
    profiles: { quick_edit: 0.78, debugging: 0.77, architecture: 0.68, documentation: 0.70, general: 0.72 },
    capabilities: { tools: false, reasoning: true, images: false, structuredOutput: true },
    contextClass: 'medium', latencyClass: 'variable', costClass: 'local'
  })
];

class ModelRegistry {
  constructor(custom = [], { includeDefaults = true } = {}) {
    this.models = [...(includeDefaults ? DEFAULT_MODELS : []), ...custom.map(m => normalizeModel(m, m.discoverySource || 'custom'))];
  }
  list(provider) { return provider ? this.models.filter(m => m.provider === provider) : [...this.models]; }
  find(provider, modelId) { return this.models.find(m => m.provider === provider && m.modelId === modelId); }
  add(model) {
    if (!model || !model.provider || !model.modelId) throw new Error('Model requires provider and modelId');
    const normalized = normalizeModel(model, model.discoverySource || 'custom');
    const i = this.models.findIndex(m => m.provider === normalized.provider && m.modelId === normalized.modelId);
    if (i >= 0) this.models[i] = normalized; else this.models.push(normalized);
  }
}

module.exports = { ModelRegistry, DEFAULT_MODELS, CAPABILITY_NAMES, normalizeModel, unknownModel };
