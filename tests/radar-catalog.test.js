import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { inspectRadarCatalogInTab, inspectRadarCatalog, radarCatalogSourcePreview,
  saveRadarCatalogExpansion, undoRadarCatalogExpansion, RADAR_CATALOG_ROLLBACK_KEY } from '../radar-catalog.js';
import { radarProjectSourcePreview } from '../radar-session.js';
import { createBackup, settingsImportChanges } from '../backup.js';
const scope = { accountId: '44444444-4444-4444-8444-444444444444', workspaceId: '11111111-1111-4111-8111-111111111111' };
const project = { id: '22222222-2222-4222-8222-222222222222', name: 'Synthetic native name', workspace_id: scope.workspaceId };
const second = { id: '33333333-3333-4333-8333-333333333333', name: 'Synthetic second', workspace_id: scope.workspaceId };
const source = () => ({ ...radarProjectSourcePreview({ status: 'read', ...scope,
  ticket: { id: '55555555-5555-4555-8555-555555555555', number: 42, project_id: project.id, workspace_id: scope.workspaceId } },
  'radar-demo', 'Reviewed custom label'), enabled: true });
async function inspect({ status = 200, change = () => {}, move = false } = {}) {
  let calls = 0; const requests = [];
  const payloads = [{ email: 'synthetic@example.test' }, { me: { email: 'synthetic@example.test' },
    users: [{ id: scope.accountId, email: 'synthetic@example.test', team_workspace_id: scope.workspaceId }],
    projects: [{ ...project, private_extra: 'synthetic-private-content' }, { ...second }], agents: [], pipelines: [], ticketStates: [] }];
  change(payloads);
  const window = {}; window.top = window;
  const location = new URL('https://radar.sdg.la/');
  const context = vm.createContext({ window, location, AbortController, TextDecoder, setTimeout, clearTimeout,
    async fetch(url, options) { requests.push({ url, method: options.method, credentials: options.credentials });
      if (move) location.href = 'https://radar.sdg.la/login';
      return new Response(JSON.stringify(payloads[calls++]), { status, headers: { 'Content-Type': 'application/json' } }); } });
  const result = await vm.runInContext(`(${inspectRadarCatalogInTab.toString()})(${JSON.stringify(scope)})`, context);
  return { result: JSON.parse(JSON.stringify(result)), requests };
}
test('catalog projects are native ID/name projections, scope verified through two fixed GETs', async () => {
  const { result, requests } = await inspect(); assert.equal(result.status, 'catalog-read'); assert.equal(requests.length, 2);
  assert.deepEqual(result.projects, [project, second].map(({ id, name }) => ({ id, name })));
  assert.equal(requests.every((request) => request.method === 'GET' && request.credentials === 'same-origin'), true);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-private|synthetic@example|private_extra/);
});
test('catalog authentication failure stops immediately without retries or empty-success fallback', async () => {
  const { result, requests } = await inspect({ status: 401 }); assert.equal(result.code, 'authentication-expired');
  assert.equal(result.stage, 'viewer'); assert.equal(result.requestCount, 1); assert.equal(requests.length, 1);
});
for (const [name, change, code] of [
  ['other workspace', p => { p[1].projects[0].workspace_id = scope.accountId; }, 'project-scope-mismatch'],
  ['viewer mismatch', p => { p[1].me.email = 'other@example.test'; }, 'account-changed'],
  ['duplicate project IDs', p => { p[1].projects.push(p[1].projects[0]); }, 'catalog-shape-changed'],
  ['missing native name', p => { delete p[1].projects[0].name; }, 'project-scope-mismatch'],
  ['empty catalog', p => { p[1].projects = []; }, 'catalog-shape-changed'],
  ['new pagination indicator', p => { p[1].nextCursor = 'synthetic'; }, 'catalog-shape-changed'],
]) test(`catalog fails closed for ${name}`, async () => {
  assert.equal((await inspect({ change })).result.code, code);
});
test('navigation invalidates catalog even after a successful response', async () => {
  assert.equal((await inspect({ move: true })).result.code, 'context-changed');
});
test('catalog wrapper checks permission before tab reads and stops after failed native renewal', async () => {
  let reads = 0;
  await assert.rejects(inspectRadarCatalog({ permissions: { async contains() { return false; } },
    tabs: { async query() { reads += 1; } } }, source())); assert.equal(reads, 0);
  const worlds = [];
  await assert.rejects(inspectRadarCatalog({ permissions: { async contains() { return true; } },
    tabs: { async query() { return [{ id: 9, url: 'https://radar.sdg.la/' }]; }, async get() { return { url: 'https://radar.sdg.la/' }; } },
    scripting: { async executeScript(request) { worlds.push(request.world); return [{ frameId: 0, result: { status: 'unavailable', code: 'authentication-expired' } }]; } },
  }, source()), { code: 'authentication-expired' });
  assert.deepEqual(worlds, ['MAIN']);
});
test('review expands by native ID, keeps reviewed labels, and rejects account changes or duplicate catalog IDs', async () => {
  const before = source(); const { result } = await inspect(); const preview = radarCatalogSourcePreview(before, result);
  assert.equal(before.projects.length, 1); assert.equal(preview.enabled, false); assert.equal(preview.projects.length, 2);
  assert.equal(preview.projects[0].name, 'Reviewed custom label');
  assert.throws(() => radarCatalogSourcePreview(before, { ...result, accountId: project.id }));
  assert.throws(() => radarCatalogSourcePreview(before, { ...result, projects: [result.projects[0], result.projects[0]] }));
  const backup = createBackup({ workspaceSources: [{ ...preview, enabled: true }] });
  assert.equal(settingsImportChanges({}, backup.settings).workspaceSources[0].enabled, false);
});
function storageFixture(before) {
  // Native storage need not preserve the producer's dictionary property order.
  const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).reverse().map(key => [key, reorder(value[key])])) : value;
  const state = { workspaceSources: [structuredClone(before), { id: 'shortcut-unchanged', enabled: true }],
    pinnedProtection: true, manualProtection: true, pause: ['synthetic-window'], focus: 'synthetic-focus',
    rules: [{ prefix: 'https://app.shortcut.com/synthetic/' }], activity: ['synthetic-undo'], automatic: true };
  const writes = [];
  const chrome = { storage: { local: {
    async get(keys) { return reorder(structuredClone(Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, state[key]])))); },
    async set(values) { writes.push(Object.keys(values));
      Object.assign(state, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, structuredClone(value)]))); },
    async remove(key) { delete state[key]; },
  } } };
  return { state, writes, chrome };
}
test('expansion and rollback change only one source, retain protections/Shortcut/history, and preserve intervening other-source edits', async () => {
  const before = source(); const { result } = await inspect();
  const after = { ...radarCatalogSourcePreview(before, result), enabled: true };
  const f = storageFixture(before); const baseline = structuredClone(f.state);
  await saveRadarCatalogExpansion(f.chrome, before, after);
  assert.equal(f.state.workspaceSources[0].projects.length, 2);
  assert.deepEqual(f.writes[0], ['workspaceSources', RADAR_CATALOG_ROLLBACK_KEY]);
  f.state.workspaceSources[1].name = 'Intervening other-source edit';
  await undoRadarCatalogExpansion(f.chrome);
  assert.deepEqual(f.state.workspaceSources[0], before); assert.equal(f.state.workspaceSources[1].name, 'Intervening other-source edit');
  for (const key of Object.keys(baseline).filter(key => key !== 'workspaceSources')) assert.deepEqual(f.state[key], baseline[key]);
  assert.equal(f.state[RADAR_CATALOG_ROLLBACK_KEY], undefined);
});
test('stale review and stale rollback refuse to overwrite newer source edits', async () => {
  const before = source(); const { result } = await inspect();
  const after = { ...radarCatalogSourcePreview(before, result), enabled: true };
  const f = storageFixture(before); f.state.workspaceSources[0].name = 'New edit';
  await assert.rejects(saveRadarCatalogExpansion(f.chrome, before, after)); assert.equal(f.writes.length, 0);
  f.state.workspaceSources[0] = before; await saveRadarCatalogExpansion(f.chrome, before, after);
  f.state.workspaceSources[0].enabled = false;
  await assert.rejects(undoRadarCatalogExpansion(f.chrome)); assert.equal(f.state.workspaceSources[0].enabled, false);
});
test('expansion cannot rename/remove prior bindings, change precedence, or introduce a new request', async () => {
  const before = source(); const { result } = await inspect();
  const after = { ...radarCatalogSourcePreview(before, result), enabled: true };
  for (const changed of [
    { ...after, projects: after.projects.slice(1) },
    { ...after, projects: after.projects.map(project => ({ ...project, name: 'Unreviewed rename' })) },
    { ...after, precedence: 'before-rules' },
    { ...after, routes: [{ ...after.routes[0], steps: [{ ...after.routes[0].steps[0], request: { method: 'POST', url: 'https://radar.sdg.la/api/me' } }] }] },
  ]) {
    const f = storageFixture(before);
    await assert.rejects(saveRadarCatalogExpansion(f.chrome, before, changed)); assert.equal(f.writes.length, 0);
  }
});
