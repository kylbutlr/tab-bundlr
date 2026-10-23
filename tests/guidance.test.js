import assert from 'node:assert/strict';
import test from 'node:test';
import {
  shouldShowFirstUseGuidance,
  sourceAccessDisclosure,
} from '../guidance.js';

test('shows first-use guidance only before a user configures or dismisses it', () => {
  assert.equal(shouldShowFirstUseGuidance(false, {}), true);
  assert.equal(shouldShowFirstUseGuidance(true, {}), false);
  assert.equal(shouldShowFirstUseGuidance(false, { smartGroupCount: 1 }), false);
  assert.equal(shouldShowFirstUseGuidance(false, { focusGroupCount: 1 }), false);
  assert.equal(shouldShowFirstUseGuidance(false, { trainedRuleCount: 1 }), false);
  assert.equal(shouldShowFirstUseGuidance(false, { workspaceSourceCount: 1 }), false);
});

test('requires contextual disclosure only before ungranted connection access', () => {
  const source = {
    name: 'Project Tracker',
    permissionOrigins: ['https://api.tracker.example/*'],
  };
  assert.deepEqual(sourceAccessDisclosure(source, false), {
    required: true,
    name: 'Project Tracker',
    origins: ['https://api.tracker.example/*'],
  });
  assert.equal(sourceAccessDisclosure(source, true).required, false);
  assert.equal(sourceAccessDisclosure({ name: 'Local source' }, false).required, false);
});
