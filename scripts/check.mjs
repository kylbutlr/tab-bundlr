import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

for (const directory of ['.', 'scripts', 'tests']) {
  const files = await readdir(directory, { withFileTypes: true });
  for (const file of files.filter((entry) => entry.isFile() && /\.(?:js|mjs|cjs)$/.test(entry.name))) {
    const result = spawnSync(process.execPath, ['--check', `${directory}/${file.name}`], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
