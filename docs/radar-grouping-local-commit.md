# Isolated Radar grouping commit, November 12, 2026

This local commit contains the optional Chrome-session Radar source and project catalog workflow, provider/account/workspace-qualified grouping, explicit review/enable and source-expansion rollback, protected grouping/Undo, and bounded extension acceptance tools. It follows the separately committed home-base loop fix (`e76d6f2`). The existing nontracking `kylebutler/radar-workspace-source` branch and fetched `origin/main` (`0bb0877`) were preserved. No checkout was switched or history rewritten.

## Validation of the exact staged runtime

An export of the Git index was validated independently of unstaged/untracked work. Node 22.23.1 ran `npm test -- --test-concurrency=1`: **186 passed, zero failed**, including App Stylr and JavaScript syntax checks. The isolated suite excludes 24 tests for the retired OAuth/hosting work; the earlier full-worktree 210-test receipt remains historical evidence, not the isolated commit result.

Packaging passed the allowlist, credential-pattern and ZIP integrity checks. The validation-only ZIP SHA-256 was `05c55e8e3f8d6be3f02c2cc852ff2ee989e39f6ce083d4e372c60beccfe53478`. It was generated in the temporary export, without replacing the loaded build or the checkout's existing artifact. Staged whitespace, exact file selection, synthetic-only UUIDs in runtime/tests/JSON, and byte-for-byte preservation of all original dirty/untracked files were checked. No package installation or browser process was started. The temporary export and validation logs were removed after verification.

## Installed evidence remains separate

This commit operation performed no service read or browser automation. The prior [extension read](radar-extension-read-receipt.json), [disposable grouping/Undo](radar-project-grouping-receipt.json), and [34-project catalog configuration](radar-project-catalog-receipt.json) receipts are preserved. Their dated acceptance limits still apply. In particular, the catalog's native renewal preflight does not establish unattended renewal for automatic ticket matching, historical completeness, or closed-Codex installed acceptance.

## Preserved work and rollback

Retired OAuth implementation/tests, metadata publication drafts, hosting patch, discovery/audit documents, and the obsolete browser-source smoke script remain outside this commit and unmodified. A legacy unused CSS rule and historical documentation/comment variants remain unstaged through index-only selection. The current working-tree file bytes, including the loaded extension source, were preserved. Compatibility-only cleanup of old OAuth storage keys stays in the grouping import boundary; no OAuth runtime is packaged.

No push, PR modification, merge, deployment, consent, permission grant, extension reload, installation, or app restart occurred. App Launchr PR #2 was not touched. Browser automation remains stopped. Git author and committer are verified as Kyle Butler <kylbutlr@gmail.com> immediately before committing.

The existing source-expansion Undo restores only the same unchanged source and preserves other source edits. For a code rollback to a build without schemas 3/4, disable the Radar source first and retain a settings backup. Core local organization, Shortcut rules, protections, and the prior loop fix remain independent.

## Exact commit scope

- [README.md](../README.md)
- [background.js](../background.js)
- [docs/architecture.md](../docs/architecture.md)
- [docs/privacy.md](../docs/privacy.md)
- [docs/workspace-sources.md](../docs/workspace-sources.md)
- [help.html](../help.html)
- [manifest.json](../manifest.json)
- [options.css](../options.css)
- [options.html](../options.html)
- [options.js](../options.js)
- [scripts/package-extension.mjs](../scripts/package-extension.mjs)
- [source-resolver.js](../source-resolver.js)
- [sources.js](../sources.js)
- [tests/extension.test.js](../tests/extension.test.js)
- [tests/source-access.test.js](../tests/source-access.test.js)
- [tests/source-resolver.test.js](../tests/source-resolver.test.js)
- [tests/sources.test.js](../tests/sources.test.js)
- [tests/workspace-worker.test.js](../tests/workspace-worker.test.js)
- [workspace-identity.js](../workspace-identity.js)
- [radar-source.js](../radar-source.js)
- [radar-session.js](../radar-session.js)
- [radar-native-session.js](../radar-native-session.js)
- [radar-catalog.js](../radar-catalog.js)
- [radar-catalog-options.js](../radar-catalog-options.js)
- [radar-disposable.js](../radar-disposable.js)
- [radar-disposable.html](../radar-disposable.html)
- [radar-options.js](../radar-options.js)
- [reload-safety.js](../reload-safety.js)
- [tests/radar-source.test.js](../tests/radar-source.test.js)
- [tests/radar-session.test.js](../tests/radar-session.test.js)
- [tests/radar-projects.test.js](../tests/radar-projects.test.js)
- [tests/radar-catalog.test.js](../tests/radar-catalog.test.js)
- [tests/radar-native-session.test.js](../tests/radar-native-session.test.js)
- [tests/radar-disposable.test.js](../tests/radar-disposable.test.js)
- [tests/reload-safety.test.js](../tests/reload-safety.test.js)
- [tests/fixtures/radar-source.json](../tests/fixtures/radar-source.json)
- [docs/radar-extension-session.md](../docs/radar-extension-session.md)
- [docs/radar-extension-read-receipt.json](../docs/radar-extension-read-receipt.json)
- [docs/radar-project-grouping.md](../docs/radar-project-grouping.md)
- [docs/radar-project-grouping-receipt.json](../docs/radar-project-grouping-receipt.json)
- [docs/radar-project-catalog.md](../docs/radar-project-catalog.md)
- [docs/radar-project-catalog-receipt.json](../docs/radar-project-catalog-receipt.json)
- This local commit handoff.

## Recommended Next Steps

No action is required for this local commit. Remote publication remains separately approval-gated.
