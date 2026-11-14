import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('public package has no custom provider reader, scripting permission or acceptance controls', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.optional_permissions, undefined);
  const packager = await readFile(new URL('../scripts/package-extension.mjs', import.meta.url), 'utf8');
  const files = [...packager.split('const files = [')[1].split('];')[0].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.equal(files.some((file) => /radar|custom\/|reload-safety/.test(file)), false);
  assert.ok(files.includes('workspace-import.js'));
  assert.ok(files.includes('workspace-import-options.js'));
  for (const file of files.filter((name) => /\.(js|html|json|css)$/.test(name))) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /radar|executeScript|READ_ONLY_PREVIEW|DISPOSABLE_TEST/i, file);
  }
});
