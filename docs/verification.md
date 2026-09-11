# Public Beta Verification

## Automated

- [x] `npm test` passes, 73 tests on September 10, 2026.
- [x] `npm run package` creates a valid ZIP.
- [x] The ZIP contains only the 23 entries in the explicit public allowlist.
- [x] The ZIP scan contains no private fixture names, IDs, tokens, or legacy secret exports.

## Fresh installation

- [x] Installation succeeds in an isolated Chromium profile with empty local storage.
- [x] Automatic Tab Bundling is off.
- [x] No account, token, or Workspace Source is required.
- [x] A neutral Smart Group can be created, fixed, organized, and undone.

## Core behavior

- [x] Pinned tabs remain untouched.
- [x] Manual Chrome groups remain untouched during automatic processing, Fix, and Organize.
- [x] A designated Focus Group holds manually placed tabs and safe opener links.
- [x] Unassigned HTTP and HTTPS tabs appear in review without being moved.
- [x] Duplicate review requires a keeper and confirmation.
- [x] Stale review starts with every candidate unchecked.
- [x] Pausing affects only the chosen window.
- [x] Home-base restoration works in review mode.
- [x] Optional exact home-base duplicate removal protects active and pinned tabs in the implementation and automated suite.

## Workspace Sources

- [x] Import saves a source disabled.
- [x] Enabling requests only the source's declared origins.
- [x] Missing credentials prevent enablement.
- [x] Successful GET responses resolve the configured workspace.
- [x] Undeclared origins, redirects, missing fields, and failed requests do not move the tab.
- [x] Missing and unsupported Workspace Source schema versions are rejected.
- [x] Disabling or removing a source stops future matching and releases unused optional origins.
- [ ] Complete one live provider request after entering a real credential and approving Chrome's interactive permission prompt.

## Backup and migration

- [x] Version 2 export contains source definitions but no credential values.
- [x] Version 2 import disables sources and retains no imported secrets.
- [x] Settings import clears existing Workspace Source credentials before imported definitions can be enabled.
- [x] Version 1 import ignores its legacy token.
- [x] In-place migration retains the existing credential locally and creates a visible compatibility source.
- [x] Existing automation, source precedence, home-base duplicate behavior, groups, colors, and ordering remain available after migration.
- [ ] Confirm the in-place migration once against a disposable copy of the currently installed Chrome profile.

## Browser-level scenarios

- [x] Previous Tab works in toggle and history modes in the automated service-worker tests.
- [x] Opener inheritance can be enabled and disabled in the browser smoke test.
- [x] A newly detached one-tab window pauses automatically in the automated service-worker tests.
- [x] Closing the last home-base copy restores one inactive tab in the automated service-worker tests.
- [x] Extension reload does not duplicate managed groups in the automated service-worker tests.
