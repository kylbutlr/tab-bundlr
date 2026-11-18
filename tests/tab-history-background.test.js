import assert from 'node:assert/strict';
import test from 'node:test';

function eventCapture() {
  let listener = null;
  return {
    addListener(nextListener) {
      listener = nextListener;
    },
    listener() {
      return listener;
    },
  };
}

function storageArea(values) {
  return {
    async get(keys) {
      const requested = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(requested
        .filter((key) => Object.prototype.hasOwnProperty.call(values, key))
        .map((key) => [key, values[key]]));
    },
    async set(next) {
      Object.assign(values, next);
    },
    async remove(keys) {
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete values[key]);
    },
  };
}

test('the previous-tab command walks backward through the active window history', async () => {
  const commandEvent = eventCapture();
  const activationEvent = eventCapture();
  const localValues = { previousTabMode: 'history' };
  const sessionValues = {
    sessionReconciled: true,
    persistentHomeBasesReconciled: true,
    pausedWindowIds: [],
    windowAutomationMode: 'all',
    selectedWindowIds: [],
    tabActivationHistory: {
      9: { tabs: [101, 102, 103], cursor: null },
    },
  };
  const tabs = new Map([
    [101, { id: 101, windowId: 9, active: false }],
    [102, { id: 102, windowId: 9, active: false }],
    [103, { id: 103, windowId: 9, active: true }],
  ]);
  let activeTabId = 103;
  const activatedTabIds = [];

  globalThis.chrome = {
    storage: {
      local: storageArea(localValues),
      session: storageArea(sessionValues),
      onChanged: { addListener() {} },
    },
    tabs: {
      async query(queryInfo) {
        if (queryInfo.active) return [{ ...tabs.get(activeTabId), active: true }];
        return [];
      },
      async get(tabId) {
        const tab = tabs.get(Number(tabId));
        if (!tab) throw new Error('Missing tab.');
        return tab;
      },
      async update(tabId, updateProperties) {
        assert.equal(updateProperties.active, true);
        activeTabId = Number(tabId);
        activatedTabIds.push(activeTabId);
        return { ...tabs.get(activeTabId), active: true };
      },
      onActivated: activationEvent,
      onCreated: { addListener() {} },
      onUpdated: { addListener() {} },
      onDetached: { addListener() {} },
      onAttached: { addListener() {} },
      onRemoved: { addListener() {} },
    },
    tabGroups: {
      async query() { return []; },
      onCreated: { addListener() {} },
      onMoved: { addListener() {} },
    },
    windows: {
      async getAll() { return [{ id: 9, type: 'normal' }]; },
      onRemoved: { addListener() {} },
    },
    commands: { onCommand: commandEvent },
    runtime: {
      onMessage: { addListener() {} },
      openOptionsPage() {},
    },
  };

  try {
    const worker = await import('../background.js?previous-tab-history-command');
    assert.equal(typeof commandEvent.listener(), 'function');
    commandEvent.listener()('activate-previous-tab');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(activatedTabIds, [102]);

    await worker.TabBundlrBackground.activatePreviousTab();
    assert.deepEqual(activatedTabIds, [102, 101]);
  } finally {
    delete globalThis.chrome;
  }
});
