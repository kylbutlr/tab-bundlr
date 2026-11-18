import assert from 'node:assert/strict';
import test from 'node:test';
import { closeReviewedTabs } from '../review-actions.js';

const tab = (id, changes = {}) => ({ id, url: 'https://example.com/docs', windowId: 1, groupId: -1, lastAccessed: 100, pinned: false, active: false, ...changes });
const duplicateOptions = { keeperId: 1, duplicateKey: 'https://example.com/docs' };
function browser(current) {
  const removed = [];
  return { removed, query: async () => current, remove: async (ids) => removed.push(...ids) };
}

test('closes reviewed unchanged duplicates while retaining the selected keeper', async () => {
  const tabs = browser([tab(1), tab(2), tab(3)]);
  const result = await closeReviewedTabs([tab(1), tab(2), tab(3)], tabs, duplicateOptions);
  assert.deepEqual(result.closedIds, [2, 3]);
  assert.deepEqual(tabs.removed, [2, 3]);
});

test('rechecks protections, navigation, and reviewed context after confirmation', async () => {
  const current = [tab(1), tab(2, { active: true }), tab(3, { pinned: true }),
    tab(4, { url: 'https://example.com/other' }), tab(5, { pendingUrl: 'https://example.com/other' }),
    tab(6, { windowId: 2 }), tab(7, { groupId: 10 }), tab(8, { lastAccessed: 200 }), tab(9)];
  const tabs = browser(current);
  await closeReviewedTabs(Array.from({ length: 10 }, (_, index) => tab(index + 1)), tabs, duplicateOptions);
  assert.deepEqual(tabs.removed, [9]);
});

test('keeps all duplicates if the selected keeper closed or navigated away', async () => {
  for (const current of [[tab(2)], [tab(1, { url: 'https://example.com/other' }), tab(2)]]) {
    const tabs = browser(current);
    assert.equal((await closeReviewedTabs([tab(2)], tabs, duplicateOptions)).keeperChanged, true);
    assert.deepEqual(tabs.removed, []);
  }
});

test('closes only unchanged stale selections that still exceed the cutoff', async () => {
  const tabs = browser([tab(1), tab(2, { lastAccessed: 600 }), tab(3, { lastAccessed: 0 }), tab(4, { active: true })]);
  await closeReviewedTabs([tab(1), tab(2, { lastAccessed: 600 }), tab(3, { lastAccessed: 0 }), tab(4)], tabs, { staleCutoff: 500 });
  assert.deepEqual(tabs.removed, [1]);
});

test('does not remove tabs when the current browser state cannot be read', async () => {
  const tabs = browser([]);
  tabs.query = async () => { throw new Error('Unavailable'); };
  await assert.rejects(closeReviewedTabs([tab(1)], tabs));
  assert.deepEqual(tabs.removed, []);
});
