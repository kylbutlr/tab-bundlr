// One-use, short-lived update handoff. No credentials or behavior preferences are copied.
export const SESSION_HANDOFF_KEY = 'tabBundlrSessionHandoff';
export const SESSION_HANDOFF_KEYS = ['pausedWindowIds', 'focusGroups', 'focusHeldTabs', 'windowAutomationMode',
  'selectedWindowIds', 'unfrozenWindowIds', 'persistentHomeBaseAnchors', 'persistentHomeBaseRestorations',
  'tabActivationHistory', 'temporaryActivationOverrideUntil'];

export async function restoreSessionHandoff(chromeApi, now = Date.now()) {
  const handoff = (await chromeApi.storage.local.get(SESSION_HANDOFF_KEY))[SESSION_HANDOFF_KEY];
  if (!handoff) return { restored: false };
  if (handoff.version !== 1 || !Number.isFinite(handoff.createdAt) || now < handoff.createdAt
    || now - handoff.createdAt > 300000 || !handoff.session || !Array.isArray(handoff.windowIds)) {
    throw new Error('The update handoff expired. Keep tab actions stopped until the update is reviewed.');
  }
  const windows = (await chromeApi.windows.getAll({ windowTypes: ['normal'] })).map((window) => window.id).sort((a, b) => a - b);
  if (JSON.stringify(windows) !== JSON.stringify(handoff.windowIds)) {
    throw new Error('Browser windows changed during the update. Keep tab actions stopped.');
  }
  const session = Object.fromEntries(SESSION_HANDOFF_KEYS.filter((key) => Object.hasOwn(handoff.session, key))
    .map((key) => [key, handoff.session[key]]));
  await chromeApi.storage.session.set({ ...session, sessionReconciled: true, persistentHomeBasesReconciled: true });
  await chromeApi.storage.local.remove(SESSION_HANDOFF_KEY);
  return { restored: true };
}
