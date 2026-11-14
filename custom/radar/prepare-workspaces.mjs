// Private-use file conversion only. No network, browser access, credentials or settings writes.
import { createHash } from 'node:crypto';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseWorkspaceFile } from '../../workspace-import.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fields(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new Error('Use only the documented metadata fields, without content or credentials.');
  }
}
function uuid(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error('Native IDs must be verified UUIDs.');
  return value.toLowerCase();
}

export function radarMetadataToWorkspaces(input) {
  fields(input, ['format', 'version', 'accountId', 'workspaceId', 'projects', 'tickets']);
  if (input.format !== 'tab-bundlr-radar-metadata' || input.version !== 1) throw new Error('Use metadata version 1.');
  const accountId = uuid(input.accountId);
  const workspaceId = uuid(input.workspaceId);
  if (!Array.isArray(input.projects) || !Array.isArray(input.tickets)
    || input.projects.length > 200 || input.tickets.length > 500) throw new Error('Keep conversions to 200 projects and 500 tickets.');
  const projects = new Map();
  for (const project of input.projects) {
    fields(project, ['id', 'name']);
    const id = uuid(project.id);
    if (projects.has(id) || typeof project.name !== 'string') throw new Error('Projects need unique native IDs and reviewed names.');
    projects.set(id, { id: `radar-${createHash('sha256').update(JSON.stringify([
      'radar', 'https://radar.sdg.la', accountId, workspaceId, 'project', id,
    ])).digest('hex')}`, name: project.name, urls: [] });
  }
  const ticketIds = new Set();
  const numbers = new Set();
  for (const ticket of input.tickets) {
    fields(ticket, ['id', 'number', 'workspace_id', 'project_id']);
    const id = uuid(ticket.id);
    const project = projects.get(uuid(ticket.project_id));
    if (uuid(ticket.workspace_id) !== workspaceId || !project || !Number.isSafeInteger(ticket.number)
      || ticket.number < 1 || ticketIds.has(id) || numbers.has(ticket.number)) {
      throw new Error('Tickets need a unique UUID/number pair and an explicit relationship to a reviewed project in this workspace.');
    }
    ticketIds.add(id);
    numbers.add(ticket.number);
    // Short-number URLs do not encode account/workspace scope. Only emit canonical UUID routes.
    project.urls.push(`https://radar.sdg.la/tickets/${id}`);
  }
  return parseWorkspaceFile(JSON.stringify({ format: 'tab-bundlr-workspaces', version: 1,
    workspaces: [...projects.values()] }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [, , from, to] = process.argv;
    if (!from || !to || process.argv.length !== 4) throw new Error('Usage: node custom/radar/prepare-workspaces.mjs metadata.json workspaces.json');
    if ((await stat(from)).size > 256 * 1024) throw new Error('Metadata must be smaller than 256 KB.');
    const raw = await readFile(from);
    if (raw.length > 256 * 1024) throw new Error('Metadata must be smaller than 256 KB.');
    const result = radarMetadataToWorkspaces(JSON.parse(raw.toString('utf8')));
    // Refuse to replace a previous file. Output contains private project labels and URLs.
    await writeFile(to, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    console.log(`Prepared ${result.workspaces.length} workspace(s). No browser or settings were changed.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
