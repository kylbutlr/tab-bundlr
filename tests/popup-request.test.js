import assert from 'node:assert/strict';
import test from 'node:test';
import { readPopupState } from '../popup-request.js';
const flush = async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); };

test('successful reads separate tab, message, guidance, and worker timings', async () => {
  let at = 0;
  const api = {
    tabs: { query: async () => { at += 120; return [{ windowId: 7 }]; } },
    runtime: { sendMessage: async (message) => {
      assert.equal(message.windowId, 7);
      assert.equal(message.popupSentAt, 1120);
      at += 300;
      return { ok: true, popupTiming: { requestDeliveryMs: 100, workerMs: 190, responseSentAt: 1410 } };
    } },
    storage: { local: { get: async () => { at += 20; return { dismissed: true }; } } },
  };
  const data = await readPopupState(api, 'dismissed', { now: () => at, wallNow: () => 1000 + at });
  assert.deepEqual(data.timings, { tabQueryMs: 120, backgroundRoundTripMs: 300, messageMs: 420,
    requestDeliveryMs: 100, workerMs: 190, responseDeliveryMs: 10, guidanceMs: 20 });
  assert.deepEqual(data.storedGuidance, { dismissed: true });
});

test('timeout ignores a late tab result and does not issue the status request', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolveTab;
  const messages = [];
  const api = {
    tabs: { query: () => new Promise((resolve) => { resolveTab = resolve; }) },
    runtime: { sendMessage: async (message) => { messages.push(message); } },
  };
  const result = readPopupState(api, 'key');
  const rejected = assert.rejects(result, { code: 'POPUP_TIMEOUT' });
  await flush();
  t.mock.timers.tick(5000);
  await rejected;
  resolveTab([{ windowId: 7 }]);
  await flush();
  assert.deepEqual(messages.map((m) => m.type), ['POPUP_TIMING']);
});

test('deadline is shared across stages rather than five seconds per API', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolveTab;
  const api = {
    tabs: { query: () => new Promise((resolve) => { resolveTab = resolve; }) },
    runtime: { sendMessage: () => new Promise(() => {}) },
  };
  const result = readPopupState(api, 'key');
  const rejected = assert.rejects(result, /background response/);
  await flush();
  t.mock.timers.tick(4000);
  resolveTab([{ windowId: 7 }]);
  await flush();
  t.mock.timers.tick(1000);
  await rejected;
});

test('an API rejection is retained even if diagnostic reporting also throws', async () => {
  const api = {
    tabs: { query: async () => { throw new Error('Context invalidated'); } },
    runtime: { sendMessage() { throw new Error('Cannot report'); } },
  };
  await assert.rejects(readPopupState(api, 'key'), /Context invalidated/);
});
