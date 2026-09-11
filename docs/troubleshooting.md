# Troubleshooting

## A matching tab does not move

1. Confirm the tab is not pinned or inside a manual Chrome group.
2. Confirm the current window is selected and not paused.
3. Use **Test a URL** in Settings to inspect the winning rule.
4. In manual mode, select **Fix**.
5. In automatic mode, reload the tab after saving the rule.

## A Workspace Source does not resolve

1. Open Settings and confirm the source is enabled.
2. Confirm every required credential is saved.
3. Disable and re-enable the source to review its exact origin permission.
4. Confirm its page pattern matches the complete provider URL.
5. Confirm every request URL is HTTPS and covered by `permissionOrigins`.
6. Check that the configured response property paths exist in the API response.

Workspace Source requests stop after 10 seconds so a slow or unavailable provider cannot leave startup reconciliation or **Fix** pending indefinitely. Retry after the provider recovers; repeated failures remain cached briefly to avoid request storms.

## A tab remains in a Focus Group

Drag it out of the Focus Group. Tab Bundlr then re-evaluates its normal rule. Disable Focus behavior on that Smart Group if temporary holds are no longer wanted.

## A home-base duplicate was not removed

Fresh installations use review mode. Choose **Remove exact inactive duplicates automatically** in Settings if desired. Active tabs, pinned tabs, different query strings, and different normalized URLs are intentionally protected.

## Reset without losing a backup

Export settings, inspect the JSON to confirm it contains no credentials, then remove and reload the extension. Import the backup and re-enter Workspace Source credentials. Imported sources remain disabled until explicitly enabled.
