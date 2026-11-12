import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { radarProjectSourcePreview, radarSessionSourcePreview, resolveRadarProjectMatch, readRadarMetadataInTab } from '../radar-session.js';
import { normalizeWorkspaceSource, matchingWorkspaceSources, resolveWorkspaceSourceMatch } from '../sources.js';
import { sourceWorkspaceId } from '../workspace-identity.js';
import { createBackup, settingsImportChanges } from '../backup.js';
import vm from 'node:vm';
const fixture = JSON.parse(await readFile(new URL('./fixtures/radar-source.json', import.meta.url)));
const accountId = '44444444-4444-4444-8444-444444444444';
const metadata = { status: 'read', accountId, workspaceId: fixture.workspaceId, ticket: fixture.tickets[0] };
const second = { ...metadata, ticket: { ...metadata.ticket, id: '55555555-5555-4555-8555-555555555555', number: 43 } };
const url = (value) => `https://radar.sdg.la/tickets/${value.ticket.id}`;
const source = () => normalizeWorkspaceSource({ ...radarProjectSourcePreview(metadata, 'radar-projects', 'Reviewed project'), enabled: true });

test('version 4 groups previously unseen native tickets by the returned reviewed project ID', async () => {
  const profile = source();
  const results = [];
  for (const record of [metadata, second]) {
    const [match] = matchingWorkspaceSources([profile], url(record));
    assert.ok(match); assert.equal(match.captures.ticketId, record.ticket.id);
    results.push(await resolveRadarProjectMatch(match, { id: 9, url: url(record) }, async (tabId, expected) => {
      assert.equal(tabId, 9); assert.deepEqual(expected, { id: record.ticket.id, accountId, workspaceId: fixture.workspaceId });
      return record;
    }));
  }
  assert.equal(results[0].workspaceId, results[1].workspaceId);
  assert.notEqual(results[0].itemId, results[1].itemId);
  assert.equal(results[1].workspaceName, 'Reviewed project');
  assert.deepEqual(matchingWorkspaceSources([profile], `${url(metadata)}/arbitrary`), []);
  assert.deepEqual(matchingWorkspaceSources([profile], 'https://radar.sdg.la/t/42'), []);
});
test('unknown projects stay unassigned; accounts, workspaces and ticket scope never mix', async () => {
  const profile = source(); const [match] = matchingWorkspaceSources([profile], url(metadata));
  const unknown = await resolveRadarProjectMatch(match, { id: 9, url: url(metadata) }, async () => ({ ...metadata,
    ticket: { ...metadata.ticket, project_id: accountId } }));
  assert.equal(unknown.status, 'unassigned'); assert.equal(unknown.reason, 'project-not-reviewed');
  for (const record of [{ ...metadata, accountId: second.ticket.id }, { ...metadata, workspaceId: accountId },
    { ...metadata, ticket: { ...metadata.ticket, workspace_id: accountId } }, second]) {
    await assert.rejects(resolveRadarProjectMatch(match, { id: 9, url: url(metadata) }, async () => record), { code: 'ticket-scope-mismatch' });
  }
  assert.notEqual(sourceWorkspaceId(profile.id, metadata.ticket.project_id, 'workspace', profile.identity),
    sourceWorkspaceId(profile.id, metadata.ticket.project_id, 'workspace', { ...profile.identity, accountId: second.ticket.id }));
});
test('explicit project review preserves bindings, requires a new ID for legacy sources and never broadens version 3', () => {
  const old = normalizeWorkspaceSource(radarSessionSourcePreview(metadata, 'radar-projects', 'Original label'));
  assert.equal(old.schemaVersion, 3);
  assert.deepEqual(matchingWorkspaceSources([{ ...old, enabled: true }], url(second)), []);
  assert.throws(() => radarProjectSourcePreview(metadata, old.id, 'New label', old));
  const first = source(); const added = radarProjectSourcePreview({ ...second,
    ticket: { ...second.ticket, project_id: accountId } }, first.id, 'Second project', first);
  assert.equal(added.enabled, false); assert.equal(added.projects.length, 2); assert.equal(first.projects.length, 1);
  assert.equal(added.routes.length, 1);
  assert.throws(() => radarProjectSourcePreview({ ...metadata, accountId: second.ticket.id }, first.id, 'Wrong account', first), { code: 'account-changed' });
});
test('closed session schema rejects arbitrary reads, missing/duplicate projects, credentials and generic transport', async () => {
  const profile = source();
  for (const changes of [{ projects: [] }, { projects: [profile.projects[0], profile.projects[0]] },
    { projects: [{ id: '42', name: 'No UUID' }] }, { credentials: [{ id: 'token', headerName: 'Authorization' }] },
    { routes: [{ ...profile.routes[0], steps: [{ request: { url: 'https://radar.sdg.la/api/me' } }] }] },
    { identity: { ...profile.identity, provider: 'shortcut' } }, { permissionOrigins: ['https://other.example/*'] }]) {
    assert.throws(() => normalizeWorkspaceSource({ ...profile, ...changes }));
  }
  const [match] = matchingWorkspaceSources([profile], url(metadata));
  await assert.rejects(resolveWorkspaceSourceMatch(match, {}, () => assert.fail('No generic session request')), { code: 'extension-session-required' });
  const imported = settingsImportChanges({}, createBackup({ workspaceSources: [profile] }).settings);
  assert.equal(imported.workspaceSources[0].schemaVersion, 4); assert.equal(imported.workspaceSources[0].enabled, false);
  assert.deepEqual(imported.workspaceSourceSecrets, {});
});
test('isolated native reader accepts an account-scoped dynamic ticket without inventing a number or project request', async () => {
  const responses = [{ email: 'synthetic@example.test' }, { me: { email: 'synthetic@example.test' },
    users: [{ id: accountId, email: 'synthetic@example.test', team_workspace_id: fixture.workspaceId }] }, { ticket: second.ticket }];
  const calls = []; const window = {}; window.top = window;
  const context = vm.createContext({ window, location: new URL(url(second)), AbortController, TextDecoder, setTimeout, clearTimeout,
    async fetch(request, options) { calls.push(request); return new Response(JSON.stringify(responses.shift()),
      { headers: { 'Content-Type': 'application/json' } }); } });
  const expected = { id: second.ticket.id, accountId, workspaceId: fixture.workspaceId };
  const result = await vm.runInContext(`(${readRadarMetadataInTab.toString()})(${JSON.stringify(expected)})`, context);
  assert.equal(result.status, 'read'); assert.equal(result.ticket.number, 43); assert.equal(calls.length, 3);
  assert.equal(calls[2], `https://radar.sdg.la/api/reads?op=ticket-get&id=${second.ticket.id}&include=page`);
});
