// Explicit metadata-only reload. Never export session state or credential keys.
export const READ_ONLY_RELOAD_KEY = 'tabBundlrReadOnlyReload';
export const RELOAD_SESSION_KEYS = ['pausedWindowIds', 'focusGroups', 'focusHeldTabs', 'windowAutomationMode',
  'selectedWindowIds', 'unfrozenWindowIds', 'persistentHomeBaseAnchors', 'persistentHomeBaseRestorations',
  'tabActivationHistory'];
const pick = (value) => Object.fromEntries(RELOAD_SESSION_KEYS.filter((key) => Object.hasOwn(value || {}, key))
  .map((key) => [key, value[key]]));

export async function armReadOnlyReload(chromeApi) {
  const session = await chromeApi.storage.session.get(RELOAD_SESSION_KEYS);
  await chromeApi.storage.local.set({ [READ_ONLY_RELOAD_KEY]: {
    version: 1, held: true, createdAt: Date.now(), session: pick(session),
  } });
  chromeApi.runtime.reload();
}

export async function restoreReadOnlyReload(chromeApi, clock = Date.now) {
  const state = (await chromeApi.storage.local.get(READ_ONLY_RELOAD_KEY))[READ_ONLY_RELOAD_KEY];
  let held = state?.version === 1 && state.held === true;
  if (held) {
    // Restore only an immediate reload handoff, never stale browser/window IDs.
    const fresh = Number.isFinite(state.createdAt) && clock() >= state.createdAt && clock() - state.createdAt < 300000;
    await chromeApi.storage.session.set({ ...(fresh ? pick(state.session) : {}),
      sessionReconciled: true, persistentHomeBasesReconciled: true });
    // Consume the local snapshot immediately. Only the explicit hold persists.
    await chromeApi.storage.local.set({ [READ_ONLY_RELOAD_KEY]: { version: 1, held: true } });
  }
  return {
    get held() { return held; },
    async finish() {
      // Do not replay startup reconciliation or alter any automation preference.
      await chromeApi.storage.session.set({ sessionReconciled: true, persistentHomeBasesReconciled: true });
      await chromeApi.storage.local.remove(READ_ONLY_RELOAD_KEY);
      held = false;
      return { held: false };
    },
  };
}
