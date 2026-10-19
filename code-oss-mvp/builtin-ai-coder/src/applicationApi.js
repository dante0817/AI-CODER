'use strict';

const SAFE_TASK_ID = /^[A-Za-z0-9_-]{1,160}$/;
const MODES = new Set(['chat', 'plan', 'agent', 'review']);
const ROUTING = new Set(['balanced', 'quality', 'fast', 'low-cost', 'local-only']);
const PROVIDERS = new Set(['auto', 'codex', 'openai-compatible', 'ollama']);
const EFFORTS = new Set(['auto', 'low', 'medium', 'high', 'extra-high']);

function fail(message, code = 'AI_CODER_INVALID_UI_MESSAGE') {
  const error = new Error(message); error.code = code; throw error;
}
function text(value, name, max, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') fail(`${name} must be a string.`);
  const out = value.trim();
  if (!allowEmpty && !out) fail(`${name} is required.`);
  if (out.length > max) fail(`${name} is too long.`);
  return out;
}
function enumValue(value, name, allowed) {
  const out = String(value || '');
  if (!allowed.has(out)) fail(`Unsupported ${name}: ${out || '(empty)'}.`);
  return out;
}
function bool(value, name, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') fail(`${name} must be boolean.`);
  return value;
}
function validateTaskId(value) {
  const id = String(value || '');
  if (!SAFE_TASK_ID.test(id)) fail('Invalid task id.');
  return id;
}
function pickObject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Workbench message must be an object.');
  return input;
}

function validateInboundMessage(input) {
  const m = pickObject(input);
  const type = text(m.type, 'message type', 64);
  switch (type) {
    case 'ready': case 'newTask': case 'undo': case 'applyWorktree': case 'reviewPending': case 'codexStatus': case 'codexLogin': case 'codexLogout': case 'runtimeQualification': case 'openProject': case 'cloneRepository': case 'openAgents': case 'openEvidence': case 'openModels': case 'openArchitecture': case 'focusEditor':
      return { type };
    case 'selectTask': return { type, taskId: validateTaskId(m.taskId) };
    case 'renameTask': return { type, title: text(m.title, 'task title', 120), ...(m.taskId ? { taskId: validateTaskId(m.taskId) } : {}) };
    case 'saveProvider':
      return {
        type,
        baseUrl: m.baseUrl === undefined ? '' : text(m.baseUrl, 'base URL', 2048, { allowEmpty: true }),
        apiKey: m.apiKey === undefined ? '' : text(m.apiKey, 'API key', 8192, { allowEmpty: true })
      };
    case 'refreshModels': return { type, provider: enumValue(m.provider || 'auto', 'provider', PROVIDERS) };
    case 'submit': {
      const model = text(String(m.model ?? 'auto'), 'model', 240);
      return {
        type,
        text: text(m.text, 'prompt', 100000),
        mode: enumValue(String(m.mode || 'chat').toLowerCase(), 'mode', MODES),
        routingMode: enumValue(m.routingMode || 'balanced', 'routing mode', ROUTING),
        provider: enumValue(m.provider || 'auto', 'provider', PROVIDERS),
        model,
        effort: enumValue(m.effort || 'auto', 'effort', EFFORTS),
        includeWorkspace: bool(m.includeWorkspace, 'includeWorkspace', false),
        useWorktree: bool(m.useWorktree, 'useWorktree', true)
      };
    }
    default: fail(`Unknown AI-CODER workbench message type: ${type}`);
  }
}

module.exports = { validateInboundMessage, SAFE_TASK_ID, MODES, ROUTING, PROVIDERS, EFFORTS };
