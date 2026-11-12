import { parseRadarTicketUrl, prepareRadarSource, RADAR_AUTHORITY } from './radar-source.js';

export const RADAR_SESSION_PERMISSIONS = { permissions: ['scripting'], origins: [`${RADAR_AUTHORITY}/*`] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const fail = (code) => { throw Object.assign(new Error(`Radar session read stopped: ${code}.`), { code }); };
const orderedValue = (value) => Array.isArray(value) ? value.map(orderedValue)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, orderedValue(value[key])])) : value;

// This is a closed transport, not a general session-authenticated JSON fetcher.
export function validateRadarSessionSource(source) {
  const identity = source.identity;
  if (![3, 4].includes(source.schemaVersion) || source.authentication?.type !== 'radar-tab-session'
    || identity?.provider !== 'radar' || identity.authority !== RADAR_AUTHORITY || identity.entityKind !== 'project'
    || !UUID.test(identity.accountId) || !UUID.test(identity.workspaceId)
    || source.credentials.length || JSON.stringify(source.permissionOrigins) !== JSON.stringify(RADAR_SESSION_PERMISSIONS.origins)) fail('invalid-session-source');
  if (source.schemaVersion === 4) {
    if (!Array.isArray(source.projects) || !source.projects.length || source.projects.length > 100
      || new Set(source.projects.map((project) => project.id)).size !== source.projects.length
      || source.projects.some((project) => !UUID.test(project.id) || typeof project.name !== 'string'
        || !project.name.trim() || project.name.length > 120)) fail('invalid-project-bindings');
    if (source.routes.length !== 1 || JSON.stringify(orderedValue(source.routes[0])) !== JSON.stringify(orderedValue(radarProjectRoute(identity.workspaceId)))) fail('invalid-project-route');
    return;
  }
  for (const route of source.routes) {
    const expected = route.steps?.[0]?.expect;
    const parsed = parseRadarTicketUrl(route.pagePattern);
    if (!route.exact || !parsed || route.steps.length !== 1 || !expected
      || !UUID.test(expected['ticket.id']) || !UUID.test(expected['ticket.project_id'])
      || !Number.isSafeInteger(expected['ticket.number']) || expected['ticket.number'] < 1
      || expected['ticket.workspace_id'] !== identity.workspaceId
      || (parsed.kind === 'uuid' ? parsed.id !== expected['ticket.id'] : parsed.number !== expected['ticket.number'])
      || route.steps[0].request.method !== 'GET'
      || route.steps[0].request.url !== `${RADAR_AUTHORITY}/api/reads?op=ticket-get&id=${expected['ticket.id']}&include=page`
      || route.placement.workspaceId !== expected['ticket.project_id']
      || route.placement.itemId !== '{itemId}' || route.placement.workspaceType !== 'workspace') fail('invalid-session-source');
  }
}

