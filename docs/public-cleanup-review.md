# Simplified build, local commit handoff

The simplified public runtime is active locally following the approved November 13, 2026 reload. This source is isolated on the non-tracking `kylebutler/public-workspace-import` branch from merged integration commit `d427121d37fccd125e0abda22c5527df0dd833da`. No push or publication is authorized or performed. Browser automation remains stopped.

## Result

- Remove Radar acquisition, session/catalog settings, developer test controls and scripting permission from the public runtime. Keep generic optional sources and legacy Shortcut compatibility.
- Add portable workspace JSON import/export with file/paste entry, preview, per-row selection, additive updates, conflicts, stale-preview checks and guarded settings Undo.
- Preserve the home-base redirect-loop fix, automatic-bundling preference, pinned/manual-group policies, pause/focus/window protections, home bases, source credentials, connected rules and move history. Import/Undo do not immediately open, close, move, recolor or reorder existing tabs/groups. Future normal automation and explicit Apply rules retain their established behavior.
- Retain unsupported custom source definitions in storage without executing them. Ordinary source edits preserve other stored definitions. Full-settings restore remains a separate operation with its existing credential-clearing behavior; public backups exclude unsupported custom sources.
- Keep the separate [personal metadata converter and historical evidence](../custom/radar/README.md) outside the extension package. Static conversion uses verified native UUID/project relationships and deliberately excludes unscoped short-number rules. It does not acquire data, discover new tickets or claim provider history completeness.

## Source, installation and rollback

The source change is isolated in this checkout. The approved in-place reload copied 12 changed/new runtime files into the original loaded folder, preserving extension identity, storage and the Shortcut site grant. Exact preceding runtime files and the original dirty working diff remain in ignored `dist/public-reload-rollback` artifacts in that original checkout. Earlier custom runtime snapshots also remain in its ignored artifacts. Git HEAD, index and unrelated source files in the original checkout are preserved. Historical Radar evidence was relocated byte-for-byte into `custom/radar/evidence`; no prior receipt was rewritten.

`session-handoff.js` restores only allowlisted session protections for a fresh five-minute same-window update. It skips startup grouping/home-base replay without changing persistent preferences or copying credentials. Missing handoffs use ordinary startup; invalid handoffs fail closed. This internal boundary adds no public setup or test control.

The displayed source manifest version remains 1.2.0. The local 46-file ZIP is different from the published v1.2.0 asset and must not replace it. A new release version and publication are separate future actions. Returning to the custom reader requires an approved runtime restore and guarded reload, without removing the extension or importing real settings.

## Verified evidence

- **187 offline Node tests passed**, including real worker adapters, source/credential preservation, stale-preview replay, no-move import/Undo and session-handoff rejection cases. App Stylr v1.4.1 generated assets and syntax checks passed.
- The offline DOM adapter exercised the actual import UI module, selection, preview invalidation, Undo and text-only labels. This is distinct from native evidence.
- Local packaging, import allowlist, private-fixture scan and ZIP integrity passed. All **46** packaged payloads matched the locally activated runtime. The package contains no Radar/custom runtime files, scripting permission or temporary acceptance helper.
- During the approved native reload, the extension-owned verifier confirmed matching salted settings/credential, protection, working-tab and Chrome-group checksums. The update handoff was consumed.
- Native JSON preview, one synthetic import and its Undo succeeded. Original visible workspace counts returned. No working tab was grouped, opened or closed by the agent.
- See [the exact bounded acceptance receipt](public-acceptance-check.json). The [earlier interrupted attempt](public-acceptance-attempt.json) is preserved as historical evidence.

## Remaining limits

Browser protocol policy blocked the optional final screenshot/DOM claim. Automation stopped without an alternate-surface workaround. Final post-Undo aggregate verification and removal of the inactive verification record were not completed. The temporary helper files and inactive salted baseline remain for deferred cleanup. No active handoff, automation test hold, preview, watcher or test process remains.

No live Radar or Shortcut request or native tab-grouping test was performed in this pass. Bounded reload/import acceptance does not establish provider authentication, session renewal, history coverage or full release acceptance. Static files cover only known canonical ticket URLs; project reassignments still need explicit rule review because imports retain previous prefixes.

Imports are serialized and recheck their preview baseline, but Chrome storage does not offer a transaction spanning every existing editor. Avoid simultaneous workspace edits in separate Settings windows while applying an import. Import Undo refuses to overwrite later workspace/order edits and preserves unrelated preference or connected-rule edits. Tab moves retain their separate popup Undo.

The mechanical style detector reported inherited Geist-font and border/shadow advisories. The pinned App Stylr treatment was preserved. The remote visual-reference page was unavailable; incumbent source and generated assets supplied the visual authority.

## Next steps and cleanup

Continue using the already loaded simplified runtime. No additional reload or settings import is needed for this local source commit. Any later push, publication, runtime switch or browser automation needs its applicable authorization. No credentials, consent or host setup is required for plain workspace JSON import. Fresh Radar acquisition remains a separately approved extension-owned action.

