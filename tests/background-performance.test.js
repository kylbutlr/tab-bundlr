import assert from 'node:assert/strict';
import test from 'node:test';

function extensionEvent() {
  return { addListener() {} };
}

function capturingEvent() {
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

function storageArea(values, { afterGet } = {}) {
  return {
    async get(keys) {
      const requested = Array.isArray(keys) ? keys : [keys];
      const result = Object.fromEntries(requested
        .filter((key) => Object.prototype.hasOwnProperty.call(values, key))
        .map((key) => [key, values[key]]));
      afterGet?.(requested);
      return result;
    },
    async set(next) {
      Object.assign(values, next);
    },
    async remove(keys) {
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete values[key]);
    },
  };
}

test('treats chrome pages as ignored instead of unassigned in popup status', async () => {
  const windowId = 9;
  const groupId = 19;
  const localValues = {
    groupRecords: {
      '9:smart:me': {
        groupId,
        windowId,
        workspaceType: 'smart',
        smartGroupId: 'me',
        epicId: 'smart:me',
        epicName: '[ Me ]',
      },
    },
    smartGroups: [{
      id: 'me',
      name: '[ Me ]',
      patterns: ['https://example.com/me'],
    }],
  };
  const sessionValues = {
    sessionReconciled: true,
    pausedWindowIds: [],
    windowAutomationMode: 'all',
    selectedWindowIds: [],
  };
  globalThis.chrome = {
    storage: {
      local: storageArea(localValues),
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query(queryInfo) {
        if (Number(queryInfo.windowId) !== windowId) return [];
        return [{
          id: 91,
          windowId,
          groupId,
          index: 0,
          active: true,
          pinned: false,
          title: 'Extensions',
          url: 'chrome://extensions/',
        }];
      },
      onCreated: extensionEvent(),
      onUpdated: extensionEvent(),
      onDetached: extensionEvent(),
      onAttached: extensionEvent(),
      onRemoved: extensionEvent(),
    },
    tabGroups: {
      async query() {
        return [{ id: groupId, windowId, title: '[ Me ]', color: 'grey' }];
      },
      onCreated: extensionEvent(),
      onMoved: extensionEvent(),
    },
    windows: {
      async getCurrent() { return { id: windowId }; },
      async getAll() { return []; },
      onRemoved: extensionEvent(),
    },
    runtime: {
      onMessage: extensionEvent(),
      openOptionsPage() {},
    },
  };

  try {
    const worker = await import('../background.js?popup-chrome-page=ignored');
    const response = await worker.TabBundlrBackground.statusForPopup(windowId);
    assert.deepEqual(response.activeCoverage, { state: 'ignored', type: 'browser' });
    assert.equal(response.activeTab.roleLabel, 'Browser');
    assert.equal(response.groups[0].tabs[0].coverageState, 'ignored');
    assert.equal(response.groups[0].tabs[0].coverageLabel, 'Browser page');
    assert.deepEqual(response.reviewTabs, []);
  } finally {
    delete globalThis.chrome;
  }
});

test('routes a Chrome-owned page to its configured standard Smart Group', async () => {
  const windowId = 12;
  const tab = {
    id: 121,
    windowId,
    groupId: -1,
    index: 0,
    active: true,
    pinned: false,
    title: 'Extensions',
    url: 'chrome://extensions/',
  };
  const groups = [];
  const localValues = {
    browserPageSmartGroupId: 'browser-pages',
    smartGroups: [{
      id: 'browser-pages',
      name: 'Browser pages',
      patterns: ['https://example.com/browser-pages'],
      focusMode: false,
    }],
    trainedRules: [],
    autoOrganizeGroups: false,
  };
  const sessionValues = {
    sessionReconciled: true,
    pausedWindowIds: [],
    windowAutomationMode: 'all',
    selectedWindowIds: [],
  };
  globalThis.chrome = {
    storage: {
      local: storageArea(localValues),
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query(queryInfo) {
        if (!queryInfo || Object.keys(queryInfo).length === 0 || Number(queryInfo.windowId) === windowId) return [{ ...tab }];
        return [];
      },
      async group({ tabIds }) {
        const groupId = 212;
        groups.push({ id: groupId, windowId, title: '', color: 'grey' });
        if (tabIds.includes(tab.id)) tab.groupId = groupId;
        return groupId;
      },
      onCreated: extensionEvent(),
      onUpdated: extensionEvent(),
      onDetached: extensionEvent(),
      onAttached: extensionEvent(),
      onRemoved: extensionEvent(),
    },
    tabGroups: {
      async query({ windowId: queryWindowId } = {}) {
        return groups.filter((group) => queryWindowId === undefined || Number(group.windowId) === Number(queryWindowId));
      },
      async update(groupId, changes) {
        const group = groups.find((candidate) => Number(candidate.id) === Number(groupId));
        Object.assign(group, changes);
        return { ...group };
      },
      onCreated: extensionEvent(),
      onMoved: extensionEvent(),
    },
    windows: {
      async getAll() { return []; },
      onRemoved: extensionEvent(),
    },
    runtime: {
      onMessage: extensionEvent(),
      openOptionsPage() {},
    },
  };

  try {
    const worker = await import('../background.js?browser-page=smart-group');
    const result = await worker.TabBundlrBackground.processBrowserPageTab({ ...tab }, 'test');
    assert.equal(result.moved, true);
    assert.equal(tab.groupId, 212);
    assert.equal(groups[0].title, 'Browser pages');
    assert.equal(localValues.groupRecords[`${windowId}:smart:browser-pages`]?.workspaceType, 'smart');
    assert.equal(localValues.tabContexts[String(tab.id)]?.source, 'browser-page');
  } finally {
    delete globalThis.chrome;
  }
});

test('resolves a generic Workspace Source into a managed group', async () => {
  const windowId = 14;
  const tab = {
    id: 141, windowId, groupId: -1, index: 0, active: true, pinned: false,
    title: 'Example item', url: 'https://tracker.example/items/482',
  };
  const groups = [];
  const localValues = {
    settingsVersion: 2,
    tabBundlrEnabled: true,
    workspaceSources: [{
      schemaVersion: 1,
      id: 'tracker',
      name: 'Example Tracker',
      enabled: true,
      precedence: 'after-rules',
      permissionOrigins: ['https://api.tracker.example/*'],
      credentials: [],
      routes: [{
        id: 'item',
        pagePattern: 'https://tracker.example/items/{itemId}',
        steps: [{
          request: { method: 'GET', url: 'https://api.tracker.example/items/{itemId}' },
          extract: { workspaceId: 'workspace.id', workspaceName: 'workspace.name' },
        }],
        placement: { workspaceId: '{workspaceId}', workspaceName: '{workspaceName}', itemId: '{itemId}' },
      }],
    }],
    workspaceSourceSecrets: {},
    trainedRules: [],
    smartGroups: [],
    autoOrganizeGroups: false,
  };
  const sessionValues = {
    sessionReconciled: true,
    persistentHomeBasesReconciled: true,
    pausedWindowIds: [],
    windowAutomationMode: 'all',
    selectedWindowIds: [],
  };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.tracker.example/items/482');
    assert.equal(options.method, 'GET');
    return { ok: true, status: 200, async json() { return { workspace: { id: 'north', name: 'North launch' } }; } };
  };
  globalThis.chrome = {
    storage: {
      local: storageArea(localValues),
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query() { return [{ ...tab }]; },
      async group({ tabIds }) {
        const groupId = 214;
        groups.push({ id: groupId, windowId, title: '', color: 'grey' });
        if (tabIds.includes(tab.id)) tab.groupId = groupId;
        return groupId;
      },
      onCreated: extensionEvent(), onUpdated: extensionEvent(), onDetached: extensionEvent(),
      onAttached: extensionEvent(), onRemoved: extensionEvent(),
    },
    tabGroups: {
      async query() { return groups.map((group) => ({ ...group })); },
      async update(groupId, changes) {
        const group = groups.find((candidate) => Number(candidate.id) === Number(groupId));
        Object.assign(group, changes);
        return { ...group };
      },
      onCreated: extensionEvent(), onMoved: extensionEvent(),
    },
    windows: { async getAll() { return []; }, onRemoved: extensionEvent() },
    runtime: { onMessage: extensionEvent(), openOptionsPage() {} },
  };

  try {
    const worker = await import('../background.js?workspace-source=generic');
    const result = await worker.TabBundlrBackground.processWorkspaceSourceTab({ ...tab }, 'test');
    assert.equal(result.moved, true);
    assert.equal(groups[0].title, 'North launch');
    assert.equal(localValues.groupRecords[`${windowId}:north`]?.epicName, 'North launch');
    assert.match(localValues.tabContexts[String(tab.id)]?.source, /^workspace-source:tracker:item$/);
  } finally {
    globalThis.fetch = previousFetch;
    delete globalThis.chrome;
  }
});