// Chrome serializes this function into the top frame's ISOLATED world. No imports,
// page scripts, credentials, response bodies or server error text cross that boundary.
export async function readRadarMetadataInTab(expected = null) {
  const uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
  const stop = (code) => { throw Object.assign(new Error(), { code }); };
  const original = location.href;
  const native = /^\/tickets\/([0-9a-f-]+)\/?$/.exec(location.pathname);
  const short = /^\/t\/([1-9][0-9]*)\/?$/.exec(location.pathname);
  const id = native?.[1] || expected?.id;
  if (location.origin !== 'https://radar.sdg.la' || window.top !== window || !uuid(id)
    || (!native && !(short && expected?.number === Number(short[1])))
    || (expected?.id && expected.id !== id)) return { status: 'unavailable', code: 'native-ticket-required' };
  const deadline = Date.now() + 15000;
  if (globalThis.__tabBundlrRadarReadUntil > Date.now()) return { status: 'unavailable', code: 'read-in-progress' };
  globalThis.__tabBundlrRadarReadUntil = deadline;
  let bytes = 0;
  const read = async (path) => {
    if (location.href !== original || Date.now() >= deadline) stop('context-changed');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(5000, deadline - Date.now())));
    try {
      const response = await fetch(`https://radar.sdg.la${path}`, { method: 'GET', credentials: 'same-origin',
        redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) stop(({ 401: 'authentication-expired', 403: 'access-denied', 428: 'verification-required', 429: 'rate-limited' })[response.status] || 'service-unavailable');
      if (response.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') stop('invalid-response');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let body = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 2 * 1024 * 1024) stop('response-too-large');
          body += decoder.decode(value, { stream: true });
        }
        body += decoder.decode();
        return JSON.parse(body);
      } finally { await reader.cancel().catch(() => {}); }
    } finally { clearTimeout(timer); }
  };
  try {
    const viewer = await read('/api/me');
    const bootstrap = await read('/api/reads?op=bootstrap');
    const email = typeof viewer.email === 'string' ? viewer.email.toLowerCase() : null;
    const users = (Array.isArray(bootstrap.users) ? bootstrap.users : []).filter((user) => email && user.email?.toLowerCase() === email);
    if (!email || bootstrap.me?.email?.toLowerCase() !== email || users.length !== 1
      || !uuid(users[0].id) || !uuid(users[0].team_workspace_id) || users[0].removed || users[0].other_team) stop('identity-unavailable');
    const user = users[0];
    if (expected && (user.id !== expected.accountId || user.team_workspace_id !== expected.workspaceId)) stop('account-changed');
    const { ticket } = await read(`/api/reads?op=ticket-get&id=${id}&include=page`);
    if (location.href !== original) stop('context-changed');
    if (!ticket || ticket.id !== id || !uuid(ticket.workspace_id) || !uuid(ticket.project_id)
      || ticket.workspace_id !== user.team_workspace_id || !Number.isSafeInteger(ticket.number) || ticket.number < 1
      || ticket.deleted_at || (expected?.number !== undefined && ticket.number !== expected.number)
      || (expected?.projectId && ticket.project_id !== expected.projectId)) stop('ticket-scope-mismatch');
    // Deliberately discard descriptions, events, revisions, emails and all other fields.
    return { status: 'read', accountId: user.id, workspaceId: ticket.workspace_id,
      ticket: { id: ticket.id, number: ticket.number, workspace_id: ticket.workspace_id, project_id: ticket.project_id } };
  } catch (error) {
    return { status: 'unavailable', code: ['authentication-expired', 'access-denied', 'verification-required', 'rate-limited',
      'service-unavailable', 'invalid-response', 'response-too-large', 'identity-unavailable', 'account-changed',
      'context-changed', 'ticket-scope-mismatch'].includes(error.code) ? error.code : 'read-unavailable' };
  } finally { delete globalThis.__tabBundlrRadarReadUntil; }
}

export function createRadarSessionReader(chromeApi) {
  const requests = new Map();
  let tail = Promise.resolve();
  let blockedUntil = 0;
  return (tabId, expected = null) => {
    const key = JSON.stringify([tabId, expected]);
    if (requests.has(key)) return requests.get(key);
    if (requests.size >= 16) return Promise.reject(Object.assign(new Error('Radar read queue is full.'), { code: 'read-in-progress' }));
    const scoped = expected ? { ...expected } : null;
    const request = tail.then(async () => {
      if (Date.now() < blockedUntil) fail('read-cooldown');
      try {
        if (!await chromeApi.permissions?.contains(RADAR_SESSION_PERMISSIONS)) fail('permission-required');
        const before = await chromeApi.tabs.get(tabId);
        const parsed = parseRadarTicketUrl(before.url);
        if (!parsed || (!scoped && parsed.kind !== 'uuid')) fail('native-ticket-required');
        const frames = await chromeApi.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: 'ISOLATED',
          func: readRadarMetadataInTab, args: [scoped] });
        if (frames.length !== 1 || frames[0].frameId !== 0 || frames[0].result?.status !== 'read') fail(frames[0]?.result?.code || 'read-unavailable');
        if ((await chromeApi.tabs.get(tabId)).url !== before.url) fail('context-changed');
        if (!await chromeApi.permissions.contains(RADAR_SESSION_PERMISSIONS)) fail('permission-required');
        return frames[0].result;
      } catch (error) {
        blockedUntil = Date.now() + 30000;
        fail(error.code || 'read-unavailable');
      }
    }).finally(() => requests.delete(key));
    requests.set(key, request);
    tail = request.catch(() => {});
    return request;
  };
}

export function radarSessionSourcePreview(metadata, connectionId, workspaceName) {
  if (metadata?.status !== 'read' || !UUID.test(metadata.accountId) || !String(workspaceName || '').trim()
    || String(workspaceName).length > 120) fail('invalid-preview');
  const proposal = prepareRadarSource({ connectionId, accountId: metadata.accountId, workspaceId: metadata.workspaceId,
    projects: [{ id: metadata.ticket.project_id, name: workspaceName }], tickets: [metadata.ticket] });
  return { ...proposal.source, schemaVersion: 3, authentication: { type: 'radar-tab-session' } };
}

