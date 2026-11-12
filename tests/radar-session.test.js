import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { readRadarMetadataInTab, createRadarSessionReader, radarSessionSourcePreview,
  resolveRadarSessionMatch, RADAR_SESSION_PERMISSIONS } from '../radar-session.js';
import { normalizeWorkspaceSource, matchingWorkspaceSources, resolveWorkspaceSourceMatch } from '../sources.js';
import { createBackup, settingsImportChanges } from '../backup.js';

const fixture = JSON.parse(await readFile(new URL('./fixtures/radar-source.json', import.meta.url)));
const userId = '44444444-4444-4444-8444-444444444444';
const ticket = fixture.tickets[0];
const url = `https://radar.sdg.la/tickets/${ticket.id}`;
const metadata = { status: 'read', accountId: userId, workspaceId: ticket.workspace_id,
  ticket: { id: ticket.id, number: ticket.number, project_id: ticket.project_id, workspace_id: ticket.workspace_id } };
const source = () => normalizeWorkspaceSource(radarSessionSourcePreview(metadata, 'radar-demo', 'Reviewed label'));
const expected = { id: ticket.id, number: ticket.number, projectId: ticket.project_id,
  workspaceId: ticket.workspace_id, accountId: userId };
async function inTab({ status = 200, change = () => {}, path = url, expectation = null, fetchChange } = {}) {
  const calls = [];
  const payloads = [{ email: 'synthetic@example.test' },
    { me: { email: 'synthetic@example.test' }, users: [{ id: userId, email: 'synthetic@example.test', team_workspace_id: ticket.workspace_id }] },
    { ticket: { ...ticket }, description: { body_md: 'synthetic-private-body' }, events: [{ payload: 'synthetic-private-event' }] }];
  change(payloads);
  const location = new URL(path);
  const window = {}; window.top = window;
  const context = vm.createContext({ location, window, AbortController, TextDecoder, setTimeout, clearTimeout,
    async fetch(requestUrl, options) {
      calls.push({ url: requestUrl, options });
      if (fetchChange) return fetchChange(calls.length, location);
      return new Response(JSON.stringify(payloads[calls.length - 1]), { status, headers: { 'Content-Type': 'application/json' } });
    } });
  const result = await vm.runInContext(`(${readRadarMetadataInTab.toString()})(${JSON.stringify(expectation)})`, context);
  return { result: JSON.parse(JSON.stringify(result)), calls };
}