test('restores an anchored home base after navigation and keeps one exact URL', async () => {
  const windowId = 9;
  const homeBaseUrl = 'https://work.example.com/dashboard?team=platform';
  const tabs = [{
    id: 91,
    windowId,
    groupId: -1,
    index: 3,
    active: true,
    pinned: false,
    title: 'Another workspace page',
    url: 'https://work.example.com/items/420005',
  }];
  const localValues = { persistentHomeBases: [homeBaseUrl] };
  const sessionValues = {
    sessionReconciled: true,
    persistentHomeBasesReconciled: true,
    persistentHomeBaseAnchors: { '91': homeBaseUrl },
  };
  let nextTabId = 92;
  const removedTabIds = [];
  globalThis.chrome = {
    storage: {
      local: storageArea(localValues),
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query(queryInfo = {}) {
        return tabs
          .filter((tab) => queryInfo.windowId === undefined || Number(tab.windowId) === Number(queryInfo.windowId))
          .map((tab) => ({ ...tab }));
      },
      async create(properties) {
        const created = {
          id: nextTabId++,
          windowId: Number(properties.windowId),
          groupId: -1,
          index: Number(properties.index),
          active: properties.active === true,
          pinned: false,
          title: 'Status',
          url: properties.url,
        };
        tabs.push(created);
        return { ...created };
      },
      async remove(tabIds) {
        const ids = new Set((Array.isArray(tabIds) ? tabIds : [tabIds]).map(Number));
        removedTabIds.push(...ids);
        for (let index = tabs.length - 1; index >= 0; index -= 1) {
          if (ids.has(Number(tabs[index].id))) tabs.splice(index, 1);
        }
      },
      onCreated: extensionEvent(),
      onUpdated: extensionEvent(),
      onDetached: extensionEvent(),
      onAttached: extensionEvent(),
      onRemoved: extensionEvent(),
    },
    tabGroups: {
      async query() { return []; },
      onCreated: extensionEvent(),
      onMoved: extensionEvent(),
    },
    windows: {
      async getCurrent() { return { id: windowId }; },
      async getAll() { return []; },
      onRemoved: extensionEvent(),
    },
    runtime: {
      onMessage: extensionEvent(),
      openOptionsPage() {},
    },
  };

  try {
    const worker = await import('../background.js?persistent-home-base=navigation');
    const restored = await worker.TabBundlrBackground.handlePersistentHomeBaseTabUpdate(
      { url: tabs[0].url },
      { ...tabs[0] },
    );
    assert.equal(restored?.status, 'restored');
    assert.equal(tabs.filter((tab) => tab.url === homeBaseUrl).length, 1);
    assert.equal(sessionValues.persistentHomeBaseAnchors['92'], homeBaseUrl);
    assert.equal(sessionValues.persistentHomeBaseAnchors['91'], undefined);

    tabs.push({
      id: 93,
      windowId,
      groupId: -1,
      index: 4,
      active: true,
      pinned: false,
      title: 'Status duplicate',
      url: homeBaseUrl,
    });
    const deduplicated = await worker.TabBundlrBackground.handlePersistentHomeBaseTabUpdate(
      { url: homeBaseUrl },
      { ...tabs.find((tab) => tab.id === 93) },
    );
    assert.equal(deduplicated?.status, 'deduplicated');
    assert.deepEqual(removedTabIds, [92]);
    assert.equal(tabs.filter((tab) => tab.url === homeBaseUrl).length, 1);
    assert.equal(sessionValues.persistentHomeBaseAnchors['93'], homeBaseUrl);
  } finally {
    delete globalThis.chrome;
  }
});

test('fresh defaults report home-base duplicates without closing them', async () => {
  const windowId = 19;
  const homeBaseUrl = 'https://work.example.com/dashboard';
  const tabs = [
    { id: 191, windowId, groupId: -1, index: 0, active: false, pinned: false, title: 'Dashboard', url: homeBaseUrl },
    { id: 192, windowId, groupId: -1, index: 1, active: true, pinned: false, title: 'Dashboard duplicate', url: homeBaseUrl },
  ];
  const localValues = {
    settingsVersion: 2,
    tabBundlrEnabled: false,
    workspaceSources: [],
    workspaceSourceSecrets: {},
    homeBaseDuplicateAction: 'review',
    openerInheritance: true,
    persistentHomeBases: [homeBaseUrl],
  };
  const sessionValues = {
    sessionReconciled: true,
    persistentHomeBasesReconciled: true,
    persistentHomeBaseAnchors: {},
  };
  const removedTabIds = [];
  globalThis.chrome = {
    storage: {
      local: storageArea(localValues),
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query() { return tabs.map((tab) => ({ ...tab })); },
      async remove(tabIds) { removedTabIds.push(...(Array.isArray(tabIds) ? tabIds : [tabIds])); },
      onCreated: extensionEvent(), onUpdated: extensionEvent(), onDetached: extensionEvent(),
      onAttached: extensionEvent(), onRemoved: extensionEvent(),
    },
    tabGroups: { async query() { return []; }, onCreated: extensionEvent(), onMoved: extensionEvent() },
    windows: {
      async getCurrent() { return { id: windowId }; },
      async getAll() { return []; },
      onRemoved: extensionEvent(),
    },
    runtime: { onMessage: extensionEvent(), openOptionsPage() {} },
  };

  try {
    const worker = await import('../background.js?persistent-home-base=review-duplicates');
    const result = await worker.TabBundlrBackground.handlePersistentHomeBaseTabUpdate(
      { url: homeBaseUrl },
      { ...tabs[1] },
    );
    assert.equal(result.status, 'duplicates-found');
    assert.equal(result.duplicateCount, 1);
    assert.equal(result.removedCount, 0);
    assert.deepEqual(removedTabIds, []);
    assert.equal(sessionValues.persistentHomeBaseAnchors['192'], homeBaseUrl);
  } finally {
    delete globalThis.chrome;
  }
});

test('updates an anchored home base when same-page filters change', async () => {
  const windowId = 9;
  const homeBaseUrl = 'https://work.example.com/dashboard';
  const filteredUrl = 'https://work.example.com/dashboard?team=platform&collection=sprint-34';
  const tabs = [{
    id: 91,
    windowId,
    groupId: -1,
    index: 3,
    active: true,
    pinned: false,
    title: 'Status',
    url: filteredUrl,
  }];
  const localValues = { persistentHomeBases: [homeBaseUrl] };
  const sessionValues = {
    sessionReconciled: true,
    persistentHomeBasesReconciled: true,
    persistentHomeBaseAnchors: { '91': homeBaseUrl },
  };
  const createdUrls = [];
  globalThis.chrome = {
    storage: {
      local: storageArea(localValues),
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query() { return tabs.map((tab) => ({ ...tab })); },
      async create(properties) {
        createdUrls.push(properties.url);
        return { id: 92, windowId, groupId: -1, index: 4, active: false, pinned: false, ...properties };
      },
      async remove() {},
      onCreated: extensionEvent(),
      onUpdated: extensionEvent(),
      onDetached: extensionEvent(),
      onAttached: extensionEvent(),
      onRemoved: extensionEvent(),
    },
    tabGroups: {
      async query() { return []; },
      onCreated: extensionEvent(),
      onMoved: extensionEvent(),
    },
    windows: {
      async getCurrent() { return { id: windowId }; },
      async getAll() { return []; },
      onRemoved: extensionEvent(),
    },
    runtime: {
      onMessage: extensionEvent(),
      openOptionsPage() {},
    },
  };

  try {
    const worker = await import('../background.js?persistent-home-base=same-page-filter');
    const result = await worker.TabBundlrBackground.handlePersistentHomeBaseTabUpdate(
      { url: filteredUrl },
      { ...tabs[0] },
    );
    assert.equal(result?.status, 'updated');
    assert.deepEqual(localValues.persistentHomeBases, [filteredUrl]);
    assert.equal(sessionValues.persistentHomeBaseAnchors['91'], filteredUrl);
    assert.deepEqual(createdUrls, []);
  } finally {
    delete globalThis.chrome;
  }
});

