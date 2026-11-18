# Contributing

Tab Bundlr is a local-first Chrome extension. Changes should keep URL-rule organization useful without an account, API credential, or external service.

## Development

Use Node.js 22 or newer. The extension has no runtime dependencies. Development uses Playwright for the isolated browser smoke test.

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
npm run package
```

Load the repository directory as an unpacked extension in a disposable Chrome profile. Keep personal browser data out of fixtures, screenshots, and bug reports. Never reload or replace someone else's installed extension during testing.

## Changes

Keep changes focused and explain the user-visible behavior and validation in the pull request. Preserve pinned tabs, manual Chrome groups, paused windows, focus holds, settings backups, and undo. Add behavior tests for assignment or migration changes. Test the actual extension when changing Chrome interactions; a mocked API test alone cannot establish browser acceptance.

Connections use the public declarative schema. Provider-specific behavior belongs in a profile or compatibility migration, rather than a private branch of the grouping engine. Keep credentials outside profiles and backups.

See [Architecture](docs/architecture.md), [Workspace Sources](docs/workspace-sources.md), and the [release checklist](docs/verification.md).
