# Workspace Source Format

Workspace Sources are optional declarative JSON profiles. They convert a provider page URL and bounded read-only API responses into a proposed Tab Bundlr workspace.

## Security boundaries

- Schema version 1 only
- HTTPS page and request URLs only
- `GET` requests only
- No request bodies or arbitrary headers containing embedded values
- Credentials referenced by ID and stored separately
- Request origin must match `permissionOrigins`
- Redirects rejected
- Dotted response property paths only
- Imported profiles disabled
- Pinned, manual-group, pause, and focus protections always take precedence

## Shape

```json
{
  "schemaVersion": 1,
  "id": "tracker",
  "name": "Project Tracker",
  "enabled": false,
  "precedence": "after-rules",
  "permissionOrigins": ["https://api.tracker.example/*"],
  "credentials": [
    {
      "id": "token",
      "label": "Access token",
      "type": "header",
      "headerName": "Tracker-Token"
    }
  ],
  "routes": []
}
```

`precedence` is either `after-rules`, the default, or `before-rules`. Safety protections are not affected.

Each route contains a `pagePattern`, optional `steps`, and `placement`. Named placeholders such as `{itemId}` are captured from the page URL and may be used by later request URLs.

Each request step contains a request URL, optional `when` fields, and an `extract` map. An extract value is a dotted property path or an ordered array of fallback paths.

Placement requires `workspaceId` and `workspaceName`. Its optional `workspaceType` is `workspace` or `collection`.

See [example-tracker.json](../examples/workspace-sources/example-tracker.json).

## Optional Shortcut profile

[shortcut.json](../examples/workspace-sources/shortcut.json) uses the same public schema as every other source. Before saving it:

1. Replace `your-workspace` in each `pagePattern` with the workspace segment from your Shortcut URLs.
2. Save the JSON profile in Tab Bundlr settings.
3. Enter the API token in the separate credential field.
4. Select **Enable** and approve access to the declared Shortcut API origin.

Existing pre-v2 installations are migrated to this visible profile. The previous token is moved to local source credentials and excluded from backups. Because the provider host changes from a required permission to optional access in v0.8.0, Chrome may show **Grant access** once after the upgrade.
