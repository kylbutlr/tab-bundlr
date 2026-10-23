# Changelog

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
