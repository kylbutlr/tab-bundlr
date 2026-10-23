import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceResolver } from '../source-resolver.js';
import { normalizeWorkspaceSource } from '../sources.js';
const source = normalizeWorkspaceSource({ schemaVersion: 1, id: 'tracker', name: 'Tracker', enabled: true,
  permissionOrigins: ['https://api.example/*'], routes: [{ id: 'item', pagePattern: 'https://example.com/{id}',
    steps: [{ request: { url: 'https://api.example/{id}' }, extract: { name: 'name' } }],
    placement: { workspaceId: '{id}', workspaceName: '{name}' } }] });
const match = (id = '42') => ({ source, route: source.routes[0], captures: { id } });

test('connection resolver shares in-flight requests, expires success and isolates invalidated requests', async () => {
  let calls = 0;
  let at = 0;
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const resolver = createSourceResolver(() => async () => {
    calls += 1; await blocked;
    return { ok: true, async json() { return { name: 'Project' }; } };
  }, { clock: () => at });
  const first = resolver.resolve(match(), {}, 'manual-fix');
  assert.equal(first, resolver.resolve(match(), {}, 'startup-sync'));
  assert.equal(calls, 1);
  resolver.clear();
  const second = resolver.resolve(match(), {}, 'manual-fix');
  assert.notEqual(first, second);
  release(); await Promise.all([first, second]);
  assert.equal(calls, 2);
  await resolver.resolve(match(), {}, 'manual-fix');
  assert.equal(calls, 2);
  at = 300001;
  await resolver.resolve(match(), {}, 'manual-fix');
  assert.equal(calls, 3);
});

test('connection resolver briefly caches failure and bounds cached destinations', async () => {
  let calls = 0;
  let at = 0;
  const resolver = createSourceResolver(() => async () => { calls += 1; throw new Error('Offline'); }, { clock: () => at, maxEntries: 2 });
  await assert.rejects(resolver.resolve(match('1'), {}), /Offline/);
  await assert.rejects(resolver.resolve(match('1'), {}), /Offline/);
  assert.equal(calls, 1);
  at = 30001;
  await assert.rejects(resolver.resolve(match('1'), {}), /Offline/);
  await assert.rejects(resolver.resolve(match('2'), {}), /Offline/);
  await assert.rejects(resolver.resolve(match('3'), {}), /Offline/);
  await assert.rejects(resolver.resolve(match('1'), {}), /Offline/);
  assert.equal(calls, 5);
});
