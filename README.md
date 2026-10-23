# Tab Bundlr

Tab Bundlr organizes browser tabs into predictable workspaces using transparent URL rules, while keeping users in control of every move.

It is a local-first Manifest V3 Chrome extension. No account, hosted profile, cloud synchronization, or project-management service is required. Settings stay in Chrome extension storage unless the user explicitly exports them.

[Report an issue](https://github.com/kylbutlr/tab-bundlr/issues)

## Status

Tab Bundlr 1.0.0 is distributed through [GitHub Releases](https://github.com/kylbutlr/tab-bundlr/releases/tag/v1.0.0) under the MIT License. Download the ZIP and install it through Chrome's **Load unpacked** control. The core workflow needs no account, password, API token, or external integration. See [release verification](docs/verification.md) for tested behavior and accepted verification limits.

## Highlights

- Organizes tabs into persistent workspaces with transparent, testable URL rules.
- Keeps automatic bundling off by default and protects pinned tabs, manual groups, paused windows, and focus holds.
- Provides deliberate review flows for unassigned, duplicate, and stale tabs, with local activity history and undo.
- Supports optional, visible Workspace Sources without making any provider mandatory.

## Quick start

### Install locally

1. Download the versioned ZIP from [GitHub Releases](https://github.com/kylbutlr/tab-bundlr/releases/tag/v1.0.0), or clone this repository and run `npm run package`.
2. Extract the ZIP into a permanent folder. Keep this folder after installation.
3. Open `chrome://extensions`.
4. Enable **Developer mode**.
5. Choose **Load unpacked** and select the directory containing `manifest.json`.
6. Pin Tab Bundlr from Chrome's Extensions menu.
7. Open **Extension options** from the Tab Bundlr details page or popup.

### Create a first workspace

1. Leave **Automatic Tab Bundling** off while learning the workflow.
2. Under **Workspaces**, create a workspace such as `Documentation` with `https://docs.example.com/product/`.
3. Open matching pages, then open the popup and choose **Apply rules**.
4. Review the result and use **Undo** if needed.
5. Turn on **Automatic Tab Bundling** only if you want matching tabs handled as they open or navigate.

Fresh installations start in manual mode. The popup's **Apply rules**, **Reorder**, review, focus, home-base, pause, and undo actions remain available without an external integration.

See the complete [installation guide](docs/installation.md) for update and reload instructions.

## How it works

### Workspaces and URL rules

Use one workspace editor in the popup to choose a local or saved connected destination. Settings leads with workspace creation. Window routing, categories, connections, backups, and troubleshooting are expandable. Removing the final URL rule keeps the workspace; Undo rule removal restores the prefix. Delete workspace is a separate confirmed action and leaves open tabs in place.

A workspace is a named destination that can have explicit URL prefixes. A workspace can remain saved without a rule, for example after its last prefix is removed. A prefix matches itself and deeper paths. When several rules match, the longest prefix wins. A local workspace rule wins an exact-length tie with a saved destination rule.

The rule tester in Settings shows enabled URL-rule matches and their winner using the runtime resolver. Optional connection requests are not executed by the tester. Equal local-rule matches use a stable workspace identifier; equal saved-destination matches retain stored order.

### Precedence and protection

Tab Bundlr applies this order:

1. Pinned tabs and user-owned manual Chrome groups are protected.
2. Paused or excluded windows are left unchanged.
3. A Focus Group hold is respected.
4. Saved URL rules and enabled Workspace Sources are evaluated using each source's visible precedence setting.
5. Opener inheritance runs when enabled and no more specific assignment wins.
6. Unmatched tabs remain available in the unassigned inbox.

Automatic and explicit actions use the same protections. A stored Tab Bundlr group record is required before an existing Chrome group can be treated as managed. A restored exact-name group is recovered only when prior ownership evidence exists.

### Manual and automatic modes

**Automatic Tab Bundling** is off on a fresh install. In manual mode, **Apply rules** re-evaluates recognized tabs and **Reorder** reorders managed groups. Neither action moves pinned tabs or tabs in manual groups.

When automatic mode is enabled, matching tabs are processed on creation and navigation. Every move is recorded in local activity history and can be undone while the affected tab still exists in the recorded destination.

### Opener inheritance

When Chrome provides a direct `openerTabId`, an HTTP or HTTPS child tab can inherit its opener's known workspace. This is independently configurable. Browser-owned pages, pinned tabs, unknown openers, and tabs protected by manual groups are not inherited.

### Focus Groups

One workspace can be designated as the Focus Group. Tabs manually placed there remain held until dragged out. Direct web links may inherit that hold when opener inheritance is enabled. Leaving the Focus Group re-evaluates the tab's normal saved assignment.

### Persistent home-base tabs

**Keep as home base** remembers an exact HTTP or HTTPS URL and restores an inactive copy when the last copy disappears or navigates away. Query strings remain significant; hash fragments and trailing slashes are ignored.

Fresh installations review exact home-base duplicates without closing them. The optional **Remove exact inactive duplicates automatically** setting may close only inactive, unpinned tabs whose normalized URL exactly matches the home base. General duplicate review always requires the user to select a keeper and confirm **Close extras**.

### Duplicate and stale review

The review page groups exact normalized URL duplicates and lists probably stale tabs using a configurable age threshold. Active and pinned tabs are protected. Stale candidates begin unchecked, and Tab Bundlr never closes a tab solely because it is old.

### Paused windows

Each window can be paused independently. A detached tab that becomes a one-tab window causes that destination window to pause, protecting presentation or meeting windows. Settings can also restrict automation to selected Chrome windows.

Paused and excluded windows default to **Allow new tabs in this window: Off**, available below the popup's window-management action. With exactly one available managed destination, subsequent web links (including links opened from Meet) and New Tab tabs are moved to that main window, independently of automatic bundling. Active tabs focus the main window; background tabs do not. The first tab in a new window, dragged tabs, pinned tabs, and existing tabs are left alone. Turn Allow new tabs on to let new tabs stay in the secondary window without enabling organization there. Dragging a tab into the window does not change this preference. This choice survives service-worker restarts for the current browser session and resets when the window closes. If there is no unambiguous managed destination, tabs stay in place.

For troubleshooting, use **Routing and speed diagnostic** in the popup or Help. It opens independently of the popup status request. A worker records up to 128 allowlisted routing decisions and popup timings in memory for five minutes after waking or starting a capture. It records no URLs, titles, content, credentials or raw errors, makes no network requests, and does not poll or write each event to storage. Refresh and download the report manually; worker suspension/restart can clear the capture. `popup-start` without `popup-status` indicates an unfinished status request. `ioMs` measures Chrome/storage waiting; the remaining status time is computation. `popup-render` separates the popup's message wait from rendering and its guidance-storage read. These measurements are diagnostic evidence, not a live-performance guarantee.

### Undo and previous tab

The latest 20 move activities are stored locally and can be undone individually. The configurable Previous Tab command either toggles between the last two tabs or walks backward through activation history in the current window.

## Workspace Sources

Workspace Sources are optional, visible JSON profiles. They can recognize provider pages, issue bounded HTTPS `GET` requests to user-approved origins, extract response properties, and propose a workspace assignment. They cannot execute scripts, send request bodies, follow cross-origin redirects, or make write requests.

Credentials are stored separately in `chrome.storage.local` and are never embedded in source JSON. Imported sources are disabled until the user reviews their origins, supplies credentials, grants runtime host access, and enables them.

The worker checks current Chrome host access before resolving a connection, before each API request, and before applying its result. Permission changes clear the connection cache. If access is missing or revoked, open **Connections (optional)** in Settings and choose **Review access** for that connection.

See [Workspace Source format](docs/workspace-sources.md) and the neutral [example tracker profile](examples/workspace-sources/example-tracker.json). Shortcut compatibility is provided by the same public schema, not a private execution path. Existing pre-v2 installations migrate their prior setup into a visible source profile.

## Backup and import

Settings backups include rules, source definitions, colors, ordering, behavior preferences, and home-base URLs. They exclude:

- Workspace Source credentials and legacy tokens
- Open tabs and tab activation history
- Chrome group and window IDs
- Paused-window state and temporary focus holds
- Activity and undo history

Imported Workspace Sources are disabled, and importing settings clears locally saved Workspace Source credentials so an old secret cannot be rebound to a changed source definition. Legacy version 1 backups may be imported, but embedded tokens are ignored and must be entered again. In-place migration from v0.7 preserves the existing local token separately. See [Privacy](docs/privacy.md).

## Privacy and permissions

Tab Bundlr has no hosted backend, cloud synchronization, telemetry, advertising SDK, or analytics service. Workspace rules, optional source credentials, behavior preferences, home-base URLs, and recent move history stay in Chrome extension storage. Settings exports exclude Workspace Source credentials and legacy tokens.

- `storage` stores local settings and session state.
- `tabs` reads tab URLs and titles and performs visible tab moves, activation, and user-confirmed closure.
- `tabGroups` creates, updates, and orders managed Chrome groups.
- Optional `https://*/*` host access allows a user-authored Workspace Source to request its declared HTTPS API origin. Tab Bundlr requests exact origins only when the user enables that source.

Tab Bundlr does not inject content scripts, read page contents, request cookies, or include analytics.

See the complete [privacy policy](docs/privacy.md) and [Workspace Source security model](docs/workspace-sources.md).

## Known limitations

- Pinned tabs, manual Chrome groups, and paused windows are protected. Browser-owned pages are ignored unless explicitly routed to a standard workspace.
- Undo requires the affected tab to still exist in the recorded destination.
- Workspace Sources depend on user-approved HTTPS origin access and the configured provider response retaining the expected public fields.
- Tab Bundlr currently targets Chrome and does not provide cross-device synchronization.

Tab Bundlr does not provide accounts, hosted profiles, AI categorization, mandatory integrations, enterprise administration, or silent general-purpose tab closure.

## Development

Use Node.js 22 or newer. The extension has no runtime dependencies. Run `npm ci` to install the browser test tool; the Node test suite also works without installing it.

```bash
npm ci
npm test
npx playwright install chromium
npm run test:browser
npm run package
```

The package command creates an extension ZIP from the explicit allowlist in `scripts/package-extension.mjs` and scans it for excluded private fixtures and credential patterns. It checks archive integrity and writes a SHA-256 checksum beside the ZIP.

Packaging creates a local artifact. Publishing the ZIP and checksum to GitHub Releases is a separate step described in the [release guide](docs/releases.md).

## Documentation

- [Installation](docs/installation.md)
- [Architecture](docs/architecture.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Changelog](CHANGELOG.md)
- In-extension Help and Privacy page (`help.html`)
- [Privacy](docs/privacy.md)
- [Support](docs/support.md)
- [Troubleshooting](docs/troubleshooting.md)
- [GitHub releases](docs/releases.md)
- [Workspace Source format](docs/workspace-sources.md)
- [Verification checklist](docs/verification.md)

## App Stylr

Tab Bundlr follows the pinned [App Stylr v1.2.0 source](https://github.com/kylbutlr/app-stylr/tree/b3ca31ea264d5dd233fd871ac167247f1c306985) contract for its standalone popup and options surfaces. Review the current [App Stylr Visual Reference](https://app-stylr.netlify.app/) as guidance, but upgrade the pinned release deliberately before adopting newer contract requirements.

The popup width exception and current styling boundary are documented in [docs/app-stylr-exceptions.md](docs/app-stylr-exceptions.md).

## Support

Start with the [support guide](docs/support.md) and [troubleshooting guide](docs/troubleshooting.md), or open a report in the [issue tracker](https://github.com/kylbutlr/tab-bundlr/issues). Include Chrome and Tab Bundlr versions, the action attempted, and redacted source definitions when relevant. Never include API tokens, authorization headers, private URLs, exported browser data, or confidential workspace information.

## License

Tab Bundlr is available under the [MIT License](LICENSE).

Current styling source: [App Stylr Evening adoption](docs/app-stylr-evening-adoption.md).

### Troubleshooting

Settings includes an expandable Troubleshooting section for optional local request counts. Help links to a separate routing and popup-timing diagnostic. These tools are opt-in where stated, do not add network requests, and do not connect to other applications. See [Troubleshooting](docs/troubleshooting.md) for capture limits and interpretation.
