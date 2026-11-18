import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseWorkspaceFile, previewWorkspaceImport, applyWorkspaceImport, undoWorkspaceImport,
  canUndoWorkspaceImport, exportWorkspaceFile, isWorkspaceImportChange, WORKSPACE_IMPORT_UNDO_KEY,
} from '../workspace-import.js';
import { bestUrlAssignmentForUrl } from '../rules.js';
import { migrateLegacySettings } from '../settings.js';
import { normalizeWorkspaceSources, normalizeWorkspaceSource, workspaceSourceSaveChanges } from '../sources.js';
import { shortcutWorkspaceSource } from '../legacy-shortcut.js';

const copy = (value) => structuredClone(value);
const file = (workspaces = [{ id: 'docs', name: 'Documentation', urls: ['https://docs.example/product'] }]) => ({
  format: 'tab-bundlr-workspaces', version: 1, workspaces,
});
function fixture(initial = {}) {
  const values = copy(initial);
  const writes = [];
  const changes = [];
  const storage = {
    async get(keys) { return copy(Object.fromEntries(keys.filter((key) => Object.hasOwn(values, key)).map((key) => [key, values[key]]))); },
    async set(next) {
      writes.push(copy(next));
      changes.push(Object.fromEntries(Object.entries(next).map(([key, newValue]) => [key, { oldValue: values[key], newValue }])));
      Object.assign(values, copy(next));
    },
  };
  return { values, writes, changes, storage };
}

test('accepts portable workspace JSON, including saved workspaces with no rules', () => {
  assert.deepEqual(parseWorkspaceFile(JSON.stringify(file([{ id: 'empty', name: ' Empty ', urls: [] }]))),
    file([{ id: 'empty', name: 'Empty', urls: [] }]));
  const parsed = parseWorkspaceFile(JSON.stringify(file([{ id: 'docs', name: 'Docs', urls: ['https://docs.example/product/', 'https://docs.example/product'] }])));
  assert.deepEqual(parsed.workspaces[0].urls, ['https://docs.example/product']);
});

for (const [label, value] of [
  ['invalid JSON', '{'], ['unknown version', JSON.stringify({ ...file(), version: 2 })],
  ['settings backup', JSON.stringify({ format: 'tab-bundlr-settings', version: 2, settings: {} })],
  ['preference injection', JSON.stringify({ ...file(), tabBundlrEnabled: true })],
  ['source injection', JSON.stringify(file([{ id: 'docs', name: 'Docs', urls: [], workspaceSources: [] }]))],
  ['duplicate IDs', JSON.stringify(file([file().workspaces[0], file().workspaces[0]]))],
  ['empty names', JSON.stringify(file([{ id: 'docs', name: ' ', urls: [] }]))],
  ['invalid ID', JSON.stringify(file([{ id: 'source:42', name: 'Docs', urls: [] }]))],
  ['oversized file', ' '.repeat(262145)], ['empty list', JSON.stringify(file([]))],
]) test(`rejects ${label} without modifying settings`, () => assert.throws(() => parseWorkspaceFile(value)));

for (const url of ['javascript:alert(1)', 'chrome://extensions', 'https://u:p@example.test/',
  'https://docs.example/?token=secret', 'https://docs.example/#section', 'https://docs.example/*',
  'https://docs.example/{ticket}', 'not a URL', 'https://docs.example/has space']) {
  test(`rejects unsupported URL input ${url.split(':')[0]}`, () => {
    assert.throws(() => parseWorkspaceFile(JSON.stringify(file([{ id: 'docs', name: 'Docs', urls: [url] }]))));
  });
}