export function radarProjectRoute(workspaceId) {
  return { id: 'native-project', pagePattern: `${RADAR_AUTHORITY}/tickets/{ticketId}`, exact: true,
    steps: [{ when: [], request: { method: 'GET', url: `${RADAR_AUTHORITY}/api/reads?op=ticket-get&id={ticketId}&include=page` },
      extract: { itemId: ['ticket.id'], projectId: ['ticket.project_id'] }, expect: { 'ticket.workspace_id': workspaceId } }],
    placement: { workspaceId: '{projectId}', workspaceName: '{projectName}', workspaceType: 'workspace', itemId: '{itemId}', itemName: '' } };
}

// A new version is deliberate: existing exact-ticket sources never broaden silently.
export function radarProjectSourcePreview(metadata, connectionId, workspaceName, previous = null) {
  const exact = radarSessionSourcePreview(metadata, connectionId, workspaceName);
  if (previous) {
    validateRadarSessionSource(previous);
    if (previous.schemaVersion !== 4 || previous.id !== connectionId
      || JSON.stringify(previous.identity) !== JSON.stringify(exact.identity)) fail('account-changed');
  }
  const projects = previous ? [...previous.projects] : [];
  const project = { id: metadata.ticket.project_id, name: workspaceName.trim() };
  const index = projects.findIndex((candidate) => candidate.id === project.id);
  if (index < 0) projects.push(project); else projects[index] = project;
  const source = { ...(previous || exact), schemaVersion: 4, enabled: false, projects,
    routes: [radarProjectRoute(exact.identity.workspaceId)] };
  validateRadarSessionSource(source);
  return source;
}

export async function resolveRadarProjectMatch(match, tab, read) {
  validateRadarSessionSource(match.source);
  if (match.source.schemaVersion !== 4) fail('invalid-project-source');
  if (!match.source.enabled) return { status: 'disabled', sourceId: match.source.id };
  const parsed = parseRadarTicketUrl(tab?.url);
  if (parsed?.kind !== 'uuid') return { status: 'unassigned', sourceId: match.source.id, reason: 'native-ticket-required' };
  const metadata = await read(tab.id, { id: parsed.id, accountId: match.source.identity.accountId,
    workspaceId: match.source.identity.workspaceId });
  if (metadata.accountId !== match.source.identity.accountId || metadata.workspaceId !== match.source.identity.workspaceId
    || metadata.ticket.workspace_id !== match.source.identity.workspaceId || metadata.ticket.id !== parsed.id
    || !Number.isSafeInteger(metadata.ticket.number) || metadata.ticket.number < 1 || !UUID.test(metadata.ticket.project_id)) fail('ticket-scope-mismatch');
  const project = match.source.projects.find((candidate) => candidate.id === metadata.ticket.project_id);
  if (!project) return { status: 'unassigned', sourceId: match.source.id, reason: 'project-not-reviewed' };
  return { status: 'resolved', sourceId: match.source.id, sourceName: match.source.name, sourceIdentity: match.source.identity,
    routeId: match.route.id, workspaceId: project.id, workspaceName: project.name, workspaceType: 'workspace',
    itemId: metadata.ticket.id, itemName: '' };
}

export async function resolveRadarSessionMatch(match, tab, read) {
  validateRadarSessionSource(match.source);
  if (!match.source.enabled) return { status: 'disabled', sourceId: match.source.id };
  const expected = match.route.steps[0].expect;
  const metadata = await read(tab.id, { id: expected['ticket.id'], number: expected['ticket.number'],
    projectId: expected['ticket.project_id'], workspaceId: match.source.identity.workspaceId, accountId: match.source.identity.accountId });
  if (metadata.accountId !== match.source.identity.accountId || metadata.workspaceId !== match.source.identity.workspaceId
    || metadata.ticket.id !== expected['ticket.id'] || metadata.ticket.number !== expected['ticket.number']
    || metadata.ticket.project_id !== expected['ticket.project_id']) fail('ticket-scope-mismatch');
  return { status: 'resolved', sourceId: match.source.id, sourceName: match.source.name, sourceIdentity: match.source.identity,
    routeId: match.route.id, workspaceId: metadata.ticket.project_id, workspaceName: match.route.placement.workspaceName,
    workspaceType: 'workspace', itemId: metadata.ticket.id, itemName: '' };
}
