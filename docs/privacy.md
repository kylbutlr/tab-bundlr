# Privacy

Tab Bundlr is local-first. It has no Tab Bundlr account, hosted backend, cloud synchronization, telemetry, advertising SDK, or analytics service.

## Data stored locally

Chrome extension-local storage may contain workspace rules, Workspace Source definitions, Workspace Source credentials, group records, behavior preferences, home-base URLs, recent move history, and whether first-use guidance was dismissed. Session storage may contain paused window IDs, temporary focus holds, home-base anchors, and tab activation history.

## External requests

Generic enabled Workspace Sources make bounded HTTPS GET requests using their declared, separately stored header credentials. They omit browser cookies and reject redirects. Core local organization needs no external requests.


## Backups

Full settings exports exclude Workspace Source credentials, unsupported custom sources and legacy tokens. Importing a full settings backup clears locally saved Workspace Source credentials, ignores credentials embedded in legacy backups, and leaves imported supported Workspace Sources disabled until reviewed and explicitly enabled. In-place migration from v0.7 preserves the existing token in the separate local credential store.

Backups are created on the user's device. Tab Bundlr does not upload them.

## Tab access

The `tabs` permission allows Tab Bundlr to read tab URLs and titles so it can match rules, display review information, and perform visible user-requested actions. It does not read page bodies or form contents.

## Deletion

Remove individual rules and sources from Settings, or remove the extension through `chrome://extensions` to delete its local extension storage. Removing a Workspace Source also removes its locally stored credentials.


## In-product explanation

Open **Help** from the popup or use the **Privacy** link in Settings to see the same data flow beside the controls that use it. Before an optional connection first requests service access, Tab Bundlr shows the exact HTTPS addresses and explains how its saved credential will be used.

## Optional request diagnostic

When explicitly started in Settings, Tab Bundlr records local request counts, timestamps, fixed trigger labels and failure totals for marked browsing and idle periods. No URLs, credentials, headers, bodies, tab titles or provider error messages are recorded. Collection lasts at most 24 hours, with at most 12 periods and 10,000 counted requests. Data remains in local extension storage until Clear recording or extension removal. Export report creates a local JSON file only when requested; it does not upload it. Browser shutdown, sleep and interrupted storage limit what the sample can prove.


## Workspace files

Workspace-only export contains workspace names, local IDs and URL prefixes. These can identify private projects or sites, so share files deliberately. Import never includes credentials or behavior settings, performs no network requests and moves no tabs. One local before/after snapshot supports guarded import Undo. Full settings backups keep their existing separate behavior and exclusions. Custom provider acquisition tools are outside the public extension package.
