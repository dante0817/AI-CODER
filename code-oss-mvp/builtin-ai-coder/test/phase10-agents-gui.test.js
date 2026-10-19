'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { getWebviewHtml } = require('../src/webview');
const { getAgentsHtml } = require('../src/agentsWebview');
const { validateInboundMessage } = require('../src/applicationApi');

test('editor-mode workbench exposes agents switch, welcome state, and task artifacts', () => {
  const html = getWebviewHtml({});
  for (const text of ['Agents Workspace', 'Start coding with AI-CODER', 'Open Project', 'Clone Repository', 'Artifacts']) {
    assert.match(html, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('agents workspace exposes task, artifact, change, context, and verification surfaces', () => {
  const html = getAgentsHtml();
  for (const text of ['Agent Tasks', 'Plan / Lifecycle', 'Artifacts', 'Changes', 'Context', 'Verification', 'Apply to Main']) {
    assert.match(html, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(html, /Editor/);
  assert.match(html, /Agents/);
});

test('navigation-only UI commands are schema validated', () => {
  for (const type of ['openProject','cloneRepository','openAgents','openEvidence','openModels','openArchitecture','focusEditor']) {
    assert.deepEqual(validateInboundMessage({ type, unexpected: 'dropped' }), { type });
  }
});

test('package contributes the full Agents workspace command and rc4 version', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(pkg.version, '0.6.0-rc.4');
  assert.ok(pkg.contributes.commands.some(c => c.command === 'aiCoder.openAgentsWorkspace'));
  assert.ok(pkg.activationEvents.includes('onCommand:aiCoder.openAgentsWorkspace'));
});
