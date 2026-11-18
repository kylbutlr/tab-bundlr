import assert from 'node:assert/strict';
import test from 'node:test';
import { restoreSessionHandoff, SESSION_HANDOFF_KEY } from '../session-handoff.js';

function fixture(handoff) {
  const session = {};
  const local = handoff ? { [SESSION_HANDOFF_KEY]: handoff } : {};
  return { session, local, chrome: { windows: { async getAll() { return [{ id: 9 }]; } }, storage: {
    local: { async get() { return local; }, async remove(key) { delete local[key]; } },
    session: { async set(values) { Object.assign(session, values); } },
  } } };
}
const fresh = () => ({ version: 1, createdAt: 1000, windowIds: [9], session: {
  pausedWindowIds: [9], focusHeldTabs: { 4: { groupId: 8 } }, windowAutomationMode: 'selected', selectedWindowIds: [9],
  workspaceSourceSecrets: { token: 'synthetic-do-not-restore' }, tabBundlrEnabled: false,
} });
test('fresh same-window update restores protections once and suppresses startup replay', async () => {
  const f = fixture(fresh());
  assert.deepEqual(await restoreSessionHandoff(f.chrome, 1100), { restored: true });
  assert.deepEqual(f.session.pausedWindowIds, [9]);
  assert.deepEqual(f.session.focusHeldTabs, { 4: { groupId: 8 } });
  assert.equal(f.session.sessionReconciled, true);
  assert.equal(f.session.persistentHomeBasesReconciled, true);
  assert.equal(f.session.workspaceSourceSecrets, undefined);
  assert.equal(f.session.tabBundlrEnabled, undefined);
  assert.equal(f.local[SESSION_HANDOFF_KEY], undefined);
  assert.deepEqual(await restoreSessionHandoff(f.chrome, 1100), { restored: false });
});
test('absent handoff leaves ordinary startup and storage untouched', async () => {
  const f = fixture();
  assert.deepEqual(await restoreSessionHandoff(f.chrome, 1100), { restored: false });
  assert.deepEqual(f.session, {});
});
for (const invalid of [
  (value) => { value.createdAt = -400000; },
  (value) => { value.createdAt = 2000; },
  (value) => { value.windowIds = [10]; },
  (value) => { value.version = 2; },
]) test('stale or changed-window update fails before restoring or consuming the handoff', async () => {
  const handoff = fresh(); invalid(handoff); const f = fixture(handoff);
  await assert.rejects(restoreSessionHandoff(f.chrome, 1100));
  assert.deepEqual(f.session, {});
  assert.deepEqual(f.local[SESSION_HANDOFF_KEY], handoff);
});
