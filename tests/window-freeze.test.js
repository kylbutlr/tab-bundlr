import assert from 'node:assert/strict';
import test from 'node:test';

const event = () => ({ addListener() {} });
const capturedEvent = () => ({ addListener(listener) { this.fire = listener; } });
const area = (values) => ({
  async get(keys) {
    return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, values[key]]));
  },
  async set(next) { Object.assign(values, next); },
  async remove() {},
});

for (const scenario of [
  { name: 'automatic bundling on', automaticBundling: true },
  { name: 'automatic bundling off', automaticBundling: false },
  { name: 'URL update overlaps creation', automaticBundling: true, overlap: true },
  { name: 'Chrome temporarily rejects move after drag', automaticBundling: true, rejectMove: true },
  { name: 'allowing tabs cancels a failed move retry', automaticBundling: true, rejectMove: true, allowAfterFailure: true },
  { name: 'repeated Chrome rejection stops after three attempts', automaticBundling: true, rejectMove: true, rejectAlways: true },
]) {
  const { automaticBundling, overlap, rejectMove } = scenario;
  test(`external link after dragging another tab into Meet routes away (${scenario.name})`, async () => {
    const session = { sessionReconciled: true, persistentHomeBasesReconciled: true, windowAutomationMode: 'selected', selectedWindowIds: [1] };
    const detached = capturedEvent();
    const attached = capturedEvent();
    const moved = [];
    const focused = [];
    const meet = { id: 20, windowId: 2, index: 0, url: 'https://meet.google.com/test' };
    const dragged = { id: 30, windowId: 2, index: 1, url: 'https://example.com/dragged' };
    const external = { id: 31, windowId: 2, index: 2, active: true, pendingUrl: 'https://example.com/external' };
    let releaseQuery;
    let queryStarted;
    const queryReady = new Promise((resolve) => { queryStarted = resolve; });
    let holdQuery = false;
    let moveAttempts = 0;
    globalThis.chrome = {
      storage: { local: area({ tabBundlrEnabled: automaticBundling }), session: area(session), onChanged: event() },
      tabs: {
        async query({ windowId } = {}) {
          if (windowId === 2 && holdQuery) {
            holdQuery = false;
            queryStarted();
            await new Promise((resolve) => { releaseQuery = resolve; });
          }
          return windowId === 2 ? [meet, dragged, external] : [];
        },
        async move(id, options) {
          moveAttempts += 1;
          if (rejectMove && (moveAttempts === 1 || scenario.rejectAlways)) throw new Error('Tabs cannot be edited right now (user may be dragging a tab).');
          moved.push({ id, ...options });
        },
        async update() {},
        onCreated: event(), onUpdated: event(), onDetached: detached, onAttached: attached, onRemoved: event(),
      },
      tabGroups: { async query() { return []; }, onCreated: event(), onMoved: event() },
      windows: { async getAll() { return [{ id: 1 }, { id: 2, focused: true }]; }, async update(id) { focused.push(id); }, onRemoved: event() },
      runtime: { onMessage: event(), openOptionsPage() {} },
    };
    try {
      const { TabBundlrBackground: worker } = await import(`../background.js?drag-then-external=${encodeURIComponent(scenario.name)}`);
      detached.fire(dragged.id, { oldWindowId: 1 });
      attached.fire(dragged.id, { newWindowId: 2, newPosition: 1 });
      await new Promise(setImmediate);
      assert.deepEqual(moved, [], 'manually dragged tab stays in Meet');
      if (overlap) {
        holdQuery = true;
        const creating = worker.processCreatedTab({ ...external, pendingUrl: '' });
        await queryReady;
        const updating = worker.processUpdatedTab({ url: external.pendingUrl }, { ...external, url: external.pendingUrl });
        await new Promise(setImmediate);
        releaseQuery();
        await Promise.all([creating, updating]);
      } else {
        await worker.processCreatedTab(external);
      }
      if (scenario.allowAfterFailure) await worker.setWindowFrozen(2, false);
      if (rejectMove) await worker.processUpdatedTab({ status: 'complete' }, { ...external, url: external.pendingUrl });
      if (scenario.rejectAlways) {
        for (let i = 0; i < 5; i += 1) await worker.processUpdatedTab({ status: 'complete' }, { ...external, url: external.pendingUrl });
        assert.equal(moveAttempts, 3, 'retry work is bounded');
        assert.deepEqual(moved, []);
        return;
      }
      if (scenario.allowAfterFailure) {
        assert.equal(moveAttempts, 1);
        assert.deepEqual(moved, []);
        return;
      }
      assert.deepEqual(moved, [{ id: external.id, windowId: 1, index: -1 }], 'external link must leave Meet even after a manual drag');
      assert.deepEqual(focused, [1]);
    } finally {
      delete globalThis.chrome;
    }
  });
}

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
