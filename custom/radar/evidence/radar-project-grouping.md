# Radar project grouping, November 12, 2026

Project-based matching is implemented locally. The installed extension's explicitly requested disposable test passed: **two tabs grouped together, two restored by Undo, zero retained test tabs and zero Radar requests**. Existing working content tabs were unchanged by that test. The previously verified real session read was not repeated. No real Radar source was saved or enabled, no working ticket tab was moved, and no push, PR modification, merge or deployment occurred.

## Supported behavior

New schema-4 sources match native Radar ticket URLs and acquire each ticket's native UUID, number, workspace and project through the same app-owned isolated extension reader already verified against Radar. The viewer/account and workspace must match the reviewed connection. Placement uses an explicit project-ID-to-label binding. A newly encountered ticket in a reviewed project resolves to that project's existing provider/account/workspace-qualified destination. Unknown projects remain unassigned. No display title, arbitrary path segment, number range or Shortcut identifier supplies a grouping identity.

The Settings preview now proposes project sources. One verified native ticket supplies connection scope and a project ID; the user reviews its workspace label. Reusing a schema-4 connection ID previews adding or renaming that project's binding without losing the other reviewed projects. The source remains disabled until saved and explicitly enabled. Existing schema-3 exact-ticket sources are never broadened automatically; choose a new source ID for a project source. Local, Shortcut and version-1/2 behavior remains intact.

The fixed reader is serialized through a bounded 16-entry queue with in-flight coalescing, no success cache, and a 30-second cooldown after failure. It does not poll or retry service failures. This allows concurrent tab-navigation events to be processed one at a time without opening anything or mixing account scope. Native session reads still use only the established viewer, bootstrap and ticket-get routes. No new endpoint, catalog, pagination or authentication mechanism was added.

Before applying a real session result, the worker rechecks that the tab's URL and window are unchanged, and that it has not become pinned, paused or manually grouped. Existing focus protection, move recording and Undo continue through the shared worker engine.

Short-link limitation: schema 4 does not guess a UUID from `/t/{number}`. It matches after Radar resolves the page to its native `/tickets/{UUID}` route. Existing reviewed schema-3 short/native aliases remain valid. Storefront pages, arbitrary project paths, deleted work, histories, activity origins and daily coverage are not inferred or scanned.

## Validation and installed acceptance

- **Local:** 194 Node tests passed serially on Node 22.23.1, plus App Stylr, JavaScript syntax, packaging and whitespace checks. New tests cover unseen ticket UUIDs in the same project, unknown projects, account/workspace isolation, explicit schema migration, imports, closed request routing, and both worker-level project grouping/Undo and the disposable controller.
- **Real Radar acquisition:** the earlier [extension-mediated read receipt](radar-extension-read-receipt.json) remains the transport evidence. No connection test or service request was repeated for this increment.
- **Installed Chrome:** the new Settings action ran in the loaded local extension under the explicit read-only reload hold. Its synthetic metadata followed the production project resolver and shared grouping/Undo engines. Chrome readback confirmed both created test tabs joined the same group, then returned to ungrouped state through Undo. Both unchanged test tabs were closed. Working-tab identity, relative order, pinned state and group membership were compared before and after the test by the controller.

The disposable check uses extension-owned pages, not real Radar pages. It keeps test move history in memory through the shared move recorder interface, so real activity history cannot be truncated. It suppresses whole-window reordering and catalog persistence, removes only its own group/context records, and never saves a source or credential. Production source placement uses the ordinary persisted activity recorder; the worker regression covers that path separately.

A full real-ticket project grouping demonstration was intentionally not performed because the approved test uses disposable tabs and does not repeat the connection test. Closed-Codex operation is an optional remaining independence check, not a new authentication or enablement prerequisite. No labor, actor, revision-history or completeness claim is made.

## Cleanup qualification

The two synthetic test tabs and their group/context records were cleaned up. The temporary read-only hold was released without replaying startup organization. The original selected working ticket was restored. Browser automation and cross-chat messages are stopped; no preview, watcher or validation process remains running.

The agent reused the original Extensions control tab for extension Settings before reload. Chrome automatically closed that extension page and removed its one-tab `[ Me ]` group. A replacement control tab restored the Extensions page and total tab count, but it is ungrouped. This was an administrative cleanup mistake outside the controller's working-tab baseline, and it is not hidden by the controller's successful comparison. The original working content tabs were not navigated, grouped, closed or reordered by the task.

Automatic approval review rejected recreating the control page's group because it mutates persistent Chrome tab-group state beyond disposable-tab testing. No bypass or retry occurred. Restoring only that control tab's `[ Me ]` group remains pending Kyle's approval; its original color was not captured and will not be guessed.

Coordination was overbroad: unrelated active project chats were contacted as possible native Chrome conflicts. Kyle objected. No further cross-chat messages were sent after that correction, and no further browser action was taken.

## Exact changed files

Runtime: [radar-session.js](../radar-session.js), [radar-disposable.js](../radar-disposable.js), [radar-disposable.html](../radar-disposable.html), [sources.js](../sources.js), [background.js](../background.js), [options.js](../options.js), [options.html](../options.html), [radar-options.js](../radar-options.js), [package-extension.mjs](../scripts/package-extension.mjs).

Tests: [radar-projects.test.js](../tests/radar-projects.test.js), [radar-disposable.test.js](../tests/radar-disposable.test.js), [radar-session.test.js](../tests/radar-session.test.js), [workspace-worker.test.js](../tests/workspace-worker.test.js), [sources.test.js](../tests/sources.test.js).

Documentation: [README](../README.md), [workspace source format](workspace-sources.md), [architecture](architecture.md), [privacy](privacy.md), [prior integration handoff](radar-extension-session.md), this handoff and the [sanitized acceptance receipt](radar-project-grouping-receipt.json). Historical read receipts and all unrelated dirty work remain preserved. No new commit was made.

## Migration and rollback

No stored source or setting was migrated. Schema-4 previews are explicit, disabled changes with reviewed project bindings. Backups retain the new schema without credentials; imports disable it. Keep a pre-change backup and disable/remove schema-4 sources before reverting to an older build. Existing schemas and history remain valid. The home-base loop regression continues to pass.

## Recommended Next Steps

Review and enable the desired project bindings only when real-tab grouping is wanted. No connection retest, new sign-in or OAuth setup is needed. The remaining cleanup approval concerns only the restored Extensions control tab's `[ Me ]` group.
