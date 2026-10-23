// Compatibility profile for pre-v2 installations. New connections use the public source schema.
import { normalizeWorkspaceSource } from './sources.js';

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
