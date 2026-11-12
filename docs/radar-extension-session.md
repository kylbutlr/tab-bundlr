# Radar acquisition through Tab Bundlr's Chrome extension

> November 12 update: [Project-based grouping and installed disposable grouping/Undo](radar-project-grouping.md) are implemented and verified. This earlier selected-ticket handoff is preserved as historical evidence. No connection retest was performed; closing Codex is optional, not an enablement prerequisite.


Current decision, later November 11, 2026: Kyle requires the app's own Chrome extension to acquire Radar data through his existing signed-in Chrome session. This supersedes OAuth/client-metadata setup as the integration path. Historical discovery receipts are preserved unchanged. App Launchr [PR #2](https://github.com/kylbutlr/app-launchr/pull/2) remains outside this work, with no merge, publication or remote changes performed here.

## Supported local implementation

[radar-session.js](../radar-session.js) is a closed, app-owned transport, independent of Codex. Settings lists existing native ticket tabs only after an explicit click. A preview targets the selected tab's top frame in Chrome's ISOLATED world, never creating, reloading, activating or navigating a tab. It uses browser-managed same-origin session requests. It neither reads nor exports cookies, authorization headers, passkeys, tokens or Codex credentials.

A bounded attempt makes these three GETs, sequentially, with redirects rejected, no cache, a five-second request timeout, a 15-second total deadline and a 2 MiB aggregate response limit:

1. `/api/me`, for the current viewer email, used transiently inside the reader.
2. `/api/reads?op=bootstrap`, to match that viewer uniquely to a native user and team workspace. Membership IDs are never substituted for native user IDs.
3. `/api/reads?op=ticket-get&id={observed native UUID}&include=page`, with no presence flag, for that selected ticket's UUID, number, workspace and project.

Returned metadata consists only of native user/account ID, workspace ID, ticket UUID/number and project ID. No descriptions, events, actors, revisions, email addresses or arbitrary response data leave the isolated reader. The verified page response does include unnecessary content in transit; it is parsed transiently and discarded there. A smaller supported metadata-only response has not been established, so no query parameter or endpoint is invented.

Preview uses the native project ID and a user-entered label. It makes no claim that this label is Radar's official storefront name. It generates a disabled schema-3 source with exact native and short routes for only the observed UUID/number pair. Unknown short URLs cannot seed a preview. No catalog is scanned, project grouping is not inferred from titles or path segments, and no aliases are migrated.

Saving and enabling remain separate explicit actions through the existing Workspace Sources controls. The source uses only optional `scripting` and the exact Radar origin; no required host permission or cookies/webRequest/identity permission is added. The generic wildcard optional-host declaration remains necessary for existing user-authored sources; Radar itself requests only its exact origin. Source JSON cannot supply scripts, session headers or arbitrary session requests.

On a matching enabled source, the worker repeats the viewer and scope checks in the matching existing tab, then uses the existing protected move and undo flow. Successes bypass the generic cache so an account switch cannot reuse a previous viewer's result. Only one acquisition runs at a time, including an isolated-tab guard across worker restarts. Failures cool down for 30 seconds; there is no timer-driven retry, login opening, background scan or polling. HTTP 401, 403, 428, 429, HTML login/challenge, navigation, missing/ambiguous identity, deleted records, scope changes and oversized/failed reads all stop without a grouping result.

This operates when Codex is closed by design, using Chrome's extension APIs alone. Actual closed-Codex acceptance is still pending.

## Evidence and claims

The [shared Radar contract](/Users/kylebutler/.codex/visualizations/2026/11/05/01a1acee-ff0f-7641-890a-61b2694b01ed/radar-migration-handoffs-20261111/RADAR-CONTRACT.txt), its [route inventory](/Users/kylebutler/.codex/visualizations/2026/11/05/01a1acee-ff0f-7641-890a-61b2694b01ed/radar-migration-handoffs-20261111/frontend-discovery/frontend-route-map.json), [field inventory](/Users/kylebutler/.codex/visualizations/2026/11/05/01a1acee-ff0f-7641-890a-61b2694b01ed/radar-migration-handoffs-20261111/frontend-discovery/response-fields.json) and [frontend mechanics](/Users/kylebutler/.codex/visualizations/2026/11/05/01a1acee-ff0f-7641-890a-61b2694b01ed/radar-migration-handoffs-20261111/frontend-discovery/frontend-mechanics.txt) establish observed native ticket URLs and selected response fields. These are sourced observations, not a new Tab Bundlr service read or a stable public API guarantee.

