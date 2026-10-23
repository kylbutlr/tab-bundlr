import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateLegacySettings } from '../settings.js';

test('uses conservative generic defaults for a fresh installation', () => {
  const migration = migrateLegacySettings({});
  assert.equal(migration.freshInstall, true);
  assert.equal(migration.settings.settingsVersion, 2);
  assert.equal(migration.settings.tabBundlrEnabled, false);
  assert.equal(migration.settings.homeBaseDuplicateAction, 'review');
  assert.equal(migration.settings.openerInheritance, true);
  assert.deepEqual(migration.settings.workspaceSources, []);
  assert.deepEqual(migration.settings.workspaceSourceSecrets, {});
});

test('migrates the existing setup into a visible source without changing behavior', () => {
  const migration = migrateLegacySettings({
    shortcutReadToken: 'not-a-real-token',
    tabBundlrEnabled: true,
    smartGroups: [{ id: 'docs', name: 'Documentation', patterns: ['https://docs.example.com/'] }],
  });
  assert.equal(migration.freshInstall, false);
  assert.equal(migration.settings.tabBundlrEnabled, true);
  assert.equal(migration.settings.homeBaseDuplicateAction, 'remove-exact-inactive');
  assert.equal(migration.settings.workspaceSources.length, 1);
  assert.equal(migration.settings.workspaceSources[0].id, 'shortcut');
  assert.equal(migration.settings.workspaceSources[0].enabled, true);
  assert.equal(migration.settings.workspaceSources[0].precedence, 'before-rules');
  assert.equal(migration.settings.workspaceSources[0].routes[0].pagePattern.includes('/workspace/'), true);
  assert.deepEqual(migration.settings.workspaceSourceSecrets, {
    shortcut: { apiToken: 'not-a-real-token' },
  });
  assert.deepEqual(migration.removeKeys, ['shortcutReadToken']);
});

test('keeps an already migrated source configuration stable', () => {
  const existingSource = {
    schemaVersion: 1,
    id: 'tracker',
    name: 'Tracker',
    enabled: true,
    permissionOrigins: [],
    routes: [{
      pagePattern: 'https://tracker.example/workspaces/{workspaceId}',
      placement: { workspaceId: '{workspaceId}', workspaceName: '{workspaceId}' },
    }],
  };
  const migration = migrateLegacySettings({
    settingsVersion: 2,
    workspaceSources: [existingSource],
    workspaceSourceSecrets: { tracker: { token: 'secret' } },
    homeBaseDuplicateAction: 'review',
    openerInheritance: false,
  });
  assert.equal(migration.migrated, false);
  assert.equal(migration.settings.workspaceSources[0].id, 'tracker');
  assert.deepEqual(migration.settings.workspaceSourceSecrets, { tracker: { token: 'secret' } });
  assert.equal(migration.settings.openerInheritance, false);
});
