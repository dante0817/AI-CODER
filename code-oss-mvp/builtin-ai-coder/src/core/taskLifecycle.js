'use strict';

const STATES = Object.freeze([
  'ready', 'routing', 'gathering_context', 'calling_model', 'validating_plan', 'awaiting_review',
  'applying', 'verifying', 'review', 'changed', 'applied', 'failed', 'cancelled', 'interrupted', 'recovery_required'
]);
const KNOWN = new Set(STATES);
const TRANSIENT = new Set(['routing', 'gathering_context', 'calling_model', 'validating_plan', 'awaiting_review', 'applying', 'verifying']);
const STABLE_RESTART = new Set(['ready', 'review', 'changed', 'applied', 'failed', 'cancelled', 'interrupted', 'recovery_required']);

const ALLOWED = new Map([
  ['ready', new Set(['routing', 'failed', 'recovery_required'])],
  ['review', new Set(['routing', 'awaiting_review', 'applying', 'ready', 'failed', 'recovery_required'])],
  ['changed', new Set(['routing', 'awaiting_review', 'applying', 'ready', 'failed', 'recovery_required'])],
  ['applied', new Set(['routing', 'review', 'changed', 'ready', 'failed', 'recovery_required'])],
  ['failed', new Set(['routing', 'ready', 'recovery_required'])],
  ['cancelled', new Set(['routing', 'ready'])],
  ['interrupted', new Set(['routing', 'ready', 'recovery_required'])],
  ['recovery_required', new Set(['ready', 'review', 'changed', 'applied', 'failed'])],
  ['routing', new Set(['gathering_context', 'ready', 'failed', 'cancelled', 'interrupted'])],
  ['gathering_context', new Set(['calling_model', 'failed', 'cancelled', 'interrupted'])],
  ['calling_model', new Set(['validating_plan', 'ready', 'failed', 'cancelled', 'interrupted'])],
  ['validating_plan', new Set(['awaiting_review', 'ready', 'review', 'failed', 'cancelled', 'interrupted'])],
  ['awaiting_review', new Set(['applying', 'ready', 'review', 'failed', 'cancelled', 'interrupted'])],
  ['applying', new Set(['verifying', 'review', 'changed', 'applied', 'recovery_required', 'failed', 'interrupted'])],
  ['verifying', new Set(['review', 'changed', 'applied', 'ready', 'failed', 'cancelled', 'interrupted'])]
]);

function normalizeTaskStatus(value) {
  const status = String(value || 'ready').trim().toLowerCase();
  return KNOWN.has(status) ? status : 'recovery_required';
}
function canTransition(from, to) {
  from = normalizeTaskStatus(from); to = normalizeTaskStatus(to);
  if (from === to) return true;
  return !!ALLOWED.get(from)?.has(to);
}
function assertTransition(from, to) {
  const a = normalizeTaskStatus(from), b = normalizeTaskStatus(to);
  if (!canTransition(a, b)) {
    const error = new Error(`Invalid AI-CODER task-state transition: ${a} -> ${b}`);
    error.code = 'AI_CODER_INVALID_TASK_TRANSITION';
    throw error;
  }
  return b;
}
function isTransientState(value) { return TRANSIENT.has(normalizeTaskStatus(value)); }
function isRestartableState(value) { return STABLE_RESTART.has(normalizeTaskStatus(value)); }

module.exports = { STATES, normalizeTaskStatus, canTransition, assertTransition, isTransientState, isRestartableState };