test('restores a saved home base when its tab is missing at session startup', async () => {
  const windowId = 9;
  const homeBaseUrl = 'https://work.example.com/dashboard?team=platform';
  const tabs = [];
  const localValues = { persistentHomeBases: [homeBaseUrl] };
  const sessionValues = { sessionReconciled: true };
  let nextTabId = 101;
  globalThis.chrome = {
    storage: {
      local: storageArea(localValues),
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query() { return tabs.map((tab) => ({ ...tab })); },
      async create(properties) {
        const created = {
          id: nextTabId++,
          windowId,
          groupId: -1,
          index: 0,
          active: properties.active === true,
          pinned: false,
          title: 'Status',
          url: properties.url,
        };
        tabs.push(created);
        return { ...created };
      },
      async remove() {},
      onCreated: extensionEvent(),
      onUpdated: extensionEvent(),
      onDetached: extensionEvent(),
      onAttached: extensionEvent(),
      onRemoved: extensionEvent(),
    },
    tabGroups: {
      async query() { return []; },
      onCreated: extensionEvent(),
      onMoved: extensionEvent(),
    },
    windows: {
      async getAll() { return []; },
      onRemoved: extensionEvent(),
    },
    runtime: {
      onMessage: extensionEvent(),
      openOptionsPage() {},
    },
  };

  try {
    const worker = await import('../background.js?persistent-home-base=session-restore');
    await worker.TabBundlrBackground.initializeForSession();
    assert.equal(tabs.length, 1);
    assert.equal(tabs[0].url, homeBaseUrl);
    assert.equal(tabs[0].active, false);
    assert.equal(sessionValues.persistentHomeBaseAnchors['101'], homeBaseUrl);
    assert.deepEqual(localValues.persistentHomeBases, [homeBaseUrl]);
  } finally {
    delete globalThis.chrome;
  }
});

test('adopts a filtered version of a saved home base instead of recreating the base URL', async () => {
  const windowId = 9;
  const homeBaseUrl = 'https://work.example.com/dashboard';
  const filteredUrl = 'https://work.example.com/dashboard?team=platform&collection=sprint-34';
  const tabs = [{
    id: 91,
    windowId,
    groupId: -1,
    index: 3,
    active: true,
    pinned: false,
    title: 'Status',
    url: filteredUrl,
  }];
  const localValues = { persistentHomeBases: [homeBaseUrl] };
  const sessionValues = { sessionReconciled: true };
  const createdUrls = [];
  globalThis.chrome = {
    storage: {
      local: storageArea(localValues),
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query() { return tabs.map((tab) => ({ ...tab })); },
      async create(properties) {
        createdUrls.push(properties.url);
        const created = {
          id: 92,
          windowId,
          groupId: -1,
          index: 4,
          active: properties.active === true,
          pinned: false,
          title: 'Status',
          url: properties.url,
        };
        tabs.push(created);
        return { ...created };
      },
      async remove() {},
      onCreated: extensionEvent(),
      onUpdated: extensionEvent(),
      onDetached: extensionEvent(),
      onAttached: extensionEvent(),
      onRemoved: extensionEvent(),
    },
    tabGroups: {
      async query() { return []; },
      onCreated: extensionEvent(),
      onMoved: extensionEvent(),
    },
    windows: {
      async getAll() { return []; },
      onRemoved: extensionEvent(),
    },
    runtime: {
      onMessage: extensionEvent(),
      openOptionsPage() {},
    },
  };

  try {
    const worker = await import('../background.js?persistent-home-base=filtered-session-restore');
    await worker.TabBundlrBackground.initializeForSession();
    assert.deepEqual(createdUrls, []);
    assert.deepEqual(localValues.persistentHomeBases, [filteredUrl]);
    assert.equal(sessionValues.persistentHomeBaseAnchors['91'], filteredUrl);
  } finally {
    delete globalThis.chrome;
  }
});

test('restores a saved home base after its anchored tab closes', async () => {
  const windowId = 9;
  const homeBaseUrl = 'https://work.example.com/dashboard?team=platform';
  const tabs = [];
  const removedEvent = capturingEvent();
  const localValues = { persistentHomeBases: [homeBaseUrl] };
  const sessionValues = {
    sessionReconciled: true,
    persistentHomeBasesReconciled: true,
    persistentHomeBaseAnchors: { '91': homeBaseUrl },
  };
  globalThis.chrome = {
    storage: {
      local: storageArea(localValues),
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query() { return tabs.map((tab) => ({ ...tab })); },
      async create(properties) {
        const created = {
          id: 92,
          windowId,
          groupId: -1,
          index: 0,
          active: properties.active === true,
          pinned: false,
          title: 'Status',
          url: properties.url,
        };
        tabs.push(created);
        return { ...created };
      },
      async remove() {},
      onCreated: extensionEvent(),
      onUpdated: extensionEvent(),
      onDetached: extensionEvent(),
      onAttached: extensionEvent(),
      onRemoved: removedEvent,
    },
    tabGroups: {
      async query() { return []; },
      onCreated: extensionEvent(),
      onMoved: extensionEvent(),
    },
    windows: {
      async getAll() { return []; },
      onRemoved: extensionEvent(),
    },
    runtime: {
      onMessage: extensionEvent(),
      openOptionsPage() {},
    },
  };

  try {
    await import('../background.js?persistent-home-base=tab-close');
    await removedEvent.listener()(91, { windowId, isWindowClosing: false });
    assert.equal(tabs.length, 1);
    assert.equal(tabs[0].url, homeBaseUrl);
    assert.equal(tabs[0].active, false);
    assert.equal(sessionValues.persistentHomeBaseAnchors['92'], homeBaseUrl);

    tabs.splice(0, 1);
    await removedEvent.listener()(92, { windowId, isWindowClosing: true });
    assert.equal(tabs.length, 0);
    assert.equal(sessionValues.persistentHomeBaseAnchors['92'], undefined);
  } finally {
    delete globalThis.chrome;
  }
});

test('runs the full tab reconciliation only once across service worker restarts in one session', async () => {
  const localValues = {};
  const sessionValues = {};
  let allTabQueries = 0;
  globalThis.chrome = {
    storage: {
      local: storageArea(localValues),
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query(queryInfo) {
        if (Object.keys(queryInfo).length === 0) allTabQueries += 1;
        return [];
      },
      onCreated: extensionEvent(),
      onUpdated: extensionEvent(),
      onDetached: extensionEvent(),
      onAttached: extensionEvent(),
      onRemoved: extensionEvent(),
    },
    tabGroups: {
      async query() { return []; },
      onCreated: extensionEvent(),
      onMoved: extensionEvent(),
    },
    windows: {
      async getAll() { return []; },
      onRemoved: extensionEvent(),
    },
    runtime: {
      onMessage: extensionEvent(),
      openOptionsPage() {},
    },
  };

  try {
    const firstWorker = await import('../background.js?performance-worker=first');
    await firstWorker.TabBundlrBackground.initializeForSession();
    const firstWorkerQueries = allTabQueries;
    assert.equal(sessionValues.sessionReconciled, true);
    assert.equal(firstWorkerQueries, 2);

    const restartedWorker = await import('../background.js?performance-worker=second');
    await restartedWorker.TabBundlrBackground.initializeForSession();
    assert.equal(allTabQueries, firstWorkerQueries);
  } finally {
    delete globalThis.chrome;
  }
});

