import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { prepareRadarSource, parseRadarTicketUrl } from '../radar-source.js';
import { normalizeWorkspaceSource, matchingWorkspaceSources, resolveWorkspaceSourceMatch,
  upgradeWorkspaceSource, workspaceSourceSaveChanges } from '../sources.js';
import { sourceWorkspaceId, sourceIdentityMigration } from '../workspace-identity.js';
import { createBackup, settingsImportChanges } from '../backup.js';
import { migrateLegacySettings } from '../settings.js';

const fixture = JSON.parse(await readFile(new URL('./fixtures/radar-source.json', import.meta.url), 'utf8'));
const response = (payload, status = 200) => ({ ok: status === 200, status, async json() { return payload; } });

// This stand-in exercises only the generic interpreter, not a claim of Radar auth support.
function interpreterSource() {
  const proposed = prepareRadarSource(fixture).source;
  return normalizeWorkspaceSource({ ...proposed, id: 'synthetic-tracker', name: 'Synthetic tracker', enabled: true,
    identity: { ...proposed.identity, provider: 'synthetic-tracker', authority: 'https://tracker.example' },
    authentication: { type: 'header' },
    permissionOrigins: ['https://tracker.example/*'],
    credentials: [{ id: 'token', headerName: 'Tracker-Token' }],
    routes: proposed.routes.map((route) => ({ ...route,
      pagePattern: route.pagePattern.replace('https://radar.sdg.la', 'https://tracker.example'),
      steps: route.steps.map((step) => ({ ...step, request: { ...step.request,
        url: step.request.url.replace('https://radar.sdg.la', 'https://tracker.example') } })),
    })),
  });
}

test('recognizes observed native and short URLs without deriving a project or converting a number to UUID', () => {
  assert.deepEqual(parseRadarTicketUrl('https://radar.sdg.la/t/42?view=detail'), { kind: 'number', number: 42 });
  assert.deepEqual(parseRadarTicketUrl(`https://radar.sdg.la/tickets/${fixture.tickets[0].id}`), { kind: 'uuid', id: fixture.tickets[0].id });
  for (const value of ['http://radar.sdg.la/t/42', 'https://radar.sdg.la.evil.example/t/42',
    'https://radar.sdg.la/tickets/42', 'https://radar.sdg.la/projects/42',
    'https://radar.sdg.la/t/42/arbitrary', 'https://user@radar.sdg.la/t/42']) {
    assert.equal(parseRadarTicketUrl(value), null);
  }
});

test('prepares a reviewable, disabled proposal but refuses to turn unverified Radar authentication into an executable source', async () => {
  const preview = prepareRadarSource(fixture);
  assert.equal(preview.status, 'authentication-unavailable');
  assert.equal(preview.source.enabled, false);
  assert.deepEqual(preview.source.permissionOrigins, ['https://radar.sdg.la/*']);
  assert.deepEqual(preview.source.credentials, []);
  assert.equal(preview.source.routes.length, 2);
  assert.equal(preview.source.routes[1].steps[0].request.url.includes(`id=${fixture.tickets[0].id}`), true);
  assert.equal(preview.source.routes[1].steps[0].request.url.includes('presence='), false);
  assert.equal(preview.legacyReferences[0].shortcutStoryId, '42');
  assert.equal(preview.legacyReferences[0].status, 'review-required');
  assert.throws(() => normalizeWorkspaceSource(preview.source), { code: 'authentication-unavailable' });
  let called = false;
  await assert.rejects(resolveWorkspaceSourceMatch({ source: { ...preview.source, enabled: true },
    route: preview.source.routes[0], captures: {} }, {}, () => { called = true; }), { code: 'authentication-unavailable' });
  assert.equal(called, false);
  assert.deepEqual(fixture.tickets[0].shortcut_story_id, 42);
});

test('does not infer grouping or aliases when project or source identity is missing, conflicting or from another workspace', () => {
  assert.throws(() => prepareRadarSource({ ...fixture, projects: [] }), /reviewed label/);
  assert.throws(() => prepareRadarSource({ ...fixture, tickets: [fixture.tickets[0], fixture.tickets[0]] }), /unique/);
  assert.throws(() => prepareRadarSource({ ...fixture, workspaceId: fixture.projects[0].id }), /workspace mismatch/);
  assert.throws(() => prepareRadarSource({ ...fixture, tickets: [{ ...fixture.tickets[0], id: '42' }] }), /native UUID/);
  const noAlias = prepareRadarSource({ ...fixture, tickets: [{ ...fixture.tickets[0], shortcut_story_id: null }] });
  assert.deepEqual(noAlias.legacyReferences, []);
});

test('requires complete versioned source identity and rejects unsupported authentication, inline secrets and session headers', () => {
  const source = interpreterSource();
  assert.throws(() => normalizeWorkspaceSource({ ...source, identity: { ...source.identity, accountId: '' } }), /identity fields/);
  assert.throws(() => normalizeWorkspaceSource({ ...source, schemaVersion: 1 }), /version 2/);
  for (const type of ['oauth', 'session', 'unavailable']) {
    assert.throws(() => normalizeWorkspaceSource({ ...source, authentication: { type } }), { code: 'authentication-unavailable' });
  }
  for (const credential of [{ id: 'token', type: 'oauth', headerName: 'Authorization' },
    { id: 'token', headerName: 'Tracker-Token', value: 'synthetic-secret' },
    { id: 'token', headerName: 'Cookie' }]) {
    assert.throws(() => normalizeWorkspaceSource({ ...source, credentials: [credential] }), /credentials|session headers/);
  }
  for (const expect of [null, [], 'ticket.id']) {
    assert.throws(() => normalizeWorkspaceSource({ ...source, routes: [{ ...source.routes[0],
      steps: [{ ...source.routes[0].steps[0], expect }] }] }), /property map/);
  }
  assert.throws(() => normalizeWorkspaceSource({ ...source, routes: [{ ...source.routes[0],
    steps: [{ ...source.routes[0].steps[0], request: { url: 'http://tracker.example/read' } }] }] }), /HTTPS/);
});

