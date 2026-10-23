import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeUrlRules, bestUrlAssignmentForUrl } from '../rules.js';

const groups = [{ id: 'z', name: 'Alpha', patterns: ['https://example.com'] },
  { id: 'a', name: 'Zulu', patterns: ['https://example.com'] }];

test('URL tester and runtime agree on exact ties, disabled categories, focus and more specific saved rules', () => {
  const focus = { id: '0', name: 'Focus', patterns: ['https://example.com/docs'], focusMode: true };
  const rules = [{ epicId: 'project', epicName: 'Project', pattern: 'https://example.com/docs/setup' }];
  for (const enabled of [null, { smart: false }, { client: false }, { 'focus-smart': false }]) {
    for (const url of ['https://example.com', 'https://example.com/docs', 'https://example.com/docs/setup', 'https://other.example']) {
      const runtime = bestUrlAssignmentForUrl([...groups, focus], rules, url, enabled);
      const tested = analyzeUrlRules([...groups, focus], rules, url, enabled).assignment;
      assert.equal(tested?.id, runtime ? String(runtime.type === 'smart' ? runtime.rule.id : runtime.rule.epicId) : undefined);
      assert.equal(tested?.type, runtime?.type);
    }
  }
  assert.equal(analyzeUrlRules(groups, [], 'https://example.com').assignment.id, 'a');
});