test('preview and selected apply preserve every unrelated setting and source credential byte-for-byte', async () => {
  const initial = { smartGroups: [{ id: 'focus', name: 'Focus', patterns: ['https://focus.example'], focusMode: true, extra: 'keep' }],
    smartGroupOrder: ['focus'], trainedRules: [{ epicId: '42', epicName: 'Shortcut project', pattern: 'https://shortcut.example/project' }],
    savedClientGroups: [{ epicId: '42', epicName: 'Shortcut project' }], workspaceSources: [shortcutWorkspaceSource()],
    workspaceSourceSecrets: { shortcut: { apiToken: 'synthetic-only' } }, tabBundlrEnabled: false,
    openerInheritance: false, persistentHomeBases: ['https://home.example'], windowAutomationPreference: { mode: 'selected' },
    managedGroupTypeEnabled: { smart: false }, activityHistory: [{ id: 'prior-move' }], lastAction: { id: 'prior-move' } };
  const f = fixture(initial);
  const preview = previewWorkspaceImport(f.values, file([
    { id: 'docs', name: 'Documentation', urls: ['https://docs.example/product'] },
    { id: 'research', name: 'Research', urls: ['https://research.example'] },
  ]));
  assert.deepEqual(f.values, initial);
  assert.equal(f.writes.length, 0);
  await applyWorkspaceImport(f.storage, preview, ['docs']);
  for (const key of Object.keys(initial).filter((key) => !['smartGroups', 'smartGroupOrder'].includes(key))) {
    assert.deepEqual(f.values[key], initial[key], key);
  }
  assert.deepEqual(f.values.smartGroups[0], initial.smartGroups[0]);
  assert.deepEqual(f.values.smartGroups.map((group) => group.id), ['focus', 'docs']);
  assert.deepEqual(f.values.smartGroupOrder, ['focus', 'docs']);
  assert.equal(f.values.smartGroups[1].focusMode, false);
  assert.equal(isWorkspaceImportChange(f.changes[0]), true);
  assert.equal(bestUrlAssignmentForUrl(f.values.smartGroups, f.values.trainedRules, 'https://docs.example/product/setup').rule.id, 'docs');
  assert.equal(canUndoWorkspaceImport(f.values), true);
  await undoWorkspaceImport(f.storage);
  assert.deepEqual(f.values.smartGroups, initial.smartGroups);
  assert.deepEqual(f.values.smartGroupOrder, initial.smartGroupOrder);
  assert.deepEqual(f.values.activityHistory, initial.activityHistory);
  assert.equal(isWorkspaceImportChange(f.changes[1]), true);
  assert.equal(canUndoWorkspaceImport(f.values), false);
});

test('update uses exact local ID, retains old rules, focus designation, order and custom fields', async () => {
  const f = fixture({ smartGroups: [{ id: 'docs', name: 'Old', patterns: ['https://old.example'], focusMode: true, custom: 42 }], smartGroupOrder: ['docs'] });
  const preview = previewWorkspaceImport(f.values, file());
  assert.equal(preview.rows[0].action, 'update');
  await applyWorkspaceImport(f.storage, preview, ['docs']);
  assert.deepEqual(f.values.smartGroups[0].patterns, ['https://old.example', 'https://docs.example/product']);
  assert.equal(f.values.smartGroups[0].custom, 42);
  assert.equal(f.values.smartGroups[0].focusMode, true);
  assert.deepEqual(f.values.smartGroupOrder, ['docs']);
  assert.equal(Object.hasOwn(f.writes[0], 'smartGroupOrder'), false);
});

test('equal-number local and connected IDs never merge across destination kinds', async () => {
  const f = fixture({ trainedRules: [{ epicId: '42', epicName: 'Connected', pattern: 'https://connected.example' }],
    savedClientGroups: [{ epicId: '42', epicName: 'Connected' }] });
  await applyWorkspaceImport(f.storage, previewWorkspaceImport(f.values, file([{ id: '42', name: 'Local', urls: ['https://local.example'] }])), ['42']);
  assert.equal(f.values.smartGroups[0].name, 'Local');
  assert.equal(f.values.savedClientGroups[0].epicName, 'Connected');
  assert.equal(f.values.trainedRules[0].epicName, 'Connected');
});

test('same-name workspaces do not establish identity or silently merge', () => {
  const preview = previewWorkspaceImport({ smartGroups: [{ id: 'old', name: 'Documentation', patterns: [] }] }, file());
  assert.equal(preview.rows[0].blocked, true);
});

test('exact rule conflicts with saved Shortcut rules are blocked; broader overlaps remain visible', async () => {
  const f = fixture({ trainedRules: [{ epicId: '42', epicName: 'Shortcut', pattern: 'https://docs.example/product' }] });
  const preview = previewWorkspaceImport(f.values, file());
  assert.equal(preview.rows[0].blocked, true);
  assert.match(preview.rows[0].warnings.join(' '), /Shortcut/);
  await assert.rejects(applyWorkspaceImport(f.storage, preview, ['docs']), /conflicts/);
  assert.equal(f.writes.length, 0);
  const broad = previewWorkspaceImport({ smartGroups: [{ id: 'broad', name: 'Broad', patterns: ['https://docs.example'] }] }, file());
  assert.equal(broad.rows[0].blocked, false);
  assert.match(broad.rows[0].warnings.join(' '), /existing-broader/);
});

