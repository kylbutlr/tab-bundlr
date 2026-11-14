# Tab Bundlr v1.3.0 release candidate

Prepared November 13, 2026. **Unpublished.** This preparation does not merge a PR, tag a release, publish assets, reload the installed extension or change real settings.

## A simpler public app

- Import ordinary workspace JSON by file or paste. Preview additions and updates, select workspaces and review conflicting URL rules before saving.
- Update workspaces by stable local ID while retaining existing URL prefixes and focus settings. Guarded import Undo refuses to overwrite later workspace edits.
- Keep existing tabs in place when saving or undoing an import. Apply rules when ready; existing automatic behavior remains your choice.
- Keep Radar acquisition and its setup/test controls outside the public extension. Personal custom tooling can prepare the same portable workspace file from verified metadata.

Tab Bundlr remains local-first and account-free. Shortcut compatibility, pinned tabs, manual groups, pause/focus/window protections, home bases, move history and tab Undo remain. The home-base redirect-loop fix and App Stylr v1.4.1 appearance are retained. An explicit short-lived update handoff preserves session protections without startup regrouping.

## Data, permissions and updates

The public package requests only storage, tabs and tabGroups, with optional exact-origin host grants for generic connections. It has no scripting permission, Radar reader, OAuth setup or new account requirement. JSON workspace import makes no network request and imports no credentials, preferences or connected-workspace rules.

Workspace-only import is distinct from full settings restore. Full restore retains its existing credential-clearing behavior. Unsupported custom source definitions remain stored but cannot execute in the public build; keep a separate custom backup, since public full-settings exports omit unsupported sources. Static custom files cover known canonical ticket URLs and do not discover future tickets or infer new provider relationships.

Keep the existing extension installation to retain local storage. No real settings import or replacement is part of release preparation. Return to a custom reader only through an approved runtime restore and guarded reload; removing the extension would remove its local storage.

## Validation and limits

The functional source merged as `ef79e2ab96636514cd2bbe5e607af4a769a7bcfb` in [PR #5](https://github.com/kylbutlr/tab-bundlr/pull/5). Its [post-merge CI](https://github.com/kylbutlr/tab-bundlr/actions/runs/43547078100) passed, including cloud browser smoke and packaging. See [the exact candidate receipt](release-v1.3.0-receipt.json) for fresh local unit/style/syntax/package checks and the candidate checksum. Runtime file bytes other than manifest version are unchanged from that merged source.

The [earlier bounded native check](public-acceptance-check.json) verified settings/credential, protection, working-tab and group preservation across the approved reload, then native JSON preview, synthetic import and Undo. Its final post-Undo aggregate check and cleanup were blocked by browser protocol policy; an inactive verification record remains. No new browser automation, native grouping, v1.3.0 installation, provider authentication/read, session-renewal or closed-Codex acceptance was performed in release preparation. These limits remain open.

## Local candidate artifacts

- `tab-bundlr-1.3.0.zip` and `tab-bundlr-1.3.0.sha256`, prepared on Node.js 22.23.1.
- SHA-256: `c6bfe9866dcf94d1f172a2bfbbb8a7f5ffdfaf74ac78a0cd964a9206c3fb0de2`.
- 187 offline tests passed, including pinned-style and syntax checks. ZIP integrity/private-fixture checks passed; all 46 payloads match source. Only the manifest version differs from the merged functional runtime.

The original local ZIP is retained as the candidate. ZIP timestamps can change a rebuilt archive's hash even when all file payloads match; preserve this candidate/checksum together for any later authorized publication.

## Release steps

Review and merge the separate release PR, then verify the merged commit and its CI. Publishing the verified v1.3.0 ZIP/checksum and tag requires Kyle's separate approval. Existing published v1.2.0 artifacts remain unchanged.
