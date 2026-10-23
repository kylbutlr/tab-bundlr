# Release verification

Version 1.0.0 uses open-source GitHub distribution: a versioned ZIP installed unpacked in Chrome, with privacy and support information in this repository. Chrome Web Store submission is outside this release's scope. The checks below distinguish automated behavior, disposable Chromium checks, native browser observations, and accepted verification limits. Historical v0.8 checks are not current release evidence.

## Automated behavior

- [x] Node test suite: 124 passing tests on October 22, 2026, using Node.js 24.
- [x] Rule tester and runtime agree on ties, specificity, disabled categories, and focus rules.
- [x] Distinct sources, workspace kinds, and delimiter-containing IDs cannot collide.
- [x] A proven legacy connection retains its Chrome group ID, contexts, and saved destination rules through identity migration.
- [x] Ambiguous or unproven legacy destinations are preserved without guessing ownership.
- [x] Empty workspaces survive settings export.
- [x] Connection reads share in-flight work, expire cached results/errors, and bound retained destinations.
- [x] Existing tests cover migration defaults, credential exclusion, disabled imports, tab/window protection, undo, worker restart handling, and bounded diagnostics.
- [x] Six worker regressions cover denied, unavailable, or rejected host-grant checks; cached reads after revocation; restored access; revocation between requests; and revocation before applying an in-flight result. All six failed before the permission fix and passed afterward. They use controlled Chrome adapters and mock API responses.
- [x] Tab review rechecks current protections and reviewed context after confirmation, skips changed tabs, and closes no duplicates when the selected keeper has disappeared or navigated away. Chrome's query and remove APIs are separate operations, so this reduces the race window without claiming an atomic close operation.

## Disposable Chromium installation

Run `npm run test:browser` after installing the pinned development dependencies and Playwright Chromium. The script uses one isolated profile, one review tab, temporary fixture tabs, a five-minute deadline, and automatic cleanup. It makes no changes to a personal Chrome profile. Fixture HTTPS pages are fulfilled locally by the test harness.

The local walkthrough below was verified on October 22, 2026 with Chromium 151.0.7922.34 against the 1.0.0 runtime, including the tab-review safety and connection-permission changes. The smoke script reported 14 successful checks:

- [x] Fresh install has manual mode, no account, and no required token.
- [x] Settings creates a workspace.
- [x] Removing its final URL rule retains the workspace; undo restores the rule.
- [x] URL tester renders the winning destination.
- [x] Keyboard Enter on Import JSON opens the native file chooser.
- [x] Settings renders at 1280px and 390px without horizontal overflow.
- [x] Apply rules groups a matching tab while protecting pinned tabs and manual Chrome groups.
- [x] Undo restores an actual Chrome tab move.
- [x] The unified popup editor creates a workspace and moves a rule to it.
- [x] Editing an existing rule replaces its old prefix.
- [x] Popup search filters destinations and each managed group exposes all its tabs.
- [x] Populated duplicate keepers have distinct accessible names, including tab position and window.
- [x] Canceling duplicate closure retains all tabs; confirming closes only extras and keeps the selected tab.
- [x] Tabs pinned or navigated after the review snapshot are skipped at confirmation.
- [x] With a real Chrome host grant absent, Apply rules makes zero requests to the controlled fixture API, keeps the existing group, and Settings offers **Review access**.
- [x] Review, Help, and diagnostics render; the diagnostic endpoint responds.
- [x] No page JavaScript errors occur during the smoke flow.
- [x] The isolated browser closes and its temporary profile is removed.

The browser command writes screenshots and its machine-readable report under `dist/qa-<manifest-version>/`. The current local walkthrough is under `dist/qa-1.0.0/`, including `review-populated.png`. CI artifacts contain captures for their tested revision. The popup is rendered as its real extension page in a tab; native toolbar anchoring is a separate check. Accessible-name assertions are not a screen-reader walkthrough.

## Package and repository checks

