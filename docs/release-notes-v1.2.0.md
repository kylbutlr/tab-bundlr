# Tab Bundlr 1.2.0 release candidate

Prepared November 12, 2026. **Local and unpublished.** No Git tag, GitHub release, deployment, installation or remote branch change is created by preparation.

## Changes

- Optional Radar project grouping through Tab Bundlr's Chrome extension and the existing signed-in Radar session. Native account, workspace, ticket UUID/number and project identities remain distinct.
- Explicit project/catalog review, enablement and selected-connection rollback. Existing bindings, labels, connection names and precedence are retained. Unknown projects remain unassigned until reviewed.
- Home-base redirect-loop protection prevents an automatically restored sign-in redirect from generating an unbounded replacement chain.
- In-flight source reads recheck automatic-bundling/category preferences. Metadata-only holds keep preference snapshots fresh without replaying startup organization.

Core local organization works without Radar, Shortcut, an account or Codex. Shortcut rules, manual groups, pinned tabs, pause/focus holds, automatic-bundling defaults, backups, import compatibility and tab Undo remain independent. The App Stylr v1.4.1 pin and branding are unchanged.

## Permissions and migration

Radar uses optional scripting and the exact Radar host permission. No cookie, webRequest, identity, Google credential or broader host grant is added. Its fixed readers discard unneeded descriptions/events and export only grouping metadata. No OAuth hosting document, API token, new consent, polling, write request or two-way synchronization is required.

Existing sources are not automatically broadened or aliased. Versioned imports disable connected sources and omit credentials. Source expansion has a guarded local Undo. Keep a settings backup and disable schema-3/4 Radar sources before reverting to an older build; no real settings import or replacement is performed for acceptance.

## Acceptance status

The merged source is `06679a7936a1011b8ae7a5f9fd3bd9033d9a08ce` from [PR #3](https://github.com/kylbutlr/tab-bundlr/pull/3). Its [review follow-up CI](https://github.com/kylbutlr/tab-bundlr/actions/runs/43283506507) passed 190 Node tests, cloud browser smoke, and packaging. Those results precede this version-only/documentation release preparation. Current candidate results are recorded in [the local release receipt](release-v1.2.0-receipt.json).

The isolated v1.2.0 candidate passed **190 Node tests**, App Stylr verification, JavaScript syntax and package/privacy/integrity checks on Node 22.23.1. No local server or additional headless browser process was started. Earlier cloud CI remains evidence for the unchanged merged functional runtime, not CI for a new release commit.

The bounded installed functional check passed in Chrome after the user-approved protected reload. Chrome's extension card displayed **1.2.0**; Settings confirmed the metadata-only hold before the controller ran. **Two disposable tabs grouped, two were restored through Undo, zero test tabs remained, and the controller made zero Radar requests.** Its working-tab comparison passed. The original selected tab was restored, the existing Settings control was retained through a replacement after reload, and the window contained 21 tabs before and after. The hold was released explicitly without replaying startup moves. Browser automation stopped.

The initial Settings view showed rule-count labels 13/11 while a later view showed 13/12/3. Kyle confirmed those edits were his. The check resumed against that current configuration, with counts 13/12/3, five visible preference controls, visible working group summaries and the enabled 34-project source preserved. No real source/rule import, replacement, edit or rollback was performed. The first reload attempt did not establish a hold, so no disposable test was started until a fresh protected reload visibly established it.

Prior dated service-read receipts remain separate evidence. No new sign-in, consent or live service test was deliberately requested. The four PR review guard cases are covered by synthetic Node regressions; the installed pass verifies loaded version, protections and shared grouping/Undo, without changing real preferences to recreate those races.

The clean packaged candidate excludes the preserved unrelated dirty work. The installed checkout retained one historical source-comment difference and one unused legacy CSS rule; the executable behavior of the functional runtime is unchanged. Exact installation of the packaged ZIP into a disposable profile was not repeated. This qualification is retained in the release receipt rather than treating the loaded checkout as byte-identical to the ZIP.

Automatic ticket reads still stop on expired sessions. The explicit catalog action has verified native renewal, but unattended renewal and closed-Codex installed acceptance remain unverified. No activity provenance, labor, daily coverage or deleted-descendant claim is made.

## Publication

The candidate may be reviewed locally. Do not publish or tag it until the isolated release change is committed/reviewed, the applicable release CI passes, and Kyle explicitly approves publication. No browser preview or server is left running for release review.

## Recommended Next Steps

Review the local ZIP/checksum and isolated release patch. Commit/review that release change before publication; publication requires separate explicit approval.
