import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceWorkspaceId, sourceIdentityMigration } from '../workspace-identity.js';
import { createBackup } from '../backup.js';

const result = { sourceId: 'tracker', workspaceId: '42', workspaceType: 'workspace' };
const original = () => ({ groupRecords: { '1:42': { epicId: '42', groupId: 7, windowId: 1, workspaceType: 'epic', epicName: 'Project' } },
  tabContexts: { 9: { epicId: '42', groupId: 7, windowId: 1, workspaceType: 'epic', source: 'workspace-source:tracker:item' } },
  trainedRules: [{ epicId: '42', pattern: 'https://example.com', epicName: 'Project' }], savedClientGroups: [{ epicId: '42', epicName: 'Project' }] });

test('connection IDs cannot collide with other connections, kinds, or delimiter-containing IDs', () => {
  assert.equal(new Set([sourceWorkspaceId('a', '42'), sourceWorkspaceId('b', '42'), sourceWorkspaceId('a', '42', 'collection'),
    sourceWorkspaceId('a:b', '42'), sourceWorkspaceId('a', 'b:42')]).size, 5);
});

test('upgrade preserves proven group ownership, tab contexts, and saved destination rules without mutating input', () => {
  const stored = original();
  const changes = sourceIdentityMigration(stored, result);
  const id = sourceWorkspaceId('tracker', '42');
  assert.equal(changes.groupRecords[`1:${id}`].groupId, 7);
  assert.equal(changes.groupRecords['1:42'], undefined);
  assert.equal(changes.tabContexts[9].epicId, id);
  assert.equal(changes.trainedRules[0].epicId, id);
  assert.equal(changes.savedClientGroups[0].epicId, id);
  assert.equal(stored.tabContexts[9].epicId, '42');
  assert.deepEqual(sourceIdentityMigration({ ...stored, ...changes }, result), {});
});

test('upgrade leaves ambiguous or unproven legacy destinations intact', () => {
  const stored = original();
  stored.tabContexts[10] = { ...stored.tabContexts[9], source: 'workspace-source:another:item' };
  assert.deepEqual(sourceIdentityMigration(stored, result), {});
  assert.deepEqual(sourceIdentityMigration({ ...stored, tabContexts: {} }, result), {});
});

test('workspace with no URL rules survives a settings backup', () => {
  const backup = createBackup({ smartGroups: [{ id: 'focus', name: 'Focus', patterns: [], focusMode: true }] });
  assert.equal(backup.settings.smartGroups.length, 1);
  assert.deepEqual(backup.settings.smartGroups[0].patterns, []);
});
