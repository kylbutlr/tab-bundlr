import { WORKSPACE_FILE_MAX_BYTES, parseWorkspaceFile, exportWorkspaceFile } from './workspace-import.js';

const input = document.getElementById('workspace-import-json');
const fileInput = document.getElementById('workspace-import-file');
const status = document.getElementById('workspace-import-status');
const previewPanel = document.getElementById('workspace-import-preview');
const rows = document.getElementById('workspace-import-rows');
const apply = document.getElementById('workspace-import-apply');
const undo = document.getElementById('workspace-import-undo');
let preview = null;
let busy = false;
let revision = 0;

async function request(type, fields = {}) {
  let timer;
  try {
    const response = await Promise.race([
      chrome.runtime.sendMessage({ type, ...fields }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Tab Bundlr did not respond. Reopen Settings and preview again.')), 10000); }),
    ]);
    if (!response?.ok) throw new Error(response?.message || 'The workspace action could not finish. Try again.');
    return response;
  } finally { clearTimeout(timer); }
}

function clearPreview() {
  revision += 1;
  preview = null;
  previewPanel.hidden = true;
  apply.disabled = true;
  rows.replaceChildren();
}

function showError(error) {
  status.textContent = error.message;
  status.dataset.tone = 'error';
}

async function refreshUndo() {
  const response = await request('WORKSPACE_IMPORT_STATUS');
  undo.disabled = busy || !response.canUndo;
}

input.addEventListener('input', clearPreview);
document.getElementById('workspace-import-choose').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  clearPreview();
  try {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > WORKSPACE_FILE_MAX_BYTES) throw new Error('Choose a workspace JSON file smaller than 256 KB.');
    input.value = await file.text();
    status.textContent = 'File loaded. Choose Preview workspaces to review it.';
  } catch (error) { showError(error); }
  finally { fileInput.value = ''; }
});

document.getElementById('workspace-import-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  clearPreview();
  const currentRevision = revision;
  busy = true;
  try {
    const file = parseWorkspaceFile(input.value);
    const result = await request('WORKSPACE_IMPORT_PREVIEW', { file });
    if (revision !== currentRevision) return;
    preview = result.preview;
    for (const row of preview.rows) {
      const item = document.createElement('li');
      const label = document.createElement('label');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.value = row.id;
      check.disabled = row.blocked || row.action === 'unchanged';
      check.checked = !check.disabled;
      const title = document.createElement('span');
      title.textContent = `${row.blocked ? 'Conflict' : row.action === 'add' ? 'Add' : row.action === 'update' ? 'Update' : 'Unchanged'}: ${row.name} (${row.id})`;
      label.append(check, title);
      item.append(label);
      const detail = document.createElement('p');
      detail.className = 'field-help';
      detail.textContent = [
        ...(row.previousName && row.previousName !== row.name ? [`Rename from ${row.previousName}.`] : []),
        `Add ${row.addedUrls.length} URL prefix(es); keep ${row.retainedUrls.length} existing.`,
        ...row.warnings,
      ].join(' ');
      item.append(detail);
      const urls = document.createElement('ul');
      row.proposed.patterns.forEach((url) => {
        const line = document.createElement('li');
        line.textContent = `${row.addedUrls.includes(url) ? 'Add' : 'Keep'}: ${url}`;
        urls.append(line);
      });
      item.append(urls);
      rows.append(item);
    }
    previewPanel.hidden = false;
    apply.disabled = !rows.querySelector('input:checked');
    status.textContent = 'Review the selected workspaces. Existing URL rules are retained; conflicting rows cannot be imported.';
    status.dataset.tone = 'info';
  } catch (error) { showError(error); }
  finally { busy = false; }
});

rows.addEventListener('change', () => { apply.disabled = busy || !rows.querySelector('input:checked'); });
apply.addEventListener('click', async () => {
  if (busy || !preview) return;
  busy = true;
  apply.disabled = true;
  undo.disabled = true;
  try {
    const selectedIds = [...rows.querySelectorAll('input:checked')].map((check) => check.value);
    const result = await request('WORKSPACE_IMPORT_APPLY', { preview, selectedIds });
    clearPreview();
    status.textContent = `Imported ${result.imported} workspace(s). Existing tabs stayed in place. Use Apply rules in the popup when ready; automatic mode handles future navigation.`;
    status.dataset.tone = 'success';
  } catch (error) { clearPreview(); showError(error); }
  finally { busy = false; await refreshUndo().catch(showError); }
});

undo.addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  undo.disabled = true;
  try {
    await request('WORKSPACE_IMPORT_UNDO');
    clearPreview();
    status.textContent = 'Undid the workspace import. Tabs and preferences stayed in place. Tab moves have their own Undo in the popup.';
    status.dataset.tone = 'success';
  } catch (error) { showError(error); }
  finally { busy = false; await refreshUndo().catch(showError); }
});

document.getElementById('workspace-export').addEventListener('click', async () => {
  let url;
  try {
    const stored = await chrome.storage.local.get('smartGroups');
    if (!stored.smartGroups?.length) throw new Error('Create a workspace before exporting.');
    const file = exportWorkspaceFile(stored);
    url = URL.createObjectURL(new Blob([`${JSON.stringify(file, null, 2)}\n`], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tab-bundlr-workspaces.json';
    link.click();
    status.textContent = 'Exported workspace names, IDs and URL prefixes. No preferences or credentials are included.';
  } catch (error) { showError(error); }
  finally { if (url) setTimeout(() => URL.revokeObjectURL(url), 1000); }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !['smartGroups', 'smartGroupOrder', 'trainedRules', 'workspaceImportUndo'].some((key) => changes[key])) return;
  if (changes.smartGroups || changes.smartGroupOrder || changes.trainedRules) clearPreview();
  refreshUndo().catch(showError);
});
refreshUndo().catch(showError);
