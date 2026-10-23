# Request diagnostic verification

Local implementation on kylebutler/request-diagnostic, based on fetched origin/main d013917. No Switchr dependency, new permission, network timer, remote publication or browser installation is introduced.

## Evidence

- All 87 tests pass, including six focused diagnostic tests.
- Actual source resolver fixture makes its normal two HTTP calls, with both counted once. No additional request is made by recording.
- Disabled recording produces no diagnostic writes. An idle sample survives worker recreation and requires no heartbeat.
- In-flight completion remains in the originating period after switching to Idle.
- Storage failure cannot turn a successful request into an application failure. The report shows incomplete recording; original transport errors remain unchanged.
- UTC timestamps render locally in the settings summary. Fixed trigger labels are retained, arbitrary labels become unknown. Fixtures assert absence of tokens, private URLs, titles and IDs.
- Explicit limits: 24 hours, 12 periods, 10,000 starts and 128 pending writes. Pending completions display as pending or unknown.
- No user content is included in the exported JSON. Existing settings backup behavior is untouched.

## Remaining checks

Chrome control is unavailable in this session. Installed-extension behavior and rendered visual/keyboard review remain pending. The settings addition uses the existing section/button/typography classes without new CSS. Impeccable's detector reported only incumbent styling and headings outside the new section; those were preserved.

Reload the existing unpacked extension from its current source folder to preserve its extension identity and settings. Do not load the isolated worktree as a separate extension. Confirm Settings shows Check background requests, collect a browsing and awake-idle period, and export. An absent, incomplete or sleeping-browser sample cannot establish that background requests stopped. Interpretation should separate manual actions, startup, navigation/page-ready events and unknown triggers before recommending changes.