test('organizes from live tab positions when the strip changes during setup', async () => {
  const windowId = 7;
  const groups = [
    { id: 1, windowId, title: '[ Studio ]', color: 'grey' },
    { id: 2, windowId, title: 'Project Atlas', color: 'red' },
    { id: 3, windowId, title: '[ Me ]', color: 'grey' },
    { id: 4, windowId, title: 'Preview inspection', color: 'orange' },
  ];
  const desiredTabs = [3, 1, 2, 4].map((groupId, index) => ({ id: 100 + index, windowId, groupId, index, pinned: false }));
  const displacedTabs = [1, 2, 3, 4].map((groupId, index) => ({ id: 200 + index, windowId, groupId, index, pinned: false }));
  let liveTabs = desiredTabs;
  let displaced = false;
  const localValues = {
    groupRecords: {
      me: { groupId: 3, windowId, workspaceType: 'smart', smartGroupId: 'me', epicName: '[ Me ]' },
      studio: { groupId: 1, windowId, workspaceType: 'smart', smartGroupId: 'studio', epicName: '[ Studio ]' },
      atlas: { groupId: 2, windowId, workspaceType: 'epic', epicId: '420001', epicName: 'Project Atlas' },
      focus: { groupId: 4, windowId, workspaceType: 'smart', smartGroupId: 'focus', epicName: 'Preview inspection' },
    },
    smartGroups: [
      { id: 'me', name: '[ Me ]', patterns: [] },
      { id: 'studio', name: '[ Studio ]', patterns: [] },
      { id: 'focus', name: 'Preview inspection', patterns: [], focusMode: true },
    ],
    smartGroupOrder: ['me', 'studio', 'focus'],
    managedGroupTypeOrder: ['smart', 'iteration', 'client', 'focus-smart'],
    managedGroupColors: { smart: 'grey', client: 'red', 'focus-smart': 'orange' },
    autoOrganizeGroups: false,
  };
  const sessionValues = { sessionReconciled: true };
  globalThis.chrome = {
    storage: {
      local: storageArea(localValues, {
        afterGet(keys) {
          if (!displaced && keys.includes('groupRecords')) {
            liveTabs = displacedTabs;
            displaced = true;
          }
        },
      }),
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query(queryInfo) {
        if (Number(queryInfo.windowId) === windowId) return liveTabs.map((tab) => ({ ...tab }));
        return [];
      },
      onCreated: extensionEvent(),
      onUpdated: extensionEvent(),
      onDetached: extensionEvent(),
      onAttached: extensionEvent(),
      onRemoved: extensionEvent(),
    },
    tabGroups: {
      async query() { return groups; },
      async update() {},
      async move(groupId, { index }) {
        const moving = liveTabs.filter((tab) => Number(tab.groupId) === Number(groupId));
        const remaining = liveTabs.filter((tab) => Number(tab.groupId) !== Number(groupId));
        const target = Math.max(0, Math.min(Number(index), remaining.length));
        liveTabs = [...remaining.slice(0, target), ...moving, ...remaining.slice(target)]
          .map((tab, tabIndex) => ({ ...tab, index: tabIndex }));
      },
      onCreated: extensionEvent(),
      onMoved: extensionEvent(),
    },
    windows: {
      async getAll() { return []; },
      onRemoved: extensionEvent(),
    },
    runtime: {
      onMessage: extensionEvent(),
      openOptionsPage() {},
    },
  };

  try {
    const worker = await import('../background.js?ordering-race=stale-snapshot');
    await worker.TabBundlrBackground.organizeWindow(windowId);
    assert.deepEqual(liveTabs.map((tab) => tab.groupId), [3, 1, 2, 4]);
  } finally {
    delete globalThis.chrome;
  }
});

test('preserves every managed group record when different workspaces are grouped concurrently', async () => {
  const windowId = 18;
  const tabs = [
    {
      id: 181,
      windowId,
      groupId: -1,
      index: 0,
      active: false,
      pinned: false,
      title: 'Alpha dashboard',
      url: 'https://alpha.example.com/dashboard',
    },
    {
      id: 182,
      windowId,
      groupId: -1,
      index: 1,
      active: true,
      pinned: false,
      title: 'Beta dashboard',
      url: 'https://beta.example.com/dashboard',
    },
  ];
  const groups = [];
  const localValues = {
    settingsVersion: 2,
    tabBundlrEnabled: true,
    groupRecords: {},
    smartGroups: [
      { id: 'alpha', name: 'Alpha', patterns: ['https://alpha.example.com/'] },
      { id: 'beta', name: 'Beta', patterns: ['https://beta.example.com/'] },
    ],
    trainedRules: [],
    autoOrganizeGroups: false,
  };
  const sessionValues = {
    sessionReconciled: true,
    persistentHomeBasesReconciled: true,
    pausedWindowIds: [],
    windowAutomationMode: 'all',
    selectedWindowIds: [],
  };
  let pendingRecordWrites = 0;
  let releaseRecordWrites;
  const recordWritesReady = new Promise((resolve) => { releaseRecordWrites = resolve; });
  const cloningLocalStorage = {
    async get(keys) {
      const requested = Array.isArray(keys) ? keys : [keys];
      return structuredClone(Object.fromEntries(requested
        .filter((key) => Object.prototype.hasOwnProperty.call(localValues, key))
        .map((key) => [key, localValues[key]])));
    },
    async set(next) {
      if (Object.prototype.hasOwnProperty.call(next, 'groupRecords')) {
        pendingRecordWrites += 1;
        if (pendingRecordWrites === 2) releaseRecordWrites();
        await Promise.race([
          recordWritesReady,
          new Promise((resolve) => setTimeout(resolve, 20)),
        ]);
      }
      Object.assign(localValues, structuredClone(next));
    },
    async remove(keys) {
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete localValues[key]);
    },
  };
  globalThis.chrome = {
    storage: {
      local: cloningLocalStorage,
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query(queryInfo = {}) {
        return tabs
          .filter((tab) => queryInfo.windowId === undefined || Number(tab.windowId) === Number(queryInfo.windowId))
          .map((tab) => ({ ...tab }));
      },
      async group({ tabIds, groupId }) {
        let destinationGroupId = Number(groupId);
        if (!Number.isInteger(destinationGroupId)) {
          destinationGroupId = 500 + groups.length;
          groups.push({ id: destinationGroupId, windowId, title: '', color: 'grey' });
        }
        tabs.filter((tab) => tabIds.includes(tab.id)).forEach((tab) => { tab.groupId = destinationGroupId; });
        return destinationGroupId;
      },
      onCreated: extensionEvent(),
      onUpdated: extensionEvent(),
      onDetached: extensionEvent(),
      onAttached: extensionEvent(),
      onRemoved: extensionEvent(),
    },
    tabGroups: {
      async query({ windowId: queryWindowId } = {}) {
        return groups
          .filter((group) => queryWindowId === undefined || Number(group.windowId) === Number(queryWindowId))
          .map((group) => ({ ...group }));
      },
      async update(groupId, changes) {
        const group = groups.find((candidate) => Number(candidate.id) === Number(groupId));
        Object.assign(group, changes);
        return { ...group };
      },
      onCreated: extensionEvent(),
      onMoved: extensionEvent(),
    },
    windows: {
      async getAll() { return [{ id: windowId }]; },
      onRemoved: extensionEvent(),
    },
    runtime: {
      onMessage: extensionEvent(),
      openOptionsPage() {},
    },
  };

  try {
    const worker = await import('../background.js?group-records=concurrent-workspaces');
    await worker.TabBundlrBackground.syncExistingStoryTabs();

    assert.deepEqual(
      Object.keys(localValues.groupRecords).sort(),
      [`${windowId}:smart:alpha`, `${windowId}:smart:beta`],
    );
    assert.deepEqual(Object.keys(localValues.tabContexts).sort(), ['181', '182']);
    assert.equal(pendingRecordWrites, 1);
  } finally {
    delete globalThis.chrome;
  }
});

