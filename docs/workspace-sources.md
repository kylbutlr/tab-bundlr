# Workspace Source Format

Workspace Sources are optional declarative JSON profiles. They convert a provider page URL and bounded read-only API responses into a proposed Tab Bundlr workspace.

## Security boundaries

- Schema versions 1 and 2 remain valid; versions 3 and 4 are restricted to the fixed Radar tab-session transport
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

## Version 2 identity and authentication

Version 2 requires an `identity` object containing `provider`, `authority` (an exact HTTPS origin), `workspaceId`, `accountId` and `entityKind`. These values must come from verified connection context, not page titles. Destinations and caches are isolated by that context. `authentication` is `{ "type": "header" }` with separate credential declarations, or `{ "type": "none" }` without credentials. OAuth, session and unavailable authentication are rejected rather than silently interpreted as unauthenticated access. Credential values and browser session headers cannot be declared in the profile. All requests omit browser cookies.

Version-2 steps may include `expect`, a map of dotted response paths to literal string, number or boolean values. Every expectation must match before extraction and placement. Use this to require the expected native object and workspace/project identities. A mismatch fails the source; it does not produce an empty workspace. Version-2 routes may use `exact: true` to allow only the declared path (plus a trailing slash, query or fragment), instead of also matching deeper paths.

`upgradeWorkspaceSource(source, identity)` prepares a disabled version-2 copy without changing storage or existing groups. Review a new connection ID before saving it. Saving a source clears its previous credentials to prevent rebinding an old account's secret to an edited definition. No automatic conversion is performed. Version-2 sources do not adopt legacy group ownership without explicit evidence. Backups retain both schemas; imports remain disabled and credential-free. Older builds cannot restore version-2 sources, so preserve an original backup before converting.

## Version 3 Radar tab session

Version 3 narrowly extends the authentication boundary, retaining version-2 identity and expectations but requiring `authentication: { "type": "radar-tab-session" }`, no credentials, only `https://radar.sdg.la/*`, explicit UUID/number pairs and project IDs, exact ticket routes and one fixed ticket-get step. The generic request engine rejects it; only the app-owned isolated extension reader executes it.

Settings previews one selected native ticket and its authenticated viewer context. It proposes exact native/short routes for that observed UUID/number pair, with a user-reviewed label for the project ID. It enumerates no other tickets. Saving keeps it disabled; enablement is separate. Account/workspace/project changes, authentication errors and deleted records fail closed. Each resolution verifies context afresh; Radar successes do not enter the five-minute generic cache.

No source upgrades automatically. Backups retain version 3 without credentials; imports disable it. Versions 1/2, Shortcut conversion, stored rules and ownership remain intact. Older builds reject version 3; retain a pre-change backup and disable or remove this source before rollback. Development has not modified real settings. See [implementation and acceptance limits](radar-extension-session.md).

## Version 4 Radar project bindings

Version 4 retains the closed `radar-tab-session` transport, exact Radar origin and provider/account/workspace identity. It uses one fixed native-ticket route with a captured UUID, plus a nonempty `projects` list of reviewed `{ id, name }` bindings. UUIDs and labels are validated, duplicate project IDs are rejected and arbitrary session request routes are prohibited. Only tickets whose returned project ID appears in that list resolve. The generic fetch engine still cannot execute these profiles.

A schema-4 preview can explicitly add or rename a project in the same scoped connection. Version-3 sources are not automatically converted or broadened. Backups preserve the new source; imports disable it and carry no credentials. Short numbers are not resolved through an invented endpoint; the native ticket route is required. See [project grouping and acceptance](radar-project-grouping.md).

## Optional Shortcut profile

[shortcut.json](../examples/workspace-sources/shortcut.json) uses the same public schema as every other source. Before saving it:

1. Replace `your-workspace` in each `pagePattern` with the workspace segment from your Shortcut URLs.
2. Save the JSON profile in Tab Bundlr settings.
3. Enter the API token in the separate credential field.
4. Select **Enable** and approve access to the declared Shortcut API origin.

Existing pre-v2 installations are migrated to this visible profile. The previous token is moved to local source credentials and excluded from backups. Because the provider host changes from a required permission to optional access in v0.8.0, Chrome may show **Grant access** once after the upgrade.
