import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  matchPagePattern,
  matchingWorkspaceSources,
  normalizeWorkspaceSource,
  resolveWorkspaceSourceMatch,
  shortcutWorkspaceSource,
} from '../sources.js';

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return payload; } };
}

test('matches named values from a declarative page pattern', () => {
  assert.deepEqual(
    matchPagePattern(
      'https://tracker.example/workspaces/{workspace}/items/{itemId}',
      'https://tracker.example/workspaces/north/items/482?view=detail',
    ),
    { workspace: 'north', itemId: '482' },
  );
});

test('rejects mutation requests', () => {
  assert.throws(() => normalizeWorkspaceSource({
    schemaVersion: 1, id: 'tracker', name: 'Tracker', enabled: true,
    permissionOrigins: ['https://api.tracker.example/*'],
    routes: [{
      pagePattern: 'https://tracker.example/items/{itemId}',
      steps: [{ request: { method: 'POST', url: 'https://api.tracker.example/items/{itemId}' } }],
      placement: { workspaceId: '{itemId}', workspaceName: 'Workspace' },
    }],
  }), /must use GET/);
});

test('rejects missing and unsupported source schema versions', () => {
  const route = {
    pagePattern: 'https://tracker.example/items/{itemId}',
    placement: { workspaceId: '{itemId}', workspaceName: 'Workspace' },
  };
  assert.throws(() => normalizeWorkspaceSource({
    id: 'tracker',
    name: 'Tracker',
    routes: [route],
  }), /schema version 1/);
  assert.throws(() => normalizeWorkspaceSource({
    schemaVersion: 2,
    id: 'tracker',
    name: 'Tracker',
    routes: [route],
  }), /schema version 1/);
});

test('rejects undeclared API origins at request time', async () => {
  const source = normalizeWorkspaceSource({
    schemaVersion: 1, id: 'tracker', name: 'Tracker', enabled: true,
    permissionOrigins: ['https://api.tracker.example/*'],
    routes: [{
      pagePattern: 'https://tracker.example/items/{itemId}',
      steps: [{ request: { method: 'GET', url: 'https://other.example/items/{itemId}' } }],
      placement: { workspaceId: '{itemId}', workspaceName: 'Workspace' },
    }],
  });
  const [match] = matchingWorkspaceSources([source], 'https://tracker.example/items/42');
  await assert.rejects(
    resolveWorkspaceSourceMatch(match, {}, async () => response({})),
    /not declared/,
  );
});

test('resolves a workspace through bounded GET and property extraction steps', async () => {
  const source = normalizeWorkspaceSource({
    schemaVersion: 1,
    id: 'tracker',
    name: 'Tracker',
    enabled: true,
    precedence: 'after-rules',
    permissionOrigins: ['https://api.tracker.example/*'],
    credentials: [{ id: 'token', label: 'Access token', headerName: 'Tracker-Token' }],
    routes: [{
      id: 'item',
      pagePattern: 'https://tracker.example/items/{itemId}',
      steps: [
        {
          request: { url: 'https://api.tracker.example/items/{itemId}' },
          extract: { workspaceId: 'workspace_id', itemName: 'name' },
        },
        {
          when: 'workspaceId',
          request: { url: 'https://api.tracker.example/workspaces/{workspaceId}' },
          extract: { workspaceName: ['display_name', 'name'] },
        },
      ],
      placement: {
        workspaceId: '{workspaceId}',
        workspaceName: '{workspaceName}',
        itemId: '{itemId}',
        itemName: '{itemName}',
      },
    }],
  });
  const calls = [];
  const [match] = matchingWorkspaceSources([source], 'https://tracker.example/items/482');
  const result = await resolveWorkspaceSourceMatch(match, { token: 'local-secret' }, async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/items/482')) return response({ name: 'Accessibility audit', workspace_id: 'north' });
    return response({ display_name: 'North launch' });
  });
  assert.deepEqual(result, {
    status: 'resolved',
    sourceId: 'tracker',
    sourceName: 'Tracker',
    routeId: 'item',
    workspaceId: 'north',
    workspaceName: 'North launch',
    workspaceType: 'workspace',
    itemId: '482',
    itemName: 'Accessibility audit',
  });
  assert.equal(calls.length, 2);
  assert.equal(calls.every(({ options }) => options.method === 'GET'), true);
  assert.equal(calls.every(({ options }) => options.headers['Tracker-Token'] === 'local-secret'), true);
  assert.equal(calls.every(({ options }) => options.redirect === 'error'), true);
});

test('represents the current Shortcut behavior as ordinary source data', async () => {
  const source = shortcutWorkspaceSource({ enabled: true, workspaceSlug: 'sample-workspace' });
  const [match] = matchingWorkspaceSources([source], 'https://app.shortcut.com/sample-workspace/story/482');
  const result = await resolveWorkspaceSourceMatch(match, { apiToken: 'example-token' }, async (url) => {
    if (url.endsWith('/stories/482')) return response({ name: 'Public beta', epic_id: 73 });
    return response({ name: 'Browser workspace' });
  });
  assert.equal(source.precedence, 'before-rules');
  assert.equal(result.workspaceId, '73');
  assert.equal(result.workspaceName, 'Browser workspace');
  assert.equal(result.routeId, 'story');
});

test('ships the optional Shortcut example as valid disabled profile data', async () => {
  const example = JSON.parse(await readFile(new URL('../examples/workspace-sources/shortcut.json', import.meta.url), 'utf8'));
  const source = normalizeWorkspaceSource(example);
  assert.equal(source.id, 'shortcut');
  assert.equal(source.enabled, false);
  assert.deepEqual(source.permissionOrigins, ['https://api.app.shortcut.com/*']);
  assert.deepEqual(source.routes.map((route) => route.id), ['story', 'epic', 'iteration']);
});

test('redacts source credentials from API errors', async () => {
  const source = shortcutWorkspaceSource({ enabled: true });
  const [match] = matchingWorkspaceSources([source], 'https://app.shortcut.com/workspace/epic/73');
  await assert.rejects(
    resolveWorkspaceSourceMatch(match, { apiToken: 'secret-value' }, async () => (
      response({ message: 'Rejected secret-value' }, 401)
    )),
    (error) => error.message.includes('[redacted]') && !error.message.includes('secret-value'),
  );
});

test('times out a stalled Workspace Source request', async () => {
  const source = shortcutWorkspaceSource({ enabled: true });
  const [match] = matchingWorkspaceSources([source], 'https://app.shortcut.com/workspace/epic/73');
  const stalledRequest = resolveWorkspaceSourceMatch(
    match,
    { apiToken: 'example-token' },
    (_url, options) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal.reason));
    }),
    { requestTimeoutMs: 5 },
  );

  await assert.rejects(
    Promise.race([
      stalledRequest,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Source request did not time out.')), 50)),
    ]),
    /request timed out/i,
  );
});
