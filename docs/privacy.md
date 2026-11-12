# Privacy

Tab Bundlr is local-first. It has no Tab Bundlr account, hosted backend, cloud synchronization, telemetry, advertising SDK, or analytics service.

## Data stored locally

Chrome extension-local storage may contain workspace rules, Workspace Source definitions, Workspace Source credentials, group records, behavior preferences, home-base URLs, recent move history, and whether first-use guidance was dismissed. Session storage may contain paused window IDs, temporary focus holds, home-base anchors, and tab activation history.

Radar's reviewed source stores native user/account, workspace, ticket UUID/number and project IDs with your chosen workspace label. A preview stays in Settings memory until explicitly saved. The session path stores no Radar credentials or email addresses. Historical OAuth keys remain excluded from backups and cleared on import; historical OAuth source is excluded from the runtime package.

## External requests

Generic enabled Workspace Sources make bounded HTTPS GET requests using their declared, separately stored header credentials. They omit browser cookies and reject redirects. Core local organization needs no external requests.

Radar uses the browser-managed same-origin session in an already-open ticket tab, without extracting or inspecting cookies, authorization headers, passkeys or tokens. The user explicitly requests optional scripting and exact Radar-origin access. A preview or enabled source match performs at most three fixed GETs: `/api/me`, `/api/reads?op=bootstrap`, and the verified ticket-get page route. No login page, registration, OAuth, MCP, API token, new tab, catalog scan, polling, mutation or retry is used. Authentication and verification failures stop the read.

Responses are bounded to 2 MiB total and 15 seconds per attempt. The observed page response includes descriptions and events the app does not need. These are transiently parsed then discarded inside the isolated reader. Only native grouping identities return to the worker. No bodies, emails, event records, revisions, server error text or credentials are exported or logged. A smaller metadata-only server response contract has not been verified, so no narrower request is invented.

## Backups

Normal JSON exports exclude Workspace Source credentials, Radar OAuth credentials/receipts/pending attempts and legacy tokens. Importing settings clears locally saved Workspace Source credentials, disconnects Radar locally, ignores credentials embedded in legacy backups, and leaves imported Workspace Sources disabled until reviewed and explicitly enabled. In-place migration from v0.7 preserves the existing token in the separate local credential store.

Backups are created on the user's device. Tab Bundlr does not upload them.

## Tab access

The `tabs` permission allows Tab Bundlr to read tab URLs and titles so it can match rules, display review information, and perform visible user-requested actions. It does not read page bodies or form contents.

## Deletion

Remove individual rules and sources from Settings, or remove the extension through `chrome://extensions` to delete its local extension storage. Removing a Workspace Source also removes its locally stored credentials.

For Radar, turn off or remove its source to stop acquisition. Optional scripting and site grants can be removed in Chrome's extension controls. Disabling a source releases its origin only when another enabled source does not use it. The reader holds no token or server grant to revoke.

## In-product explanation

Open **Help** from the popup or use the **Privacy** link in Settings to see the same data flow beside the controls that use it. Before an optional connection first requests service access, Tab Bundlr shows the exact HTTPS addresses and explains how its saved credential will be used.

## Optional request diagnostic

When explicitly started in Settings, Tab Bundlr records local request counts, timestamps, fixed trigger labels and failure totals for marked browsing and idle periods. No URLs, credentials, headers, bodies, tab titles or provider error messages are recorded. Collection lasts at most 24 hours, with at most 12 periods and 10,000 counted requests. Data remains in local extension storage until Clear recording or extension removal. Export report creates a local JSON file only when requested; it does not upload it. Browser shutdown, sleep and interrupted storage limit what the sample can prove.

## Explicit metadata-only reload

The optional test reload control temporarily places a fixed allowlist of pause/focus, window policy, home-base protection and activation-history session keys in extension-local storage so Chrome reload does not discard them. Credential, OAuth and generic source-secret keys are never read for this handoff. The new worker consumes the snapshot immediately after restoration. Only a temporary read-only hold remains until **Finish metadata-only test**, which removes it without replaying startup tab actions. The handoff is excluded by the normal explicit settings-export allowlist. Stale handoffs do not restore old browser/window IDs. No snapshot is exported or logged.

## Project bindings and disposable acceptance

Project sources store only their reviewed native project IDs and user-selected labels alongside existing scoped connection identity. The explicit disposable test uses fixed synthetic account, workspace, project and ticket metadata, creates two extension-owned pages, runs grouping and Undo, and closes only unchanged test pages it created. It makes no Radar request and saves no source, credential or test history. Temporary group/context records use a unique test namespace and are removed. Its report contains counts and pass/fail flags, not real tab URLs, titles or native provider IDs.

## Explicit project catalog review

The separate catalog action reads the existing native bootstrap project list after matching the viewer and source scope. Only native project IDs and names leave the isolated reader. An observed, pinned native session helper runs in the page MAIN context solely to return a renewal status; no credential result crosses that boundary. This is an explicit review action, not polling or unattended ticket-session renewal. The previous and applied credential-free source definitions stay in local storage for guarded source-expansion Undo and are excluded from normal backups. See [catalog behavior and acceptance limits](radar-project-catalog.md).
