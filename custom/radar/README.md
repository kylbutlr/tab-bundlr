# Personal Radar customization

Update, November 13: the simplified runtime was subsequently activated in the existing extension folder and identity. The exact preceding custom runtime and dirty source diff are preserved in ignored rollback artifacts. The custom converter and historical evidence below remain separate from the public package. See [the local activation receipt](../../docs/public-acceptance-check.json).

The public Tab Bundlr runtime does not contain a Radar reader, Radar settings or scripting permission. Its portable workspace JSON format can be populated manually or by a separate custom tool. No custom tool is imported by the extension or included in its ZIP.

## Existing custom build

The preceding Radar runtime and dirty working diff were backed up exactly before the approved in-place update. The loaded folder now runs the simplified public runtime, retaining the existing extension identity and storage. Its Git HEAD and index were not changed. The previously published `v1.2.0` tag also retains the committed reader implementation. Do not install a second extension to inspect the customization.

Files under [evidence](evidence/) preserve the original Radar investigation, mappings, receipts and acceptance limits. They are historical evidence, not acceptance of the public cleanup. Some historical relative links describe the previous source layout. No API, session, provenance, history or background-availability claim is expanded here.

## Recommended file workflow

1. Gather only reviewed project labels and native ticket metadata through an approved extension-owned read, or use an existing verified metadata handoff. This command performs no acquisition. Never use titles, adjacent ticket numbers or guessed aliases as relationship evidence.
2. Supply the converter with the explicit authenticated account/workspace scope, native projects and verified UUID/number/project relationships.
3. Run the converter locally, then preview the resulting ordinary workspace JSON in Tab Bundlr. No source, permission or credential setup is required by the public app.
4. Add newly verified tickets to a later file and repeat the preview. Stable scoped project IDs update the same local workspace and retain previous prefixes.

From this checkout, using Node.js 22 or newer:

```sh
node custom/radar/prepare-workspaces.mjs /absolute/private/metadata.json /absolute/private/workspaces.json
```

The output must not already exist and is created with mode `0600`. Keep real input/output in ignored or external private storage, not in fixtures or Git. The tool prints a count, not project labels, URLs, credentials or bodies.

The input has this shape, using synthetic IDs only:

```json
{
  "format": "tab-bundlr-radar-metadata",
  "version": 1,
  "accountId": "44444444-4444-4444-8444-444444444444",
  "workspaceId": "11111111-1111-4111-8111-111111111111",
  "projects": [{ "id": "22222222-2222-4222-8222-222222222222", "name": "Synthetic project" }],
  "tickets": [{
    "id": "33333333-3333-4333-8333-333333333333",
    "number": 42,
    "workspace_id": "11111111-1111-4111-8111-111111111111",
    "project_id": "22222222-2222-4222-8222-222222222222"
  }]
}
```

The converter accepts only these metadata fields. Its local workspace IDs hash provider, origin, account, workspace, entity kind and native project ID. Native ticket UUIDs remain separate from display numbers. It emits only the verified native `/tickets/{UUID}` form. Short-number URLs do not encode account/workspace context, so they are deliberately excluded rather than creating cross-account matching rules. It rejects duplicate/conflicting tickets, unknown project relationships, mixed workspaces, content and credential fields. It never reads or changes Shortcut history or migration aliases.

## Limits

Static JSON groups only known native ticket URLs. It does not group short links until they resolve to a known native URL, verify the current signed-in viewer, or discover a new ticket's project. It cannot acquire an expired session, infer human labor, recover deleted work or establish daily/revision-history coverage. Project reassignments require an explicit workspace-rule review; additive import does not remove a previously saved prefix. The retained custom reader remains a separate opt-in approach if live discovery is needed later, with its previous acceptance limits. The converter itself performs no browser read, consent, installation, permission grant, synchronization or activation. The separate approved public-build reload is recorded above.

## Rollback

No full settings import or source-alias migration was performed. The approved local reload now runs the simplified build with the preceding settings and protections. Returning to the custom reader requires a separately approved runtime restore and guarded reload from the exact backup; it does not require removing the extension. The public worker retains unsupported source definitions in local storage without executing them. Public full-settings exports include supported source definitions only, so keep the custom backup as well. Workspace-only import never touches source definitions or credentials. Changing builds and testing the installed public UI require separate approval.
