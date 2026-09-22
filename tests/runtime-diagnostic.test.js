import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeDiagnostic } from '../runtime-diagnostic.js';

test('runtime capture is bounded, expiring and excludes browsing content and arbitrary errors', () => {
  let at = 1000;
  const diagnostic = createRuntimeDiagnostic(() => at);
  for (let i = 0; i < 200; i += 1) {
    diagnostic.record('routing', { reason: 'moved', tabId: i, sourceWindowId: 2, destinationWindowId: 1,
      url: 'https://private.example/secret', title: 'private', error: 'private', durationMs: Infinity });
  }
  const report = diagnostic.command('get');
  assert.equal(report.events.length, 128);
  assert.equal(report.dropped, 72);
  assert.equal(JSON.stringify(report).includes('private'), false);
  assert.equal('durationMs' in report.events[0], false);
  report.events[0].reason = 'modified';
  assert.equal(diagnostic.command('get').events[0].reason, 'moved');
  at += 300001;
  diagnostic.record('routing', { reason: 'moved' });
  assert.equal(diagnostic.command('get').active, false);
  assert.equal(diagnostic.command('get').events.length, 128);
  diagnostic.command('start');
  diagnostic.record('routing', { reason: 'raw private error' });
  assert.equal('reason' in diagnostic.command('get').events[0], false);
  diagnostic.command('stop');
  diagnostic.record('created', {});
  assert.equal(diagnostic.command('get').events.length, 1);
  assert.equal(diagnostic.command('clear').events.length, 0);
});

test('diagnostic endpoint responds even when Chrome storage and window enumeration stall', async () => {
  let listener;
  const pending = () => new Promise(() => {});
  const event = () => ({ addListener() {} });
  globalThis.chrome = {
    storage: { local: { get: pending }, session: { get: pending }, onChanged: event() },
    windows: { getAll: pending, onRemoved: event() },
    tabs: { onCreated: event(), onUpdated: event(), onDetached: event(), onAttached: event(), onRemoved: event() },
    tabGroups: { onCreated: event(), onMoved: event() },
    runtime: { onMessage: { addListener(value) { listener = value; } }, getManifest() { return { version: 'test' }; } },
  };
  try {
    await import('../background.js?diagnostic=stalled-api');
    let response;
    const asyncResponse = listener({ type: 'RUNTIME_DIAGNOSTIC', action: 'get' }, {}, (value) => { response = value; });
    assert.equal(asyncResponse, false);
    assert.equal(response.ok, true);
    assert.equal(response.version, 'test');
  } finally { delete globalThis.chrome; }
});
