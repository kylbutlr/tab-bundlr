# Workspace JSON import

Use **Settings → Workspaces → Import or export workspaces**. Choose a JSON file or paste one, select **Preview workspaces**, review each selected row, then choose **Import selected workspaces**. A full settings backup belongs in the separate **Backup and restore** section.

```json
{
  "format": "tab-bundlr-workspaces",
  "version": 1,
  "workspaces": [
    {
      "id": "documentation",
      "name": "Documentation",
      "urls": ["https://docs.example.com/product"]
    }
  ]
}
```

The [example file](../examples/workspaces.json) contains fictional data. Share workspace exports carefully: project labels and private URL prefixes can be sensitive.

## What changes

- Each ID identifies a **local** workspace. Use **Export workspaces** to obtain existing IDs. Matching names or provider ticket numbers never establish identity.
- A new ID adds a standard workspace with Focus mode off. An existing ID can rename the workspace and add prefixes. Existing prefixes, Focus designation, custom fields and relative order are retained.
- Select only the rows you want. Duplicate IDs, unsupported fields, ambiguous names and exact-prefix ownership conflicts are blocked. Broader or narrower overlaps are shown before approval. No existing rule is silently reassigned.
- An unchanged row does nothing. Repeating the same import does not duplicate workspaces.
- Only local workspaces, their order and the import-Undo receipt are written. Preferences, Shortcut rules and credentials, other source definitions, home bases, session protections and tab-move history are untouched.

Saving an import or its Undo does not move, close, open, recolor or reorder existing tabs/groups. Use **Apply rules** in the popup when ready. If automatic bundling is already on, later normal tab creation/navigation uses the new rules with the existing protections.

## Undo and concurrent edits

**Undo last workspace import** restores the preceding workspace configuration while those workspaces and their order remain unchanged. It refuses to overwrite a later workspace edit. Unrelated preference or connected-rule edits remain intact. Only the latest import has this settings Undo. Tab moves have their own separate popup Undo.

The worker serializes imports and import Undo. It rechecks workspace/order/saved-rule state before applying the preview; a stale preview must be reviewed again. Chrome storage does not offer a cross-context transaction with every existing editor, so avoid editing workspace rules in another Settings window while applying an import.

## Validation

Files use format `tab-bundlr-workspaces`, numeric version `1`, at most 200 workspaces and 256 KiB. Names contain 1–80 printable characters. IDs contain letters, numbers, dots, underscores or hyphens and are at most 128 characters. Each workspace has up to 100 URL prefixes, with up to 1,000 per file. Empty URL lists preserve saved destinations.

Only literal HTTP/HTTPS prefixes are accepted. Credentials, queries, fragments, whitespace, placeholders and wildcards are rejected instead of being silently stripped into a broader matching rule. Unknown fields and full settings/source payloads are rejected. Nothing executes or requests network/browser permissions during import.

## Local review state

The simplified runtime was activated locally through the approved November 13 reload, retaining the existing extension identity and settings. Native preview, a synthetic workspace import and import Undo succeeded. The implementation is not published. See [the exact bounded acceptance and remaining limits](public-acceptance-check.json). Browser automation remains stopped; this workflow performs no live provider acquisition.