Read [workspace import](workspace-import.md), [the fictional JSON example](../examples/workspaces.json) and [the separate custom workflow](../custom/radar/README.md).

## Exact changed files

- Changed: [CHANGELOG.md](../CHANGELOG.md)
- Changed: [README.md](../README.md)
- Changed: [background.js](../background.js)
- Added: [custom/radar/README.md](../custom/radar/README.md)
- Added: [custom/radar/evidence/radar-extension-read-receipt.json](../custom/radar/evidence/radar-extension-read-receipt.json)
- Added: [custom/radar/evidence/radar-extension-session.md](../custom/radar/evidence/radar-extension-session.md)
- Added: [custom/radar/evidence/radar-grouping-local-commit.md](../custom/radar/evidence/radar-grouping-local-commit.md)
- Added: [custom/radar/evidence/radar-pr-review.md](../custom/radar/evidence/radar-pr-review.md)
- Added: [custom/radar/evidence/radar-project-catalog-receipt.json](../custom/radar/evidence/radar-project-catalog-receipt.json)
- Added: [custom/radar/evidence/radar-project-catalog.md](../custom/radar/evidence/radar-project-catalog.md)
- Added: [custom/radar/evidence/radar-project-grouping-receipt.json](../custom/radar/evidence/radar-project-grouping-receipt.json)
- Added: [custom/radar/evidence/radar-project-grouping.md](../custom/radar/evidence/radar-project-grouping.md)
- Added: [custom/radar/prepare-workspaces.mjs](../custom/radar/prepare-workspaces.mjs)
- Changed: [docs/architecture.md](../docs/architecture.md)
- Changed: [docs/privacy.md](../docs/privacy.md)
- Added: [docs/public-acceptance-attempt.json](../docs/public-acceptance-attempt.json)
- Added: [docs/public-acceptance-check.json](../docs/public-acceptance-check.json)
- Added: [docs/public-cleanup-review.md](../docs/public-cleanup-review.md)
- Removed from public tree: `docs/radar-extension-read-receipt.json`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Removed from public tree: `docs/radar-extension-session.md`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Removed from public tree: `docs/radar-grouping-local-commit.md`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Removed from public tree: `docs/radar-pr-review.md`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Removed from public tree: `docs/radar-project-catalog-receipt.json`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Removed from public tree: `docs/radar-project-catalog.md`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Removed from public tree: `docs/radar-project-grouping-receipt.json`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Removed from public tree: `docs/radar-project-grouping.md`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Changed: [docs/releases.md](../docs/releases.md)
- Changed: [docs/verification.md](../docs/verification.md)
- Added: [docs/workspace-import.md](../docs/workspace-import.md)
- Changed: [docs/workspace-sources.md](../docs/workspace-sources.md)
- Added: [examples/workspaces.json](../examples/workspaces.json)
- Changed: [help.css](../help.css)
- Changed: [help.html](../help.html)
- Changed: [manifest.json](../manifest.json)
- Changed: [options.css](../options.css)
- Changed: [options.html](../options.html)
- Changed: [options.js](../options.js)
- Removed from public tree: `radar-catalog-options.js`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Removed from public tree: `radar-catalog.js`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Removed from public tree: `radar-disposable.html`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Removed from public tree: `radar-disposable.js`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Removed from public tree: `radar-native-session.js`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Removed from public tree: `radar-options.js`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Removed from public tree: `radar-session.js`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Removed from public tree: `radar-source.js`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Removed from public tree: `reload-safety.js`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Changed: [scripts/package-extension.mjs](../scripts/package-extension.mjs)
- Added: [session-handoff.js](../session-handoff.js)
- Changed: [settings.js](../settings.js)
- Changed: [sources.js](../sources.js)
- Added: [tests/custom-workspace-conversion.test.js](../tests/custom-workspace-conversion.test.js)
- Changed: [tests/extension.test.js](../tests/extension.test.js)
- Removed from public tree: `tests/fixtures/radar-source.json`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Added: [tests/public-build.test.js](../tests/public-build.test.js)
- Removed from public tree: `tests/radar-catalog.test.js`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Removed from public tree: `tests/radar-disposable.test.js`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Removed from public tree: `tests/radar-native-session.test.js`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Removed from public tree: `tests/radar-projects.test.js`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Removed from public tree: `tests/radar-session.test.js`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Removed from public tree: `tests/radar-source.test.js`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Removed from public tree: `tests/reload-safety.test.js`; source retained in the pre-cleanup Git history and custom rollback artifacts.
- Added: [tests/session-handoff.test.js](../tests/session-handoff.test.js)
- Added: [tests/workspace-import-options.test.js](../tests/workspace-import-options.test.js)
- Added: [tests/workspace-import-worker.test.js](../tests/workspace-import-worker.test.js)
- Added: [tests/workspace-import.test.js](../tests/workspace-import.test.js)
- Changed: [tests/workspace-worker.test.js](../tests/workspace-worker.test.js)
- Added: [workspace-import-options.js](../workspace-import-options.js)
- Added: [workspace-import.js](../workspace-import.js)
