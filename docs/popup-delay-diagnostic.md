# Popup delay diagnostic (0.8.6)

This is targeted instrumentation and timeout handling, not a confirmed fix for
the reported hours-long Chrome/extension outage.

The captured 0.8.5 report measured 5,496 ms before rendering, 262 ms in the
background status calculation, and 14 ms rendering. Its next refresh measured
34 ms before rendering. The old `messageMs` includes active-tab lookup, so it
cannot identify which API caused the first wait.

## New measurements

- `tabQueryMs`: active-tab lookup in Chrome.
- `backgroundRoundTripMs`: status message send to receipt of response.
- `requestDeliveryMs`: wall-clock estimate from send to worker listener entry,
  including any worker startup delay. Recorded on receipt as `popup-received`.
- `workerMs`: listener entry through completion of status work.
- `responseDeliveryMs`: wall-clock estimate from response send to popup receipt.
- `guidanceMs`: reading first-use settings from local storage.
- `renderMs`: synchronous UI rendering, now excluding the settings read.
- `messageMs`: retained for compatibility; lookup plus background round trip.

Cross-context delivery estimates use Date.now, not unrelated performance.now
origins. System clock adjustments may distort them. Timings are numeric;
arbitrary text, error details, URLs and titles are not captured.

One five-second deadline covers all three API stages per refresh. On timeout,
the popup names the pending stage and tells the user to close and reopen it.
There is no automatic retry. Late responses cannot render or start the next
stage. Chrome APIs already in progress are not cancelled.

Timeout/error reports are best-effort messages to the existing in-memory
diagnostic. If the worker cannot receive them, they cannot be recovered there.
The existing five-minute expiry, 128-entry cap, and worker-restart clearing still
apply. No persistent logging, background timer, polling or network is added.
If Chrome cannot execute popup JavaScript at all, neither this timer nor its
error UI can run. This does not diagnose the browser process itself.

## Verification

`node --test tests/popup-timeout.test.js` imports the real popup with mocked
Chrome APIs that never settle, then advances the deadline and checks its status
UI. All three cases failed before the change and pass afterward.

`node --test tests/popup-request.test.js tests/runtime-diagnostic.test.js` covers
timing separation, shared deadline, late results, reporting failures and privacy.
These simulated stalls do not reproduce the user's complete Chrome outage.

Installed-extension verification remains pending. Do not reload the user's
extension or restart Chrome as part of local tests.

Local QA: 105 tests pass, the 0.8.6 ZIP builds, and a browser-rendered preview
with a deliberately nonresponding worker shows the background timeout message
and diagnostic link. The preview used mocked Chrome APIs, not the installed
extension. Impeccable's hardening guidance informed the stage-specific error
and recovery copy while preserving the existing popup layout.
