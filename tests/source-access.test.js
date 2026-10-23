import assert from 'node:assert/strict';
import test from 'node:test';

const event = () => ({ listeners: [], addListener(listener) { this.listeners.push(listener); } });
const storage = (values) => ({
  async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter((key) => key in values).map((key) => [key, values[key]])); },
  async set(changes) { Object.assign(values, changes); },
  async remove(keys) { for (const key of keys) delete values[key]; },
});
let serial = 0;
async function fixture({ granted = true, unavailable = false, rejects = false, revokeAfterRequest = 0 } = {}) {
  const access = { granted, rejects };
  const requests = [];
  const removed = event();
  const added = event();
  const source = { schemaVersion: 1, id: 'tracker', name: 'Example Tracker', enabled: true,
    permissionOrigins: ['https://api.tracker.example/*'], credentials: [{ id: 'token', headerName: 'Tracker-Token' }],
    routes: [{ id: 'item', pagePattern: 'https://tracker.example/items/{itemId}', steps: [
      { request: { url: 'https://api.tracker.example/items/{itemId}' }, extract: { workspaceId: 'workspace_id' } },
      { request: { url: 'https://api.tracker.example/workspaces/{workspaceId}' }, extract: { workspaceName: 'name' } },
    ], placement: { workspaceId: '{workspaceId}', workspaceName: '{workspaceName}' } }] };
  const local = { settingsVersion: 2, tabBundlrEnabled: true, workspaceSources: [source],
    workspaceSourceSecrets: { tracker: { token: 'test-credential' } }, autoOrganizeGroups: false };
  const session = { sessionReconciled: true, persistentHomeBasesReconciled: true, windowAutomationMode: 'all' };
  const tab = { id: 1, windowId: 1, groupId: -1, index: 0, url: 'https://tracker.example/items/1' };
  const groups = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    requests.push(url);
    if (requests.length === revokeAfterRequest) access.granted = false;
    return { ok: true, status: 200, async json() { return { workspace_id: '42', name: 'Fixture workspace' }; } };
  };
  globalThis.chrome = {
    permissions: unavailable ? undefined : { async contains() { if (access.rejects) throw new Error('Unavailable'); return access.granted; }, onRemoved: removed, onAdded: added },
    storage: { local: storage(local), session: storage(session), onChanged: event() },
    tabs: { async query() { return [{ ...tab }]; }, async group({ groupId }) {
      if (groupId === undefined) { groupId = groups.length + 10; groups.push({ id: groupId, windowId: 1 }); }
      tab.groupId = groupId; return groupId;
    }, onCreated: event(), onUpdated: event(), onActivated: event(), onDetached: event(), onAttached: event(), onRemoved: event() },
    tabGroups: { async query() { return groups.map((group) => ({ ...group })); }, async update(id, changes) {
      const group = groups.find((item) => item.id === id); Object.assign(group, changes); return { ...group };
    }, onCreated: event(), onMoved: event() },
    windows: { async getAll() { return [{ id: 1 }]; }, onRemoved: event() }, runtime: { onMessage: event() },
  };
  const { TabBundlrBackground: worker } = await import(`../background.js?source-access=${++serial}`);
  await worker.initializeForSession();
  return { worker, tab, access, requests, removed, added, local, groups,
    restore() { globalThis.fetch = previousFetch; delete globalThis.chrome; } };
}

for (const [name, options] of Object.entries({ denied: { granted: false }, unavailable: { unavailable: true }, rejected: { rejects: true } })) {
  test(`worker makes no source request when host access is ${name}`, async () => {
    const f = await fixture(options);
    try {
      const result = await f.worker.processWorkspaceSourceTab({ ...f.tab });
      assert.equal(f.requests.length, 0);
      assert.equal(result.status, 'permission-required');
      assert.equal(f.groups.length, 0);
    } finally { f.restore(); }
  });
}

test('worker rechecks access before cached reads and refreshes after access is restored', async () => {
  const f = await fixture();
  try {
    await f.worker.processWorkspaceSourceTab({ ...f.tab });
    assert.equal(f.requests.length, 2);
    f.access.granted = false;
    for (const listener of f.removed.listeners) listener({ origins: ['https://api.tracker.example/*'] });
    const denied = await f.worker.processWorkspaceSourceTab({ ...f.tab });
    assert.equal(denied.status, 'permission-required');
    assert.equal(f.requests.length, 2);
    f.access.granted = true;
    for (const listener of f.added.listeners) listener({ origins: ['https://api.tracker.example/*'] });
    await f.worker.processWorkspaceSourceTab({ ...f.tab });
    assert.equal(f.requests.length, 4);
    assert.equal(f.local.workspaceSources[0].enabled, true);
    assert.equal(f.local.workspaceSourceSecrets.tracker.token, 'test-credential');
  } finally { f.restore(); }
});

test('worker stops a multi-step source after host access is revoked between requests', async () => {
  const f = await fixture({ revokeAfterRequest: 1 });
  try {
    await assert.rejects(f.worker.processWorkspaceSourceTab({ ...f.tab }), /service access/i);
    assert.equal(f.requests.length, 1);
    assert.equal(f.groups.length, 0);
  } finally { f.restore(); }
});

test('worker does not apply a completed result if access was revoked while it was in flight', async () => {
  const f = await fixture({ revokeAfterRequest: 2 });
  try {
    const result = await f.worker.processWorkspaceSourceTab({ ...f.tab });
    assert.equal(result.status, 'permission-required');
    assert.equal(f.requests.length, 2);
    assert.equal(f.groups.length, 0);
  } finally { f.restore(); }
});
