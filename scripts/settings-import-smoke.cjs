const assert = require('node:assert/strict');

async function openSettingsImportChooser(page) {
  const trigger = page.locator('#choose-import-settings');
  await trigger.waitFor({ state: 'visible' });
  // Keep keyboard activation bound to this button rather than relying on focus
  // established by a separate action. Still require the native chooser event.
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    trigger.press('Enter'),
  ]);
  assert.equal(await chooser.element().getAttribute('id'), 'import-settings',
    'Keyboard activation must open the settings import input.');
  return chooser;
}

module.exports = { openSettingsImportChooser };
