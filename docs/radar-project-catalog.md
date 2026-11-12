# Radar project catalog, November 12, 2026

The installed local extension read 34 native project records, verified every record against the existing connection's account and workspace, and expanded that same enabled schema-4 connection from one project to 34. The enabled count persisted after reloading only the Settings page. Automatic bundling remained on. No extension reload, new permission, consent, push, PR modification or merge occurred.

## Primary evidence and supported scope

The app-owned isolated reader obtained the existing native `GET /api/me` and `GET /api/reads?op=bootstrap` responses. The observed bootstrap top-level fields were `me`, `projects`, `agents`, `users`, `pipelines`, and `ticketStates`. Native project rows exposed `id`, `name`, `workspace_id`, and `archived_at`, among other configuration fields. Only project ID/name pairs and verified connection scope cross the extension boundary. Other project configuration, emails, credentials, bodies and raw responses are discarded. No descriptions, comments, ticket history, or activity streams are requested.

Each of the 34 UUIDs was unique and each `workspace_id` matched the existing source workspace. The viewer was matched uniquely through `bootstrap.users`, with its native user and team workspace matching the existing source. IDs are never derived from labels, ticket numbers, arbitrary paths or Shortcut aliases. Existing reviewed labels and bindings are retained. Archived flags are not treated as deletion or human activity.

This is the complete project array returned by this native bootstrap read, not a historical or cross-workspace completeness guarantee. No pagination endpoint or parameter was inferred. Empty, duplicate, oversized, differently scoped, or changed top-level response shapes fail closed. Future projects require another explicit catalog review; there is no synchronization, polling or catalog background scan.

## Session finding

The first direct catalog attempt returned HTTP 401. Kyle refreshed and completed normal sign-in, but a subsequent extension read still returned 401. Neither failure was reported as an empty project list. The specific failing endpoint was not retained by the initial friendly error UI, so the historical failures are not assigned to one endpoint retrospectively.

A bounded inspection of already-loaded Chrome Sources identified:

- `bridge-ieNtTQrc.js` imports its request wrapper from `signInServiceCopy-Cbq_WqRo.js`.
- That helper's native `s` export wraps a request, invokes its registered session renewer after a 401/redirect, and retries. Its `o` export invokes only the renewer and returns `renewed`, `signed-out`, or `unreachable`.
- `ClerkSession-BfneNOFi.js` registers that renewer through the helper's `c` export. The native frontend owns the session operation. Tab Bundlr never calls Clerk or reads its credential result directly.

The narrow [native session bridge](../radar-native-session.js) invokes only the observed helper's enum-returning `o` export in the existing page's MAIN module context, before the fixed isolated catalog requests. It requires the exact already-observed resource URL, checks unchanged navigation, and fails closed on a changed frontend asset. The helper itself bounds renewal at ten seconds; the bridge bounds waiting at eleven seconds. Only an allowlisted status crosses MAIN. Existing exact Radar/scripting access is sufficient. No cookie, authorization header, passkey, token or Codex credential is inspected, exported, logged or stored.

The first read after adding this bridge succeeded. This supports the missing native renewal preflight as the practical difference, not a claim about the server's complete authentication policy. A separate credential-free public HTML inspection received HTTP 429 and was stopped without retry; it supplied no project or authentication evidence.

The automatic ticket reader still uses its existing isolated transport and stops on expiry. The explicit catalog action now supports native renewal; this does not claim installed acceptance of every expiry/revocation case or promise unattended session renewal for ticket matching. The ordinary browser session must remain available.

## Review, apply and rollback

Settings, Connections (optional), Radar browser session now offers **Read all Radar projects**, **Enable grouping for these projects**, and **Undo project expansion**. Preview shows project names and binding counts before saving. Apply rechecks the selected source against the reviewed snapshot and changes only that source's projects/enabled state. Other sources, Shortcut URL rules, preferences, credential stores, and tab move history are not rewritten. Existing source precedence remains after URL rules.

The local `radarProjectCatalogRollback` record contains only the previous and applied credential-free source definitions. Undo restores that one source only when it still matches the applied version, retaining intervening edits to other sources. Newer edits to the same source stop Undo. This record stays in extension storage and is not a Git fixture or exported settings backup. Source schema remains version 4; versioned imports continue to disable sources. No migration alias is added.

The storage guard and route validator compare object values independently of dictionary property order. The first apply was stopped before writing by the former order-sensitive route check; the corrected apply was verified by readback. Unknown routes and write requests remain rejected.

The existing worker normally re-evaluates recognized tabs after a source setting changes. This action does not bypass pinned/manual-group, pause or focus protections, change automatic bundling, or run a separate Apply rules action. Visible working group summaries matched before and after the save. No native tab/group mutation control was used by this task.

## Acceptance and limits

- **Local:** synthetic tests cover metadata projection, fixed GETs, native renewal status/serialization, 401 stop, scope mismatch, duplicate IDs, navigation, changed catalog shapes, review/enable, property-order variation, source concurrency, guarded rollback, imports, retained labels, and unchanged Shortcut/protection/history storage keys. Full final results are in the [sanitized receipt](radar-project-catalog-receipt.json).
- **Actual extension-mediated service read:** passed in the loaded extension. All 34 returned native projects passed identity/scope validation and were saved enabled; Settings-page reload confirmed 34 persisted bindings.
- **Installed grouping/Undo:** the earlier [disposable acceptance](radar-project-grouping-receipt.json) remains separate evidence. This increment did not create disposable tabs, navigate real ticket tabs, or repeat that grouping test. No real-ticket grouping demonstration, closed-Codex run, full-day/human-origin evidence or deleted-descendant acceptance is claimed.
- **Cleanup:** the task-created Settings tab was closed, the task-opened source inspector was closed, and Kyle's post-sign-in selected tab was restored. Five visible preference controls matched the task baseline; saved workspace URL-prefix counts remained 13 and 11. No other agent/chat was contacted. Browser automation stopped. Local validation processes exited; no preview was started.

## Exact files changed in this increment

- Runtime: [radar-catalog.js](../radar-catalog.js), [radar-native-session.js](../radar-native-session.js), [radar-catalog-options.js](../radar-catalog-options.js), [radar-session.js](../radar-session.js), [options.html](../options.html), [package-extension.mjs](../scripts/package-extension.mjs).
- Tests: [radar-catalog.test.js](../tests/radar-catalog.test.js), [radar-native-session.test.js](../tests/radar-native-session.test.js).
- Documentation: this handoff, its [receipt](radar-project-catalog-receipt.json), [README](../README.md), and the appended [session handoff](radar-extension-session.md). Earlier dirty work and historical receipts are preserved.

## Recommended Next Steps

No setup step is required. Normal automatic handling now has bindings for all 34 returned catalog projects. Use the explicit catalog review when Radar adds a project; use **Undo project expansion** only if the previous one-project configuration is wanted.