test('equal prefixes across imported rows are blocked before either can change grouping precedence', () => {
  const preview = previewWorkspaceImport({}, file([{ id: 'a', name: 'A', urls: ['https://same.example'] },
    { id: 'b', name: 'B', urls: ['https://same.example'] }]));
  assert.equal(preview.rows.every((row) => row.blocked), true);
});

test('replaying an import is an unchanged preview and cannot duplicate workspaces', async () => {
  const f = fixture();
  await applyWorkspaceImport(f.storage, previewWorkspaceImport(f.values, file()), ['docs']);
  const preview = previewWorkspaceImport(f.values, file());
  assert.equal(preview.rows[0].action, 'unchanged');
  await assert.rejects(applyWorkspaceImport(f.storage, preview, ['docs']), /changed workspaces/);
  assert.equal(f.writes.length, 1);
});

test('a stale preview cannot overwrite subsequent workspace or Shortcut rule edits', async () => {
  for (const key of ['smartGroups', 'smartGroupOrder', 'trainedRules']) {
    const f = fixture();
    const preview = previewWorkspaceImport(f.values, file());
    f.values[key] = [];
    await assert.rejects(applyWorkspaceImport(f.storage, preview, ['docs']), /changed/);
    assert.equal(f.writes.length, 0);
  }
});

test('guarded Undo refuses later workspace edits but preserves unrelated preference edits', async () => {
  const f = fixture();
  await applyWorkspaceImport(f.storage, previewWorkspaceImport(f.values, file()), ['docs']);
  f.values.openerInheritance = false;
  await undoWorkspaceImport(f.storage);
  assert.equal(f.values.openerInheritance, false);
  assert.deepEqual(f.values.smartGroups, []);
  await applyWorkspaceImport(f.storage, previewWorkspaceImport(f.values, file()), ['docs']);
  f.values.smartGroups[0].name = 'Edited';
  assert.equal(canUndoWorkspaceImport(f.values), false);
  await assert.rejects(undoWorkspaceImport(f.storage), /changed/);
  assert.equal(f.values.smartGroups[0].name, 'Edited');
});

test('storage failure leaves the import unreported and original settings intact', async () => {
  const f = fixture();
  f.storage.set = async () => { throw new Error('Synthetic storage failure'); };
  await assert.rejects(applyWorkspaceImport(f.storage, previewWorkspaceImport(f.values, file()), ['docs']), /storage failure/);
  assert.deepEqual(f.values, {});
});

test('workspace export contains only portable names, IDs and prefixes and round-trips', () => {
  const f = fixture({ smartGroups: [{ id: 'docs', name: 'Documentation', patterns: ['https://docs.example/product'], focusMode: true }],
    workspaceSourceSecrets: { token: 'synthetic-only' }, tabBundlrEnabled: true });
  const exported = exportWorkspaceFile(f.values);
  assert.deepEqual(exported, file());
  assert.doesNotMatch(JSON.stringify(exported), /synthetic-only|focusMode|tabBundlrEnabled/);
});

test('public build retains unsupported custom source data without executing or rebinding it', () => {
  const custom = { schemaVersion: 4, id: 'private', enabled: true, customData: 'synthetic-definition' };
  const shortcut = shortcutWorkspaceSource();
  const stored = { settingsVersion: 2, workspaceSources: [custom, shortcut], workspaceSourceSecrets: { shortcut: { apiToken: 'synthetic-only' } } };
  const migration = migrateLegacySettings(stored);
  assert.deepEqual(migration.settings.workspaceSources, stored.workspaceSources);
  assert.deepEqual(normalizeWorkspaceSources(stored.workspaceSources).map((source) => source.id), [shortcut.id]);
  assert.throws(() => normalizeWorkspaceSource(custom), /schema version/);
  const saved = workspaceSourceSaveChanges(stored, { ...shortcut, name: 'Edited optional source' });
  assert.deepEqual(saved.workspaceSources[0], custom);
});

test('only import-only storage notifications suppress immediate organization', () => {
  assert.equal(isWorkspaceImportChange({ smartGroups: {}, [WORKSPACE_IMPORT_UNDO_KEY]: {} }), true);
  assert.equal(isWorkspaceImportChange({ smartGroups: {} }), false);
  assert.equal(isWorkspaceImportChange({ smartGroups: {}, tabBundlrEnabled: {}, [WORKSPACE_IMPORT_UNDO_KEY]: {} }), false);
});
