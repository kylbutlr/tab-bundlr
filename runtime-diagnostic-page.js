const status = document.getElementById('status');
const report = document.getElementById('report');
const download = document.getElementById('download');
let snapshot = null;
let busy = false;
async function command(action) {
  if (busy) return;
  busy = true;
  status.textContent = 'Reading the extension worker…';
  let timer;
  try {
    const result = await Promise.race([
      chrome.runtime.sendMessage({ type: 'RUNTIME_DIAGNOSTIC', action }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('The extension worker did not respond within five seconds. This is itself a diagnostic result; no tabs were changed.')), 5000); }),
    ]);
    if (!result?.ok) throw new Error(result?.error || 'The report could not be read.');
    snapshot = result;
    report.textContent = JSON.stringify(result, null, 2);
    status.textContent = `Version ${result.version || 'unknown'}. ${result.active ? 'Capture active.' : 'Capture stopped.'} ${result.events.length} entries, ${result.dropped} older entries dropped.`;
    download.disabled = false;
  } catch (error) { status.textContent = error.message; }
  finally { clearTimeout(timer); busy = false; }
}
for (const [id, action] of [['start', 'start'], ['refresh', 'get'], ['stop', 'stop'], ['clear', 'clear']]) {
  document.getElementById(id).addEventListener('click', () => command(action));
}
download.addEventListener('click', () => {
  if (!snapshot) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'tab-bundlr-runtime-diagnostic.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