test('restores a missing managed group record from its saved tab context', async () => {
  const windowId = 19;
  const groupId = 519;
  const tab = {
    id: 191,
    windowId,
    groupId,
    index: 0,
    active: true,
    pinned: false,
    title: 'Alpha dashboard',
    url: 'https://alpha.example.com/dashboard',
  };
  const localValues = {
    settingsVersion: 2,
    tabBundlrEnabled: true,
    groupRecords: {},
    tabContexts: {
      '191': {
        epicId: 'smart:alpha',
        epicName: 'Alpha',
        groupId,
        windowId,
        source: 'smart',
        workspaceType: 'smart',
        smartGroupId: 'alpha',
        focusGroupId: null,
      },
    },
    smartGroups: [{ id: 'alpha', name: 'Alpha', patterns: ['https://alpha.example.com/'] }],
    trainedRules: [],
    autoOrganizeGroups: false,
  };
  const sessionValues = {
    sessionReconciled: true,
    persistentHomeBasesReconciled: true,
    pausedWindowIds: [],
    windowAutomationMode: 'all',
    selectedWindowIds: [],
  };
  globalThis.chrome = {
    storage: {
      local: storageArea(localValues),
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query(queryInfo = {}) {
        if (queryInfo.windowId === undefined || Number(queryInfo.windowId) === windowId) return [{ ...tab }];
        return [];
      },
      async group() { throw new Error('Recovery should reuse the existing group.'); },
      onCreated: extensionEvent(),
      onUpdated: extensionEvent(),
      onDetached: extensionEvent(),
      onAttached: extensionEvent(),
      onRemoved: extensionEvent(),
    },
    tabGroups: {
      async query({ windowId: queryWindowId } = {}) {
        return queryWindowId === undefined || Number(queryWindowId) === windowId
          ? [{ id: groupId, windowId, title: 'Alpha', color: 'grey' }]
          : [];
      },
      async update(_groupId, changes) {
        return { id: groupId, windowId, title: 'Alpha', color: 'grey', ...changes };
      },
      onCreated: extensionEvent(),
      onMoved: extensionEvent(),
    },
    windows: {
      async getAll() { return [{ id: windowId }]; },
      onRemoved: extensionEvent(),
    },
    runtime: {
      onMessage: extensionEvent(),
      openOptionsPage() {},
    },
  };

  try {
    const worker = await import('../background.js?group-records=restore-from-context');
    await worker.TabBundlrBackground.syncExistingStoryTabs();

    assert.equal(localValues.groupRecords[`${windowId}:smart:alpha`]?.groupId, groupId);
    assert.equal(localValues.groupRecords[`${windowId}:smart:alpha`]?.title, 'Alpha');
  } finally {
    delete globalThis.chrome;
  }
});

test('adopts an exact-name restored group when its recognized tabs outlive saved Chrome group IDs', async () => {
  const windowId = 31;
  const restoredGroupId = 401;
  const tabs = [
    {
      id: 501,
      windowId,
      groupId: restoredGroupId,
      index: 0,
      pinned: false,
      title: 'Tab Bundlr',
      url: 'https://github.com/sample-user/tab-bundlr',
    },
    {
      id: 502,
      windowId,
      groupId: restoredGroupId,
      index: 1,
      pinned: false,
      title: 'App Launchr',
      url: 'https://github.com/sample-user/app-launchr',
    },
  ];
  const groups = [{ id: restoredGroupId, windowId, title: '[ Me ]', color: 'grey' }];
  const createdGroups = [];
  const localValues = {
    groupRecords: {
      '4:smart:me': {
        groupId: 17,
        windowId: 4,
        workspaceType: 'smart',
        smartGroupId: 'me',
        epicId: 'smart:me',
        epicName: '[ Me ]',
        title: '[ Me ]',
      },
    },
    smartGroups: [{
      id: 'me',
      name: '[ Me ]',
      patterns: ['https://github.com/sample-user'],
    }],
    trainedRules: [],
    autoOrganizeGroups: false,
  };
  const sessionValues = { sessionReconciled: true };
  globalThis.chrome = {
    storage: {
      local: storageArea(localValues),
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query(queryInfo) {
        if (Object.keys(queryInfo).length === 0 || Number(queryInfo.windowId) === windowId) {
          return tabs.map((tab) => ({ ...tab }));
        }
        return [];
      },
      async group({ tabIds, groupId }) {
        if (groupId !== undefined) {
          tabs.filter((tab) => tabIds.includes(tab.id)).forEach((tab) => { tab.groupId = Number(groupId); });
          return Number(groupId);
        }
        const createdGroupId = 900 + createdGroups.length;
        createdGroups.push(createdGroupId);
        groups.push({ id: createdGroupId, windowId, title: '', color: 'grey' });
        tabs.filter((tab) => tabIds.includes(tab.id)).forEach((tab) => { tab.groupId = createdGroupId; });
        return createdGroupId;
      },
      onCreated: extensionEvent(),
      onUpdated: extensionEvent(),
      onDetached: extensionEvent(),
      onAttached: extensionEvent(),
      onRemoved: extensionEvent(),
    },
    tabGroups: {
      async query({ windowId: queryWindowId } = {}) {
        return groups.filter((group) => queryWindowId === undefined || Number(group.windowId) === Number(queryWindowId));
      },
      async update(groupId, changes) {
        const group = groups.find((candidate) => Number(candidate.id) === Number(groupId));
        Object.assign(group, changes);
        return { ...group };
      },
      onCreated: extensionEvent(),
      onMoved: extensionEvent(),
    },
    windows: {
      async getAll() { return []; },
      onRemoved: extensionEvent(),
    },
    runtime: {
      onMessage: extensionEvent(),
      openOptionsPage() {},
    },
  };

  try {
    const worker = await import('../background.js?restored-group=exact-name');
    await worker.TabBundlrBackground.syncExistingStoryTabs();

    assert.deepEqual(createdGroups, []);
    assert.deepEqual(tabs.map((tab) => tab.groupId), [restoredGroupId, restoredGroupId]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].title, '[ Me ]');
    assert.equal(localValues.groupRecords[`${windowId}:smart:me`]?.groupId, restoredGroupId);
  } finally {
    delete globalThis.chrome;
  }
});

test('saves a workspace rule against the popup window when another Chrome window is current', async () => {
  const popupWindowId = 42;
  const otherWindowId = 99;
  const clientGroupId = 7;
  const activeTab = {
    id: 501,
    windowId: popupWindowId,
    groupId: clientGroupId,
    index: 0,
    active: true,
    pinned: false,
    title: 'Project Cedar Admin',
    url: 'https://admin.shopify.com/store/project-cedar',
  };
  const localValues = {
    groupRecords: {
      [`${popupWindowId}:420006`]: {
        groupId: clientGroupId,
        windowId: popupWindowId,
        workspaceType: 'epic',
        epicId: '420006',
        epicName: 'Project Cedar',
        title: 'Project Cedar',
      },
    },
    smartGroups: [],
    trainedRules: [],
    autoOrganizeGroups: false,
  };
  const sessionValues = { sessionReconciled: true };
  const runtimeMessages = capturingEvent();
  globalThis.chrome = {
    storage: {
      local: storageArea(localValues),
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query(queryInfo) {
        return Number(queryInfo.windowId) === popupWindowId ? [{ ...activeTab }] : [];
      },
      async group() { return clientGroupId; },
      onCreated: extensionEvent(),
      onUpdated: extensionEvent(),
      onDetached: extensionEvent(),
      onAttached: extensionEvent(),
      onRemoved: extensionEvent(),
    },
    tabGroups: {
      async query({ windowId } = {}) {
        return Number(windowId) === popupWindowId
          ? [{ id: clientGroupId, windowId: popupWindowId, title: 'Project Cedar', color: 'grey' }]
          : [];
      },
      async update(groupId, changes) {
        return { id: Number(groupId), windowId: popupWindowId, title: 'Project Cedar', color: 'grey', ...changes };
      },
      onCreated: extensionEvent(),
      onMoved: extensionEvent(),
    },
    windows: {
      async getCurrent() { return { id: otherWindowId }; },
      async getAll() { return []; },
      onRemoved: extensionEvent(),
    },
    runtime: {
      onMessage: runtimeMessages,
      openOptionsPage() {},
    },
  };

  try {
    await import('../background.js?client-rule=popup-window');
    const response = await new Promise((resolve) => {
      runtimeMessages.listener()({
        type: 'ADD_CLIENT_RULE',
        windowId: popupWindowId,
        groupId: String(clientGroupId),
        pattern: 'https://admin.shopify.com/store/project-',
        epicName: 'Project Cedar',
        epicId: '420006',
      }, {}, resolve);
    });

    assert.equal(response.ok, true);
    assert.equal(localValues.trainedRules[0]?.epicName, 'Project Cedar');
  } finally {
    delete globalThis.chrome;
  }
});

