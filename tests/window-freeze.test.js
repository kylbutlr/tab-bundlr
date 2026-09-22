import assert from 'node:assert/strict';
import test from 'node:test';

const event = () => ({ addListener() {} });
const area = (values) => ({
  async get(keys) {
    return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, values[key]]));
  },
  async set(next) { Object.assign(values, next); },
  async remove() {},
});

test('freeze defaults, opt-out, worker restart, safe targets and future-tab-only routing', async () => {
  const session = { sessionReconciled: true, persistentHomeBasesReconciled: true, windowAutomationMode: 'selected', selectedWindowIds: [1] };
  const local = { tabBundlrEnabled: true };
  const moved = [];
  const focused = [];
  let windows = [{ id: 1 }, { id: 2 }];
  const meet = { id: 20, windowId: 2, index: 0, url: 'https://meet.google.com/test' };
  const created = { id: 21, windowId: 2, index: 1, groupId: -1, active: false, url: 'chrome://newtab/' };
  let groupMoves = 0;
  globalThis.chrome = {
    storage: { local: area(local), session: area(session), onChanged: event() },
    tabs: {
      async query({ windowId, groupId } = {}) {
        if (groupId !== undefined) return [{ ...created, groupId }];
        return windowId === 2 ? [meet, created] : [];
      },
      async move(id, options) { moved.push({ id, ...options }); },
      async update() {},
      onCreated: event(), onUpdated: event(), onDetached: event(), onAttached: event(), onRemoved: event(),
    },
    tabGroups: { async query() { return []; }, async move() { groupMoves += 1; }, onCreated: event(), onMoved: event() },
    windows: { async getAll() { return windows; }, async update(id) { focused.push(id); }, onRemoved: event() },
    runtime: { onMessage: event(), openOptionsPage() {} },
  };
  try {
    let { TabBundlrBackground: worker } = await import('../background.js?freeze=initial');
    await worker.processCreatedTab(created);
    assert.deepEqual(moved, [{ id: 21, windowId: 1, index: -1 }]);
    assert.deepEqual(focused, [], 'background tab must not steal focus');
    await worker.processCreatedTab({ ...created, id: 22, url: 'https://example.com/link', openerTabId: 20, active: true });
    assert.equal(moved.length, 2);
    assert.deepEqual(focused, [1]);
    await worker.processCreatedTab({ ...created, id: 23, pinned: true });
    await worker.processCreatedTab({ ...meet, windowId: 3 });
    await worker.processUpdatedTab({ url: 'https://example.com/existing' }, { ...meet, url: 'https://example.com/existing' });
    assert.equal(moved.length, 2, 'pinned, first-window tab and existing navigation stay put');

    await worker.setWindowFrozen(2, false);
    assert.deepEqual(session.unfrozenWindowIds, [2]);
    await worker.processCreatedTab({ ...created, id: 24 });
    await worker.processCreatedGroup({ id: 100, windowId: 2 });
    assert.equal(groupMoves, 0);
    assert.equal(moved.length, 2);
    ({ TabBundlrBackground: worker } = await import('../background.js?freeze=restarted'));
    await worker.processCreatedTab({ ...created, id: 25, url: 'https://example.com/external' });
    assert.equal(moved.length, 2, 'opt-out survives service worker restart');
    await worker.setWindowFrozen(2, true);
    assert.equal(moved.length, 2, 'enabling does not move existing tabs');
    await worker.processCreatedTab({ ...created, id: 26 });
    assert.equal(moved.length, 3);
    windows = [{ id: 2 }];
    await worker.processCreatedTab({ ...created, id: 27 });
    assert.equal(moved.length, 3, 'closed main window is not a target');

    windows = [{ id: 1 }, { id: 2 }];
    session.windowAutomationMode = 'all';
    session.pausedWindowIds = [2];
    ({ TabBundlrBackground: worker } = await import('../background.js?freeze=paused'));
    await worker.processCreatedTab({ ...created, id: 28 });
    assert.equal(moved.length, 4, 'auto-paused secondary window also defaults to frozen');
    windows.push({ id: 3 });
    await worker.processCreatedTab({ ...created, id: 29 });
    assert.equal(moved.length, 4, 'multiple managed destinations are ambiguous');
  } finally {
    delete globalThis.chrome;
  }
});
