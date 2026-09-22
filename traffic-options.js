import { diagnosticSummary } from './traffic-diagnostic.js';

const status = document.getElementById('traffic-status');
const summary = document.getElementById('traffic-summary');
const periods = document.getElementById('traffic-periods');
const controls = [...document.querySelectorAll('[data-traffic]'), document.getElementById('traffic-export')];
let latest;
function render(report) {
  latest = report;
  const active = report.periods.at(-1);
  status.textContent = report.storageFailed ? 'Recording failed. Check available storage before starting again.'
    : active?.endedAt === null ? `Recording: ${active.mode === 'idle' ? 'Idle' : 'Browsing'}` : 'Recording stopped';
  summary.textContent = diagnosticSummary(report);
  periods.replaceChildren(...report.periods.map((period) => {
    const row = document.createElement('p'); row.className = 'help';
    const duration = Math.max(0, (period.endedAt ?? report.capturedAt) - period.startedAt) / 60000;
    const triggers = Object.entries(period.reasons).map(([reason, count]) => `${reason}: ${count}`).join(', ');
    row.textContent = `${period.mode === 'idle' ? 'Idle' : 'Browsing'} · ${new Date(period.startedAt).toLocaleString()} · ${duration.toFixed(1)} min · ${period.requests} requests · ${period.failed} failed · ${period.requests - period.completed} pending or unknown. ${triggers ? `Triggers: ${triggers}.` : ''}`;
    return row;
  }));
}
async function action(name) {
  controls.forEach((button) => { button.disabled = true; });
  try {
    const result = await chrome.runtime.sendMessage({ type: 'REQUEST_DIAGNOSTIC', action: name });
    if (!result?.ok) throw new Error(result?.message || 'Diagnostic unavailable. Reload Tab Bundlr and try again.');
    render(result.report);
  } catch (error) { status.textContent = error.message; latest = null; }
  finally { controls.forEach((button) => { button.disabled = false; }); }
}
document.querySelectorAll('[data-traffic]').forEach((button) => button.addEventListener('click', () => action(button.dataset.traffic)));
document.getElementById('traffic-export').addEventListener('click', async () => {
  await action('get');
  if (!latest) return;
  const blob = new Blob([JSON.stringify(latest, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = 'tab-bundlr-request-report.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
void action('get');