test('saves a workspace rule for a collection page when automatic collection groups are disabled', async () => {
  const windowId = 42;
  const clientGroupId = 7;
  const activeTab = {
    id: 502,
    windowId,
    groupId: -1,
    index: 0,
    active: true,
    pinned: false,
    title: 'Sprint 34 collection',
    url: 'https://work.example.com/collections/sprint-34',
  };
  const localValues = {
    groupRecords: {
      [`${windowId}:420006`]: {
        groupId: clientGroupId,
        windowId,
        workspaceType: 'epic',
        epicId: '420006',
        epicName: 'Project Cedar',
        title: 'Project Cedar',
      },
    },
    smartGroups: [],
    trainedRules: [],
    managedGroupTypeEnabled: {
      smart: true,
      iteration: false,
      client: true,
      'focus-smart': true,
    },
    autoOrganizeGroups: false,
  };
  const sessionValues = { sessionReconciled: true };
  const runtimeMessages = capturingEvent();
  globalThis.chrome = {
    storage: {
      local: storageArea(localValues),
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query(queryInfo) {
        return Number(queryInfo.windowId) === windowId ? [{ ...activeTab }] : [];
      },
      async group() { return clientGroupId; },
      onCreated: extensionEvent(),
      onUpdated: extensionEvent(),
      onDetached: extensionEvent(),
      onAttached: extensionEvent(),
      onRemoved: extensionEvent(),
    },
    tabGroups: {
      async query({ windowId: requestedWindowId } = {}) {
        return Number(requestedWindowId) === windowId
          ? [{ id: clientGroupId, windowId, title: 'Project Cedar', color: 'grey' }]
          : [];
      },
      async update(groupId, changes) {
        return { id: Number(groupId), windowId, title: 'Project Cedar', color: 'grey', ...changes };
      },
      onCreated: extensionEvent(),
      onMoved: extensionEvent(),
    },
    windows: {
      async getCurrent() { return { id: windowId }; },
      async getAll() { return []; },
      onRemoved: extensionEvent(),
    },
    runtime: {
      onMessage: runtimeMessages,
      openOptionsPage() {},
    },
  };

  try {
    await import('../background.js?client-rule=disabled-iteration');
    const response = await new Promise((resolve) => {
      runtimeMessages.listener()({
        type: 'ADD_CLIENT_RULE',
        windowId,
        groupId: String(clientGroupId),
        pattern: 'https://work.example.com/collections/sprint-34',
        epicName: 'Project Cedar',
        epicId: '420006',
      }, {}, resolve);
    });

    assert.equal(response.ok, true);
    assert.equal(localValues.trainedRules[0]?.pattern, 'https://work.example.com/collections/sprint-34');
    assert.equal(localValues.trainedRules[0]?.epicName, 'Project Cedar');
  } finally {
    delete globalThis.chrome;
  }
});

test('skips automatic tab processing outside the selected Chrome windows', async () => {
  const localValues = {};
  const sessionValues = {
    sessionReconciled: true,
    windowAutomationMode: 'selected',
    selectedWindowIds: [10],
  };
  globalThis.chrome = {
    storage: {
      local: storageArea(localValues),
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query() { return []; },
      onCreated: extensionEvent(),
      onUpdated: extensionEvent(),
      onDetached: extensionEvent(),
      onAttached: extensionEvent(),
      onRemoved: extensionEvent(),
    },
    tabGroups: {
      async query() { return []; },
      onCreated: extensionEvent(),
      onMoved: extensionEvent(),
    },
    windows: {
      async getAll() { return []; },
      onRemoved: extensionEvent(),
    },
    runtime: {
      onMessage: extensionEvent(),
      openOptionsPage() {},
    },
  };

  try {
    const worker = await import('../background.js?window-policy=selected');
    const result = await worker.TabBundlrBackground.processUpdatedTab(
      { status: 'complete' },
      {
        id: 901,
        windowId: 20,
        groupId: -1,
        pinned: false,
        url: 'https://work.example.com/items/420004',
      },
    );
    assert.deepEqual(result, { status: 'window-paused' });
  } finally {
    delete globalThis.chrome;
  }
});

test('restores a selected sole window when the persistent window preference survives session reset', async () => {
  const windowId = 10;
  const localValues = { windowAutomationPreference: 'selected' };
  const sessionValues = { sessionReconciled: true };
  const runtimeMessages = capturingEvent();
  globalThis.chrome = {
    storage: {
      local: storageArea(localValues),
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query() { return []; },
      onCreated: extensionEvent(),
      onUpdated: extensionEvent(),
      onDetached: extensionEvent(),
      onAttached: extensionEvent(),
      onRemoved: extensionEvent(),
    },
    tabGroups: {
      async query() { return []; },
      onCreated: extensionEvent(),
      onMoved: extensionEvent(),
    },
    windows: {
      async getAll() { return [{ id: windowId, focused: true, tabs: [] }]; },
      onRemoved: extensionEvent(),
    },
    runtime: {
      onMessage: runtimeMessages,
      openOptionsPage() {},
    },
  };

  try {
    await import('../background.js?window-policy=restore-sole-window');
    const response = await new Promise((resolve) => {
      runtimeMessages.listener()({ type: 'GET_WINDOW_AUTOMATION_POLICY' }, {}, resolve);
    });
    assert.equal(response.mode, 'selected');
    assert.deepEqual(response.selectedWindowIds, [windowId]);
  } finally {
    delete globalThis.chrome;
  }
});

test('routes a new external web tab from an excluded existing window to the sole selected window', async () => {
  const mainWindowId = 10;
  const meetWindowId = 20;
  const newWindowId = 30;
  const externalTab = {
    id: 202,
    windowId: meetWindowId,
    groupId: -1,
    index: 1,
    active: true,
    pinned: false,
    pendingUrl: 'https://example.com/from-another-app',
    url: '',
  };
  const intentionalNewWindowTab = {
    id: 301,
    windowId: newWindowId,
    groupId: -1,
    index: 0,
    active: true,
    pinned: false,
    pendingUrl: 'https://meet.google.com/new-window',
    url: '',
  };
  const tabsByWindow = new Map([
    [mainWindowId, [{ id: 101, windowId: mainWindowId, active: true, url: 'https://example.com/main' }]],
    [meetWindowId, [
      { id: 201, windowId: meetWindowId, active: false, url: 'https://meet.google.com/abc-defg-hij' },
      externalTab,
    ]],
    [newWindowId, [intentionalNewWindowTab]],
  ]);
  const movedTabs = [];
  const focusedWindows = [];
  const sessionValues = {
    sessionReconciled: true,
    windowAutomationMode: 'selected',
    selectedWindowIds: [mainWindowId],
  };
  globalThis.chrome = {
    storage: {
      local: storageArea({ tabBundlrEnabled: true }),
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query({ windowId } = {}) { return tabsByWindow.get(Number(windowId)) || []; },
      async move(tabId, moveProperties) {
        movedTabs.push({ tabId: Number(tabId), ...moveProperties });
        return { ...externalTab, windowId: Number(moveProperties.windowId) };
      },
      async update() {},
      onCreated: extensionEvent(),
      onUpdated: extensionEvent(),
      onDetached: extensionEvent(),
      onAttached: extensionEvent(),
      onRemoved: extensionEvent(),
    },
    tabGroups: {
      async query() { return []; },
      onCreated: extensionEvent(),
      onMoved: extensionEvent(),
    },
    windows: {
      async getAll() {
        return [
          { id: mainWindowId, focused: false },
          { id: meetWindowId, focused: true },
          { id: newWindowId, focused: false },
        ];
      },
      async update(windowId, changes) { focusedWindows.push({ windowId: Number(windowId), ...changes }); },
      onRemoved: extensionEvent(),
    },
    runtime: {
      onMessage: extensionEvent(),
      openOptionsPage() {},
    },
  };

  try {
    const worker = await import('../background.js?window-policy=route-external-tab');
    await worker.TabBundlrBackground.processCreatedTab(externalTab);
    await worker.TabBundlrBackground.processCreatedTab(intentionalNewWindowTab);
    assert.deepEqual(movedTabs, [{
      tabId: externalTab.id,
      windowId: mainWindowId,
      index: -1,
    }]);
    assert.deepEqual(focusedWindows, [{ windowId: mainWindowId, focused: true }]);
  } finally {
    delete globalThis.chrome;
  }
});

