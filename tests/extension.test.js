import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('declares a local-first Manifest V3 extension with optional network access', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'Tab Bundlr');
  assert.equal(manifest.version, '0.8.2');
  assert.equal(packageJson.version, manifest.version);
  assert.deepEqual(manifest.permissions, ['storage', 'tabs', 'tabGroups']);
  assert.equal('host_permissions' in manifest, false);
  assert.deepEqual(manifest.optional_host_permissions, ['https://*/*']);
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.equal(manifest.options_page, 'options.html');
  assert.equal(manifest.action.default_popup, 'popup.html');
});

test('ships the generic first-run, safety, source, review, and recovery surfaces', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  await Promise.all(Object.values(manifest.icons).map((iconPath) => access(new URL(iconPath, root))));
  await Promise.all([
    access(new URL('fonts/Geist-Variable.woff2', root)),
    access(new URL('fonts/GeistMono-Variable.woff2', root)),
    access(new URL('assets/tab-bundlr-icon.svg', root)),
  ]);
  const options = await readFile(new URL('options.html', root), 'utf8');
  const optionsCss = await readFile(new URL('options.css', root), 'utf8');
  const optionsScript = await readFile(new URL('options.js', root), 'utf8');
  const background = await readFile(new URL('background.js', root), 'utf8');
  const popup = await readFile(new URL('popup.html', root), 'utf8');
  const popupScript = await readFile(new URL('popup.js', root), 'utf8');
  const review = await readFile(new URL('review.html', root), 'utf8');
  const help = await readFile(new URL('help.html', root), 'utf8');
  const guidance = await readFile(new URL('guidance.js', root), 'utf8');
  const backup = await readFile(new URL('backup.js', root), 'utf8');

  assert.match(options, /Build predictable browser workspaces/);
  assert.match(options, /Automatic Tab Bundling/);
  assert.match(options, /home-base-duplicate-action/);
  assert.match(options, /Personal tab rules/);
  assert.match(options, /Connections from JSON/);
  assert.match(options, /workspace-source-json/);
  assert.match(options, /credentials.*excluded/i);
  assert.match(options, /Before you connect/);
  assert.match(options, /See what is stored, sent, and deleted/);
  assert.match(optionsScript, /chrome\.permissions\.request/);
  assert.match(optionsScript, /enabled: false/);
  assert.match(optionsScript, /WORKSPACE_SOURCE_SECRETS_STORAGE_KEY/);
  assert.match(optionsCss, /\.source-credentials label \{[^}]*margin-bottom:\s*0/);
  assert.match(optionsCss, /\.source-credentials button \{[^}]*height:\s*44px/);
  assert.match(backup, /BACKUP_VERSION = 2/);
  assert.doesNotMatch(backup, /workspaceSourceSecrets.*return/);
  assert.match(background, /manual-group-protected/);
  assert.match(background, /HOME_BASE_DUPLICATE_REMOVE_EXACT/);
  assert.match(background, /openerInheritance/);
  assert.match(background, /settings\.openerInheritance && await inheritFocusFromOpener\(tab\)/);
  assert.match(background, /processWorkspaceSourceTab/);
  assert.doesNotMatch(background, /app\.shortcut\.com|api\.app\.shortcut\.com/);
  assert.doesNotMatch(await readFile(new URL('core.js', root), 'utf8'), /app\.shortcut\.com|api\.app\.shortcut\.com/);
  assert.match(popup, /Fix/);
  assert.match(popup, /Organize/);
  assert.match(popup, /Undo last move/);
  assert.match(popup, /first-use-guide/);
  assert.match(popup, /Dismiss first-use guidance/);
  assert.match(popup, /Help/);
  assert.match(popupScript, /FIRST_USE_GUIDANCE_DISMISSED_STORAGE_KEY/);
  assert.match(guidance, /workspaceSourceCount/);
  assert.match(popupScript, /Manual mode is on/);
  assert.match(review, /Same URL clusters/);
  assert.match(review, /Probably stale tabs/);
  assert.match(help, /What leaves the device/);
  assert.match(help, /How to delete it/);
  assert.match(help, /Nothing leaves the device unless you enable an optional connection/);
});

test('does not ship private fixture names, private IDs, or credential values', async () => {
  const files = [
    'README.md',
    'manifest.json',
    'options.html',
    'options.js',
    'popup.html',
    'popup.js',
    'review.html',
    'review.js',
    'core.js',
    'background.js',
    'backup.js',
    'settings.js',
    'guidance.js',
    'sources.js',
    'help.html',
    'help.css',
    'scripts/package-extension.mjs',
    'docs/app-stylr-exceptions.md',
    'docs/installation.md',
    'docs/privacy.md',
    'docs/store-listing.md',
    'docs/support.md',
    'docs/troubleshooting.md',
    'docs/verification.md',
    'docs/workspace-sources.md',
    'examples/workspace-sources/example-tracker.json',
    'examples/workspace-sources/shortcut.json',
    'tests/backup.test.js',
    'tests/background-performance.test.js',
    'tests/core.test.js',
    'tests/settings.test.js',
    'tests/guidance.test.js',
    'tests/sources.test.js',
  ];
  const source = (await Promise.all(files.map((file) => readFile(new URL(file, root), 'utf8')))).join('\n');
  const forbidden = [
    ['S', 'D', 'G'].join(''),
    ['Team', 'S', 'D', 'G'].join(''),
    ['Bro', 'wns'].join(''),
    ['p', 'r', 'Ana'].join(''),
    ['Pe', 'et', "'s"].join(''),
    ['MA', 'TE', ' The Label'].join(''),
    ['459', '966'].join(''),
    ['488', '290'].join(''),
    ['489', '254'].join(''),
    ['491', '130'].join(''),
    ['mate', '-', 'the', '-', 'label'].join(''),
    ['sct', '_', 'r', '_'].join(''),
  ];
  const normalizedSource = source.toLowerCase();
  forbidden.forEach((value) => assert.equal(normalizedSource.includes(value.toLowerCase()), false, `Found private fixture: ${value}`));
});

test('source requests cannot use write methods', async () => {
  const source = await readFile(new URL('sources.js', root), 'utf8');
  assert.doesNotMatch(source, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i);
  assert.match(source, /method: 'GET'/);
  assert.match(source, /redirect: 'error'/);
});
