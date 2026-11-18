import assert from 'node:assert/strict';
import test from 'node:test';
import { radarMetadataToWorkspaces } from '../custom/radar/prepare-workspaces.mjs';

const fixture = () => ({ format: 'tab-bundlr-radar-metadata', version: 1,
  accountId: '44444444-4444-4444-8444-444444444444', workspaceId: '11111111-1111-4111-8111-111111111111',
  projects: [{ id: '22222222-2222-4222-8222-222222222222', name: 'Synthetic project' }],
  tickets: [{ id: '33333333-3333-4333-8333-333333333333', number: 42,
    workspace_id: '11111111-1111-4111-8111-111111111111', project_id: '22222222-2222-4222-8222-222222222222' }] });
test('custom conversion prepares plain workspace JSON using explicit native relationships', () => {
  const result = radarMetadataToWorkspaces(fixture());
  assert.equal(result.format, 'tab-bundlr-workspaces');
  assert.equal(result.workspaces[0].name, 'Synthetic project');
  assert.deepEqual(result.workspaces[0].urls, ['https://radar.sdg.la/tickets/33333333-3333-4333-8333-333333333333']);
  assert.equal(result.workspaces[0].urls.some((url) => url.includes('/t/42')), false);
  assert.equal('accountId' in result, false);
});
test('equal project/ticket numbers in different account scopes produce separate local IDs', () => {
  const other = fixture();
  other.accountId = '55555555-5555-4555-8555-555555555555';
  assert.notEqual(radarMetadataToWorkspaces(other).workspaces[0].id, radarMetadataToWorkspaces(fixture()).workspaces[0].id);
});
for (const change of [
  (input) => { input.tickets[0].workspace_id = input.accountId; },
  (input) => { input.tickets[0].project_id = input.accountId; },
  (input) => { input.tickets.push(input.tickets[0]); },
  (input) => { input.projects.push(input.projects[0]); },
  (input) => { input.tickets[0].description = 'Do not collect content'; },
  (input) => { input.token = 'synthetic-only'; },
  (input) => { input.tickets[0].id = '42'; },
]) test('custom conversion rejects ambiguous, unqualified or excessive metadata', () => {
  const input = fixture(); change(input);
  assert.throws(() => radarMetadataToWorkspaces(input));
});
