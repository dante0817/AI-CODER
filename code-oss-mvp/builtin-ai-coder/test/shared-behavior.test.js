'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { analyzeTask, chooseEffort, selectExecutionProfile } = require('../src/core/router');
const { ModelRegistry } = require('../src/core/modelRegistry');
const { rankWorkspaceCandidates } = require('../src/core/contextEngine');

const SPEC = path.resolve(__dirname, '..', '..', '..', 'spec', 'behavior');
function load(name) { return JSON.parse(fs.readFileSync(path.join(SPEC, name), 'utf8')); }

test('shared router behavior vectors match the Python reference contract', () => {
  const spec = load('router-v1.json');
  for (const c of spec.analysisCases) {
    const task = analyzeTask(c.text);
    assert.equal(task.type, c.expected.taskType, c.name);
    assert.equal(task.complexity, c.expected.complexity, c.name);
    assert.equal(task.requiresWrite, c.expected.requiresWrite, c.name);
    assert.equal(task.requiresTools, c.expected.requiresTools, c.name);
    assert.equal(chooseEffort(task, 'auto'), c.expected.autoEffort, c.name);
  }
  for (const c of spec.routingCases) {
    const profile = selectExecutionProfile({
      text: c.text, routingMode: c.routingMode, registry: new ModelRegistry(), availableProviders: new Set(c.availableProviders)
    });
    assert.equal(profile.provider, c.expected.provider, c.name);
    assert.equal(profile.model, c.expected.model, c.name);
    assert.equal(profile.effort, c.expected.effort, c.name);
  }
});

test('shared context-ranking vectors match the Python reference contract', () => {
  const spec = load('context-ranking-v1.json');
  for (const c of spec.cases) {
    const ranked = rankWorkspaceCandidates(c.paths, {
      activeRel: c.activeRel, activeText: c.activeText, taskText: c.taskText, modifiedPaths: new Set(c.modifiedPaths)
    });
    assert.deepEqual(ranked.map(x => x.path), c.expectedOrder, c.name);
    const byPath = new Map(ranked.map(x => [x.path, x]));
    for (const [rel, reason] of Object.entries(c.expectedReasons || {})) {
      assert.equal(byPath.get(rel).reasons[0], reason, `${c.name}: ${rel}`);
    }
  }
});
