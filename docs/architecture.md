# Architecture

Tab Bundlr is a Manifest V3 extension with a background service worker and standalone popup, settings, review, and help pages. It uses browser APIs and ES modules without a build framework or hosted backend.

## Modules

| Module | Responsibility |
| --- | --- |
| `rules.js` | Normalize URL prefixes, rank assignments, explain winners, and detect overlaps. Runtime and the rule tester share the same ranking. |
| `workspace-identity.js` | Namespace external workspace identities and migrate proven legacy ownership. |
| `sources.js` | Validate and interpret provider-neutral declarative connections using bounded HTTPS GET requests. |
| `source-resolver.js` | Share in-flight requests and bound success/error caching. |
| `legacy-shortcut.js` | Supply the compatibility profile used by pre-v2 settings migration. |
| `radar-session.js`, `radar-source.js`, `radar-options.js` | Fixed selected-tab session reader, identity checks, disabled source preview and explicit Settings actions. Historical OAuth is not packaged or reachable from runtime. |
| `reload-safety.js` | Explicit metadata-only reload handoff for fixed session protections, automatic-action hold and release without startup replay. |
| `storage.js` | Serialize batched read-modify-write operations and recover after rejected writes. |
| `message-router.js` | Dispatch known messages, preserve synchronous diagnostic access, and handle asynchronous response channels. |
| `core.js` | Browser policies, group metadata, ordering, tab history, focus, and compatibility exports. |
| `background.js` | Coordinate Chrome tab/group changes, window routing, focus, home-base restoration, and UI operations. |
| `workspace-ui.js` | Present existing local and connected destinations as one workspace selection. |
| `settings.js`, `backup.js` | Migrate existing settings and normalize credential-free settings backups. |

## Identity and compatibility

A connection workspace identity includes its source ID, workspace kind, and external ID. Provider IDs are opaque, not globally unique. Identical IDs from different connections or kinds must not share a managed group.

Schema-2 sources additionally qualify destinations by provider, authority, workspace, account profile and entity kind. Their opt-in conversion is disabled and does not automatically migrate schema-1 destinations. Schema-3 Radar sources use the dedicated isolated extension reader. No OAuth or MCP credentials are used. See the dated [extension acquisition evidence](radar-extension-session.md) and current [project catalog acceptance](radar-project-catalog.md).

Existing stored fields such as `epicId`, `trainedRules`, and `smartGroups` remain compatibility fields. The interface calls destinations workspaces. Retaining these keys avoids an unnecessary destructive rewrite of settings and existing backups.

When an old tab context identifies a connection unambiguously, its group record, contexts, and linked saved destinations migrate together while retaining the Chrome group ID. Ambiguous or unproven legacy data is preserved. A source resolution creates a namespaced destination rather than guessing the owner of ambiguous saved rules.

## Safety and lifecycle

Pinned tabs, manual groups, window policies, and focus holds are evaluated before automatic assignment. The user can apply rules in manual mode and undo recorded moves. Tab closure remains a separate confirmed action. Removing a URL prefix leaves the workspace intact; deleting a workspace explicitly releases its ownership records and leaves open tabs in place.

The service worker owns tab and window operations. UI pages communicate through known messages. Synchronous diagnostics do not depend on storage readiness. Request instrumentation records allowlisted metadata without additional transport calls.

Connection caching is bounded to 256 entries, shares pending reads, retains successful results for five minutes, and retains errors for 30 seconds. Editing sources or credentials, or changing Chrome permissions, clears the cache. No polling or heartbeat is added.

Cache keys include the complete source and route definitions. Credentials are compared in memory and are never included in diagnostics or persisted by the cache. Results are discarded if the source or credentials changed while the request was in flight. Generic transport omits browser cookies. Schema-3 Radar bypasses its cache and uses browser-managed same-origin requests in an existing ticket tab, fresh viewer/scope verification, one active read and a 30-second failure cooldown, without polling. Optional response identity expectations run before placement.

The Chrome coordinator checks declared host grants before connection resolution, including cached reads, and again before applying a result. Its transport checks the actual API origin before every request, preventing a multi-step connection from continuing after access is revoked. Missing or failed permission checks deny access. Connections with no declared API origins remain available without a host grant. These checks enforce the product's approval boundary independently of whether a remote API supports ordinary CORS. See [Chrome's API guidance](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/chrome-extensions/references/extensions/api-calling.md).

## Validation

Node's test runner covers pure rules, migration, backups, bounded diagnostics, and the actual worker against controlled Chrome adapters. Release verification also requires an unpacked extension in a disposable Chromium profile and interactive checks that cannot be established by mocks, including real provider permission prompts.

## Radar project resolution

Schema 4 extends the closed Radar transport with a reviewed project-ID/label list and one native UUID route. Each returned ticket resolves only within its verified account/workspace and a reviewed project. Session reads are bounded and serialized with in-flight coalescing. Successful results are not cached across account checks. Schemas 1/2/3 are preserved. The worker shares source placement, move and Undo engines with the explicit synthetic disposable-tab check; the check substitutes an in-memory recorder and suppresses global reordering/catalog writes to preserve real settings and history. See [project grouping evidence](radar-project-grouping.md).
