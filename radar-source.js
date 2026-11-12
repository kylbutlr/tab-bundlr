// Offline preparation only. No session, OAuth client, credentials or network access.
// Evidence and remaining runtime gates are recorded in docs/radar-extension-session.md.
export const RADAR_AUTHORITY = 'https://radar.sdg.la';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRadarTicketUrl(value) {
  try {
    const url = new URL(value);
    if (url.origin !== RADAR_AUTHORITY || url.username || url.password) return null;
    const native = /^\/tickets\/([^/]+)\/?$/.exec(url.pathname);
    if (native && UUID.test(native[1])) return { kind: 'uuid', id: native[1].toLowerCase() };
    const short = /^\/t\/([1-9][0-9]*)\/?$/.exec(url.pathname);
    if (short && Number.isSafeInteger(Number(short[1]))) return { kind: 'number', number: Number(short[1]) };
  } catch { /* Not a supported ticket URL. */ }
  return null;
}

function uuid(value, field) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error(`Radar ${field} must be a native UUID.`);
  return value.toLowerCase();
}

// Only records with explicit project IDs and reviewed labels can propose grouping.
// A short URL alone never supplies the UUID required by ticket-get.
export function prepareRadarSource({ connectionId, accountId, workspaceId, projects, tickets }) {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(connectionId || '') || !String(accountId || '').trim()) {
    throw new Error('Radar needs an explicit connection ID and account profile.');
  }
  const workspace = uuid(workspaceId, 'workspace_id');
  const projectNames = new Map();
  for (const project of projects || []) {
    const id = uuid(project.id, 'project_id');
    if (!String(project.name || '').trim() || projectNames.has(id)) throw new Error('Review one label per Radar project ID.');
    projectNames.set(id, String(project.name).trim());
  }
  const seenIds = new Set();
  const seenNumbers = new Set();
  const routes = [];
  const legacyReferences = [];
  for (const ticket of tickets || []) {
    const id = uuid(ticket.id, 'ticket.id');
    const projectId = uuid(ticket.project_id, 'ticket.project_id');
    if (uuid(ticket.workspace_id, 'ticket.workspace_id') !== workspace) throw new Error('Radar workspace mismatch.');
    if (!Number.isSafeInteger(ticket.number) || ticket.number < 1
      || seenIds.has(id) || seenNumbers.has(ticket.number)) throw new Error('Radar ticket identities must be unique UUID/number pairs.');
    seenIds.add(id);
    seenNumbers.add(ticket.number);
    const name = projectNames.get(projectId);
    if (!name) throw new Error('Radar project has no reviewed label. Do not infer grouping from URLs or titles.');
    // Both forms use the verified UUID. No number-to-UUID endpoint is invented.
    for (const path of [`tickets/${id}`, `t/${ticket.number}`]) {
      routes.push({
        id: `${id}-${path.startsWith('t/') ? 'short' : 'native'}`,
        pagePattern: `${RADAR_AUTHORITY}/${path}`,
        exact: true,
        steps: [{
          request: { method: 'GET', url: `${RADAR_AUTHORITY}/api/reads?op=ticket-get&id=${id}&include=page` },
          expect: { 'ticket.id': id, 'ticket.number': ticket.number,
            'ticket.workspace_id': workspace, 'ticket.project_id': projectId },
          extract: { itemId: 'ticket.id' },
        }],
        placement: { workspaceId: projectId, workspaceName: name, workspaceType: 'workspace', itemId: '{itemId}' },
      });
    }
    if (ticket.shortcut_story_id !== null && ticket.shortcut_story_id !== undefined) {
      const legacyId = String(ticket.shortcut_story_id);
      if (!/^[1-9][0-9]*$/.test(legacyId)) throw new Error('Invalid explicit Shortcut source reference.');
      legacyReferences.push({ radarUuid: id, radarNumber: ticket.number, shortcutStoryId: legacyId,
        status: 'review-required', reason: 'Verify the Shortcut workspace and account before proposing any rule change.' });
    }
  }
  if (!routes.length) throw new Error('Radar preview requires at least one verified ticket record.');
  return {
    status: 'authentication-unavailable',
    reason: 'Independent extension authentication for the Radar read API has not been verified. This proposal cannot be saved or enabled.',
    source: {
      schemaVersion: 2, id: connectionId, name: 'Radar', enabled: false, precedence: 'after-rules',
      identity: { provider: 'radar', authority: RADAR_AUTHORITY, workspaceId: workspace,
        accountId: String(accountId).trim(), entityKind: 'project' },
      authentication: { type: 'unavailable' },
      permissionOrigins: [`${RADAR_AUTHORITY}/*`], credentials: [], routes,
    },
    legacyReferences,
  };
}
