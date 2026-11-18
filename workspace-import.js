import { overlappingUrlRules, smartGroupPatterns, trainingPatternForUrl, clientRulePatternKey } from './rules.js';

export const WORKSPACE_FILE_FORMAT = 'tab-bundlr-workspaces';
export const WORKSPACE_FILE_VERSION = 1;
export const WORKSPACE_FILE_MAX_BYTES = 256 * 1024;
export const WORKSPACE_IMPORT_UNDO_KEY = 'workspaceImportUndo';
const GROUPS = 'smartGroups';
const ORDER = 'smartGroupOrder';
const RULES = 'trainedRules';
const READ_KEYS = [GROUPS, ORDER, RULES, WORKSPACE_IMPORT_UNDO_KEY];
const own = (object, key) => Object.hasOwn(object, key);
const copy = (value) => JSON.parse(JSON.stringify(value));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const list = (value) => Array.isArray(value) ? value : [];

function keysOnly(value, allowed) {
  if (!object(value) || Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new Error('Use only the documented workspace fields. Settings and credentials cannot be imported here.');
  }
}

export function parseWorkspaceFile(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > WORKSPACE_FILE_MAX_BYTES) {
    throw new Error('Choose a workspace JSON file smaller than 256 KB.');
  }
  let file;
  try { file = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  keysOnly(file, ['format', 'version', 'workspaces']);
  if (file.format !== WORKSPACE_FILE_FORMAT || file.version !== WORKSPACE_FILE_VERSION) {
    throw new Error('Use a tab-bundlr-workspaces file with version 1. Full settings backups use Backup and restore.');
  }
  if (!Array.isArray(file.workspaces) || !file.workspaces.length || file.workspaces.length > 200) {
    throw new Error('Include between 1 and 200 workspaces.');
  }
  const ids = new Set();
  let total = 0;
  const workspaces = file.workspaces.map((workspace) => {
    keysOnly(workspace, ['id', 'name', 'urls']);
    const { id, name, urls } = workspace;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id) || ids.has(id)) {
      throw new Error('Give each workspace a unique ID using letters, numbers, dots, underscores or hyphens.');
    }
    ids.add(id);
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(name)) {
      throw new Error('Workspace names must contain between 1 and 80 printable characters.');
    }
    if (!Array.isArray(urls) || urls.length > 100 || (total += urls.length) > 1000) {
      throw new Error('Use at most 100 URL prefixes per workspace and 1,000 per file.');
    }
    const patterns = urls.map((value) => {
      let url;
      try { url = new URL(value); } catch { throw new Error('Every URL prefix must be an absolute HTTP or HTTPS address.'); }
      // Query/fragment matching is not part of the URL-rule engine. Reject instead of broadening.
      if (typeof value !== 'string' || !['http:', 'https:'].includes(url.protocol)
        || url.username || url.password || url.search || url.hash || /[?\s#*{}]/.test(value)) {
        throw new Error('URL prefixes cannot contain credentials, spaces, queries, fragments or wildcards.');
      }
      return trainingPatternForUrl(value);
    });
    return { id, name: name.trim(), urls: [...new Set(patterns)] };
  });
  return { format: WORKSPACE_FILE_FORMAT, version: WORKSPACE_FILE_VERSION, workspaces };
}

function snapshot(stored) {
  return copy(Object.fromEntries([GROUPS, ORDER, RULES].filter((key) => own(stored, key)).map((key) => [key, stored[key]])));
}

export function previewWorkspaceImport(stored, file) {
  const normalized = parseWorkspaceFile(JSON.stringify(file));
  const groups = list(stored[GROUPS]);
  if (new Set(groups.map((group) => group.id)).size !== groups.length) {
    throw new Error('Existing workspace IDs are duplicated. Resolve them before importing.');
  }
  const rows = normalized.workspaces.map((workspace) => {
    const existing = groups.find((group) => String(group.id) === workspace.id);
    const addedUrls = workspace.urls.filter((url) => !smartGroupPatterns(existing).includes(url));
    const proposed = existing ? {
      ...existing, name: workspace.name, patterns: [...smartGroupPatterns(existing), ...addedUrls],
    } : { id: workspace.id, name: workspace.name, patterns: workspace.urls, focusMode: false };
    const collisions = addedUrls.flatMap((url) => overlappingUrlRules(url, groups, list(stored[RULES]), {
      type: 'smart', id: workspace.id,
    }).map((conflict) => ({ ...conflict, url })));
    // Also check other rows. Selection cannot silently break ties between imported workspaces.
    const incoming = normalized.workspaces.filter((candidate) => candidate.id !== workspace.id)
      .map((candidate) => ({ ...candidate, patterns: candidate.urls }));
    const fileCollisions = addedUrls.flatMap((url) => overlappingUrlRules(url, incoming, [])
      .map((conflict) => ({ ...conflict, url })));
    const sameName = [...groups, ...normalized.workspaces].some((group) => String(group.id) !== workspace.id
      && String(group.name).toLowerCase() === workspace.name.toLowerCase());
    const savedRuleTie = addedUrls.some((url) => list(stored[RULES])
      .some((rule) => clientRulePatternKey(rule.pattern) === clientRulePatternKey(url)));
    const blocked = sameName || savedRuleTie || [...collisions, ...fileCollisions].some((conflict) => conflict.relation === 'equal');
    const action = !existing ? 'add' : existing.name !== workspace.name || addedUrls.length ? 'update' : 'unchanged';
    return { id: workspace.id, name: workspace.name, previousName: existing?.name || null,
      action, addedUrls, retainedUrls: smartGroupPatterns(existing), proposed, blocked,
      warnings: [
        ...(sameName ? ['Another local workspace has this name. Use its exported ID to update it.'] : []),
        ...(savedRuleTie ? ['A saved workspace rule already owns this URL prefix. Keep that rule and edit the JSON.'] : []),
        ...[...collisions, ...fileCollisions].map((conflict) =>
          `${conflict.url} overlaps ${conflict.name}: ${conflict.pattern} (${conflict.relation}).`),
      ] };
  });
  return { file: normalized, baseline: snapshot(stored), rows };
}