- [x] `npm run package` builds an allowlisted ZIP, validates its relative module dependencies, scans for private fixtures and credential patterns, checks ZIP integrity, and writes SHA-256 metadata.
- [x] Package and manifest versions agree.
- [x] The release ZIP includes the MIT license and bundled font license.
- [x] Repository documentation describes GitHub distribution and the account-free core.
- [x] GitHub Actions passed for commit `5a3b268e416569d50058f540fabfb97a15164146`: [run 39878807651](https://github.com/kylbutlr/tab-bundlr/actions/runs/39878807651). This predates the final GitHub distribution documentation, license packaging, and tab-review safety changes.
- [x] The GitHub distribution and tab-review changes passed PR checks for `f47ea15` and [post-merge CI for `1824b11`](https://github.com/kylbutlr/tab-bundlr/actions/runs/39883408281). This predates the connection-permission fix.
- [x] The connection-permission runtime passed [PR CI for `c7ed69d`](https://github.com/kylbutlr/tab-bundlr/actions/runs/39890711311) and [post-merge CI for `342d343`](https://github.com/kylbutlr/tab-bundlr/actions/runs/39890833643), including 124 tests and 14 disposable-browser checks. Release documentation changes do not alter this runtime. CI for a consolidated release commit is a separate publication check.

## Native popup and live adapter checks

- [x] After the user reloaded the existing extension, its Chrome card showed version 1.0.0 and its native toolbar popup opened without a visible error or horizontal clipping. Keyboard navigation reached Apply rules, search, Review tabs, Help, and tab-list disclosure. Search, expanding all tabs in a workspace, collapsing, Escape, and navigation to Settings worked. The temporary search and test Settings tab were cleaned up. No rules, settings, or host permissions were changed. The permission fix changes background behavior; this popup UI is unchanged.
- [x] With explicit token-use approval, the real source interpreter and cache resolved the existing optional Shortcut profile using two read-only GET requests, both HTTP 200. The result agreed with the saved workspace context. Concurrent reads shared their request; a cached read added no request. Disabled sources, missing credentials, and undeclared origins added no request in local negative checks. The test ran the adapter outside Chrome, so it does not establish native permission-dialog behavior. Credentials and response contents were excluded from the report, and the temporary settings copy and reader were removed.
- [x] A private copy of the installed v2 configuration passed migration stability, credential preservation, credential-free export, and disabled/credential-cleared import checks.
- [x] A consistent copy of the installed v2 extension database loaded in an offline disposable Chromium 151.0.7922.34 profile. Workspaces, URL rules, connection definitions, credentials, and selected settings survived a full browser and worker restart. The temporary profile and copied credentials were removed. This does not establish stable-Chrome native permission interaction or an older-version upgrade path.

## Accepted manual verification limits

The maintainer approved publication on October 22, 2026 with these two checks unverified. They are accepted coverage limits, not passing test results:

- Native optional-origin permission dialogs, including denial, approval, and revocation, in supported stable Chrome. Automated host-denial and mock revocation checks do not establish this interactive flow.
- A screen-reader walkthrough of populated duplicate and stale-tab controls, including keeper selection and confirmation. Accessible-name and keyboard checks do not establish screen-reader acceptance.

## GitHub publication verification

Publication evidence belongs to the [versioned GitHub release](https://github.com/kylbutlr/tab-bundlr/releases/tag/v1.0.0) and [GitHub Actions](https://github.com/kylbutlr/tab-bundlr/actions). Before reporting publication complete:

1. Verify the final release commit, package, and CI result.
2. Verify anonymous access to the repository, privacy policy, support tracker, installation guide, and license.
3. Verify the `v1.0.0` tag targets the intended commit and the release contains the exact ZIP and matching SHA-256 file.
4. Download both assets anonymously and check the checksum.

Git history consolidation requires a separately verified backup, repository-state inventory, and current destructive-operation approval. See [GitHub releases](releases.md) for the publication sequence.
