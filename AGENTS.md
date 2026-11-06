# Tab Bundlr agent guidance

Use the exact [App Stylr v1.4.1](https://github.com/kylbutlr/app-stylr/tree/v1.4.1) pin recorded in app-stylr.json. Review the [Visual Reference](https://kylbutlr.com/app-stylr) before interface changes. Use shared semantic roles, Geist, precise geometry and dark-first Sage styling; preserve the product’s compact popup and transparent workspace rules.

Run `npm run styles` after changing the dependency or icon master. The generated adapter, fonts and bitmap icons are checked by `npm run styles:check`, included in `npm test`. Do not hand-edit generated adapters. Record product-specific density and workspace-color meaning in docs/app-stylr-exceptions.md.

Keep browser permissions, tab/window protections, storage, optional connections and grouping behavior intact during visual changes. Read README.md and docs/releases.md before preparing a release. Packaging is local; pushes, PRs, merges and publication require explicit authorization. Use the existing grouped-tab glyph over the neutral Graphite tile.