test('isolated function reads three fixed GETs and exports only selected grouping metadata', async () => {
  const { result, calls } = await inTab();
  assert.deepEqual(result, metadata);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((call) => call.url), ['https://radar.sdg.la/api/me',
    'https://radar.sdg.la/api/reads?op=bootstrap', `https://radar.sdg.la/api/reads?op=ticket-get&id=${ticket.id}&include=page`]);
  for (const { options } of calls) {
    assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'same-origin');
    assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
    assert.deepEqual(Object.keys(options.headers), ['Accept']);
  }
  assert.doesNotMatch(JSON.stringify(result), /email|body|event|shortcut|author|actor|cookie|token/i);
});
for (const [status, code] of [[401, 'authentication-expired'], [403, 'access-denied'], [428, 'verification-required'], [429, 'rate-limited']]) {
  test(`session status ${status} stops after one request without retries or content leakage`, async () => {
    const { result, calls } = await inTab({ status });
    assert.deepEqual(result, { status: 'unavailable', code }); assert.equal(calls.length, 1);
  });
}
for (const [name, change, code] of [
  ['viewer mismatch', (p) => { p[1].me.email = 'different@example.test'; }, 'identity-unavailable'],
  ['ambiguous native user', (p) => { p[1].users.push(p[1].users[0]); }, 'identity-unavailable'],
  ['removed viewer', (p) => { p[1].users[0].removed = true; }, 'identity-unavailable'],
  ['other workspace', (p) => { p[2].ticket.workspace_id = userId; }, 'ticket-scope-mismatch'],
  ['deleted record', (p) => { p[2].ticket.deleted_at = 'synthetic-date'; }, 'ticket-scope-mismatch'],
  ['missing project', (p) => { p[2].ticket.project_id = null; }, 'ticket-scope-mismatch'],
]) test(`fails closed for ${name}`, async () => {
  assert.equal((await inTab({ change })).result.code, code);
});
test('reviewed account and project changes fail; short numbers require prior native mapping', async () => {
  assert.equal((await inTab({ expectation: { ...expected, accountId: ticket.id } })).result.code, 'account-changed');
  assert.equal((await inTab({ expectation: { ...expected, projectId: userId } })).result.code, 'ticket-scope-mismatch');
  assert.equal((await inTab({ path: 'https://radar.sdg.la/t/42' })).calls.length, 0);
  assert.deepEqual((await inTab({ path: 'https://radar.sdg.la/t/42', expectation: expected })).result, metadata);
  assert.equal((await inTab({ path: 'https://radar.sdg.la/t/43', expectation: expected })).calls.length, 0);
});
test('navigation, HTML sign-in, network errors and response limits remain unavailable', async () => {
  const html = await inTab({ fetchChange: () => new Response('<html>synthetic login</html>', { headers: { 'Content-Type': 'text/html' } }) });
  assert.equal(html.result.code, 'invalid-response'); assert.equal(html.calls.length, 1);
  const moved = await inTab({ fetchChange: (count, location) => { location.href = 'https://radar.sdg.la/login'; return new Response('{"email":"synthetic@example.test"}', { headers: { 'Content-Type': 'application/json' } }); } });
  assert.equal(moved.result.code, 'context-changed'); assert.equal(moved.calls.length, 1);
  assert.equal((await inTab({ fetchChange: () => { throw Error('synthetic-secret'); } })).result.code, 'read-unavailable');
  assert.equal((await inTab({ fetchChange: () => new Response('x'.repeat(2 * 1024 * 1024 + 1), { headers: { 'Content-Type': 'application/json' } }) })).result.code, 'response-too-large');
});
function chromeFixture({ granted = true, result = metadata, blocked = null } = {}) {
  const calls = [];
  return { calls, chrome: {
    permissions: { async contains(request) { assert.deepEqual(request, RADAR_SESSION_PERMISSIONS); return granted; } },
    tabs: { async get(id) { assert.equal(id, 9); return { id, url }; } },
    scripting: { async executeScript(request) { calls.push(request); if (blocked) await blocked;
      return [{ frameId: 0, result }]; } },
  } };
}
test('reader targets only the selected existing tab and never creates, reloads or navigates tabs', async () => {
  const f = chromeFixture(); const read = createRadarSessionReader(f.chrome);
  assert.deepEqual(await read(9), metadata);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].target, { tabId: 9, frameIds: [0] });
  assert.equal(f.calls[0].world, 'ISOLATED');
  assert.equal(f.calls[0].func, readRadarMetadataInTab);
  const denied = chromeFixture({ granted: false });
  await assert.rejects(createRadarSessionReader(denied.chrome)(9), { code: 'permission-required' });
  assert.equal(denied.calls.length, 0);
});
test('reader coalesces concurrent work and cools down failure without retrying or caching success', async () => {
  let release; const blocked = new Promise((resolve) => { release = resolve; });
  const f = chromeFixture({ blocked }); const read = createRadarSessionReader(f.chrome);
  const first = read(9); assert.equal(read(9), first);
  release(); await first; await read(9); assert.equal(f.calls.length, 2);
  const failed = chromeFixture({ result: { status: 'unavailable', code: 'authentication-expired' } });
  const failedRead = createRadarSessionReader(failed.chrome);
  await assert.rejects(failedRead(9), { code: 'authentication-expired' });
  await assert.rejects(failedRead(9), { code: 'read-cooldown' }); assert.equal(failed.calls.length, 1);
});
test('schema 3 migration is explicit and disabled, with closed transport and versioned credential-free imports', async () => {
  const preview = source(); assert.equal(preview.enabled, false); assert.equal(preview.schemaVersion, 3);
  assert.deepEqual(preview.credentials, []);
  for (const change of [ { schemaVersion: 2 }, { permissionOrigins: ['https://other.example/*'] },
    { identity: { ...preview.identity, provider: 'shortcut' } },
    { routes: [{ ...preview.routes[0], exact: false }] },
    { routes: [{ ...preview.routes[0], steps: [{ ...preview.routes[0].steps[0], request: { url: 'https://radar.sdg.la/api/me' } }] }] },
  ]) assert.throws(() => normalizeWorkspaceSource({ ...preview, ...change }));
  const enabled = { ...preview, enabled: true };
  const [match] = matchingWorkspaceSources([enabled], url);
  await assert.rejects(resolveWorkspaceSourceMatch(match, {}, () => assert.fail('No generic session transport')), { code: 'extension-session-required' });
  const result = await resolveRadarSessionMatch(match, { id: 9 }, async (id, scoped) => {
    assert.equal(id, 9); assert.deepEqual(scoped, expected); return metadata;
  });
  assert.equal(result.workspaceName, 'Reviewed label'); assert.equal(result.itemId, ticket.id);
  const backup = createBackup({ workspaceSources: [enabled] });
  const imported = settingsImportChanges({}, backup.settings);
  assert.equal(imported.workspaceSources[0].schemaVersion, 3); assert.equal(imported.workspaceSources[0].enabled, false);
  assert.deepEqual(imported.workspaceSourceSecrets, {});
});
