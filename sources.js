export const WORKSPACE_SOURCES_STORAGE_KEY = 'workspaceSources';
export const WORKSPACE_SOURCE_SECRETS_STORAGE_KEY = 'workspaceSourceSecrets';
export const SETTINGS_VERSION_STORAGE_KEY = 'settingsVersion';
export const CURRENT_SETTINGS_VERSION = 2;
export const HOME_BASE_DUPLICATE_ACTION_STORAGE_KEY = 'homeBaseDuplicateAction';
export const HOME_BASE_DUPLICATE_REVIEW = 'review';
export const HOME_BASE_DUPLICATE_REMOVE_EXACT = 'remove-exact-inactive';
export const OPENER_INHERITANCE_STORAGE_KEY = 'openerInheritance';
export const DEFAULT_OPENER_INHERITANCE = true;
export const DEFAULT_SOURCE_REQUEST_TIMEOUT_MS = 10_000;

const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9_.-]*)\}/g;
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const SOURCE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function uniqueStrings(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean))];
}

function validHttpsPattern(value) {
  return /^https:\/\/(?:\*\.)?[A-Za-z0-9.-]+(?::\d+)?\/\*$/.test(String(value || ''));
}

function validPagePattern(value) {
  try {
    const sample = String(value || '').replace(PLACEHOLDER_PATTERN, 'sample');
    const url = new URL(sample);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function normalizeExtract(value) {
  return Object.fromEntries(Object.entries(plainObject(value))
    .map(([key, paths]) => [
      String(key || '').trim(),
      uniqueStrings(Array.isArray(paths) ? paths : [paths]),
    ])
    .filter(([key, paths]) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(key) && paths.length));
}

function normalizeRoute(route, index) {
  const source = plainObject(route);
  const pagePattern = String(source.pagePattern || '').trim();
  const placement = plainObject(source.placement);
  const steps = (Array.isArray(source.steps) ? source.steps : [])
    .map((step) => {
      const candidate = plainObject(step);
      const request = plainObject(candidate.request);
      const method = String(request.method || 'GET').trim().toUpperCase();
      if (method !== 'GET') throw new Error('Workspace Source requests must use GET.');
      const url = String(request.url || '').trim();
      if (!validPagePattern(url)) return null;
      return {
        when: uniqueStrings(Array.isArray(candidate.when) ? candidate.when : candidate.when ? [candidate.when] : []),
        request: { method, url },
        extract: normalizeExtract(candidate.extract),
      };
    })
    .filter(Boolean);
  if (!validPagePattern(pagePattern)) return null;
  const workspaceId = String(placement.workspaceId || '').trim();
  const workspaceName = String(placement.workspaceName || '').trim();
  if (!workspaceId || !workspaceName) return null;
  return {
    id: String(source.id || `route-${index + 1}`).trim(),
    pagePattern,
    steps,
    placement: {
      workspaceId,
      workspaceName,
      workspaceType: source.placement?.workspaceType === 'collection' ? 'collection' : 'workspace',
      itemId: String(placement.itemId || '').trim(),
      itemName: String(placement.itemName || '').trim(),
    },
  };
}

export function normalizeWorkspaceSource(value) {
  const source = plainObject(value);
  if (Number(source.schemaVersion) !== 1) {
    throw new Error('Workspace Sources must use schema version 1.');
  }
  const id = String(source.id || '').trim().toLowerCase();
  const name = String(source.name || '').replace(/\s+/g, ' ').trim();
  if (!SOURCE_ID_PATTERN.test(id)) throw new Error('Workspace Source IDs may use lowercase letters, numbers, dots, dashes, and underscores.');
  if (!name) throw new Error('Workspace Sources need a name.');
  const permissionOrigins = uniqueStrings(source.permissionOrigins).filter(validHttpsPattern);
  if (permissionOrigins.length !== uniqueStrings(source.permissionOrigins).length) {
    throw new Error(`${name} contains an invalid API origin. Only explicit HTTPS match patterns are allowed.`);
  }
  const credentials = (Array.isArray(source.credentials) ? source.credentials : [])
    .map((credential) => {
      const candidate = plainObject(credential);
      const credentialId = String(candidate.id || '').trim();
      const headerName = String(candidate.headerName || '').trim();
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(credentialId) || !HEADER_NAME_PATTERN.test(headerName)) return null;
      return {
        id: credentialId,
        label: String(candidate.label || credentialId).replace(/\s+/g, ' ').trim(),
        type: 'header',
        headerName,
      };
    })
    .filter(Boolean);
  const routes = (Array.isArray(source.routes) ? source.routes : [])
    .map(normalizeRoute)
    .filter(Boolean);
  if (!routes.length) throw new Error(`${name} needs at least one valid route.`);
  return {
    schemaVersion: 1,
    id,
    name,
    enabled: source.enabled === true,
    precedence: source.precedence === 'before-rules' ? 'before-rules' : 'after-rules',
    permissionOrigins,
    credentials,
    routes,
  };
}

export function normalizeWorkspaceSources(value) {
  const byId = new Map();
  (Array.isArray(value) ? value : []).forEach((source) => {
    try {
      const normalized = normalizeWorkspaceSource(source);
      byId.set(normalized.id, normalized);
    } catch {
      // Invalid imported sources are omitted rather than made executable.
    }
  });
  return [...byId.values()];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function matchPagePattern(pattern, value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const names = [];
  let cursor = 0;
  let expression = '^';
  for (const match of String(pattern || '').matchAll(PLACEHOLDER_PATTERN)) {
    expression += escapeRegExp(String(pattern).slice(cursor, match.index));
    expression += '([^/?#]+)';
    names.push(match[1]);
    cursor = Number(match.index) + match[0].length;
  }
  expression += `${escapeRegExp(String(pattern || '').slice(cursor))}(?:[/?#]|$)`;
  const result = new RegExp(expression).exec(url.href);
  if (!result) return null;
  return Object.fromEntries(names.map((name, index) => {
    try {
      return [name, decodeURIComponent(result[index + 1])];
    } catch {
      return [name, result[index + 1]];
    }
  }));
}

export function matchingWorkspaceSources(sources, value) {
  return normalizeWorkspaceSources(sources).flatMap((source) => source.routes
    .map((route) => {
      const captures = matchPagePattern(route.pagePattern, value);
      return captures ? { source, route, captures } : null;
    })
    .filter(Boolean));
}

function interpolate(template, context, encode = true) {
  return String(template || '').replace(PLACEHOLDER_PATTERN, (placeholder, key) => {
    const value = context[key];
    return value === null || value === undefined || value === ''
      ? placeholder
      : encode ? encodeURIComponent(String(value)) : String(value);
  });
}

function valueAtPath(value, path) {
  return String(path || '').split('.').filter(Boolean).reduce((current, segment) => {
    if (current === null || current === undefined) return undefined;
    return current[segment];
  }, value);
}

function firstExtractedValue(payload, paths) {
  for (const path of paths) {
    const value = valueAtPath(payload, path);
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
}

function originPatternMatches(pattern, url) {
  const parsed = new URL(url);
  const match = /^https:\/\/(\*\.)?([^/]+)\/\*$/.exec(pattern);
  if (!match || parsed.protocol !== 'https:') return false;
  const host = parsed.host.toLowerCase();
  const allowedHost = match[2].toLowerCase();
  return match[1] ? host === allowedHost || host.endsWith(`.${allowedHost}`) : host === allowedHost;
}

function sourceHeaders(source, secrets) {
  const headers = { Accept: 'application/json' };
  for (const credential of source.credentials) {
    const value = String(plainObject(secrets)[credential.id] || '').trim();
    if (!value) throw new Error(`${source.name} needs ${credential.label}.`);
    headers[credential.headerName] = value;
  }
  return headers;
}

function safeSourceError(source, status, payload, secrets) {
  const detail = typeof payload?.message === 'string'
    ? payload.message
    : typeof payload?.error === 'string' ? payload.error : '';
  let safeDetail = detail;
  Object.values(plainObject(secrets)).forEach((secret) => {
    if (secret) safeDetail = safeDetail.split(String(secret)).join('[redacted]');
  });
  return `${source.name} request failed (${status})${safeDetail ? `: ${safeDetail}` : ''}`;
}

export async function resolveWorkspaceSourceMatch(
  match,
  secrets,
  fetchImpl = globalThis.fetch,
  { requestTimeoutMs = DEFAULT_SOURCE_REQUEST_TIMEOUT_MS } = {},
) {
  const { source, route, captures } = match;
  if (!source.enabled) return { status: 'disabled', sourceId: source.id };
  const context = { ...captures };
  const headers = sourceHeaders(source, secrets);
  for (const step of route.steps) {
    if (step.when.some((key) => context[key] === null || context[key] === undefined || context[key] === '')) continue;
    const requestUrl = interpolate(step.request.url, context);
    if (PLACEHOLDER_PATTERN.test(requestUrl)) {
      PLACEHOLDER_PATTERN.lastIndex = 0;
      throw new Error(`${source.name} could not fill every request value for ${route.id}.`);
    }
    PLACEHOLDER_PATTERN.lastIndex = 0;
    if (!source.permissionOrigins.some((pattern) => originPatternMatches(pattern, requestUrl))) {
      throw new Error(`${source.name} tried to use an API origin that is not declared in its profile.`);
    }
    const controller = new AbortController();
    const timeoutMs = Number.isFinite(Number(requestTimeoutMs))
      ? Math.max(1, Number(requestTimeoutMs))
      : DEFAULT_SOURCE_REQUEST_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    timeout?.unref?.();
    let response;
    let payload;
    try {
      response = await fetchImpl(requestUrl, {
        method: 'GET',
        headers,
        redirect: 'error',
        signal: controller.signal,
      });
      payload = await response.json().catch(() => null);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`${source.name} request timed out.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error(safeSourceError(source, response.status, payload, secrets));
    Object.entries(step.extract).forEach(([key, paths]) => {
      context[key] = firstExtractedValue(payload, paths);
    });
  }
  const workspaceId = interpolate(route.placement.workspaceId, context, false);
  const workspaceName = interpolate(route.placement.workspaceName, context, false);
  if (!workspaceId || !workspaceName || PLACEHOLDER_PATTERN.test(`${workspaceId}${workspaceName}`)) {
    PLACEHOLDER_PATTERN.lastIndex = 0;
    return { status: 'unassigned', sourceId: source.id, routeId: route.id };
  }
  PLACEHOLDER_PATTERN.lastIndex = 0;
  return {
    status: 'resolved',
    sourceId: source.id,
    sourceName: source.name,
    routeId: route.id,
    workspaceId,
    workspaceName,
    workspaceType: route.placement.workspaceType,
    itemId: interpolate(route.placement.itemId, context, false),
    itemName: interpolate(route.placement.itemName, context, false),
  };
}

export function shortcutWorkspaceSource({ enabled = false, workspaceSlug = 'workspace' } = {}) {
  const slug = String(workspaceSlug || 'workspace').trim().replace(/[^A-Za-z0-9_-]/g, '') || 'workspace';
  return normalizeWorkspaceSource({
    schemaVersion: 1,
    id: 'shortcut',
    name: 'Shortcut',
    enabled,
    precedence: 'before-rules',
    permissionOrigins: ['https://api.app.shortcut.com/*'],
    credentials: [{ id: 'apiToken', label: 'API token', type: 'header', headerName: 'Shortcut-Token' }],
    routes: [
      {
        id: 'story',
        pagePattern: `https://app.shortcut.com/${slug}/story/{itemId}`,
        steps: [
          {
            request: { method: 'GET', url: 'https://api.app.shortcut.com/api/v3/stories/{itemId}' },
            extract: { workspaceId: ['epic_id', 'epic.id'], itemName: ['name', 'title'] },
          },
          {
            when: ['workspaceId'],
            request: { method: 'GET', url: 'https://api.app.shortcut.com/api/v3/epics/{workspaceId}' },
            extract: { workspaceName: ['name', 'title'] },
          },
        ],
        placement: {
          workspaceId: '{workspaceId}',
          workspaceName: '{workspaceName}',
          workspaceType: 'workspace',
          itemId: '{itemId}',
          itemName: '{itemName}',
        },
      },
      {
        id: 'epic',
        pagePattern: `https://app.shortcut.com/${slug}/epic/{workspaceId}`,
        steps: [{
          request: { method: 'GET', url: 'https://api.app.shortcut.com/api/v3/epics/{workspaceId}' },
          extract: { workspaceName: ['name', 'title'] },
        }],
        placement: { workspaceId: '{workspaceId}', workspaceName: '{workspaceName}', workspaceType: 'workspace' },
      },
      {
        id: 'iteration',
        pagePattern: `https://app.shortcut.com/${slug}/iteration/{workspaceId}`,
        steps: [{
          request: { method: 'GET', url: 'https://api.app.shortcut.com/api/v3/iterations/{workspaceId}' },
          extract: { workspaceName: ['name', 'title'] },
        }],
        placement: { workspaceId: '{workspaceId}', workspaceName: '{workspaceName}', workspaceType: 'collection' },
      },
    ],
  });
}