test('routes a new external tab before Chrome includes it in the source window query', async () => {
  const mainWindowId = 81;
  const meetWindowId = 82;
  const externalTab = {
    id: 802,
    windowId: meetWindowId,
    groupId: -1,
    index: 1,
    active: true,
    pinned: false,
    pendingUrl: 'https://example.com/from-another-app',
    url: '',
  };
  const tabsByWindow = new Map([
    [mainWindowId, [{ id: 801, windowId: mainWindowId, active: true, url: 'https://example.com/main' }]],
    [meetWindowId, [{ id: 803, windowId: meetWindowId, active: false, url: 'https://meet.google.com/abc-defg-hij' }]],
  ]);
  const movedTabs = [];
  const sessionValues = {
    sessionReconciled: true,
    windowAutomationMode: 'selected',
    selectedWindowIds: [mainWindowId],
  };
  globalThis.chrome = {
    storage: {
      local: storageArea({ tabBundlrEnabled: true }),
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query({ windowId } = {}) { return tabsByWindow.get(Number(windowId)) || []; },
      async move(tabId, moveProperties) {
        movedTabs.push({ tabId: Number(tabId), ...moveProperties });
        return { ...externalTab, windowId: Number(moveProperties.windowId) };
      },
      async update() {},
      onCreated: extensionEvent(),
      onUpdated: extensionEvent(),
      onDetached: extensionEvent(),
      onAttached: extensionEvent(),
      onRemoved: extensionEvent(),
    },
    tabGroups: {
      async query() { return []; },
      onCreated: extensionEvent(),
      onMoved: extensionEvent(),
    },
    windows: {
      async getAll() {
        return [
          { id: mainWindowId, focused: false },
          { id: meetWindowId, focused: true },
        ];
      },
      async update() {},
      onRemoved: extensionEvent(),
    },
    runtime: {
      onMessage: extensionEvent(),
      openOptionsPage() {},
    },
  };

  try {
    const worker = await import('../background.js?window-policy=route-before-source-query-catches-up');
    await worker.TabBundlrBackground.processCreatedTab(externalTab);
    assert.deepEqual(movedTabs, [{
      tabId: externalTab.id,
      windowId: mainWindowId,
      index: -1,
    }]);
  } finally {
    delete globalThis.chrome;
  }
});

test('routes an external web tab when its URL arrives after creation', async () => {
  const mainWindowId = 91;
  const meetWindowId = 92;
  const externalTab = {
    id: 902,
    windowId: meetWindowId,
    groupId: -1,
    index: 1,
    active: true,
    pinned: false,
    title: 'New Tab',
    url: '',
  };
  const tabsByWindow = new Map([
    [mainWindowId, [{ id: 901, windowId: mainWindowId, active: true, url: 'https://example.com/main' }]],
    [meetWindowId, [
      { id: 903, windowId: meetWindowId, active: false, url: 'https://meet.google.com/abc-defg-hij' },
      externalTab,
    ]],
  ]);
  const movedTabs = [];
  const localValues = { tabBundlrEnabled: true };
  const sessionValues = {
    sessionReconciled: true,
    windowAutomationMode: 'selected',
    selectedWindowIds: [mainWindowId],
  };
  globalThis.chrome = {
    storage: {
      local: storageArea(localValues),
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query({ windowId } = {}) { return tabsByWindow.get(Number(windowId)) || []; },
      async move(tabId, moveProperties) {
        movedTabs.push({ tabId: Number(tabId), ...moveProperties });
        return { ...externalTab, windowId: Number(moveProperties.windowId) };
      },
      async update() {},
      onCreated: extensionEvent(),
      onUpdated: extensionEvent(),
      onDetached: extensionEvent(),
      onAttached: extensionEvent(),
      onRemoved: extensionEvent(),
    },
    tabGroups: {
      async query() { return []; },
      onCreated: extensionEvent(),
      onMoved: extensionEvent(),
    },
    windows: {
      async getAll() {
        return [
          { id: mainWindowId, focused: false },
          { id: meetWindowId, focused: true },
        ];
      },
      async update() {},
      onRemoved: extensionEvent(),
    },
    runtime: {
      onMessage: extensionEvent(),
      openOptionsPage() {},
    },
  };

  try {
    const worker = await import('../background.js?window-policy=route-delayed-external-tab');
    await worker.TabBundlrBackground.processCreatedTab(externalTab);
    assert.deepEqual(movedTabs, []);

    externalTab.url = 'https://example.com/from-another-app';
    externalTab.title = 'External page';
    await worker.TabBundlrBackground.processUpdatedTab({ url: externalTab.url }, { ...externalTab });

    assert.deepEqual(movedTabs, [{
      tabId: externalTab.id,
      windowId: mainWindowId,
      index: -1,
    }]);
  } finally {
    delete globalThis.chrome;
  }
});

test('does not reroute a normal New Tab navigation in an excluded window', async () => {
  const mainWindowId = 101;
  const meetWindowId = 102;
  const existingTab = {
    id: 1002,
    windowId: meetWindowId,
    groupId: -1,
    index: 1,
    active: true,
    pinned: false,
    title: 'New Tab',
    pendingUrl: 'chrome://newtab/',
    url: '',
  };
  const tabsByWindow = new Map([
    [mainWindowId, [{ id: 1001, windowId: mainWindowId, active: true, url: 'https://example.com/main' }]],
    [meetWindowId, [
      { id: 1003, windowId: meetWindowId, active: false, url: 'https://meet.google.com/abc-defg-hij' },
      existingTab,
    ]],
  ]);
  const movedTabs = [];
  const sessionValues = {
    sessionReconciled: true,
    windowAutomationMode: 'selected',
    selectedWindowIds: [mainWindowId],
  };
  globalThis.chrome = {
    storage: {
      local: storageArea({}),
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query({ windowId } = {}) { return tabsByWindow.get(Number(windowId)) || []; },
      async move(tabId, moveProperties) { movedTabs.push({ tabId: Number(tabId), ...moveProperties }); },
      onCreated: extensionEvent(),
      onUpdated: extensionEvent(),
      onDetached: extensionEvent(),
      onAttached: extensionEvent(),
      onRemoved: extensionEvent(),
    },
    tabGroups: {
      async query() { return []; },
      onCreated: extensionEvent(),
      onMoved: extensionEvent(),
    },
    windows: {
      async getAll() {
        return [
          { id: mainWindowId, focused: false },
          { id: meetWindowId, focused: true },
        ];
      },
      onRemoved: extensionEvent(),
    },
    runtime: {
      onMessage: extensionEvent(),
      openOptionsPage() {},
    },
  };

  try {
    const worker = await import('../background.js?window-policy=keep-excluded-navigation');
    await worker.TabBundlrBackground.processCreatedTab({ ...existingTab });
    existingTab.url = 'https://example.com/after';
    delete existingTab.pendingUrl;
    await worker.TabBundlrBackground.processUpdatedTab({ url: existingTab.url }, { ...existingTab });
    assert.deepEqual(movedTabs, []);
  } finally {
    delete globalThis.chrome;
  }
});

test('moves a freshly created external tab group to the sole selected window', async () => {
  const mainWindowId = 111;
  const meetWindowId = 112;
  const openerTab = {
    id: 1101,
    windowId: meetWindowId,
    groupId: -1,
    index: 0,
    active: false,
    pinned: false,
    title: 'Meet',
    url: 'https://meet.google.com/abc-defg-hij',
  };
  const codexTab = {
    id: 1102,
    windowId: meetWindowId,
    groupId: 501,
    index: 1,
    active: true,
    pinned: false,
    openerTabId: openerTab.id,
    title: 'Codex browser task',
    url: 'https://example.com/codex-task',
  };
  const manualTab = {
    id: 1103,
    windowId: meetWindowId,
    groupId: 502,
    index: 2,
    active: false,
    pinned: false,
    title: 'Meeting notes',
    url: 'https://example.com/meeting-notes',
  };
  const groups = [
    { id: 501, windowId: meetWindowId, title: 'Codex task', color: 'blue' },
    { id: 502, windowId: meetWindowId, title: 'Meeting material', color: 'grey' },
  ];
  const tabs = [openerTab, codexTab, manualTab];
  const movedGroups = [];
  const sessionValues = {
    sessionReconciled: true,
    windowAutomationMode: 'selected',
    selectedWindowIds: [mainWindowId],
  };
  globalThis.chrome = {
    storage: {
      local: storageArea({ tabBundlrEnabled: true }),
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query(queryInfo = {}) {
        return tabs.filter((tab) => (
          (queryInfo.windowId === undefined || Number(tab.windowId) === Number(queryInfo.windowId))
          && (queryInfo.groupId === undefined || Number(tab.groupId) === Number(queryInfo.groupId))
        ));
      },
      async move() {},
      async update() {},
      onCreated: extensionEvent(),
      onUpdated: extensionEvent(),
      onDetached: extensionEvent(),
      onAttached: extensionEvent(),
      onRemoved: extensionEvent(),
    },
    tabGroups: {
      async query() { return groups; },
      async move(groupId, moveProperties) {
        movedGroups.push({ groupId: Number(groupId), ...moveProperties });
        return { ...groups.find((group) => group.id === groupId), windowId: Number(moveProperties.windowId) };
      },
      onCreated: extensionEvent(),
      onMoved: extensionEvent(),
    },
    windows: {
      async getAll() {
        return [
          { id: mainWindowId, focused: false },
          { id: meetWindowId, focused: true },
        ];
      },
      async update() {},
      onRemoved: extensionEvent(),
    },
    runtime: {
      onMessage: extensionEvent(),
      openOptionsPage() {},
    },
  };

  try {
    const worker = await import('../background.js?window-policy=route-fresh-external-group');
    await worker.TabBundlrBackground.processCreatedTab({ ...codexTab });
    await worker.TabBundlrBackground.processCreatedGroup(groups[0]);
    await worker.TabBundlrBackground.processCreatedGroup(groups[1]);
    assert.deepEqual(movedGroups, [{
      groupId: groups[0].id,
      windowId: mainWindowId,
      index: -1,
    }]);
  } finally {
    delete globalThis.chrome;
  }
});

