# Tab Bundlr

Tab Bundlr organizes browser tabs into predictable workspaces using transparent URL rules, while keeping users in control of every move.

It is a local-first Manifest V3 Chrome extension. No account, hosted profile, cloud synchronization, or project-management service is required. Settings stay in Chrome extension storage unless the user explicitly exports them.

## Start here

1. Follow [Installation](docs/installation.md).
2. Create a Smart Group such as `Documentation` with `https://docs.example.com/product/`.
3. Open the popup and use **Fix** to apply saved rules in the current window.
4. Turn on **Automatic Tab Bundling** only if you want matching tabs handled as they open or navigate.

Fresh installations start in manual mode. The popup's **Fix**, **Organize**, review, focus, home-base, pause, and undo actions remain available without an external integration.

## Product behavior

### Workspaces and URL rules

A Smart Group is a named workspace with one or more explicit URL prefixes. A prefix matches itself and deeper paths. When several rules match, the longest prefix wins. A Smart Group wins an exact-length tie with a saved workspace rule.

The rule tester in Settings shows all matches, their order, and the winner before a rule is relied upon.

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

**Automatic Tab Bundling** is off on a fresh install. In manual mode, **Fix** re-evaluates recognized tabs and **Organize** reorders managed groups. Neither action moves pinned tabs or tabs in manual groups.

When automatic mode is enabled, matching tabs are processed on creation and navigation. Every move is recorded in local activity history and can be undone while the affected tab still exists in the recorded destination.

### Opener inheritance

When Chrome provides a direct `openerTabId`, an HTTP or HTTPS child tab can inherit its opener's known workspace. This is independently configurable. Browser-owned pages, pinned tabs, unknown openers, and tabs protected by manual groups are not inherited.

### Focus Groups

One Smart Group can be designated as the Focus Group. Tabs manually placed there remain held until dragged out. Direct web links may inherit that hold when opener inheritance is enabled. Leaving the Focus Group re-evaluates the tab's normal saved assignment.

### Persistent home-base tabs

**Keep as home base** remembers an exact HTTP or HTTPS URL and restores an inactive copy when the last copy disappears or navigates away. Query strings remain significant; hash fragments and trailing slashes are ignored.

Fresh installations review exact home-base duplicates without closing them. The optional **Remove exact inactive duplicates automatically** setting may close only inactive, unpinned tabs whose normalized URL exactly matches the home base. General duplicate review always requires the user to select a keeper and confirm **Close extras**.

### Duplicate and stale review

The review page groups exact normalized URL duplicates and lists probably stale tabs using a configurable age threshold. Active and pinned tabs are protected. Stale candidates begin unchecked, and Tab Bundlr never closes a tab solely because it is old.

### Paused windows

Each window can be paused independently. A detached tab that becomes a one-tab window causes that destination window to pause, protecting presentation or meeting windows. Settings can also restrict automation to selected Chrome windows.

### Undo and previous tab

The latest 20 move activities are stored locally and can be undone individually. The configurable Previous Tab command either toggles between the last two tabs or walks backward through activation history in the current window.

## Workspace Sources

Workspace Sources are optional, visible JSON profiles. They can recognize provider pages, issue bounded HTTPS `GET` requests to user-approved origins, extract response properties, and propose a workspace assignment. They cannot execute scripts, send request bodies, follow cross-origin redirects, or make write requests.

Credentials are stored separately in `chrome.storage.local` and are never embedded in source JSON. Imported sources are disabled until the user reviews their origins, supplies credentials, grants runtime host access, and enables them.

See [Workspace Source format](docs/workspace-sources.md) and the neutral [example tracker profile](examples/workspace-sources/example-tracker.json). Shortcut compatibility is provided by the same public schema, not a private execution path. Existing pre-v2 installations migrate their prior setup into a visible source profile.

## Backup and import

Settings backups include rules, source definitions, colors, ordering, behavior preferences, and home-base URLs. They exclude:

- Workspace Source credentials and legacy tokens
- Open tabs and tab activation history
- Chrome group and window IDs
- Paused-window state and temporary focus holds
- Activity and undo history

Imported Workspace Sources are disabled, and importing settings clears locally saved Workspace Source credentials so an old secret cannot be rebound to a changed source definition. Legacy version 1 backups may be imported, but embedded tokens are ignored and must be entered again. In-place migration from v0.7 preserves the existing local token separately. See [Privacy](docs/privacy.md).

## Permissions

- `storage` stores local settings and session state.
- `tabs` reads tab URLs and titles and performs visible tab moves, activation, and user-confirmed closure.
- `tabGroups` creates, updates, and orders managed Chrome groups.
- Optional `https://*/*` host access allows a user-authored Workspace Source to request its declared HTTPS API origin. Tab Bundlr requests exact origins only when the user enables that source.

Tab Bundlr does not inject content scripts, read page contents, request cookies, or include analytics.

## Development

```bash
npm test
npm run package
```

The package command creates a public extension ZIP from the explicit allowlist in `scripts/package-extension.mjs` and scans it for excluded private fixtures and known credential values.

## Public beta materials

- [Installation](docs/installation.md)
- [Privacy](docs/privacy.md)
- [Support](docs/support.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Store listing draft](docs/store-listing.md)
- [Workspace Source format](docs/workspace-sources.md)
- [Verification checklist](docs/verification.md)

## Non-goals

The public beta does not provide cloud synchronization, accounts, hosted profiles, AI categorization, mandatory integrations, enterprise administration, or silent general-purpose tab closure.

## License

Tab Bundlr is available under the [MIT License](LICENSE).
