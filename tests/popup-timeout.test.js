import assert from 'node:assert/strict';
import test from 'node:test';

const pending = () => new Promise(() => {});
const flush = async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); };

for (const stage of ['active-tab', 'background', 'guidance']) {
  test(`real popup shows a recoverable timeout when ${stage} never responds`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const elements = new Map();
    globalThis.document = {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, {
          textContent: '', className: '', dataset: {},
          addEventListener() {}, setAttribute() {}, removeAttribute() {},
        });
        return elements.get(id);
      },
    };
    const reports = [];
    globalThis.chrome = {
      tabs: { query: stage === 'active-tab' ? pending : async () => [{ windowId: 7 }] },
      runtime: { sendMessage: (message) => {
        if (message.type === 'POPUP_TIMING') { reports.push(message); return Promise.resolve(); }
        return stage === 'background' ? pending() : Promise.resolve({ ok: true, groups: [] });
      } },
      storage: { local: { get: pending } },
    };
    try {
      await import(`../popup.js?timeout=${stage}`);
      await flush();
      t.mock.timers.tick(5000);
      await flush();
      assert.equal(elements.get('state-pill').textContent, 'Timed out');
      assert.match(elements.get('status').textContent, /Close and reopen/);
      assert.equal(reports.at(-1)?.stage, stage);
      assert.equal(reports.at(-1)?.event, 'popup-timeout');
    } finally {
      delete globalThis.document;
      delete globalThis.chrome;
    }
  });
}
