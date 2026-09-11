# Privacy

Tab Bundlr is local-first. It has no Tab Bundlr account, hosted backend, cloud synchronization, telemetry, advertising SDK, or analytics service.

## Data stored locally

Chrome extension-local storage may contain workspace rules, Workspace Source definitions, Workspace Source credentials, group records, behavior preferences, home-base URLs, and recent move history. Session storage may contain paused window IDs, temporary focus holds, home-base anchors, and tab activation history.

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
