'use strict';

const CAPABILITY_ALIASES = Object.freeze({
  tools: ['tools', 'tool_calling', 'tool_calls'],
  reasoning: ['reasoning', 'thinking'],
  images: ['images', 'vision', 'image_input'],
  structuredOutput: ['structured_output', 'json_schema', 'json_mode']
});

function normalizeCapabilityRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [target, keys] of Object.entries(CAPABILITY_ALIASES)) {
    const key = keys.find(k => Object.hasOwn(raw, k));
    if (!key) continue;
    const value = raw[key];
    if (typeof value === 'boolean') out[target] = value ? 'supported' : 'unsupported';
    else if (['supported', 'unsupported', 'unknown'].includes(value)) out[target] = value;
  }
  return out;
}

function normalizeOllamaCapabilities(values) {
  if (!Array.isArray(values)) return {};
  const caps = new Set(values.map(x => String(x).toLowerCase()));
  const out = {};
  if (['tools', 'tool', 'tool_calling'].some(x => caps.has(x))) out.tools = 'supported';
  if (['thinking', 'reasoning'].some(x => caps.has(x))) out.reasoning = 'supported';
  if (['vision', 'images', 'image'].some(x => caps.has(x))) out.images = 'supported';
  if (['structured_output', 'json', 'json_schema'].some(x => caps.has(x))) out.structuredOutput = 'supported';
  return out;
}

function mapReasoningEffort(effort, baseUrl) {
  const value = String(effort || 'auto');
  if (value === 'auto') return null;
  if (value === 'extra-high') return /api\.openai\.com/i.test(String(baseUrl || '')) ? 'xhigh' : 'high';
  return value;
}

module.exports = { normalizeCapabilityRecord, normalizeOllamaCapabilities, mapReasoningEffort };
