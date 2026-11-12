import { validateRadarSessionSource } from './radar-session.js';
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
const PROPERTY_PATH_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

export class SourceAuthenticationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SourceAuthenticationError';
    this.code = code;
  }
}

export function normalizeSourceIdentity(value) {
  const identity = plainObject(value);
  const fields = ['provider', 'authority', 'workspaceId', 'accountId', 'entityKind'];
  if (fields.some((key) => typeof identity[key] !== 'string' || !identity[key].trim())) {
    throw new Error('Version 2 sources need provider, authority, workspaceId, accountId and entityKind identity fields.');
  }
  const authority = new URL(identity.authority);
  if (authority.protocol !== 'https:' || authority.origin !== identity.authority) {
    throw new Error('Source authority must be an exact HTTPS origin.');
  }
  return Object.fromEntries(fields.map((key) => [key, identity[key].trim()]));
}

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
      if (Object.keys(request).some((key) => !['method', 'url'].includes(key))) {
        throw new Error('Workspace Source requests support only method and url.');
      }
      const url = String(request.url || '').trim();
      if (!validPagePattern(url)) throw new Error('Workspace Source request URLs must use HTTPS.');
      if (Object.hasOwn(candidate, 'expect') && (!candidate.expect || typeof candidate.expect !== 'object' || Array.isArray(candidate.expect))) {
        throw new Error('Source response expectations must be a property map.');
      }
      const expected = plainObject(candidate.expect);
      if (Object.entries(expected).some(([path, value]) => !PROPERTY_PATH_PATTERN.test(path)
        || !['string', 'number', 'boolean'].includes(typeof value))) {
        throw new Error('Source response expectations must use property paths and literal values.');
      }
      return {
        when: uniqueStrings(Array.isArray(candidate.when) ? candidate.when : candidate.when ? [candidate.when] : []),
        request: { method, url },
        extract: normalizeExtract(candidate.extract),
        ...(candidate.expect ? { expect: expected } : {}),
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
    ...(source.exact === true ? { exact: true } : {}),
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
  const version = Number(source.schemaVersion);
  if (![1, 2, 3, 4].includes(version)) {
    throw new Error('Workspace Sources must use schema version 1, 2, 3 or 4.');
  }
  if (version === 1 && (source.identity || source.authentication)) {
    throw new Error('Identity and authentication declarations require source schema version 2.');
  }
  if (version === 1 && (source.routes || []).some((route) => route.exact || (route.steps || []).some((step) => step.expect))) {
    throw new Error('Exact routes and response identity expectations require source schema version 2.');
  }
  const identity = version >= 2 ? normalizeSourceIdentity(source.identity) : null;
  const authentication = version >= 2 ? plainObject(source.authentication) : null;
  if (authentication && !(version >= 3 ? ['radar-tab-session'] : ['none', 'header']).includes(authentication.type)) {
    throw new SourceAuthenticationError('This source needs an independently verified authentication method. OAuth, browser sessions and unavailable authentication cannot be enabled.', 'authentication-unavailable');
  }
  if (authentication && Object.keys(authentication).some((key) => key !== 'type')) {
    throw new Error('Authentication values must be stored separately from source JSON.');
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
      if ((candidate.type && candidate.type !== 'header')
        || Object.keys(candidate).some((key) => !['id', 'label', 'type', 'headerName'].includes(key))
        || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(credentialId) || !HEADER_NAME_PATTERN.test(headerName)) {
        throw new Error('Workspace Source credentials must reference a separate header credential.');
      }
      if (/^(cookie|set-cookie|host|origin|referer)$/i.test(headerName)) {
        throw new Error('Workspace Sources cannot supply browser session headers.');
      }
      return {
        id: credentialId,
        label: String(candidate.label || credentialId).replace(/\s+/g, ' ').trim(),
        type: 'header',
        headerName,
      };
    })
    .filter(Boolean);
  if (authentication && authentication.type !== 'radar-tab-session' && ((authentication.type === 'none') !== (credentials.length === 0))) {
    throw new Error('Source authentication must match its credential declarations.');
  }
  const routes = (Array.isArray(source.routes) ? source.routes : [])
    .map(normalizeRoute)
    .filter(Boolean);
  if (!routes.length) throw new Error(`${name} needs at least one valid route.`);
  const normalized = {
    schemaVersion: version,
    ...(identity ? { identity, authentication: { type: authentication.type } } : {}),
    id,
    name,
    enabled: source.enabled === true,
    precedence: source.precedence === 'before-rules' ? 'before-rules' : 'after-rules',
    permissionOrigins,
    credentials,
    routes,
    ...(version === 4 ? { projects: (Array.isArray(source.projects) ? source.projects : [])
      .map((project) => ({ id: project?.id, name: project?.name })) } : {}),
  };
  if (version >= 3) validateRadarSessionSource(normalized);
  return normalized;
}

// Explicit opt-in conversion. Existing settings and destination IDs are never rewritten here.
export function upgradeWorkspaceSource(value, identity) {
  const source = normalizeWorkspaceSource(value);
  return normalizeWorkspaceSource({ ...source, schemaVersion: 2, enabled: false,
    identity, authentication: { type: source.credentials.length ? 'header' : 'none' } });
}

// Editing a definition must not rebind its previous account's secret to a new source.
export function workspaceSourceSaveChanges(stored, value) {
  const source = normalizeWorkspaceSource({ ...value, enabled: false });
  const secrets = { ...plainObject(stored[WORKSPACE_SOURCE_SECRETS_STORAGE_KEY]) };
  delete secrets[source.id];
  return {
    [WORKSPACE_SOURCES_STORAGE_KEY]: [...normalizeWorkspaceSources(stored[WORKSPACE_SOURCES_STORAGE_KEY])
      .filter((candidate) => candidate.id !== source.id), source],
    [WORKSPACE_SOURCE_SECRETS_STORAGE_KEY]: secrets,
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

export function matchPagePattern(pattern, value, { exact = false } = {}) {
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
  expression += `${escapeRegExp(String(pattern || '').slice(cursor))}${exact ? '/?(?:[?#]|$)' : '(?:[/?#]|$)'}`;
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
      const captures = matchPagePattern(route.pagePattern, value, { exact: route.exact });
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
    return Object.hasOwn(Object(current), segment) ? current[segment] : undefined;
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
    if (!value) throw new SourceAuthenticationError(`${source.name} needs ${credential.label}.`, 'authentication-unavailable');
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
  const source = normalizeWorkspaceSource(match.source);
  if (source.schemaVersion >= 3) throw new SourceAuthenticationError('Radar requires its own extension tab transport.', 'extension-session-required');
  const { route, captures } = match;
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
        credentials: 'omit',
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
    if (!response.ok) {
      const codes = { 401: 'authentication-expired', 403: 'access-denied', 428: 'verification-required' };
      const message = safeSourceError(source, response.status, payload, secrets);
      if (codes[response.status]) throw new SourceAuthenticationError(message, codes[response.status]);
      throw new Error(message);
    }
    for (const [path, expected] of Object.entries(step.expect || {})) {
      if (valueAtPath(payload, path) !== expected) {
        throw new Error(`${source.name} response identity did not match the reviewed source.`);
      }
    }
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
    ...(source.identity ? { sourceIdentity: source.identity } : {}),
    routeId: route.id,
    workspaceId,
    workspaceName,
    workspaceType: route.placement.workspaceType,
    itemId: interpolate(route.placement.itemId, context, false),
    itemName: interpolate(route.placement.itemName, context, false),
  };
}