The additional viewer/bootstrap relationship and GET usage follow Harvest Trackr's preserved [provenance evidence](/Users/kylebutler/Documents/sites/harvest-trackr/docs/radar-provenance.md) and [collector](/Users/kylebutler/Documents/sites/harvest-trackr/extension/radar-browser-collect.js). No Harvest files were edited. Chrome documents [isolated content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [scripting permissions](https://developer.chrome.com/docs/extensions/reference/api/scripting), and [content-script requests on behalf of the web origin](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests). These support the transport design, not Radar's acceptance of this installed extension.

- **Identity:** local tests verify separate provider, authority, native account/user, workspace, project and ticket UUID/number checks. Real Tab Bundlr viewer/session acceptance remains unverified. Native user identity does not establish activity authorship or manual origin.
- **Provenance:** no activity stream is acquired or interpreted. Human versus agent/tool/import classification is unavailable and is not needed for tab grouping.
- **Coverage:** one selected ticket only. No complete catalog, day, revision stream, deleted-descendant relationship, retained-trash history or original Shortcut history is claimed. Description revisions are a separate unimplemented acquisition stream, never inferred from ticket events or current state.
- **Migration:** Shortcut remains independent. No legacy mapping is acquired or applied here. UUID/number pairs are learned only from the same native response; equal numbers across providers/accounts remain separate.

## Migration and rollback

Existing source schema 1/2, legacy Shortcut conversion, local rules and manual/default protections remain intact. Schema 3 is an explicit new source, with provider/account/workspace-qualified destination identity, not an automatic upgrade. Imported sources remain disabled, credentials remain excluded, and no production settings or real tabs were changed by development.

Disable/remove the optional Radar source before reverting to a build that does not recognize schema 3. Preserve a pre-change backup. Removing the source does not rewrite historical rules, groups, activity or Shortcut references. Chrome site/scripting grants can be revoked separately. Prepared OAuth code and its receipts are retained for history but are not imported into runtime or packaged. The previously committed home-base loop fix remains intact.

## Validation and acceptance

Final bounded local pass used Node 22.23.1. `npm test` passed all 183 tests, including App Stylr 1.4.1 verification and JavaScript syntax checks. The 16 dedicated session tests exercise isolated-function serialization/projection, fixed requests, expired/denied/passkey/rate-limit states, scope mismatch, short-link mapping, navigation, response limits, no tab creation, concurrency/cooldown, schema validation and disabled versioned imports. The real-worker synthetic case verifies namespaced Radar grouping plus Undo alongside preserved legacy ownership. Existing local-core, Shortcut, equal-number identity and home-base loop tests passed. These use mocked Chrome APIs and are not installed-extension tests.

`npm run package` passed allowlist, credential-pattern and archive-integrity checks. The archive includes only the new Radar session/source/options modules, with no OAuth module, hosting files or fixtures. Prior local artifact, replaced by the later acceptance build below: [tab-bundlr-1.1.1.zip](../dist/tab-bundlr-1.1.1.zip), SHA-256 `31b43bab31e1aa63d76fa2f5c8fc5f578564cd54c9036beb1296d24ffb371fb4`. Packaging did not install or publish it. `git diff --check` passed. Initial validation caught a newly supported schema number in an old rejection test and the public provider hostname in the private-fixture scan. The rejection test now uses unsupported schema 4; only the exact public HTTPS origin is excluded from that scan, with other private-name/ID checks preserved.

All validation commands exited. No preview, watcher, browser review session or task-owned tab was started. Temporary synthetic test logs were deleted. The checkout remains on its existing nontracking feature branch; unrelated dirty work and historical receipts were preserved. No new commit was created.

**Earlier pre-acceptance status, superseded by the approved result below:** actual extension-mediated Radar read had not been performed. The current loaded extension has not been inspected, reloaded or granted new permissions. **Installed-client, rendered UI and closed-Codex acceptance: pending.** Browser automation remains stopped. No live Radar, Shortcut or Harvest write occurred; no push, PR modification, publication, installation or consent occurred.

Acceptance requires separately approved loading/reloading of this exact local build if the installed extension lacks it, followed by the user's explicit optional scripting/site grant. Then use a single already-open native ticket tab and the Settings preview, verify the minimized IDs and disabled source without moving tabs, test expiry/revocation without automatic retries, and verify a synthetic/disposable grouping move plus Undo. Repeat the selected read with Codex closed. Existing real settings and real-tab organization must not be replaced for QA.

## Exact files changed for this correction

