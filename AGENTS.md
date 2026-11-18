# Tab Bundlr agent guidance

## Public distribution versus Kyle's personal setup

**Default repository/PR/release work to the simplified public app. Kyle's personal extension intentionally differs and includes private Radar and Project Plannr integrations. Read [Runtime variants](docs/runtime-variants.md) before any runtime, provider, permission, packaging or installation change.**

- Canonical shared source: [public Tab Bundlr repository](https://github.com/kylbutlr/tab-bundlr). Canonical personal source: [private Tab Bundlr companion](https://github.com/kylbutlr/tab-bundlr-personal). Public users do not need private-repository access.
- Kyle-specific Radar and Project Plannr acquisition/grouping, optional permissions and helpers belong in the companion's patches/modules. If private access is unavailable, report the gap; do not create another companion or copy private code into public source.
- A provider-neutral fix belongs in the public app first, followed by an explicitly reviewed companion pin/patch update. Do not silently advance its public pin or overwrite the loaded extension.
- Radar-specific requests for Kyle stay in his personal overlay unless he explicitly requests public scope. Keep public tab organization, portable workspace JSON and Shortcut compatibility independent of Radar.
- Identify the actual variant from manifest permissions and worker imports, not the app name, version, branch name or an older README. A bug in Kyle's installation is not automatically a public-app bug.
- Isolate general core fixes for public review; never copy the mixed personal worker, private project bindings or Radar-only permissions into the public package. Public updates must preserve the personal customization.
- Ignored `dist/` directories may contain active private code, authoritative metadata/bindings and recovery backups. Do not clean or overwrite them, replace the extension folder, or silently restore public runtime over the personal build.
- Preserve settings, protections, Shortcut rules, history and unrelated edits. Browser automation remains stopped and Kyle reloads manually unless he explicitly authorizes otherwise. Keep local tests, actual service reads and installed acceptance separate.

Use the exact [App Stylr v1.4.1](https://github.com/kylbutlr/app-stylr/tree/v1.4.1) pin recorded in app-stylr.json. Review the [Visual Reference](https://kylbutlr.com/app-stylr) before interface changes. Use shared semantic roles, Geist, precise geometry and dark-first Sage styling; preserve the product’s compact popup and transparent workspace rules.

Run `npm run styles` after changing the dependency or icon master. The generated adapter, fonts and bitmap icons are checked by `npm run styles:check`, included in `npm test`. Do not hand-edit generated adapters. Record product-specific density and workspace-color meaning in docs/app-stylr-exceptions.md.

Keep browser permissions, tab/window protections, storage, optional connections and grouping behavior intact during visual changes. Read README.md and docs/releases.md before preparing a release. Packaging is local; pushes, PRs, merges and publication require explicit authorization. Use the existing grouped-tab glyph over the neutral Graphite tile.
