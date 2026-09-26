// One deadline per popup refresh, not a retry loop or background heartbeat.
export const POPUP_TIMEOUT_MS = 5000;
const STAGE_LABELS = {
  'active-tab': 'reading the active tab from Chrome',
  background: 'waiting for the Tab Bundlr background response',
  guidance: 'reading popup settings from Chrome',
};

export function reportPopupTiming(api, fields) {
  // Reporting must never delay the UI or retry a stalled worker.
  try { void Promise.resolve(api.runtime.sendMessage({ type: 'POPUP_TIMING', ...fields })).catch(() => {}); }
  catch { /* The extension context may have been invalidated. */ }
}

export async function readPopupState(api, guidanceKey, {
  now = () => performance.now(), wallNow = Date.now,
} = {}) {
  const started = now();
  const timings = {};
  let stage = 'active-tab';
  let expired = false;
  let timer;
  const timeoutError = () => Object.assign(new Error(
    `Timed out while ${STAGE_LABELS[stage]}. Close and reopen this popup to retry. The diagnostic link below is still available.`,
  ), { code: 'POPUP_TIMEOUT' });
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { expired = true; reject(timeoutError()); }, POPUP_TIMEOUT_MS);
  });
  const measure = async (name, field, operation) => {
    stage = name;
    const at = now();
    const value = await Promise.race([Promise.resolve().then(operation), deadline]);
    // A late Chrome result must not continue the refresh after its deadline.
    if (expired || now() - started >= POPUP_TIMEOUT_MS) throw timeoutError();
    timings[field] = now() - at;
    return value;
  };
  try {
    const [activeTab] = await measure('active-tab', 'tabQueryMs', () => api.tabs.query({ active: true, currentWindow: true }));
    const response = await measure('background', 'backgroundRoundTripMs', () => api.runtime.sendMessage({
      type: 'GET_STATUS', windowId: activeTab?.windowId, popupSentAt: wallNow(),
    }));
    if (!response?.ok) throw new Error(response?.error || 'Could not read Tab Bundlr status.');
    timings.messageMs = now() - started; // Retain the v1 total for older report readers.
    const worker = response.popupTiming;
    if (worker) {
      timings.requestDeliveryMs = worker.requestDeliveryMs;
      timings.workerMs = worker.workerMs;
      timings.responseDeliveryMs = Math.max(0, wallNow() - worker.responseSentAt);
    }
    const storedGuidance = await measure('guidance', 'guidanceMs', () => api.storage.local.get(guidanceKey));
    return { response, storedGuidance, timings };
  } catch (error) {
    reportPopupTiming(api, { ...timings, event: error.code === 'POPUP_TIMEOUT' ? 'popup-timeout' : 'popup-error',
      stage, durationMs: now() - started });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
