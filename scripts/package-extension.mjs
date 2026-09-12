import { mkdir, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const outputDirectory = path.join(root, 'dist');
const output = path.join(outputDirectory, `tab-bundlr-${manifest.version}.zip`);
const files = [
  'manifest.json',
  'backup.js',
  'background.js',
  'core.js',
  'settings.js',
  'sources.js',
  'guidance.js',
  'help.html',
  'help.css',
  'options.html',
  'options.css',
  'options.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'review.html',
  'review.css',
  'review.js',
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

await mkdir(outputDirectory, { recursive: true });
await rm(output, { force: true });
const result = spawnSync('zip', ['-q', output, ...files], { cwd: root, encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr || 'Could not create the extension ZIP.');
process.stdout.write(`${output}\n`);
