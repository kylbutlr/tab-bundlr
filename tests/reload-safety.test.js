import assert from 'node:assert/strict';
import test from 'node:test';
import { armReadOnlyReload, restoreReadOnlyReload, READ_ONLY_RELOAD_KEY } from '../reload-safety.js';
function fixture() {
  const local = {}; const session = { pausedWindowIds: [9], focusHeldTabs: { 2: 10 },
    persistentHomeBaseRestorations: { 'https://synthetic.example/': { tabId: 2, redirected: true } },
    unrelatedCredential: 'synthetic-secret' };
  let reloads = 0;
  const area = (values) => ({ async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys])
    .filter((key) => Object.hasOwn(values, key)).map((key) => [key, structuredClone(values[key])])); },
    async set(changes) { Object.assign(values, structuredClone(changes)); }, async remove(key) { delete values[key]; } });
  return { local, session, get reloads() { return reloads; }, chrome: { storage: { local: area(local), session: area(session) },
    runtime: { reload() { reloads += 1; } } } };
}
test('explicit reload snapshots only selected session protections, restores them before startup and consumes the snapshot', async () => {
  const f = fixture(); await armReadOnlyReload(f.chrome);
  assert.equal(f.reloads, 1);
  assert.equal(JSON.stringify(f.local).includes('synthetic-secret'), false);
  for (const key of Object.keys(f.session)) delete f.session[key];
  const guard = await restoreReadOnlyReload(f.chrome);
  assert.equal(guard.held, true); assert.deepEqual(f.session.pausedWindowIds, [9]);
  assert.deepEqual(f.session.focusHeldTabs, { 2: 10 });
  assert.equal(f.session.persistentHomeBaseRestorations['https://synthetic.example/'].redirected, true);
  assert.equal(f.session.sessionReconciled, true); assert.equal(f.session.persistentHomeBasesReconciled, true);
  assert.deepEqual(f.local[READ_ONLY_RELOAD_KEY], { version: 1, held: true });
  await guard.finish(); assert.equal(guard.held, false); assert.equal(f.local[READ_ONLY_RELOAD_KEY], undefined);
  assert.deepEqual(f.session.pausedWindowIds, [9]);
});
test('normal startup remains unchanged and stale browser-session IDs are never restored', async () => {
  const f = fixture(); assert.equal((await restoreReadOnlyReload(f.chrome)).held, false);
  f.local[READ_ONLY_RELOAD_KEY] = { version: 1, held: true, createdAt: 0, session: { pausedWindowIds: [77] } };
  const guard = await restoreReadOnlyReload(f.chrome, () => 300001);
  assert.equal(guard.held, true); assert.deepEqual(f.session.pausedWindowIds, [9]);
});

test('real worker holds startup and automatic tab handlers until explicit finish', async () => {
  const f = fixture(); await armReadOnlyReload(f.chrome);
  const event = () => ({ listeners: [], addListener(listener) { this.listeners.push(listener); } });
  const created = event(), updated = event(), messages = event();
  let tabReads = 0;
  f.chrome.tabs = { async query() { tabReads += 1; return []; }, onCreated: created, onUpdated: updated,
    onActivated: event(), onDetached: event(), onAttached: event(), onRemoved: event() };
  f.chrome.tabGroups = { async query() { return []; }, onCreated: event(), onMoved: event() };
  f.chrome.windows = { async getAll() { return [{ id: 9 }]; }, onRemoved: event() };
  f.chrome.storage.onChanged = event();
  f.chrome.runtime = { id: 'a'.repeat(32), getURL: (path) => `chrome-extension://${'a'.repeat(32)}/${path}`, onMessage: messages };
  f.local.settingsVersion = 2;
  globalThis.chrome = f.chrome;
  try {
    const { TabBundlrBackground: worker } = await import('../background.js?read-only-reload');
    const result = await worker.initializeForSession();
    assert.equal(result.readOnlyPreview, true); assert.equal(tabReads, 0);
    created.listeners[0]({ id: 2, windowId: 9, url: 'https://synthetic.example/' });
    updated.listeners[0](2, { url: 'https://synthetic.example/login' }, { id: 2, windowId: 9 });
    await new Promise(setImmediate); assert.equal(tabReads, 0);
    const sender = { id: f.chrome.runtime.id, url: f.chrome.runtime.getURL('options.html') };
    const blocked = await new Promise((resolve) => messages.listeners[0]({ type: 'SYNC_NOW' }, sender, resolve));
    assert.equal(blocked.code, 'read-only-preview');
    const finished = await new Promise((resolve) => messages.listeners[0]({ type: 'READ_ONLY_PREVIEW_FINISH' }, sender, resolve));
    assert.equal(finished.ok, true); assert.equal(finished.held, false); assert.equal(tabReads, 0);
  } finally { delete globalThis.chrome; }
});
