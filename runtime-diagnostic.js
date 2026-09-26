// Short-lived, bounded, in-memory metadata only. No storage writes or timers.
const EVENTS = new Set(['created', 'detached', 'routing', 'popup-start', 'popup-status', 'popup-render', 'popup-received', 'popup-timeout', 'popup-error']);
const REASONS = new Set(['allowed-here', 'source-managed', 'ambiguous-target', 'waiting-url', 'unsupported-or-first-tab', 'target-paused', 'target-missing', 'manually-dragged', 'moved', 'retry-pending', 'move-failed', 'handler-failed']);
const FIELDS = ['tabId', 'sourceWindowId', 'destinationWindowId', 'selectedCount', 'tabCount', 'groupCount', 'durationMs', 'ioMs', 'messageMs', 'renderMs', 'tabQueryMs', 'backgroundRoundTripMs', 'requestDeliveryMs', 'workerMs', 'responseDeliveryMs', 'guidanceMs'];
export function createRuntimeDiagnostic(clock = Date.now) {
  let startedAt = clock();
  let until = startedAt + 300000;
  let events = [];
  let dropped = 0;
  return {
    record(event, fields = {}) {
      if (clock() >= until || !EVENTS.has(event)) return;
      const entry = { elapsedMs: Math.max(0, clock() - startedAt), event };
      if (REASONS.has(fields.reason)) entry.reason = fields.reason;
      if (['active-tab', 'background', 'guidance'].includes(fields.stage)) entry.stage = fields.stage;
      for (const field of FIELDS) {
        if (typeof fields[field] === 'number' && Number.isFinite(fields[field])) entry[field] = Math.round(fields[field]);
      }
      if (events.length === 128) { events.shift(); dropped += 1; }
      events.push(entry);
    },
    command(action) {
      if (action === 'start') { startedAt = clock(); until = startedAt + 300000; events = []; dropped = 0; }
      else if (action === 'stop') until = 0;
      else if (action === 'clear') { events = []; dropped = 0; until = 0; }
      else if (action !== 'get') throw new Error('Unknown diagnostic action.');
      return { schema: 1, active: clock() < until, startedAt, dropped, events: events.map((entry) => ({ ...entry })) };
    },
  };
}
