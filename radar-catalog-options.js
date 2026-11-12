import { inspectRadarCatalog, radarCatalogSourcePreview, saveRadarCatalogExpansion,
  undoRadarCatalogExpansion, canUndoRadarCatalogExpansion, RADAR_CATALOG_ROLLBACK_KEY as rollbackKey } from './radar-catalog.js';
import { normalizeWorkspaceSources } from './sources.js';
const button = document.getElementById('radar-all-projects');
const output = document.getElementById('radar-catalog-status');
const apply = document.getElementById('radar-enable-projects');
const undo = document.getElementById('radar-undo-projects');
let review = null;
let busy = false;
const chosenId = () => document.getElementById('radar-source-id').value.trim();
async function showStoredCatalog(showSummary = true) {
  const id = chosenId();
  const stored = await chrome.storage.local.get(['workspaceSources', rollbackKey]);
  if (busy || chosenId() !== id) return;
  const source = normalizeWorkspaceSources(stored.workspaceSources).find((item) => item.id === id && item.schemaVersion === 4);
  if (showSummary) output.textContent = source
    ? `${source.enabled ? 'Enabled' : 'Off'}: ${source.projects.length} reviewed Radar projects. Read the current catalog to review an expansion.`
    : 'Choose an existing Radar project connection.';
  undo.disabled = !canUndoRadarCatalogExpansion(stored, id);
}
async function finishOperation() {
  busy = false; button.disabled = false;
  await showStoredCatalog(false).catch(() => { undo.disabled = true; });
}
button.addEventListener('click', () => {
  if (busy) return;
  busy = true;
  undo.disabled = true;
  button.disabled = true; apply.disabled = true; review = null;
  output.textContent = 'Reading the project catalog from your existing Radar tab…';
  void (async () => {
    try {
      const stored = await chrome.storage.local.get('workspaceSources');
      const raw = stored.workspaceSources?.find((item) => item.id === chosenId());
      const source = normalizeWorkspaceSources([raw])[0];
      if (source?.schemaVersion !== 4) throw new Error('Choose an existing Radar project connection.');
      const result = await inspectRadarCatalog(chrome, source);
      if (chosenId() !== raw.id) throw new Error('Connection selection changed. Read the selected connection again.');
      if (result?.status !== 'catalog-read') throw new Error(result?.code === 'authentication-expired'
        ? `Radar rejected the ${result.stage} read (HTTP 401). No settings changed. Normal sign-in alone has not established extension access.`
        : `Project read stopped (${result?.code || 'catalog-unavailable'}). No settings changed.`);
      const preview = radarCatalogSourcePreview(source, result);
      review = { before: raw, after: { ...preview, enabled: true }, catalogCount: result.projects.length };
      output.textContent = `Review ${result.projects.length} native catalog projects (${preview.projects.length} bindings total). Existing labels and bindings are retained.\n${preview.projects.map((project) => project.name).join('\n')}\nEnabling changes only this Radar connection. Normal automatic handling may re-evaluate matching tabs with your existing protections.`;
      apply.disabled = false;
    } catch (error) { output.textContent = error.message || 'Project catalog unavailable. Existing settings were preserved.'; }
    finally { await finishOperation(); }
  })();
});

apply.addEventListener('click', () => {
  if (busy || !review) return;
  busy = true;
  const selected = review;
  apply.disabled = true; button.disabled = true; undo.disabled = true;
  void (async () => {
    try {
      if (chosenId() !== selected.before.id) {
        throw new Error('The connection changed after review. Read and review the catalog again.');
      }
      await saveRadarCatalogExpansion(chrome, selected.before, selected.after);
      output.textContent = `Enabled: ${selected.after.projects.length} reviewed Radar projects, including all ${selected.catalogCount} returned catalog projects. Tab protections, Shortcut rules and automatic-bundling preference were preserved. Normal automatic handling continues with those protections.`;
      review = null; undo.disabled = false;
    } catch (error) { output.textContent = error.message; }
    finally { await finishOperation(); }
  })();
});

undo.addEventListener('click', () => {
  if (busy) return;
  busy = true;
  const sourceId = chosenId();
  undo.disabled = true; button.disabled = true; apply.disabled = true;
  void (async () => {
    try {
      await undoRadarCatalogExpansion(chrome, sourceId);
      review = null; apply.disabled = true;
      output.textContent = 'Previous Radar project bindings and enabled state restored. Other settings and tab move history were preserved.';
    } catch (error) { output.textContent = error.message; }
    finally { await finishOperation(); }
  })();
});
document.getElementById('radar-source-id').addEventListener('change', () => {
  review = null; apply.disabled = true; undo.disabled = true;
  void showStoredCatalog().catch(() => { output.textContent = 'Stored project summary unavailable. No settings changed.'; });
});
void showStoredCatalog().catch(() => { output.textContent = 'Stored project summary unavailable. No settings changed.'; });
