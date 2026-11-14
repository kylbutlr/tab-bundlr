# Changelog

## Unreleased

- Separate custom provider acquisition from the public extension runtime and settings.
- Add workspace-only JSON import/export with preview, selection, conflict checks and guarded settings Undo.
- Preserve the home-base redirect-loop fix, local protections and existing Shortcut compatibility.


## 1.2.0 (local release candidate, unpublished)

- Add optional Radar project grouping through the existing signed-in Chrome session, with reviewed native project bindings and a guarded catalog expansion/Undo flow.
- Keep local organization account-free and preserve Shortcut rules, pinned tabs, manual groups, pause/focus holds, imports, and tab move history.
- Prevent restored home-base pages that redirect to sign-in from spawning replacement loops.
- Recheck automation/category preferences after source reads and preserve connection names and precedence in project previews.
- Keep settings snapshots fresh during metadata-only holds and qualify catalog rollback by the selected connection.
- Record source, installed-client and release acceptance separately; no OAuth client metadata host or consent is required.

## 1.1.1

- Patch development image tooling while retaining the exact App Stylr visual-source pin.

- Update installation and saved-workspace guidance for the current public package.

## 1.1.0

- Adopt pinned App Stylr v1.4.1 styles, typography and precise geometry.
- Keep the existing grouping glyph over the neutral Graphite icon tile.
- Quiet feedback surfaces and retain workspace-specific color meaning.
- Add directly rendered 512px icons and route management cards to 128px artwork for Retina clarity.
- Refresh interface media and record current verification coverage in the release notes.

## 1.0.0

- Present local and connected destinations through one workspace rule editor.
- Lead Settings with workspace creation; place window routing, connection configuration, backups, and diagnostics in expandable sections.
- Share one deterministic URL-rule resolver between the rule tester and runtime.
- Namespace connection workspace IDs and preserve legacy group ownership when saved contexts identify the source unambiguously.
- Share in-flight connection requests and bound the response cache.
- Enforce current Chrome host grants before connection resolution, each API request, and applying results; clear cached data when permissions change.
- Preserve workspaces after their final URL rule is removed, with undo and a separate confirmed delete action.
- Make settings import keyboard-accessible and identify duplicate keepers by tab title.
- Recheck tab protections and reviewed context after close confirmation, retain duplicates when their selected keeper changes, and distinguish same-title keepers by tab position.
- Add searchable popup workspaces and expandable lists containing every tab.
- Separate assignment, connection resolution, storage batching, messaging, and compatibility data into modules.
- Add continuous integration, release checksums, contribution guidance, and current release verification requirements.
- Include the MIT license in the downloadable extension ZIP and document GitHub installation and manual updates.

Distribution: a versioned GitHub release ZIP and SHA-256 checksum, installed unpacked in Chrome. See [release verification](docs/verification.md) for coverage and accepted manual verification limits.
