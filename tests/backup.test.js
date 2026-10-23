import assert from 'node:assert/strict';
import test from 'node:test';
import { backupJson, mergeBackupSettings, settingsImportChanges } from '../backup.js';

const trackerSource = {
  schemaVersion: 1,
  id: 'tracker',
  name: 'Project Tracker',
  enabled: true,
  precedence: 'after-rules',
  permissionOrigins: ['https://api.tracker.example/*'],
  credentials: [{ id: 'token', label: 'Access token', headerName: 'Tracker-Token' }],
  routes: [{
    id: 'item',
    pagePattern: 'https://tracker.example/items/{itemId}',
    steps: [{
      request: { url: 'https://api.tracker.example/items/{itemId}' },
      extract: { workspaceId: 'workspace.id', workspaceName: 'workspace.name' },
    }],
    placement: { workspaceId: '{workspaceId}', workspaceName: '{workspaceName}' },
  }],
};

test('serializes an inspectable settings backup without credentials or browser-session state', () => {
  const json = backupJson({
    shortcutReadToken: 'legacy-secret',
    workspaceSourceSecrets: { tracker: { token: 'current-secret' } },
    workspaceSources: [trackerSource],
    tabBundlrEnabled: true,
    openerInheritance: false,
    homeBaseDuplicateAction: 'review',
    previousTabMode: 'history',
    windowAutomationPreference: { mode: 'selected', restoreSoleWindow: true },
    managedGroupColors: { smart: 'grey', 'focus-smart': 'blue', unsupported: 'red' },
    managedGroupTypeOrder: ['focus-smart', 'smart', 'iteration', 'client'],
    managedGroupTypeEnabled: { client: true, iteration: false, smart: true, 'focus-smart': false },
    browserPageSmartGroupId: 'browser-pages',
    persistentHomeBases: [
      'https://dashboard.example.com/status/?team=platform#capacity',
      'https://dashboard.example.com/status?team=platform',
    ],
    smartGroups: [
      { id: 'in-progress', name: 'In Progress', patterns: ['https://dashboard.example.com/status'], focusMode: true },
      { id: 'browser-pages', name: 'Browser pages', patterns: ['https://example.com/browser-pages'] },
    ],
    trainedRules: [{ pattern: 'https://docs.example.com/project', epicId: 'project-42', epicName: 'Project Atlas' }],
    savedClientGroups: [{ epicId: 'project-42', epicName: 'Project Atlas', archived: false }],
    groupRecords: { 'window:1:group:4': { epicId: 'project-42' } },
    tabContexts: { '12': { source: 'rule' } },
    lastAction: { moves: [{ tabId: 12 }] },
    activityHistory: [{ id: 'activity-1', moves: [{ tabId: 12 }] }],
  }, '2026-09-10T12:00:00.000Z');

  const backup = JSON.parse(json);
  assert.equal(backup.format, 'tab-bundlr-settings');
  assert.equal(backup.version, 2);
  assert.equal(backup.exportedAt, '2026-09-10T12:00:00.000Z');
  assert.equal(backup.settings.settingsVersion, 2);
  assert.equal(backup.settings.tabBundlrEnabled, true);
  assert.equal(backup.settings.openerInheritance, false);
  assert.equal(backup.settings.homeBaseDuplicateAction, 'review');
  assert.equal(backup.settings.workspaceSources[0].id, 'tracker');
  assert.equal(backup.settings.workspaceSources[0].enabled, true);
  assert.equal('shortcutReadToken' in backup.settings, false);
  assert.equal('workspaceSourceSecrets' in backup.settings, false);
  assert.equal(json.includes('legacy-secret'), false);
  assert.equal(json.includes('current-secret'), false);
  assert.deepEqual(backup.settings.persistentHomeBases, ['https://dashboard.example.com/status?team=platform']);
  assert.equal('groupRecords' in backup.settings, false);
  assert.equal('tabContexts' in backup.settings, false);
  assert.equal('lastAction' in backup.settings, false);
  assert.equal('activityHistory' in backup.settings, false);
});

test('imports source definitions disabled and ignores legacy credentials', () => {
  const merged = mergeBackupSettings({
    tabBundlrEnabled: true,
    workspaceSourceSecrets: { tracker: { token: 'keep-local' } },
    smartGroups: [{ id: 'personal', name: 'Personal', patterns: ['https://code.example.com/me/'] }],
  }, {
    shortcutReadToken: 'do-not-import',
    workspaceSourceSecrets: { tracker: { token: 'do-not-import-either' } },
    workspaceSources: [trackerSource],
    trainedRules: [{ pattern: 'https://docs.example.com/project', epicId: 'project-42', epicName: 'Project Atlas' }],
  });

  assert.equal('shortcutReadToken' in merged, false);
  assert.equal('workspaceSourceSecrets' in merged, false);
  assert.equal(merged.workspaceSources[0].enabled, false);
  assert.deepEqual(merged.smartGroups, [{
    id: 'personal',
    name: 'Personal',
    patterns: ['https://code.example.com/me/'],
    focusMode: false,
    updatedAt: merged.smartGroups[0].updatedAt,
  }]);
});

test('clears locally stored source credentials during settings import', () => {
  const changes = settingsImportChanges({
    tabBundlrEnabled: true,
  }, {
    workspaceSources: [trackerSource],
  });

  assert.deepEqual(changes.workspaceSourceSecrets, {});
  assert.equal(changes.workspaceSources[0].enabled, false);
});

test('keeps only one Focus designation when importing Smart Groups', () => {
  const merged = mergeBackupSettings({}, {
    smartGroups: [
      { id: 'in-progress', name: 'In Progress', patterns: ['https://dashboard.example.com/status'], focusMode: true },
      { id: 'personal', name: 'Personal', patterns: ['https://code.example.com/me/'], focusMode: true },
    ],
  });

  assert.equal(merged.smartGroups[0].focusMode, true);
  assert.equal(merged.smartGroups[1].focusMode, false);
});
