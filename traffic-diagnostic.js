export const TRAFFIC_KEY = 'requestDiagnosticV1';
const MAX_PERIODS = 12;
const MAX_REQUESTS = 10000;
const MAX_DURATION = 24 * 60 * 60 * 1000;
const REASONS = new Set(['story-opened', 'opener-story', 'startup-sync', 'workspace-category-change', 'smart-group-add', 'learned-rule-add', 'manual-fix', 'focus-release', 'story-navigation', 'story-ready', 'window-attached', 'window-resumed']);
export const diagnosticReason = (value) => REASONS.has(value) ? value : 'unknown';
const empty = () => ({ schema: 1, startedAt: null, periods: [], incomplete: false });

// Only allowlisted request metadata reaches storage. No URLs, headers, bodies or errors.
export function createTrafficDiagnostic(storage, clock = Date.now) {
  let state;
  let storageFailed = false;
  let pending = 0;
  let queue = Promise.resolve();
  async function load() {
    if (state) return;
    const saved = (await storage.get(TRAFFIC_KEY))[TRAFFIC_KEY];
    if (saved && (saved.schema !== 1 || !Array.isArray(saved.periods) || saved.periods.length > MAX_PERIODS)) {
      throw new Error('Unreadable diagnostic. Clear it before starting again.');
    }
    state = saved || empty();
  }
  function run(work) {
    const job = queue.then(async () => { await load(); return work(); });
    queue = job.catch(() => {});
    return job;
  }
  async function save() {
    state.incomplete ||= storageFailed;
    try { await storage.set({ [TRAFFIC_KEY]: structuredClone(state) }); }
    catch (error) { storageFailed = true; throw error; }
  }
  function active(at) {
    const period = state.periods.at(-1);
    return period && period.endedAt === null && at >= period.startedAt && at < state.startedAt + MAX_DURATION ? period : null;
  }
  function snapshot() {
    const copy = structuredClone(state);
    const period = copy.periods.at(-1);
    if (period && period.endedAt === null && clock() >= copy.startedAt + MAX_DURATION) period.endedAt = copy.startedAt + MAX_DURATION;
    return { ...copy, incomplete: copy.incomplete || storageFailed, storageFailed, capturedAt: clock() };
  }
  function record(work) {
    if (pending >= 128) { storageFailed = true; return Promise.resolve(null); }
    pending += 1;
    return run(work).catch(() => { storageFailed = true; return null; }).finally(() => { pending -= 1; });
  }
  return {
    async command(action) {
      if (action === 'clear') {
        const job = queue.then(async () => { state = empty(); storageFailed = false; await save(); return snapshot(); });
        queue = job.catch(() => {});
        return job;
      }
      return run(async () => {
        if (action === 'browsing' || action === 'idle') {
          const at = clock();
          if (state.startedAt !== null && at >= state.startedAt + MAX_DURATION) throw new Error('This recording reached 24 hours. Export it, then clear it to start again.');
          if (state.periods.length >= MAX_PERIODS) throw new Error('This recording reached 12 periods. Export it, then clear it to start again.');
          const previous = active(at);
          if (previous) previous.endedAt = at;
          state.startedAt ??= at;
          state.periods.push({ mode: action, startedAt: at, endedAt: null, requests: 0, completed: 0, failed: 0, reasons: {} });
          await save();
        } else if (action === 'stop') {
          const previous = active(clock());
          if (previous) previous.endedAt = clock();
          await save();
        } else if (action !== 'get') throw new Error('Unknown diagnostic action.');
        return snapshot();
      });
    },
    wrapFetch(reason, fetchImpl = globalThis.fetch) {
      return async (...args) => {
        const at = clock();
        const started = record(async () => {
          const period = active(at);
          if (!period) return null;
          if (state.periods.reduce((sum, item) => sum + item.requests, 0) >= MAX_REQUESTS) {
            state.incomplete = true; period.endedAt = at; await save(); return null;
          }
          period.requests += 1;
          const label = diagnosticReason(reason);
          period.reasons[label] = (period.reasons[label] || 0) + 1;
          // Keep the identity even if persistence fails, so failures never affect transport.
          try { await save(); } catch { /* surfaced in the diagnostic */ }
          return { session: state.startedAt, index: state.periods.length - 1 };
        });
        const finish = (failed) => {
          void started.then((ticket) => {
            if (!ticket) return;
            return record(async () => {
              if (state.startedAt !== ticket.session) return;
              const period = state.periods[ticket.index];
              if (!period) return;
              period.completed += 1; if (failed) period.failed += 1;
              await save();
            });
          });
        };
        try {
          const response = await fetchImpl(...args);
          finish(!(response.status >= 200 && response.status < 400));
          return response;
        } catch (error) { finish(true); throw error; }
      };
    },
  };
}

export function diagnosticSummary(report) {
  if (!report.periods.length) return 'No recording yet. Start with normal browsing, then mark an idle period before leaving Chrome alone.';
  if (report.incomplete) return 'Recording is incomplete. Counts may be low; do not use this report to conclude that Tab Bundlr was quiet.';
  const idle = report.periods.filter((period) => period.mode === 'idle');
  if (!idle.length) return 'Browsing recorded. An idle period is still needed before assessing unattended requests.';
  const count = idle.reduce((sum, period) => sum + period.requests, 0);
  const minutes = idle.reduce((sum, period) => sum + Math.max(0, (period.endedAt ?? report.capturedAt) - period.startedAt) / 60000, 0);
  if (count) return `${count} request${count === 1 ? '' : 's'} recorded during marked idle time. Review the triggers before deciding whether Switchr would help.`;
  if (minutes < 30) return 'No idle requests recorded yet. Leave Chrome open and the Mac awake for at least 30 minutes for a useful first sample.';
  return 'No requests recorded during marked idle time. This sample gives no evidence that Switchr is needed, provided Chrome stayed open and the Mac stayed awake.';
}
