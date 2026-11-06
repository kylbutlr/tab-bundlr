import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const upstream = dirname(require.resolve("app-stylr/package.json"));
const check = process.argv.includes("--check");
const manifest = JSON.parse(await readFile(join(root, "app-stylr.json"), "utf8"));
const source = JSON.parse(await readFile(join(upstream, "package.json"), "utf8"));
if (manifest.version !== source.version) throw new Error("App Stylr manifest and installed package differ");
const files = new Map();
files.set("app-stylr.css", await readFile(join(upstream, "adapters/css/app-stylr.css")));

for (const name of ["Geist-Variable.woff2", "GeistMono-Variable.woff2"]) files.set(`fonts/${name}`, await readFile(join(upstream, "assets/fonts", name)));
files.set("fonts/LICENSE-GEIST.txt", await readFile(join(upstream, "assets/fonts/LICENSE-GEIST.txt")));

const iconOutput = join(root, "dist/app-stylr-icons");
execFileSync(process.execPath, [join(upstream, "scripts/generate-icons.mjs"), "--source", join(root, "assets/tab-bundlr-icon.svg"), "--output", iconOutput], { stdio: "pipe", cwd: root });
for (const size of [16,32,48,128]) files.set(`icons/chrome/icon-${size}.png`, await readFile(join(iconOutput, `chrome/icon-${size}.png`)));
for (const [name, content] of files) {
 const target = join(root, name);
 if (check) { if (!(await readFile(target)).equals(content)) throw new Error(`${name} differs from the pinned source; run npm run styles`); }
 else { await mkdir(dirname(target), { recursive:true }); await writeFile(target, content); }
}
console.log(`${check ? "Verified" : "Generated"} App Stylr ${source.version} adapters, fonts and icons.`);
