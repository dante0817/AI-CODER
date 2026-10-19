'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { getWebviewHtml } = require('../src/webview');
const { getEvidenceHtml } = require('../src/evidenceWebview');
const { validateInboundMessage } = require('../src/applicationApi');

test('combined workbench exposes Task, Models, and Architecture surfaces', () => {
  const html = getWebviewHtml({});
  for (const text of ['Task Context', 'Changes', 'Models', 'Architecture', 'Conversation', 'Checkpoint / Actions', 'Runtime Qualification Report']) {
    assert.match(html, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(html, /Native Code-OSS provides Explorer, editor tabs, Git, Search, Terminal, Problems, and full diff views/);
  assert.doesNotMatch(html, />Provider setup</i);
});

test('reviewPending webview command is explicitly validated', () => {
  assert.deepEqual(validateInboundMessage({ type: 'reviewPending', unexpected: 'dropped' }), { type: 'reviewPending' });
});

test('package contributes AI Tasks into the native Explorer and labels the main webview as AI Task Workbench', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(pkg.version, '0.6.0-rc.4');
  assert.equal(pkg.contributes.views.aiCoder[0].name, 'AI Task Workbench');
  assert.equal(pkg.contributes.views.explorer[0].id, 'aiCoder.tasksExplorer');
  assert.equal(pkg.contributes.views.explorer[0].name, 'AI Tasks');
  assert.equal(pkg.contributes.viewsContainers.panel[0].id, 'aiCoderEvidence');
  assert.equal(pkg.contributes.views.aiCoderEvidence[0].id, 'aiCoder.evidence');
});

test('bottom evidence panel exposes verification, activity, and checkpoints', () => {
  const html = getEvidenceHtml();
  assert.match(html, /Verification/);
  assert.match(html, /AI Activity/);
  assert.match(html, /Checkpoints/);
});
