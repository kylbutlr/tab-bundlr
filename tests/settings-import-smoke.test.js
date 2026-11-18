import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { openSettingsImportChooser } = require('../scripts/settings-import-smoke.cjs');

// Model Playwright's keyboard targeting and event contract, without loading it or
// starting a browser. Deliberately move focus while the event wait is armed.
// This covers the smoke driver's focus gap, not native-browser acceptance.
function fixture({ opens = true, inputId = 'import-settings', activationError, visibilityError, driftOnListen = true } = {}) {
  let focus = 'backup-summary';
  let armed = false;
  let resolveChooser, rejectChooser;
  const actions = [];
  const chooser = { element: () => ({ getAttribute: async (name) => name === 'id' ? inputId : null }) };
  const event = new Promise((resolve, reject) => { resolveChooser = resolve; rejectChooser = reject; });
  const press = async (key) => {
    actions.push(['key', key, focus]);
    assert.equal(armed, true, 'The real chooser event must be observed before keyboard activation.');
    if (activationError) throw activationError;
    if (key === 'Enter' && focus === 'import-button' && opens) resolveChooser(chooser);
    else rejectChooser(new Error('No filechooser event from the settings import button.'));
  };
  const trigger = {
    async focus() { focus = 'import-button'; },
    async waitFor(options) {
      actions.push(['ready', options.state]);
      if (visibilityError) throw visibilityError;
    },
    async press(key) { focus = 'import-button'; await press(key); },
  };
  const page = {
    locator(selector) { assert.equal(selector, '#choose-import-settings'); return trigger; },
    waitForEvent(name) {
      assert.equal(name, 'filechooser');
      armed = true;
      if (driftOnListen) focus = 'backup-summary';
      return event;
    },
    keyboard: { press },
  };
  return { page, actions, chooser };
}

test('settings chooser keyboard activation reaches its button despite intervening focus changes', async () => {
  const { page, actions, chooser } = fixture();
  assert.equal(await openSettingsImportChooser(page), chooser);
  assert.deepEqual(actions, [['ready', 'visible'], ['key', 'Enter', 'import-button']]);
});

test('a missing native chooser event remains a failing smoke check', async () => {
  const { page } = fixture({ opens: false });
  await assert.rejects(openSettingsImportChooser(page), /No filechooser event/);
});

test('opening the workspace-only chooser cannot satisfy the settings backup check', async () => {
  const { page } = fixture({ inputId: 'workspace-import-file', driftOnListen: false });
  await assert.rejects(openSettingsImportChooser(page), /settings import input/);
});

test('a hidden import control fails readiness before keyboard activation', async () => {
  const failure = new Error('Import button is not visible.');
  const { page, actions } = fixture({ visibilityError: failure });
  await assert.rejects(openSettingsImportChooser(page), failure);
  assert.deepEqual(actions, [['ready', 'visible']]);
});

test('keyboard activation errors propagate without a mouse or input-file fallback', async () => {
  const failure = new Error('Keyboard activation failed.');
  const { page } = fixture({ activationError: failure });
  await assert.rejects(openSettingsImportChooser(page), failure);
});
