import assert from 'node:assert/strict';
import test from 'node:test';
import { createTrafficDiagnostic, diagnosticSummary, TRAFFIC_KEY } from '../traffic-diagnostic.js';
import { resolveWorkspaceSourceMatch, shortcutWorkspaceSource, matchingWorkspaceSources } from '../sources.js';

function fixture() {
  let now = 1000;
  const values = {};
  let writes = 0;
  const storage = {
    async get(key) { return structuredClone({ [key]: values[key] }); },
    async set(value) { writes++; Object.assign(values, structuredClone(value)); },
  };
  return { values, storage, tick: (ms) => { now += ms; }, clock: () => now, writes: () => writes,
    diagnostic: createTrafficDiagnostic(storage, () => now) };
}
const settled = async (diagnostic) => { await new Promise((resolve) => setImmediate(resolve)); return diagnostic.command('get'); };

test('opt-in recording adds no transport calls and stores no request content', async () => {
  const f = fixture(); let calls = 0;
  const response = { status: 200 };
  const fetch = f.diagnostic.wrapFetch('story-navigation', async () => { calls++; return response; });
  assert.equal(await fetch('https://private.example/secret', { headers: { Authorization: 'private-token' } }), response);
  await settled(f.diagnostic); assert.equal(f.writes(), 0);
  await f.diagnostic.command('browsing');
  await fetch('https://private.example/secret', { headers: { Authorization: 'private-token' } });
  const report = await settled(f.diagnostic);
  assert.equal(calls, 2); assert.equal(report.periods[0].requests, 1); assert.equal(report.periods[0].completed, 1);
  assert.deepEqual(report.periods[0].reasons, { 'story-navigation': 1 });
  assert.doesNotMatch(JSON.stringify(f.values), /private|secret|Authorization/);
});

test('idle period survives worker recreation and measures elapsed time without a heartbeat', async () => {
  const f = fixture(); await f.diagnostic.command('browsing'); f.tick(10 * 60000);
  await f.diagnostic.command('idle'); f.tick(31 * 60000);
  const restarted = createTrafficDiagnostic(f.storage, f.clock);
  const report = await restarted.command('get');
  assert.equal(report.periods[0].endedAt, 601000);
  assert.match(diagnosticSummary(report), /no evidence that Switchr is needed/);
  assert.equal(f.writes(), 2);
});

test('requests finishing after a phase switch belong to their original phase', async () => {
  const f = fixture(); await f.diagnostic.command('browsing');
  let finish;
  const request = f.diagnostic.wrapFetch('manual-fix', () => new Promise((resolve) => { finish = resolve; }))();
  await f.diagnostic.command('idle'); finish({ status: 503 }); await request;
  const report = await settled(f.diagnostic);
  assert.equal(report.periods[0].requests, 1); assert.equal(report.periods[0].failed, 1);
  assert.equal(report.periods[1].requests, 0);
});

test('storage errors never fail a successful request and network errors stay unchanged', async () => {
  const f = fixture(); await f.diagnostic.command('idle');
  f.storage.set = async () => { throw new Error('disk'); };
  const response = { status: 304 };
  assert.equal(await f.diagnostic.wrapFetch('private-reason', async () => response)(), response);
  const error = new Error('private-server-message');
  await assert.rejects(f.diagnostic.wrapFetch('private-reason', async () => { throw error; })(), (actual) => actual === error);
  const report = await settled(f.diagnostic);
  assert.equal(report.incomplete, true); assert.equal(report.periods[0].failed, 1);
  assert.deepEqual(report.periods[0].reasons, { unknown: 2 });
  assert.doesNotMatch(JSON.stringify(report), /private/);
  assert.match(diagnosticSummary(report), /incomplete/);
});

test('24-hour limit stops recording and clear recovers an unknown schema', async () => {
  const f = fixture(); await f.diagnostic.command('idle'); f.tick(24 * 3600000);
  await f.diagnostic.wrapFetch('story-ready', async () => ({ status: 200 }))();
  const report = await settled(f.diagnostic);
  assert.equal(report.periods[0].requests, 0); assert.notEqual(report.periods[0].endedAt, null);
  await assert.rejects(f.diagnostic.command('browsing'), /24 hours/);
  f.values[TRAFFIC_KEY] = { schema: 99 };
  const fresh = createTrafficDiagnostic(f.storage, f.clock);
  await assert.rejects(fresh.command('get'), /Unreadable/);
  assert.equal((await fresh.command('clear')).periods.length, 0);
});

test('real source resolver records each HTTP step without changing request behavior', async () => {
  const f = fixture(); await f.diagnostic.command('browsing');
  const source = shortcutWorkspaceSource({ enabled: true });
  const match = matchingWorkspaceSources([source], 'https://app.shortcut.com/workspace/story/123')[0];
  let calls = 0;
  const fetch = f.diagnostic.wrapFetch('manual-fix', async () => {
    calls++;
    return { ok: true, status: 200, json: async () => calls === 1 ? { epic_id: 456, name: 'Private ticket' } : { id: 456, name: 'Private workspace' } };
  });
  const result = await resolveWorkspaceSourceMatch(match, { apiToken: 'secret-token' }, fetch);
  assert.equal(result.status, 'resolved'); assert.equal(calls, 2);
  const report = await settled(f.diagnostic);
  assert.equal(report.periods[0].requests, 2); assert.equal(report.periods[0].completed, 2);
  assert.doesNotMatch(JSON.stringify(report), /Private|123|456|secret/);
});
