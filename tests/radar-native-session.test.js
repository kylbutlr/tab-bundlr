import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renewRadarNativeSessionInTab, renewRadarNativeSession } from '../radar-native-session.js';

async function renewal(result, { observed = true, move = false } = {}) {
  const location = new URL('https://radar.sdg.la/');
  const window = {}; window.top = window;
  let imports = 0;
  const context = vm.createContext({ location, window, setTimeout, clearTimeout,
    performance: { getEntriesByType: () => observed ? [{ name: 'https://radar.sdg.la/assets/signInServiceCopy-Cbq_WqRo.js' }] : [] } });
  const script = new vm.Script(`(${renewRadarNativeSessionInTab.toString()})()`, {
    async importModuleDynamically(specifier) {
      imports += 1;
      assert.equal(specifier, 'https://radar.sdg.la/assets/signInServiceCopy-Cbq_WqRo.js');
      if (move) location.href = 'https://radar.sdg.la/login';
      return import(`data:text/javascript,export const o = async () => ${JSON.stringify(result)}`);
    },
  });
  return { result: JSON.parse(JSON.stringify(await script.runInContext(context))), imports };
}

test('native renewal requires the observed module and returns only a fixed status', async () => {
  if (!process.execArgv.includes('--experimental-vm-modules')) {
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    execFileSync(process.execPath, ['--experimental-vm-modules', '--test', fileURLToPath(import.meta.url)], { timeout: 15000, env });
    return;
  }
  assert.deepEqual((await renewal('renewed')).result, { status: 'session-ready' });
  const absent = await renewal('renewed', { observed: false });
  assert.equal(absent.imports, 0); assert.equal(absent.result.code, 'session-adapter-unavailable');
  for (const [value, code] of [['signed-out', 'authentication-expired'], ['unreachable', 'session-renewal-unavailable'],
    ['synthetic-unexpected-value', 'session-renewal-unavailable']]) {
    assert.deepEqual((await renewal(value)).result, { status: 'unavailable', code });
  }
  assert.equal((await renewal('renewed', { move: true })).result.code, 'context-changed');
  assert.doesNotMatch(renewRadarNativeSessionInTab.toString(), /document\.cookie|localStorage|Authorization|\.getToken\(/);
});

test('native renewal is one fixed MAIN call with unchanged-tab verification and no response forwarding', async () => {
  const calls = [];
  const tab = { id: 9, url: 'https://radar.sdg.la/' };
  const chrome = { scripting: { async executeScript(request) { calls.push(request); return [{ frameId: 0, result: { status: 'session-ready' } }]; } },
    tabs: { async get() { return tab; } } };
  assert.equal(await renewRadarNativeSession(chrome, tab), undefined);
  assert.equal(calls.length, 1); assert.equal(calls[0].world, 'MAIN');
  assert.deepEqual(calls[0].target, { tabId: 9, frameIds: [0] });
  chrome.tabs.get = async () => ({ ...tab, url: 'https://radar.sdg.la/login' });
  await assert.rejects(renewRadarNativeSession(chrome, tab), /tab changed/);
});