function receiptMatches(stored, receipt) {
  return receipt?.version === 1 && object(receipt.before) && object(receipt.after)
    && [GROUPS, ORDER].every((key) => own(stored, key) === own(receipt.after, key)
      && same(stored[key], receipt.after[key]));
}

// Only workspace settings are written. Callers must not run SYNC_NOW after saving.
export async function applyWorkspaceImport(storage, preview, selectedIds, now = new Date().toISOString()) {
  const stored = await storage.get(READ_KEYS);
  if (!same(snapshot(stored), preview.baseline)) throw new Error('Workspace rules changed. Preview the file again before importing.');
  const checked = previewWorkspaceImport(stored, preview.file);
  const selected = new Set(selectedIds);
  if (!selected.size || [...selected].some((id) => !checked.rows.some((row) => row.id === id))) {
    throw new Error('Select at least one workspace from this preview.');
  }
  const rows = checked.rows.filter((row) => selected.has(row.id));
  if (rows.some((row) => row.blocked || row.action === 'unchanged')) throw new Error('Resolve conflicts and select only changed workspaces.');
  const groups = copy(list(stored[GROUPS]));
  const newIds = [];
  for (const row of rows) {
    const index = groups.findIndex((group) => String(group.id) === row.id);
    const next = { ...row.proposed, updatedAt: now };
    if (index === -1) { groups.push(next); newIds.push(row.id); } else groups[index] = next;
  }
  // Never reorder existing workspaces or alter focus, rules, credentials, preferences or move history.
  const changes = { [GROUPS]: groups };
  if (newIds.length) {
    const order = [...list(stored[ORDER])];
    for (const group of list(stored[GROUPS])) if (!order.includes(String(group.id))) order.push(String(group.id));
    changes[ORDER] = [...order, ...newIds];
  }
  const before = copy(Object.fromEntries([GROUPS, ORDER].filter((key) => own(stored, key)).map((key) => [key, stored[key]])));
  const after = copy({ ...before, ...changes });
  await storage.set({ ...changes, [WORKSPACE_IMPORT_UNDO_KEY]: { version: 1, before, after, importedAt: now } });
  return { imported: rows.length };
}

export function canUndoWorkspaceImport(stored) {
  return receiptMatches(stored, stored[WORKSPACE_IMPORT_UNDO_KEY]);
}

export async function undoWorkspaceImport(storage) {
  const stored = await storage.get(READ_KEYS);
  const receipt = stored[WORKSPACE_IMPORT_UNDO_KEY];
  if (!receiptMatches(stored, receipt)) throw new Error('Workspace settings changed after import. Undo is unavailable to preserve those edits.');
  // One storage write emits the same no-move notification for undo. Empty arrays restore absent lists semantically.
  await storage.set({ [GROUPS]: receipt.before[GROUPS] || [], [ORDER]: receipt.before[ORDER] || [],
    [WORKSPACE_IMPORT_UNDO_KEY]: null });
  return { undone: true };
}

export function isWorkspaceImportChange(changes) {
  return own(changes, WORKSPACE_IMPORT_UNDO_KEY)
    && Object.keys(changes).every((key) => [GROUPS, ORDER, WORKSPACE_IMPORT_UNDO_KEY].includes(key));
}

export function exportWorkspaceFile(stored) {
  return parseWorkspaceFile(JSON.stringify({ format: WORKSPACE_FILE_FORMAT, version: WORKSPACE_FILE_VERSION,
    workspaces: list(stored[GROUPS]).map((group) => ({ id: String(group.id), name: group.name, urls: smartGroupPatterns(group) })) }));
}
