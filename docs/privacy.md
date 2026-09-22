# Privacy

Tab Bundlr is local-first. It has no Tab Bundlr account, hosted backend, cloud synchronization, telemetry, advertising SDK, or analytics service.

## Data stored locally

Chrome extension-local storage may contain workspace rules, Workspace Source definitions, Workspace Source credentials, group records, behavior preferences, home-base URLs, recent move history, and whether first-use guidance was dismissed. Session storage may contain paused window IDs, temporary focus holds, home-base anchors, and tab activation history.

## External requests

Tab Bundlr makes no external API request unless the user configures and enables a Workspace Source. Before enablement, the source displays its declared HTTPS API origins and Chrome asks the user to grant those origins. Source requests use `GET` only.

Credentials are sent only as the headers defined by the enabled source and only to an origin listed in that source. Redirects are rejected.

## Backups

Normal JSON exports exclude Workspace Source credentials and legacy tokens. Importing settings clears locally saved Workspace Source credentials, ignores credentials embedded in legacy backups, and leaves imported Workspace Sources disabled until reviewed and explicitly enabled. In-place migration from v0.7 preserves the existing token in the separate local credential store.

Backups are created on the user's device. Tab Bundlr does not upload them.

## Tab access

The `tabs` permission allows Tab Bundlr to read tab URLs and titles so it can match rules, display review information, and perform visible user-requested actions. It does not read page bodies or form contents.

## Deletion

Remove individual rules and sources from Settings, or remove the extension through `chrome://extensions` to delete its local extension storage. Removing a Workspace Source also removes its locally stored credentials.

## In-product explanation

Open **Help** from the popup or use the **Privacy** link in Settings to see the same data flow beside the controls that use it. Before an optional connection first requests service access, Tab Bundlr shows the exact HTTPS addresses and explains how its saved credential will be used.

## Optional request diagnostic

When explicitly started in Settings, Tab Bundlr records local request counts, timestamps, fixed trigger labels and failure totals for marked browsing and idle periods. No URLs, credentials, headers, bodies, tab titles or provider error messages are recorded. Collection lasts at most 24 hours, with at most 12 periods and 10,000 counted requests. Data remains in local extension storage until Clear recording or extension removal. Export report creates a local JSON file only when requested; it does not upload it. Browser shutdown, sleep and interrupted storage limit what the sample can prove.