test('maps a reviewed response and checks native ticket/workspace/project identity before returning a grouping preview', async () => {
  const source = interpreterSource();
  const [match] = matchingWorkspaceSources([source], 'https://tracker.example/t/42');
  assert.deepEqual(matchingWorkspaceSources([source], 'https://tracker.example/t/42/arbitrary'), []);
  let request;
  const result = await resolveWorkspaceSourceMatch(match, { token: 'synthetic-secret' }, async (url, options) => {
    request = { url, options };
    return response({ ticket: fixture.tickets[0] });
  });
  assert.equal(result.workspaceId, fixture.projects[0].id);
  assert.equal(result.workspaceName, 'Example storefront');
  assert.equal(result.itemId, fixture.tickets[0].id);
  assert.deepEqual(result.sourceIdentity, source.identity);
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.redirect, 'error');
  for (const field of ['id', 'number', 'workspace_id', 'project_id']) {
    await assert.rejects(resolveWorkspaceSourceMatch(match, { token: 'synthetic-secret' }, async () => (
      response({ ticket: { ...fixture.tickets[0], [field]: 'mismatch' } })
    )), /response identity/);
  }
});

test('keeps unavailable credentials, expired auth, forbidden workspace and passkey verification distinct from an empty result', async () => {
  const source = interpreterSource();
  const [match] = matchingWorkspaceSources([source], 'https://tracker.example/t/42');
  let calls = 0;
  await assert.rejects(resolveWorkspaceSourceMatch(match, {}, () => { calls += 1; }), { code: 'authentication-unavailable' });
  assert.equal(calls, 0);
  for (const [status, code] of [[401, 'authentication-expired'], [403, 'access-denied'], [428, 'verification-required']]) {
    await assert.rejects(resolveWorkspaceSourceMatch(match, { token: 'synthetic-secret' }, async () => (
      response({ error: 'Rejected synthetic-secret' }, status)
    )), (error) => error.code === code && !error.message.includes('synthetic-secret'));
  }
});

test('isolates equal external IDs by provider, authority, workspace, account, source and entity kind without migrating historical groups', () => {
  const identity = interpreterSource().identity;
  const id = (context) => sourceWorkspaceId('tracker', '42', 'workspace', context);
  const ids = [id(identity), ...['provider', 'authority', 'workspaceId', 'accountId', 'entityKind'].map((field) => id({ ...identity, [field]: `${identity[field]}-different` })),
    sourceWorkspaceId('other', '42', 'workspace', identity), sourceWorkspaceId('tracker', '42')];
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(sourceIdentityMigration({ groupRecords: { '1:42': { epicId: '42' } } }, {
    sourceId: 'tracker', workspaceId: '42', sourceIdentity: identity,
  }), {});
});

test('explicit source upgrade is disabled, preserves legacy input and round trips through versioned credential-free imports', () => {
  const legacy = migrateLegacySettings({ shortcutReadToken: 'synthetic-secret' }).settings.workspaceSources[0];
  const identity = { provider: 'shortcut', authority: 'https://app.shortcut.com', workspaceId: 'synthetic-workspace', accountId: 'synthetic-account', entityKind: 'workspace' };
  const upgraded = upgradeWorkspaceSource(legacy, identity);
  assert.equal(upgraded.schemaVersion, 2);
  assert.equal(upgraded.enabled, false);
  assert.equal(legacy.schemaVersion, 1);
  assert.equal(legacy.enabled, true);
  const stored = { settingsVersion: 2, workspaceSources: [legacy, upgraded],
    workspaceSourceSecrets: { shortcut: { apiToken: 'synthetic-secret' } },
    smartGroups: [{ id: 'local', name: 'Local', patterns: [] }],
    trainedRules: [{ epicId: 'old', epicName: 'Original', pattern: 'https://docs.example' }] };
  // Use separate connection IDs to retain both sources in the same backup.
  stored.workspaceSources[1] = { ...upgraded, id: 'shortcut-new' };
  const backup = createBackup(stored);
  assert.equal(JSON.stringify(backup).includes('synthetic-secret'), false);
  const changes = settingsImportChanges({}, backup.settings);
  assert.deepEqual(changes.workspaceSources.map((source) => source.schemaVersion), [1, 2]);
  assert.equal(changes.workspaceSources.every((source) => !source.enabled), true);
  assert.deepEqual(changes.workspaceSourceSecrets, {});
  assert.equal(changes.smartGroups[0].id, 'local');
  assert.equal(changes.trainedRules[0].epicId, 'old');
  assert.equal(migrateLegacySettings(stored).settings.workspaceSources.length, 2);
});

test('saving an edited source clears only its own credentials and leaves the input and other sources intact', () => {
  const source = interpreterSource();
  const stored = { workspaceSources: [source], workspaceSourceSecrets: {
    [source.id]: { token: 'synthetic-original' }, other: { token: 'synthetic-other' },
  } };
  const changes = workspaceSourceSaveChanges(stored, { ...source,
    identity: { ...source.identity, accountId: 'different-account' } });
  assert.equal(changes.workspaceSources[0].enabled, false);
  assert.equal(changes.workspaceSources[0].identity.accountId, 'different-account');
  assert.equal(changes.workspaceSourceSecrets[source.id], undefined);
  assert.equal(changes.workspaceSourceSecrets.other.token, 'synthetic-other');
  assert.equal(stored.workspaceSourceSecrets[source.id].token, 'synthetic-original');
});
