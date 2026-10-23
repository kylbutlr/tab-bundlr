import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceWorkspaceId } from '../workspace-identity.js';
const event = () => ({ addListener() {} });
function storage(values) {
  return { async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter((key) => key in values).map((key) => [key, values[key]])); },
    async set(next) { Object.assign(values, next); }, async remove(keys) { for (const key of keys) delete values[key]; } };
}

test('real worker preserves an owned legacy group and separates equal IDs from two connections', async () => {
  const sources = ['alpha', 'beta'].map((id) => ({ schemaVersion: 1, id, name: id, enabled: true, permissionOrigins: [], credentials: [],
    routes: [{ id: 'item', pagePattern: `https://${id}.example/{id}`, placement: { workspaceId: '42', workspaceName: id } }] }));
  const local = { settingsVersion: 2, tabBundlrEnabled: true, workspaceSources: sources, smartGroups: [],
    trainedRules: [{ epicId: '42', epicName: 'alpha', pattern: 'https://internal.example' }],
    groupRecords: { '1:42': { epicId: '42', epicName: 'alpha', groupId: 10, windowId: 1, title: 'alpha', workspaceType: 'epic' } },
    tabContexts: { 1: { epicId: '42', epicName: 'alpha', groupId: 10, windowId: 1, workspaceType: 'epic', source: 'workspace-source:alpha:item' } } };
  const tabs = [{ id: 1, windowId: 1, groupId: 10, url: 'https://alpha.example/1', index: 0 },
    { id: 2, windowId: 1, groupId: -1, url: 'https://beta.example/2', index: 1 }];
  const groups = [{ id: 10, windowId: 1, title: 'alpha', color: 'blue' }];
  const session = { sessionReconciled: true, persistentHomeBasesReconciled: true, windowAutomationMode: 'all' };
  globalThis.chrome = {
    storage: { local: storage(local), session: storage(session), onChanged: event() },
    tabs: { async query() { return tabs.map((tab) => ({ ...tab })); }, async group({ tabIds, groupId }) {
      if (groupId === undefined) { groupId = groups.length + 10; groups.push({ id: groupId, windowId: 1, title: '' }); }
      for (const id of tabIds) tabs.find((tab) => tab.id === id).groupId = groupId;
      return groupId;
    }, onCreated: event(), onUpdated: event(), onActivated: event(), onDetached: event(), onAttached: event(), onRemoved: event() },
    tabGroups: { async query() { return groups.map((group) => ({ ...group })); }, async update(id, changes) {
      const group = groups.find((group) => group.id === id); Object.assign(group, changes); return { ...group };
    }, onCreated: event(), onMoved: event() },
    windows: { async getAll() { return [{ id: 1 }]; }, onRemoved: event() }, runtime: { onMessage: event() },
  };
  try {
    const { TabBundlrBackground: worker } = await import('../background.js?identity-upgrade');
    await worker.initializeForSession();
    await worker.processWorkspaceSourceTab({ ...tabs[0] });
    await worker.processWorkspaceSourceTab({ ...tabs[1] });
    assert.equal(tabs[0].groupId, 10);
    assert.notEqual(tabs[0].groupId, tabs[1].groupId);
    assert.equal(groups.length, 2);
    assert.equal(local.groupRecords[`1:${sourceWorkspaceId('alpha', '42')}`].groupId, 10);
    assert.equal(local.trainedRules[0].epicId, sourceWorkspaceId('alpha', '42'));
    assert.equal(local.tabContexts[2].epicId, sourceWorkspaceId('beta', '42'));
  } finally { delete globalThis.chrome; }
});
