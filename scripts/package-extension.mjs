import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const outputDirectory = path.join(root, 'dist');
const output = path.join(outputDirectory, `tab-bundlr-${manifest.version}.zip`);
const files = [
  'LICENSE',
  'manifest.json',
  'app-stylr.css',
  'backup.js',
  'background.js',
  'core.js',
  'settings.js',
  'sources.js',
  'legacy-shortcut.js',
  'workspace-identity.js',
  'workspace-ui.js',
  'rules.js',
  'storage.js',
  'source-resolver.js',
  'message-router.js',
  'traffic-diagnostic.js',
  'traffic-options.js',
  'runtime-diagnostic.js',
  'runtime-diagnostic.html',
  'runtime-diagnostic-page.js',
  'guidance.js',
  'help.html',
  'help.css',
  'options.html',
  'options.css',
  'options.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'popup-request.js',
  'review.html',
  'review.css',
  'review.js',
  'review-actions.js',
  'assets/tab-bundlr-icon.svg',
  'fonts/Geist-Variable.woff2',
  'fonts/GeistMono-Variable.woff2',
  'fonts/LICENSE-GEIST.txt',
  'icons/chrome/icon-16.png',
  'icons/chrome/icon-32.png',
  'icons/chrome/icon-48.png',
  'icons/chrome/icon-128.png',
];

const forbidden = [
  ['sct', 'r', ['s', 'd', 'g'].join('')].join('_'),
  ['Team', 'S', 'D', 'G'].join(''),
  ['Bro', 'wns'].join(''),
  ['p', 'r', 'Ana'].join(''),
  ['Pe', 'et', "'s"].join(''),
  ['MA', 'TE', ' The Label'].join(''),
  ['459', '966'].join(''),
  ['488', '290'].join(''),
  ['489', '254'].join(''),
  ['491', '130'].join(''),
];

for (const file of files.filter((name) => /\.(?:html|css|js|json|svg|txt)$/.test(name))) {
  const content = await readFile(path.join(root, file), 'utf8');
  for (const value of forbidden) {
    if (content.includes(value)) throw new Error(`Public package scan failed: ${file} contains an internal fixture.`);
  }
}

// Every relative runtime import must be present in the explicit package allowlist.
for (const file of files.filter((name) => name.endsWith('.js'))) {
  const content = await readFile(path.join(root, file), 'utf8');
  for (const match of content.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
    if (!files.includes(dependency)) throw new Error(`Missing packaged module: ${dependency}`);
  }
  if (/(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|sct_(?:r|rw)_[A-Za-z0-9_]{20,})/.test(content)) {
    throw new Error(`Possible credential in ${file}. Remove it before packaging.`);
  }
}

await mkdir(outputDirectory, { recursive: true });
await rm(output, { force: true });
const result = spawnSync('zip', ['-q', output, ...files], { cwd: root, encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr || 'Could not create the extension ZIP.');
const integrity = spawnSync('unzip', ['-tqq', output], { encoding: 'utf8' });
if (integrity.status !== 0) throw new Error(integrity.stderr || 'Extension ZIP integrity check failed.');
const digest = createHash('sha256').update(await readFile(output)).digest('hex');
await writeFile(output.replace(/\.zip$/, '.sha256'), `${digest}  ${path.basename(output)}\n`);
process.stdout.write(`${output}\nSHA-256: ${digest}\n`);
