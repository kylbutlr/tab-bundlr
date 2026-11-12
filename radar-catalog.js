import { RADAR_SESSION_PERMISSIONS, validateRadarSessionSource } from './radar-session.js';
import { renewRadarNativeSession } from './radar-native-session.js';
import { normalizeWorkspaceSource } from './sources.js';

// Fixed isolated-world projection of the verified bootstrap.projects relationship.
// No raw project records, content or credentials leave the page.
export async function inspectRadarCatalogInTab(scope) {
  if (location.origin !== 'https://radar.sdg.la' || window.top !== window) return { status: 'unavailable', code: 'radar-tab-required' };
  const deadline = Date.now() + 15000;
  const original = location.href;
  const uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
  if (globalThis.__tabBundlrRadarReadUntil > Date.now()) return { status: 'unavailable', code: 'read-in-progress' };
  globalThis.__tabBundlrRadarReadUntil = deadline;
  let bytes = 0;
  let requestCount = 0;
  let stage = 'viewer';
  const stop = (code) => { throw Object.assign(new Error(), { code }); };
  const read = async (path) => {
    if (location.href !== original) stop('context-changed');
    if (Date.now() >= deadline) stop('read-timeout');
    requestCount += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, deadline - Date.now()));
    try {
      const response = await fetch(`https://radar.sdg.la${path}`, { method: 'GET', credentials: 'same-origin',
        cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) stop(({ 401: 'authentication-expired', 403: 'access-denied', 428: 'verification-required', 429: 'rate-limited' })[response.status] || 'service-unavailable');
      if (response.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') stop('invalid-response');
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let body = '';
      try {
        while (true) { const { done, value } = await reader.read(); if (done) break;
          bytes += value.byteLength; if (bytes > 2 * 1024 * 1024) stop('response-too-large'); body += decoder.decode(value, { stream: true }); }
        return JSON.parse(body + decoder.decode());
      } finally { await reader.cancel().catch(() => {}); }
    } finally { clearTimeout(timer); }
  };
  try {
    const viewer = await read('/api/me'); stage = 'bootstrap'; const bootstrap = await read('/api/reads?op=bootstrap');
    const email = typeof viewer.email === 'string' ? viewer.email.toLowerCase() : null;
    const users = (Array.isArray(bootstrap.users) ? bootstrap.users : []).filter((user) => email && user.email?.toLowerCase() === email);
    if (!email || bootstrap.me?.email?.toLowerCase() !== email || users.length !== 1 || users[0].removed || users[0].other_team
      || users[0].id !== scope.accountId || users[0].team_workspace_id !== scope.workspaceId) stop('account-changed');
    if (location.href !== original) stop('context-changed');
    if (!Array.isArray(bootstrap.projects) || !bootstrap.projects.length || bootstrap.projects.length > 100
      || Object.keys(bootstrap).some((key) => !['me', 'projects', 'agents', 'users', 'pipelines', 'ticketStates'].includes(key))) stop('catalog-shape-changed');
    const projects = bootstrap.projects.map((project) => {
      if (!uuid(project?.id) || project.workspace_id !== scope.workspaceId || typeof project.name !== 'string'
        || !project.name.trim() || project.name.length > 120) stop('project-scope-mismatch');
      return { id: project.id, name: project.name.trim() };
    });
    if (new Set(projects.map((project) => project.id)).size !== projects.length) stop('catalog-shape-changed');
    return { status: 'catalog-read', requestCount, accountId: scope.accountId, workspaceId: scope.workspaceId, projects };
  } catch (error) {
    return { status: 'unavailable', stage, requestCount, code: ['authentication-expired', 'access-denied', 'verification-required', 'rate-limited',
      'service-unavailable', 'invalid-response', 'response-too-large', 'account-changed', 'read-timeout', 'context-changed',
      'catalog-shape-changed', 'project-scope-mismatch'].includes(error.code) ? error.code : 'catalog-unavailable' };
  } finally { delete globalThis.__tabBundlrRadarReadUntil; }
}

