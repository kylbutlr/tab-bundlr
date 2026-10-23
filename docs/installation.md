# Installation

## Install from GitHub

1. Download `tab-bundlr-1.0.0.zip` and its matching `.sha256` file from [GitHub Releases](https://github.com/kylbutlr/tab-bundlr/releases/tag/v1.0.0). You can also clone the repository and build with `npm run package`.
2. Optionally verify the checksum using the command below, then extract the ZIP into a permanent folder. Chrome loads the extension from this folder, so retain it after installation.
3. Open `chrome://extensions`.
4. Turn on **Developer mode**.
5. Select **Load unpacked**.
6. Choose the directory containing `manifest.json`.
7. Pin Tab Bundlr from Chrome's Extensions menu.
8. Open **Extension options** from the Tab Bundlr details page or popup.
9. Use **Help** in the popup whenever you want to reopen the first-use and privacy guidance.

No account or API credential is required.

For 1.0.0, run this from the folder containing both downloaded files:

```bash
# macOS
shasum -a 256 -c tab-bundlr-1.0.0.sha256
# Linux
sha256sum -c tab-bundlr-1.0.0.sha256
```

On Windows PowerShell, run `Get-FileHash .\tab-bundlr-1.0.0.zip -Algorithm SHA256` and compare the hash with the matching `.sha256` file.

## First workspace

1. Leave **Automatic Tab Bundling** off while learning the workflow.
2. Under **Workspaces**, name a workspace such as `Documentation`.
3. Enter a URL prefix such as `https://docs.example.com/product/`.
4. Select **Create workspace**.
5. Open matching pages and select **Apply rules** in the popup.
6. Review the result, then enable automatic mode only if desired.

## Updates

GitHub downloads do not update an unpacked installation automatically. Export a settings backup before updating, then replace the files in the same permanent extension folder and select **Reload** on `chrome://extensions`. Keep the existing installation instead of removing it. Settings backups exclude credentials, so they are not a full credential recovery mechanism.

Existing pre-v2 settings are migrated locally. Review Settings after the first reload, especially Automatic Tab Bundling, home-base duplicate handling, and migrated Workspace Sources. A settings import disables connections and requires their credentials and permissions to be reviewed again. See [Privacy](privacy.md) and [Troubleshooting](troubleshooting.md).
