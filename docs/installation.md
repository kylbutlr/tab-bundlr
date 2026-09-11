# Installation

## Load the public beta locally

1. Download or build the Tab Bundlr extension directory.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Select **Load unpacked**.
5. Choose the directory containing `manifest.json`.
6. Pin Tab Bundlr from Chrome's Extensions menu.
7. Open **Extension options** from the Tab Bundlr details page or popup.

No account or API credential is required.

## First workspace

1. Leave **Automatic Tab Bundling** off while learning the workflow.
2. Under **Personal tab rules**, name a Smart Group such as `Documentation`.
3. Enter a URL prefix such as `https://docs.example.com/product/`.
4. Select **Save Smart Group**.
5. Open matching pages and select **Fix** in the popup.
6. Review the result, then enable automatic mode only if desired.

## Updates

For an unpacked installation, replace the extension files and select **Reload** on `chrome://extensions`. Existing pre-v2 settings are migrated locally. Review Settings after the first reload, especially Automatic Tab Bundling, home-base duplicate handling, and migrated Workspace Sources.
