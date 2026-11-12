import { RADAR_SESSION_PERMISSIONS } from './radar-session.js';
import { parseRadarTicketUrl } from './radar-source.js';
import { armReadOnlyReload } from './reload-safety.js';

const reloadStatus = document.getElementById('radar-reload-status');
const disposableButton = document.getElementById('radar-disposable-test');
const disposableStatus = document.getElementById('radar-disposable-status');
disposableButton.addEventListener('click', () => {
  disposableButton.disabled = true;
  disposableStatus.textContent = 'Grouping and undoing two disposable tabs. No Radar requests or saved source changes.';
  void chrome.runtime.sendMessage({ type: 'RADAR_DISPOSABLE_TEST' }).then((result) => {
    if (!result?.ok || !result.test) {
      disposableStatus.textContent = `Test stopped (${result?.code || 'unavailable'}). Use Reload for metadata-only test first.`;
      return;
    }
    const test = result.test;
    disposableStatus.textContent = `Disposable test ${test.status}: grouped ${test.grouped}, undone ${test.undone}, remaining test tabs ${test.disposableTabsRetained}. Working tabs unchanged: ${test.workingTabsUnchanged ? 'yes' : 'NO'}. Radar requests: ${test.serviceRequests}.`;
  }).catch(() => { disposableStatus.textContent = 'Test interrupted. Check for retained disposable tabs before continuing.'; })
    .finally(() => { disposableButton.disabled = false; });
});
document.getElementById('radar-safe-reload').addEventListener('click', () => {
  void armReadOnlyReload(chrome).catch(() => { reloadStatus.textContent = 'Reload stopped. Session preservation could not be prepared.'; });
});
document.getElementById('radar-finish-test').addEventListener('click', () => {
  void chrome.runtime.sendMessage({ type: 'READ_ONLY_PREVIEW_FINISH' }).then((result) => {
    reloadStatus.textContent = result?.ok ? 'Metadata-only test finished. Normal handling resumed; no startup moves were replayed.' : 'Test mode could not be finished.';
  }).catch(() => { reloadStatus.textContent = 'Test mode status unavailable.'; });
});
void chrome.storage.local.get('tabBundlrReadOnlyReload').then((stored) => {
  reloadStatus.textContent = stored.tabBundlrReadOnlyReload?.held
    ? 'Metadata-only test mode is active. Automatic tab handling is held.' : 'Normal tab handling. No test reload has been requested.';
});

const form = document.getElementById('radar-connection-form');
const tabs = document.getElementById('radar-tab');
const status = document.getElementById('radar-connection-status');
const output = document.getElementById('radar-client-document');
const use = document.getElementById('radar-use-preview');
const refresh = document.getElementById('radar-refresh-tabs');
let preview = null;
let busy = false;
const show = (message) => { status.textContent = message; };
function clearPreview() { preview = null; output.hidden = true; output.textContent = ''; use.disabled = true; }
async function listTabs() {
  if (busy) return;
  clearPreview();
  tabs.replaceChildren();
  for (const tab of await chrome.tabs.query({ url: 'https://radar.sdg.la/*' })) {
    const parsed = parseRadarTicketUrl(tab.url);
    if (parsed?.kind !== 'uuid') continue;
    const option = document.createElement('option');
    option.value = String(tab.id);
    option.textContent = `Radar ticket ${parsed.id}`;
    tabs.append(option);
  }
  show(tabs.options.length ? 'Choose a ticket and workspace label, then preview. No request has been made.'
    : 'No native Radar ticket tab found. Open a ticket yourself in Radar first. Short links alone do not establish its native UUID.');
}
refresh.addEventListener('click', () => { void listTabs().catch(() => show('Open-ticket list unavailable.')); });
for (const element of form.querySelectorAll('input, select')) element.addEventListener('input', clearPreview);
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (busy || !tabs.value) return;
  clearPreview();
  busy = true;
  const controls = [...form.querySelectorAll('button, input, select')];
  const tabId = Number(tabs.value);
  const connectionId = document.getElementById('radar-source-id').value;
  const workspaceName = document.getElementById('radar-workspace-name').value;
  // Permission prompt belongs to this explicit click, never initialization.
  const permission = chrome.permissions.request(RADAR_SESSION_PERMISSIONS);
  controls.forEach((control) => { control.disabled = true; });
  form.setAttribute('aria-busy', 'true');
  void (async () => {
    try {
      if (!await permission) throw new Error('Optional access was declined. No read performed.');
      show('Reading selected ticket metadata, at most three GET requests.');
      const result = await chrome.runtime.sendMessage({ type: 'RADAR_SESSION_PREVIEW', tabId, connectionId, workspaceName });
      if (!result?.ok) throw new Error(`Read stopped (${result?.code || 'unavailable'}). No source saved or tabs moved.`);
      preview = result.source;
      output.textContent = JSON.stringify(preview, null, 2);
      output.hidden = false;
      show('Review the account, workspace, ticket UUID/number and project ID. This source is disabled and has not been saved.');
    } catch (error) { show(error.message); }
    finally {
      busy = false;
      form.removeAttribute('aria-busy');
      controls.forEach((control) => { control.disabled = false; });
      use.disabled = !preview;
    }
  })();
});
use.addEventListener('click', () => {
  if (!preview) return;
  const editor = document.getElementById('workspace-source-json');
  editor.value = JSON.stringify(preview, null, 2);
  editor.focus();
  show('Preview copied to the editor. Review before saving. No source or rule has changed.');
});
// Listing open tabs is deliberate too; no startup read, injection or network request.