export async function inspectRadarCatalog(chromeApi, source) {
  validateRadarSessionSource(source);
  if (source.schemaVersion !== 4) throw new Error('Choose a Radar project connection. Exact-ticket sources are not broadened.');
  if (!await chromeApi.permissions.contains(RADAR_SESSION_PERMISSIONS)) throw new Error('Radar access is unavailable.');
  const tabs = await chromeApi.tabs.query({ url: 'https://radar.sdg.la/*' });
  if (!tabs.length) throw new Error('An existing signed-in Radar tab is required.');
  const tab = tabs.find((item) => /\/tickets\/[a-f0-9-]{36}/.test(item.url)) || tabs[0];
  await renewRadarNativeSession(chromeApi, tab);
  if (!await chromeApi.permissions.contains(RADAR_SESSION_PERMISSIONS)) throw new Error('Radar access is unavailable.');
  const frames = await chromeApi.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, world: 'ISOLATED',
    func: inspectRadarCatalogInTab, args: [source.identity] });
  if (frames.length !== 1 || frames[0].frameId !== 0) throw new Error('Radar catalog read stopped.');
  if ((await chromeApi.tabs.get(tab.id)).url !== tab.url || !await chromeApi.permissions.contains(RADAR_SESSION_PERMISSIONS)) {
    throw new Error('Radar tab or access changed during the read.');
  }
  return frames[0].result;
}

export function radarCatalogSourcePreview(source, catalog) {
  validateRadarSessionSource(source);
  if (source.schemaVersion !== 4 || catalog?.status !== 'catalog-read' || catalog.accountId !== source.identity.accountId
    || catalog.workspaceId !== source.identity.workspaceId || !Array.isArray(catalog.projects) || !catalog.projects.length) {
    throw new Error('Project catalog does not match this connection.');
  }
  validateRadarSessionSource({ ...source, projects: catalog.projects });
  const projects = [...source.projects];
  for (const project of catalog.projects) {
    if (!projects.some((previous) => previous.id === project.id)) projects.push({ id: project.id, name: project.name });
  }
  const preview = { ...source, projects, enabled: false };
  validateRadarSessionSource(preview);
  return preview;
}

export const RADAR_CATALOG_ROLLBACK_KEY = 'radarProjectCatalogRollback';
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

export async function saveRadarCatalogExpansion(chromeApi, before, after) {
  const normalizedBefore = normalizeWorkspaceSource(before);
  const normalizedAfter = normalizeWorkspaceSource(after);
  if (before.id !== after.id || before.schemaVersion !== 4 || after.schemaVersion !== 4
    || after.enabled !== true || before.projects.some((project) => !after.projects.some((candidate) => same(candidate, project)))
    || !same({ ...normalizedBefore, projects: [], enabled: false }, { ...normalizedAfter, projects: [], enabled: false })) {
    throw new Error('Catalog expansion may change only the reviewed project bindings and enabled state.');
  }
  const stored = await chromeApi.storage.local.get('workspaceSources');
  const index = stored.workspaceSources?.findIndex((source) => source.id === before.id);
  if (!(index >= 0) || !same(stored.workspaceSources[index], before)) throw new Error('Connection changed after review. Read the catalog again.');
  const next = [...stored.workspaceSources]; next[index] = after;
  await chromeApi.storage.local.set({ workspaceSources: next, [RADAR_CATALOG_ROLLBACK_KEY]: { before, after } });
  const confirmed = await chromeApi.storage.local.get('workspaceSources');
  if (!same(confirmed.workspaceSources, next)) throw new Error('Settings changed during save. Check the connection before continuing.');
}

export function canUndoRadarCatalogExpansion(stored, sourceId) {
  const previous = stored[RADAR_CATALOG_ROLLBACK_KEY];
  const source = stored.workspaceSources?.find((source) => source.id === sourceId);
  return Boolean(sourceId && previous?.after?.id === sourceId && source && same(source, previous.after));
}

export async function undoRadarCatalogExpansion(chromeApi, sourceId) {
  const stored = await chromeApi.storage.local.get(['workspaceSources', RADAR_CATALOG_ROLLBACK_KEY]);
  const previous = stored[RADAR_CATALOG_ROLLBACK_KEY];
  const index = stored.workspaceSources?.findIndex((source) => source.id === previous?.after?.id);
  if (!canUndoRadarCatalogExpansion(stored, sourceId)) {
    throw new Error('Connection changed since expansion. Undo stopped to preserve newer edits.');
  }
  normalizeWorkspaceSource(previous.before);
  const next = [...stored.workspaceSources]; next[index] = previous.before;
  await chromeApi.storage.local.set({ workspaceSources: next });
  const confirmed = await chromeApi.storage.local.get('workspaceSources');
  if (!same(confirmed.workspaceSources, next)) throw new Error('Settings changed during Undo. Check the connection before continuing.');
  await chromeApi.storage.local.remove(RADAR_CATALOG_ROLLBACK_KEY);
}
