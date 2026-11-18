import assert from 'node:assert/strict';
import test from 'node:test';

const home = 'https://work.example.test/';
const login = 'https://work.example.test/login';
const event = () => ({ addListener() {} });
const area = (values) => ({
  async get(keys) {
    return Object.fromEntries((Array.isArray(keys) ? keys : [keys])
      .filter((key) => Object.hasOwn(values, key)).map((key) => [key, values[key]]));
  },
  async set(next) { Object.assign(values, next); },
  async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key]; },
});

async function fixture(label) {
  const local = { persistentHomeBases: [home] };
  const session = {
    sessionReconciled: true, persistentHomeBasesReconciled: true,
    persistentHomeBaseAnchors: { 1: home },
  };
  const tabs = [{ id: 1, windowId: 9, index: 0, groupId: -1, active: true, pinned: false, url: home }];
  const created = [];
  globalThis.chrome = {
    storage: { local: area(local), session: area(session), onChanged: event() },
    tabs: {
      async query() { return tabs.map((tab) => ({ ...tab })); },
      async create(properties) {
        const tab = { ...properties, id: 100 + created.length, windowId: 9, index: tabs.length, groupId: -1, pinned: false };
        created.push(tab); tabs.push(tab); return { ...tab };
      },
      async remove() { assert.fail('Redirect protection must not close user tabs'); },
      onCreated: event(), onUpdated: event(), onActivated: event(),
      onDetached: event(), onAttached: event(), onRemoved: event(),
    },
    tabGroups: { async query() { return []; }, onCreated: event(), onMoved: event() },
    windows: { async getAll() { return []; }, async getCurrent() { return { id: 9 }; }, onRemoved: event() },
    runtime: { onMessage: event(), openOptionsPage() {} },
  };
  const load = async (suffix) => {
    const { TabBundlrBackground: worker } = await import(`../background.js?redirect-regression=${label}-${suffix}`);
    await worker.initializeForSession();
    return worker;
  };
  const worker = await load('initial');
  const navigate = async (tab, url, target = worker) => {
    tab.url = url;
    return target.handlePersistentHomeBaseTabUpdate({ url }, { ...tab });
  };
  return { local, session, tabs, created, worker, load, navigate };
}

test('an automatically restored home base cannot reproduce itself through sign-in redirects', async () => {
  const f = await fixture('redirect-chain');
  try {
    await f.navigate(f.tabs[0], login);
    assert.equal(f.created.length, 1, 'An original tab may receive one replacement');
    for (let index = 0; index < 20; index += 1) await f.navigate(f.tabs.at(-1), login);
    assert.equal(f.created.length, 1, 'Repeated redirects must not spawn replacement chains');
    assert.equal(f.tabs.length, 2);
    assert.deepEqual(f.local.persistentHomeBases, [home], 'Do not replace the saved home base with sign-in');
  } finally { delete globalThis.chrome; }
});

test('redirect suspension survives a worker restart and closing the failed replacement', async () => {
  const f = await fixture('restart');
  try {
    await f.navigate(f.tabs[0], login);
    const replacement = f.created[0];
    await f.navigate(replacement, login);
    const restarted = await f.load('restarted');
    await f.navigate(replacement, login, restarted);
    f.tabs.splice(f.tabs.indexOf(replacement), 1);
    await restarted.handlePersistentHomeBaseTabRemoved(replacement.id, { windowId: 9 });
    assert.equal(f.created.length, 1, 'Closing a failed replacement must not rearm the loop');
    assert.deepEqual(f.local.persistentHomeBases, [home]);
  } finally { delete globalThis.chrome; }
});

test('a real matching tab recovers the saved home base without a timer retry', async () => {
  const f = await fixture('recovery');
  try {
    await f.navigate(f.tabs[0], login);
    await f.navigate(f.created[0], login);
    const recovered = { id: 500, windowId: 9, index: 2, groupId: -1, active: true, pinned: false, url: home };
    f.tabs.push(recovered);
    await f.navigate(recovered, home);
    await f.navigate(recovered, 'https://work.example.test/items/synthetic');
    assert.equal(f.created.length, 2, 'A separately opened matching tab rearms normal restoration');
    assert.equal(f.tabs.filter((tab) => tab.url === home).length, 1);
  } finally { delete globalThis.chrome; }
});

test('closing a healthy replacement still restores the home base', async () => {
  const f = await fixture('healthy-close');
  try {
    await f.navigate(f.tabs[0], 'https://work.example.test/items/synthetic');
    const replacement = f.created[0];
    f.tabs.splice(f.tabs.indexOf(replacement), 1);
    await f.worker.handlePersistentHomeBaseTabRemoved(replacement.id, { windowId: 9 });
    assert.equal(f.created.length, 2);
    assert.equal(f.tabs.filter((tab) => tab.url === home).length, 1);
  } finally { delete globalThis.chrome; }
});
