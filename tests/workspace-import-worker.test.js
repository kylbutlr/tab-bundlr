import assert from 'node:assert/strict';
import test from 'node:test';

const event = () => ({ listeners: [], addListener(listener) { this.listeners.push(listener); } });
test('actual worker imports and undoes rules without tab operations, networking or session writes', async () => {
  const local = { settingsVersion: 2, workspaceSources: [], tabBundlrEnabled: true, autoOrganizeGroups: true,
    trainedRules: [{ epicId: 'connected-42', epicName: 'Connected', pattern: 'https://connected.example' }],
    workspaceSourceSecrets: { shortcut: { apiToken: 'synthetic-only' } } };
  const session = { sessionReconciled: true, persistentHomeBasesReconciled: true, pausedWindowIds: [9],
    focusHeldTabs: { 3: { groupId: 7 } }, windowAutomationMode: 'all', selectedWindowIds: [] };
  const originalSession = structuredClone(session);
  const originalRules = structuredClone(local.trainedRules);
  const originalSecrets = structuredClone(local.workspaceSourceSecrets);
  const changes = [];
  let checking = false;
  let tabOperations = 0;
  let network = 0;
  let sessionWrites = 0;
  const area = (values, isSession = false) => ({
    async get(keys) { return structuredClone(Object.fromEntries((Array.isArray(keys) ? keys : [keys])
      .filter((key) => Object.hasOwn(values, key)).map((key) => [key, values[key]]))); },
    async set(next) {
      if (checking && isSession) sessionWrites += 1;
      if (checking && !isSession) changes.push(Object.fromEntries(Object.entries(next).map(([key, newValue]) => [key, { newValue, oldValue: values[key] }])));
      Object.assign(values, structuredClone(next));
    }, async remove() { assert.fail('Import must not remove existing storage'); },
  });
  const tabAction = async () => { if (checking) tabOperations += 1; return []; };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { network += 1; throw new Error('No network permitted'); };
  globalThis.chrome = {
    storage: { local: area(local), session: area(session, true), onChanged: event() },
    tabs: { query: tabAction, create: tabAction, move: tabAction, group: tabAction, remove: tabAction,
      onCreated: event(), onUpdated: event(), onActivated: event(), onDetached: event(), onAttached: event(), onRemoved: event() },
    tabGroups: { query: tabAction, update: tabAction, move: tabAction, onCreated: event(), onMoved: event() },
    windows: { getAll: tabAction, onRemoved: event() },
    runtime: { onMessage: event() },
  };
  try {
    const { TabBundlrBackground: worker } = await import('../background.js?workspace-import-no-moves');
    await worker.initializeForSession();
    await new Promise(setImmediate);
    checking = true;
    const send = (message) => new Promise((resolve) => chrome.runtime.onMessage.listeners[0](message, {}, resolve));
    const file = { format: 'tab-bundlr-workspaces', version: 1, workspaces: [{ id: 'docs', name: 'Docs', urls: ['https://docs.example'] }] };
    const preview = await send({ type: 'WORKSPACE_IMPORT_PREVIEW', file });
    assert.equal(preview.ok, true);
    assert.equal(changes.length, 0);
    const imported = await send({ type: 'WORKSPACE_IMPORT_APPLY', preview: preview.preview, selectedIds: ['docs'] });
    assert.equal(imported.ok, true);
    assert.equal(imported.imported, 1);
    for (const change of changes.splice(0)) for (const listener of chrome.storage.onChanged.listeners) listener(change, 'local');
    await new Promise(setImmediate);
    assert.equal((await send({ type: 'WORKSPACE_IMPORT_STATUS' })).canUndo, true);
    // Concurrent replay must fail its stale baseline, not overwrite the first import.
    assert.equal((await send({ type: 'WORKSPACE_IMPORT_APPLY', preview: preview.preview, selectedIds: ['docs'] })).ok, false);
    assert.equal((await send({ type: 'WORKSPACE_IMPORT_UNDO' })).ok, true);
    for (const change of changes.splice(0)) for (const listener of chrome.storage.onChanged.listeners) listener(change, 'local');
    await new Promise(setImmediate);
    assert.equal(tabOperations, 0);
    assert.equal(network, 0);
    assert.equal(sessionWrites, 0);
    assert.deepEqual(local.trainedRules, originalRules);
    assert.deepEqual(local.workspaceSourceSecrets, originalSecrets);
    assert.deepEqual(session, originalSession);
    assert.equal(local.tabBundlrEnabled, true);
  } finally { globalThis.fetch = previousFetch; delete globalThis.chrome; }
});
