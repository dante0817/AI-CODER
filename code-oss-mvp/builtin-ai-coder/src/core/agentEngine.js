'use strict';

const { classifyCommand, validateWorkspacePath } = require('./policy');

const AGENT_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'changes', 'commands'],
  properties: {
    summary: { type: 'string' },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'content'],
        properties: { path: { type: 'string' }, content: { type: 'string' } }
      }
    },
    commands: { type: 'array', items: { type: 'string' } }
  }
};

const AGENT_SCHEMA_PROMPT = `You are the editing planner for AI-CODER. Return ONLY valid JSON, no markdown fences.\nSchema:\n{\n  "summary": "short explanation",\n  "changes": [{"path":"relative/path","content":"complete replacement file content"}],\n  "commands": ["safe verification command"]\n}\nRules: only change files necessary for the user's request; paths must be workspace-relative; never request secrets; commands should be tests/lint/build/status/diff only. If no change is needed, return empty changes.`;

function extractJson(text) {
  const t = String(text || '').trim();
  try { return JSON.parse(t); } catch (_) {}
  const start = t.indexOf('{'), end = t.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1));
  throw new Error('Agent response was not valid JSON.');
}

function validatePlan(plan) {
  if (!plan || typeof plan !== 'object') throw new Error('Invalid agent plan.');
  plan.changes = Array.isArray(plan.changes) ? plan.changes : [];
  plan.commands = Array.isArray(plan.commands) ? plan.commands : [];
  for (const c of plan.changes) {
    validateWorkspacePath(c.path);
    if (typeof c.content !== 'string') throw new Error(`Missing content for ${c.path}`);
  }
  const commandChecks = plan.commands.map(command => ({ command, ...classifyCommand(command) }));
  return { ...plan, commandChecks };
}

module.exports = { AGENT_SCHEMA_PROMPT, AGENT_OUTPUT_SCHEMA, extractJson, validatePlan };
