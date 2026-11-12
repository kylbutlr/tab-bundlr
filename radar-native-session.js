// Verified against the loaded November 12 frontend, not an OAuth/token API.
// MAIN is necessary to reuse the page's existing module instance and renewer.
// The native helper returns an enum, never a credential. Do not call Clerk or
// its getToken callback directly, and do not fall back to another module/export.
export async function renewRadarNativeSessionInTab() {
  if (location.origin !== 'https://radar.sdg.la' || window.top !== window || location.pathname === '/login') {
    return { status: 'unavailable', code: 'radar-tab-required' };
  }
  const original = location.href;
  const moduleUrl = 'https://radar.sdg.la/assets/signInServiceCopy-Cbq_WqRo.js';
  if (!performance.getEntriesByType('resource').some((entry) => entry.name === moduleUrl)) {
    return { status: 'unavailable', code: 'session-adapter-unavailable' };
  }
  let timer;
  try {
    const result = await Promise.race([
      import(moduleUrl).then((native) => native.o()),
      new Promise((resolve) => { timer = setTimeout(() => resolve('unreachable'), 11000); }),
    ]);
    if (location.href !== original) return { status: 'unavailable', code: 'context-changed' };
    if (result === 'renewed') return { status: 'session-ready' };
    return { status: 'unavailable', code: result === 'signed-out' ? 'authentication-expired' : 'session-renewal-unavailable' };
  } catch {
    return { status: 'unavailable', code: 'session-renewal-unavailable' };
  } finally { clearTimeout(timer); }
}

export async function renewRadarNativeSession(chromeApi, tab) {
  const frames = await chromeApi.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, world: 'MAIN',
    func: renewRadarNativeSessionInTab });
  const result = frames.length === 1 && frames[0].frameId === 0 ? frames[0].result : null;
  if ((await chromeApi.tabs.get(tab.id)).url !== tab.url) throw new Error('Radar tab changed during session renewal.');
  if (result?.status !== 'session-ready') {
    throw Object.assign(new Error('Radar session renewal is unavailable. No source or rule was changed.'), {
      code: ['authentication-expired', 'session-adapter-unavailable', 'session-renewal-unavailable', 'context-changed', 'radar-tab-required'].includes(result?.code)
        ? result.code : 'session-renewal-unavailable',
    });
  }
}
