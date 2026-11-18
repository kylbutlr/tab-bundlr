# Radar grouping PR review, November 12, 2026

Reviewed [Tab Bundlr PR #3](https://github.com/kylbutlr/tab-bundlr/pull/3) from base `0bb0877` through `52fd475`. The specification was Kyle's extension-session and local-first assignment plus the PR's stated behavior. Standards sources were [AGENTS.md](../AGENTS.md), [CONTRIBUTING.md](../CONTRIBUTING.md), and the documented source/protection boundaries. Review was performed in this chat, with no other agent contact or local browser automation.

## Standards

No outstanding hard violation of the documented local-first, credential, permission or branding boundaries was found. The fixes remain inside the existing source, Settings and worker boundaries and use synthetic fixtures. No new dependency, host permission, authentication endpoint, polling, provider alias or general-purpose scripting path was added. Pure code-smell heuristics did not justify unrelated restructuring.

## Spec

Four confirmed findings were fixed:

1. **P1, preferences changed during a read:** an automatic source request could finish grouping after automatic bundling or its destination category was disabled. The worker now reads those current preferences with its final source check before placement. Tests assert zero groups/moves in both cases and preserve explicit manual Apply rules with automation off.
2. **P2, selected-ticket project preview reset source metadata:** adding a project to an existing source reset its custom name and precedence to defaults. Preview now keeps the existing source metadata while remaining disabled and updating only the reviewed project binding/route. The regression uses a custom name and before-rules precedence.
3. **P2, catalog Undo ignored the selected connection:** a persisted rollback for connection A remained available after selecting B, and could change A. Both the availability predicate and the mutation now require the selected source ID and unchanged applied source. Settings prevents overlapping operations and rejects a preview if selection changes during acquisition. Tests verify that a different source selection causes no write and that ordinary rollback retains other source edits.
4. **P2, stale snapshots during the metadata-only hold:** storage changes were discarded without invalidating cached preferences, so finishing the hold could continue using old settings. Held storage events now clear snapshots and source results while still blocking organization. The worker regression changes preferences during the hold and verifies fresh behavior after Finish without replaying startup actions or querying tabs.

## Validation and remaining acceptance

All four findings were reproduced before production changes. Five assertions failed in the initial regression pass; the focused fixes passed afterward. The exact staged runtime was exported and validated serially with Node 22.23.1: **190 tests passed**, including App Stylr and JavaScript syntax checks. Packaging, credential-pattern/allowlist checks, ZIP integrity, and whitespace checks passed. This suite excludes the unrelated retired OAuth/hosting files still present in the working checkout.

The original [GitHub Actions run](https://github.com/kylbutlr/tab-bundlr/actions/runs/43271883805) passed every step, including its isolated cloud browser smoke and packaging. Follow-up CI for the fix commit is tracked on the PR. No local browser, preview, service read, permission grant, extension reload, installed-client QA or closed-Codex test was performed in this review. Previous dated installed-read, disposable-grouping and project-catalog receipts remain separate evidence and were not rewritten.

## Exact fix scope

- [background.js](../background.js)
- [radar-session.js](../radar-session.js)
- [radar-catalog.js](../radar-catalog.js)
- [radar-catalog-options.js](../radar-catalog-options.js)
- [source-access.test.js](../tests/source-access.test.js)
- [radar-projects.test.js](../tests/radar-projects.test.js)
- [radar-catalog.test.js](../tests/radar-catalog.test.js)
- [reload-safety.test.js](../tests/reload-safety.test.js)
- This review record.

Unrelated dirty/untracked work is preserved. App Launchr and its metadata PR were not accessed or changed. No merge, deployment, publication, installation or app restart occurred. The temporary validation export and test logs were cleaned up after verification.

## Recommended Next Steps

Review the updated PR after follow-up CI. Installed acceptance for the follow-up fixes requires a separately approved extension reload; local browser automation remains stopped.
