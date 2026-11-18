# Public app and Kyle's personal runtime

This is the scope boundary for future development. The same extension name and version can identify different local runtimes. A successful local test, reload or package command does not establish that a public release and Kyle's installation contain the same code.

## Canonical source repositories

- **Shared product code:** [public Tab Bundlr repository](https://github.com/kylbutlr/tab-bundlr). General fixes, public features, branding and releases belong here.
- **Kyle's optional personal source:** [private Tab Bundlr companion](https://github.com/kylbutlr/tab-bundlr-personal). Radar acquisition/grouping, native Project Plannr grouping and personal permissions/helpers belong in its explicit patches/modules. Its public-base lock is authoritative for reconstruction; keep one public app codebase.
- **Installed state:** the existing loaded extension folder, browser settings, real bindings, protections and history. The companion is source recovery material, not a replacement installation or settings backup. Verify the registered source before an approved update and preserve path-derived extension identity.

For a shared bug found in the personal runtime, isolate the provider-neutral fix in public source first. Reconcile the companion's exact pin and patches through a reviewed follow-up with synthetic restoration checks. Do not mix private configuration into public source, silently advance its pin or apply reconstructed output to the installed folder. Source edits do not authorize reloads, imports, permissions or live tab moves.

Private-repository access is not required for public app work. For personal work, report an access gap rather than inventing another origin, duplicating the companion or guessing native mappings. Credentials, real bindings, history and service receipts stay outside Git. The private GitHub source copy does not replace encrypted runtime backup.

## Choose the target before editing

| Target | Intended behavior | Change policy |
| --- | --- | --- |
| Public GitHub distribution | Local tab organization, protections, Shortcut-compatible provider-neutral Workspace Sources, and portable workspace JSON with preview and Undo. The simplified public package excludes the custom Radar session reader, Radar-specific settings and scripting permission. | Default for general repository, PR and release work. Build from the verified integration/release source in a clean public checkout. |
| Kyle's personal extension | The public core plus optional private Radar acquisition/grouping and a native Project Plannr selector bridge. Radar uses the existing signed-in Chrome session and reviewed native project bindings. Its optional scripting declaration and private runtime imports are intentional local differences. | Explicitly personal work. Preserve the overlay, bindings, source data, existing extension identity, settings, protections and Shortcut rules. Do not make these requirements public defaults. |
| Shared core correction | A provider-independent bug fix, such as workspace-file routing or window-selection isolation. | Review and isolate the actual shared change against public source. Preserve compatibility with the personal overlay. Do not copy the entire mixed personal worker into a public branch. |

An issue reported from Kyle's installed app must be classified against the actual variant. A problem in his Radar setup is not automatically a public-app defect. A public-core update is not approval to overwrite his custom installation. Ask for scope only if source inspection and the task leave it unresolved.

## Inspect source rather than guessing from a branch or version

Before changes, verify the remote, integration base, branch, linked worktrees, dirty files, manifest permissions and worker import graph. Preserve occupied checkouts and unrelated edits. Use a nontracking feature branch from the verified integration base when branching is needed. Never silently switch the personal checkout to public source.

The personal overlay currently has worker imports under `dist/personal-radar-automatic/`, a private native project-to-local-workspace binding file, and optional `scripting`. The public package lacks these runtime imports and permission declaration. An opaque workspace ID or an empty URL list alone does not indicate which variant is running.

On Kyle's workstation, ignored `dist/` paths can contain **active private modules, authoritative bindings, metadata, exact runtime backups and recovery evidence**. They are not disposable build output. Do not clean, delete, replace, package or commit them as an incidental task. Preserve and verify the private overlay before any update of the extension folder. Read the ignored current-state note when present at `dist/personal-radar-automatic/CURRENT-STATE.md`; absence of that local file in another clone does not authorize reconstructing private data.

## Keep provider acquisition separate from portable JSON

Workspace JSON contains local destinations and reviewed URL prefixes. Zero prefixes are valid. The public app cannot discover an arbitrary new Radar ticket's project from that JSON alone. Automatic Radar project grouping requires the personal live adapter and a supported independently app-owned browser read. Do not infer relationships from display labels, equal ticket numbers, URL path fragments or guessed aliases.

Preserve provider, native account/workspace, native ticket/project and local workspace identities separately. Preserve proven Shortcut history and rules. No automatic two-way synchronization. Use synthetic fixtures, never real account/project/ticket data or credentials in tracked docs/tests, logs, screenshots or public artifacts. Do not replace the personal browser-session acquisition path with Radar MCP, Codex credentials, OAuth, copied cookies or a token.

## Public changes and packaging

Default unspecified repository work to the public app. Keep personal runtime modules, private metadata/bindings and Radar-only permission/UI changes outside public runtime and package allowlists. Do not resolve a missing private-module package error by adding private files to the public ZIP or deleting Kyle's overlay.

Use a clean checkout of the verified public source for release preparation. Inspect the final import closure, manifest and archive contents, not just the version string or Git status. The personal checkout's historical README, package scripts and older Radar receipts may describe earlier runtime variants; they are not the current public distribution contract. Retain historical evidence and annotate later findings rather than rewriting it as current acceptance.

A general fix discovered during personal testing may be prepared for public review, but it must be isolated with synthetic tests and explicit scope. Do not bulk-copy mixed local changes or publish a private build as the public update. Packaging alone is local; pushes, PRs, merges, deployment and publication retain their existing authorization gates.

## Personal updates and acceptance

Preserve the current settings, manual groups, pinned tabs, pause/focus holds, automatic-mode choice, Shortcut rules, history and Undo. Private code/config preparation does not authorize installation, reload, permission changes, real settings import or a full-tab reorganization. Kyle currently reloads manually; browser automation is stopped until he explicitly changes that boundary. Do not contact other agents/chats for browser access unless authorized.

An app-owned metadata export, a synthetic adapter test, a user-reported manual reload, an actual authenticated ticket read, installed automatic grouping/Undo and closed-Codex operation are separate evidence states. Report each accurately. Do not turn an imported project catalog or a vague approval into a passing live-grouping acceptance claim. Keep any acceptance check bounded to disposable tabs/windows, avoiding working-window replays or global Apply rules.

## Durable boundary and future improvements

The public-versus-personal policy belongs in tracked agent guidance and this guide, even though private bindings and workstation state remain ignored. Carry these docs into public branches through ordinary review so future clones inherit the boundary. Local-only guidance has not reached GitHub until it is separately committed and pushed.

The [private Tab Bundlr companion](https://github.com/kylbutlr/tab-bundlr-personal) now supplies the explicit overlay/build boundary. Read its agent instructions, public-base lock, restore guide and backup exclusions before personal source work. Existing loaded source and ignored private artifacts remain in place; companion availability does not authorize moving data or replacing the extension.