test('moves a fresh external group when Chrome reports tab membership after group creation', async () => {
  const mainWindowId = 121;
  const meetWindowId = 122;
  const groupId = 601;
  const openerTab = {
    id: 1201,
    windowId: meetWindowId,
    groupId: -1,
    index: 0,
    active: false,
    pinned: false,
    title: 'Meet',
    url: 'https://meet.google.com/abc-defg-hij',
  };
  const codexTab = {
    id: 1202,
    windowId: meetWindowId,
    groupId: -1,
    index: 1,
    active: true,
    pinned: false,
    openerTabId: openerTab.id,
    title: 'Codex browser task',
    url: 'https://example.com/codex-task',
  };
  const group = { id: groupId, windowId: meetWindowId, title: 'Codex task', color: 'blue' };
  let groupMembershipReady = false;
  const movedGroups = [];
  const sessionValues = {
    sessionReconciled: true,
    windowAutomationMode: 'selected',
    selectedWindowIds: [mainWindowId],
  };
  globalThis.chrome = {
    storage: {
      local: storageArea({ tabBundlrEnabled: true }),
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query(queryInfo = {}) {
        if (queryInfo.groupId !== undefined) return groupMembershipReady ? [{ ...codexTab }] : [];
        if (Number(queryInfo.windowId) === meetWindowId) return [{ ...openerTab }, { ...codexTab }];
        return [];
      },
      async move() {},
      async update() {},
      onCreated: extensionEvent(),
      onUpdated: extensionEvent(),
      onDetached: extensionEvent(),
      onAttached: extensionEvent(),
      onRemoved: extensionEvent(),
    },
    tabGroups: {
      async query() { return [group]; },
      async move(id, moveProperties) {
        movedGroups.push({ groupId: Number(id), ...moveProperties });
        return { ...group, windowId: Number(moveProperties.windowId) };
      },
      onCreated: extensionEvent(),
      onMoved: extensionEvent(),
    },
    windows: {
      async getAll() {
        return [
          { id: mainWindowId, focused: false },
          { id: meetWindowId, focused: true },
        ];
      },
      async update() {},
      onRemoved: extensionEvent(),
    },
    runtime: {
      onMessage: extensionEvent(),
      openOptionsPage() {},
    },
  };

  try {
    const worker = await import('../background.js?window-policy=route-group-after-membership-update');
    await worker.TabBundlrBackground.processCreatedTab({ ...codexTab });
    await worker.TabBundlrBackground.processCreatedGroup(group);
    assert.deepEqual(movedGroups, []);

    groupMembershipReady = true;
    codexTab.groupId = groupId;
    await worker.TabBundlrBackground.processUpdatedTab({ groupId }, { ...codexTab });

    assert.deepEqual(movedGroups, [{
      groupId,
      windowId: mainWindowId,
      index: -1,
    }]);
  } finally {
    delete globalThis.chrome;
  }
});

test('releases disabled collection groups and reassigns their open tabs through Smart Groups', async () => {
  const windowId = 77;
  const iterationGroupId = 41;
  const tabs = [{
    id: 701,
    windowId,
    groupId: iterationGroupId,
    index: 0,
    pinned: false,
    title: 'S34',
    url: 'https://work.example.com/collections/sprint-34',
  }];
  const groups = [{ id: iterationGroupId, windowId, title: 'S34', color: 'purple' }];
  const localValues = {
    groupRecords: {
      [`${windowId}:iteration:420003`]: {
        groupId: iterationGroupId,
        windowId,
        workspaceType: 'iteration',
        epicId: '420003',
        epicName: 'S34',
      },
    },
    tabContexts: { '701': { workspaceType: 'iteration', source: 'iteration' } },
    focusHeldTabs: {},
    smartGroups: [{
      id: 'iteration-work',
      name: 'Collection work',
      patterns: ['https://work.example.com/collections/'],
      focusMode: false,
    }],
    trainedRules: [],
    managedGroupTypeEnabled: { client: true, iteration: false, smart: true, 'focus-smart': true },
    autoOrganizeGroups: false,
  };
  const sessionValues = { sessionReconciled: true };
  globalThis.chrome = {
    storage: {
      local: storageArea(localValues),
      session: storageArea(sessionValues),
      onChanged: extensionEvent(),
    },
    tabs: {
      async query(queryInfo) {
        if (!queryInfo || Object.keys(queryInfo).length === 0 || Number(queryInfo.windowId) === windowId) {
          return tabs.map((tab) => ({ ...tab }));
        }
        return [];
      },
      async group({ tabIds, groupId }) {
        let destination = Number(groupId);
        if (!Number.isInteger(destination)) {
          destination = 900;
          groups.push({ id: destination, windowId, title: '', color: 'grey' });
        }
        tabs.filter((tab) => tabIds.includes(tab.id)).forEach((tab) => { tab.groupId = destination; });
        return destination;
      },
      async ungroup(tabIds) {
        const ids = new Set(Array.isArray(tabIds) ? tabIds : [tabIds]);
        tabs.filter((tab) => ids.has(tab.id)).forEach((tab) => { tab.groupId = -1; });
        for (let index = groups.length - 1; index >= 0; index -= 1) {
          if (!tabs.some((tab) => Number(tab.groupId) === Number(groups[index].id))) groups.splice(index, 1);
        }
      },
      onCreated: extensionEvent(),
      onUpdated: extensionEvent(),
      onDetached: extensionEvent(),
      onAttached: extensionEvent(),
      onRemoved: extensionEvent(),
    },
    tabGroups: {
      async query({ windowId: queryWindowId } = {}) {
        return groups.filter((group) => queryWindowId === undefined || Number(group.windowId) === Number(queryWindowId));
      },
      async update(groupId, changes) {
        const group = groups.find((candidate) => Number(candidate.id) === Number(groupId));
        Object.assign(group, changes);
        return { ...group };
      },
      onCreated: extensionEvent(),
      onMoved: extensionEvent(),
    },
    windows: {
      async getAll() { return []; },
      onRemoved: extensionEvent(),
    },
    runtime: {
      onMessage: extensionEvent(),
      openOptionsPage() {},
    },
  };

  try {
    const worker = await import('../background.js?workspace-category=iteration-smart-fallback');
    const result = await worker.TabBundlrBackground.reconcileManagedGroupTypeSettings();
    assert.equal(result.releasedCount, 1);
    assert.equal(tabs[0].groupId, 900);
    assert.equal(groups[0].title, 'Collection work');
    assert.equal(localValues.groupRecords[`${windowId}:iteration:420003`], undefined);
    assert.equal(localValues.groupRecords[`${windowId}:smart:iteration-work`]?.workspaceType, 'smart');
    assert.equal(localValues.tabContexts['701']?.workspaceType, 'smart');
  } finally {
    delete globalThis.chrome;
  }
});
