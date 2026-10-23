# GitHub releases

Tab Bundlr is distributed as MIT-licensed source and a versioned extension ZIP through [GitHub Releases](https://github.com/kylbutlr/tab-bundlr/releases). Users install the extracted ZIP using Chrome's **Load unpacked** control and update it manually. Chrome Web Store registration, submission, screenshots, and dashboard disclosures are outside this release's scope.

## Release assets

For version 1.0.0:

- `tab-bundlr-1.0.0.zip`: extension runtime, bundled font licenses, and MIT license.
- `tab-bundlr-1.0.0.sha256`: checksum for the exact published ZIP.

The repository also provides the [installation guide](installation.md), [privacy policy](privacy.md), [support guide](support.md), and [MIT License](../LICENSE). Do not include settings exports, browser profiles, private screenshots, or credentials in release assets.

## Maintainer sequence

1. Complete the applicable [release verification](verification.md) checks and document any unresolved limitations.
2. Finalize the release contents on the default branch through the reviewed pull request. Match the manifest, package, and changelog versions.
3. If consolidating history, complete the separate recoverable backup and repository-state inventory first. Prepare and validate the parentless candidate against the final default-branch tree. Obtain explicit authorization before destructive repository operations.
4. Verify the restored repository, then make it public only with explicit authorization. Check that the source, license, privacy policy, issue tracker, and installation guide are publicly accessible.
5. From a clean checkout of the exact release commit, run `npm ci`, `npm test`, `npm run test:browser`, and `npm run package` using Node.js 22 or newer and the pinned Playwright Chromium installation. Run resource-intensive checks serially and clean up the disposable browser.
6. Verify the ZIP and checksum, including the MIT license and every imported runtime module. Publish these exact two assets with tag `v1.0.0` targeting the verified release commit. Repository source archives are also available separately through GitHub.
7. Download the published assets, verify their checksum again, inspect the tag's target, and confirm anonymous access to the release and documentation. Record publication success only after these checks pass.

Creating a package does not publish a release. Tags, repository visibility changes, and publication are separate authorized actions. An unpacked installation does not receive automatic updates from GitHub.

## 1.0.0 release notes

Tab Bundlr organizes browser tabs into user-defined workspaces with transparent URL rules. It works locally without an account, password, token, or external service. Optional Workspace Sources provide user-approved, read-only connections.

This release brings a unified workspace editor, searchable popup, complete group tab lists, deterministic rule matching, safer connection identities, bounded request caching, and workspace rule recovery. Automatic bundling starts off; users can apply rules manually and undo recorded moves.

Download the ZIP and matching checksum, then follow [Installation](installation.md). Updates are manual. See the [changelog](../CHANGELOG.md), [privacy policy](privacy.md), and [issue tracker](https://github.com/kylbutlr/tab-bundlr/issues).

Native stable-Chrome optional permission-dialog interaction and a screen-reader walkthrough of populated review controls were not completed for 1.0.0. The maintainer accepted those verification limits for this release. Automated permission checks, disposable Chromium browser checks, native popup review, and an offline browser-restart check passed. See [Release verification](verification.md) for the scope of each check.
