import assert from 'node:assert/strict';
import test from 'node:test';
import { createRadarDisposableTest } from '../radar-disposable.js';
const event = () => ({ listeners: [], addListener(listener) { this.listeners.push(listener); } });
const area = (values) => ({ async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys])
  .filter((key) => key in values).map((key) => [key, structuredClone(values[key])])); },
  async set(changes) { Object.assign(values, structuredClone(changes)); },
  async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key]; } });

test('disposable controller refuses to create tabs outside the explicit read-only hold', async () => {
  let calls = 0;
  const run = createRadarDisposableTest({ chromeApi: { tabs: { async query() { calls += 1; } } }, isHeld: () => false });
  await assert.rejects(run(1), { code: 'read-only-hold-required' }); assert.equal(calls, 0);
});

test('installed-worker test uses dynamic project matching, real move/Undo engines and preserves working tabs, settings and history', async () => {
  const originalHistory = Array.from({ length: 20 }, (_, index) => ({ id: `synthetic-old-${index}`, createdAt: '2026-01-01T00:00:00.000Z',
    label: 'Synthetic retained history', moves: [{ tabId: 100 + index, groupId: 77, previousGroupId: -1 }] }));
  const local = { settingsVersion: 2, workspaceSources: [], activityHistory: originalHistory,
    trainedRules: [{ epicId: 'old', epicName: 'Existing', pattern: 'https://synthetic.example/' }],
    tabBundlrReadOnlyReload: { version: 1, held: true },
    groupRecords: { '1:working': { epicId: 'working', groupId: 77, windowId: 1, title: 'Existing' } } };
  const savedRules = structuredClone(local.trainedRules);
  const working = { id: 1, windowId: 1, groupId: 77, index: 0, pinned: true, url: 'https://synthetic.example/', title: 'Working fixture' };
  const options = { id: 2, windowId: 1, groupId: -1, index: 1, pinned: false, active: true,
    url: `chrome-extension://${'a'.repeat(32)}/options.html` };
  const tabs = [working, options]; const originalTabs = structuredClone(tabs);
  const groups = [{ id: 77, windowId: 1, title: 'Existing', color: 'blue' }];
  let created = 0, removed = 0, fetches = 0, wholeWindowMoves = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { fetches += 1; throw Error('No service read permitted'); };
  const messages = event();
  globalThis.chrome = {
    storage: { local: area(local), session: area({}), onChanged: event() },
    permissions: { async contains() { return true; }, onAdded: event(), onRemoved: event() },
    tabs: { async query(query = {}) { return tabs.filter((tab) => !query.url || tab.url === query.url).map((tab) => ({ ...tab })); },
      async get(id) { const tab = tabs.find((tab) => tab.id === id); if (!tab) throw Error('Gone'); return { ...tab }; },
      async create(properties) { created += 1; const tab = { ...properties, id: created + 10, groupId: -1, pinned: false, title: 'Disposable fixture' };
        tabs.push(tab); return { ...tab }; },
      async group({ tabIds, groupId }) { assert.equal(tabIds.every((id) => id > 10), true, 'Working tab must never be grouped');
        if (groupId === undefined) { groupId = 80; groups.push({ id: groupId, windowId: 1 }); }
        for (const id of tabIds) tabs.find((tab) => tab.id === id).groupId = groupId; return groupId; },
      async ungroup(id) { assert.equal(id > 10, true); tabs.find((tab) => tab.id === id).groupId = -1; },
      async remove(id) { assert.equal(id > 10, true); removed += 1; tabs.splice(tabs.findIndex((tab) => tab.id === id), 1); },
      async move() { wholeWindowMoves += 1; assert.fail('No window organization in disposable test'); },
      onCreated: event(), onUpdated: event(), onActivated: event(), onDetached: event(), onAttached: event(), onRemoved: event() },
    tabGroups: { async query() { return groups.map((group) => ({ ...group })); },
      async update(id, changes) { assert.notEqual(id, 77); const group = groups.find((group) => group.id === id); Object.assign(group, changes); return { ...group }; },
      onCreated: event(), onMoved: event() },
    windows: { async getAll() { return [{ id: 1 }]; }, onRemoved: event() },
    runtime: { id: 'a'.repeat(32), getURL: (path) => `chrome-extension://${'a'.repeat(32)}/${path}`, onMessage: messages },
  };
  try {
    const { TabBundlrBackground: worker } = await import('../background.js?disposable-project-acceptance');
    await worker.initializeForSession();
    const result = await new Promise((resolve) => messages.listeners[0]({ type: 'RADAR_DISPOSABLE_TEST' },
      { id: chrome.runtime.id, url: options.url }, resolve));
    assert.equal(result.ok, true); assert.deepEqual(result.test, { status: 'passed', grouped: 2, undone: 2,
      serviceRequests: 0, sourceSaved: false, historyWritten: false, disposableTabsRetained: 0, workingTabsUnchanged: true });
    assert.equal(created, 2); assert.equal(removed, 2); assert.equal(fetches, 0); assert.equal(wholeWindowMoves, 0);
    assert.deepEqual(tabs, originalTabs); assert.deepEqual(local.activityHistory, originalHistory);
    assert.deepEqual(local.trainedRules, savedRules); assert.deepEqual(local.workspaceSources, []);
    assert.deepEqual(Object.keys(local.groupRecords), ['1:working']); assert.deepEqual(local.tabContexts || {}, {});
  } finally { globalThis.fetch = previousFetch; delete globalThis.chrome; }
});