- Transport, source boundary and worker: [radar-session.js](../radar-session.js), [sources.js](../sources.js), [background.js](../background.js).
- Settings and permissions: [radar-options.js](../radar-options.js), [options.html](../options.html), [options.js](../options.js), [manifest.json](../manifest.json).
- Packaging and tests: [package-extension.mjs](../scripts/package-extension.mjs), [radar-session.test.js](../tests/radar-session.test.js), [workspace-worker.test.js](../tests/workspace-worker.test.js), [extension.test.js](../tests/extension.test.js), [sources.test.js](../tests/sources.test.js).
- Current guidance: [README](../README.md), [Help](../help.html), [privacy](privacy.md), [source schema](workspace-sources.md), [architecture](architecture.md), this document.
- Historical documents annotated with the superseding decision: integration (separate historical investigation), sign-in (separate historical investigation), connection audit (separate historical investigation), metadata publication (separate historical investigation). Historical JSON receipts remain unchanged.

## Approved installed-extension preview, later November 11

Kyle explicitly approved the local reload, exact Radar and scripting permissions, and one existing-tab read. Chrome verified the unpacked extension was loaded from this checkout. The real app-owned extension preview succeeded, showing a disabled schema-3 Radar session source with native account/workspace fields and no credentials. No Codex-side network read, OAuth, MCP or API token substituted for it. The [sanitized read receipt](radar-extension-read-receipt.json) records the evidence and its limits without real native IDs or private content.

The existing Radar Work tab was reused for one native ticket, then returned to its original Work route. No new tab was opened and no source was saved, enabled or applied. The lower route JSON was not exposed by the accessibility readback, so its exact fields are supported by local tests rather than a claimed full live UI readback. The reader's successful path itself validates native viewer/workspace/ticket/project scope.

Reload required a narrowly scoped safety addition. Chrome documents that extension reload clears [session storage](https://developer.chrome.com/docs/extensions/reference/api/storage#storage_areas). The new [reload-safety.js](../reload-safety.js) preserves only fixed session-protection keys in a temporary extension-local handoff. It never reads credential keys. The new worker restores those keys before loading session policies, consumes the snapshot, and holds automatic startup, tab/navigation/home-base handling and mutating messages during the test. **Finish metadata-only test** removes the hold without replaying startup moves or changing automation preferences. A stale handoff never restores old browser/window IDs. The surviving hold is recoverable through Settings if the test is interrupted.

The hold was observed active before the read and released afterward; normal handling resumed. The preview was cleared, Copy preview was disabled, the original Radar Work route and Extensions-control route were restored, and the original selected tab was restored. Browser automation stopped and ownership was released to the coordinated chats. Chrome itself closed the original extension Settings page on runtime reload, reducing the count from eight to seven. Its existing Extensions-control tab was reused for Settings and restored; no user content tab was closed or reorganized by the task.

The updated final validation passed **186/186 Node tests serially**, App Stylr verification, all JavaScript syntax checks, package integrity/privacy checks and whitespace checks. Three added tests cover session-protection handoff, stale-state rejection and the real worker's held startup/event/mutating-message paths plus explicit release. The current [local package](../dist/tab-bundlr-1.1.1.zip) has SHA-256 `0bc60e25f5215674007b4f0c45fc5eae13c0440012d630c0fe6873f1d03149b7`. Checks exited and temporary synthetic logs were deleted. No new commit, push, PR modification, merge, publication or remote data write occurred.

Files changed for this acceptance increment: [reload-safety.js](../reload-safety.js), [reload-safety.test.js](../tests/reload-safety.test.js), [background.js](../background.js), [radar-options.js](../radar-options.js), [options.html](../options.html), [package-extension.mjs](../scripts/package-extension.mjs), [README](../README.md), [architecture](architecture.md), [privacy](privacy.md), this document and the [sanitized receipt](radar-extension-read-receipt.json). All earlier unrelated dirty work and historical receipts remain preserved.

Actual installed-extension metadata acquisition is now verified for this selected ticket and active session. Full installed grouping/Undo, authentication-expiry/revocation behavior against the service, broader account coverage and closed-Codex operation remain unverified. No human-origin, labor, description-history, complete-day or deleted-descendant claim is added.

## November 12 project catalog expansion

The later [catalog implementation and acceptance](radar-project-catalog.md) verified an app-owned native session-renewal preflight and all 34 returned project bindings. The same existing source was expanded and enabled, with persisted Settings readback. This adds explicit catalog acquisition, not history synchronization or a new OAuth connection. The native helper's MAIN-world call returns only a status enum; actual project data still comes from fixed isolated same-origin GETs. Historical receipts above remain unchanged. Installed grouping/Undo continues to be separately qualified by the [project acceptance receipt](radar-project-grouping-receipt.json).

## Recommended Next Steps

No further sign-in, registration or OAuth consent is needed for the successful selected-ticket path. Before enabling a real grouping source, complete a separately scoped closed-Codex preview and disposable grouping/Undo acceptance. Leave the source unsaved/off and App Launchr PR #2 unmerged until further direction.
