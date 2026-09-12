import {
  ACTIVATE_OPENED_TABS_STORAGE_KEY,
  ACTIVITY_HISTORY_STORAGE_KEY,
  AUTO_ORGANIZE_GROUPS_STORAGE_KEY,
  BROWSER_PAGE_SMART_GROUP_STORAGE_KEY,
  CHROME_GROUP_COLORS,
  CLIENT_CATALOG_STORAGE_KEY,
  DEFAULT_AUTO_ORGANIZE_GROUPS,
  ENABLED_STORAGE_KEY,
  FOCUS_HELD_TABS_STORAGE_KEY,
  GROUP_RECORDS_STORAGE_KEY,
  LAST_ACTION_STORAGE_KEY,
  STALE_TAB_DAYS_STORAGE_KEY,
  MANAGED_GROUP_COLORS_STORAGE_KEY,
  MANAGED_GROUP_TYPE_ENABLED_STORAGE_KEY,
  MANAGED_GROUP_TYPE_ORDER_STORAGE_KEY,
  PERSISTENT_HOME_BASES_STORAGE_KEY,
  PREVIOUS_TAB_COMMAND,
  PREVIOUS_TAB_MODE_STORAGE_KEY,
  SMART_GROUPS_STORAGE_KEY,
  SMART_GROUP_ORDER_STORAGE_KEY,
  SAVED_CLIENT_GROUPS_STORAGE_KEY,
  TAB_CONTEXTS_STORAGE_KEY,
  TEMPORARY_ACTIVATION_COMMAND,
  TRAINED_RULES_STORAGE_KEY,
  UNIQUE_AUTO_COLOR,
  WINDOW_AUTOMATION_PREFERENCE_STORAGE_KEY,
  analyzeUrlRules,
  activateOpenedTabsFromStorage,
  clientRulePatternKey,
  browserPageSmartGroup,
  enabledFromStorage,
  normalizeEpicName,
  normalizeManagedGroupTypeEnabled,
  orderedManagedGroupTypes,
  orderedSmartGroupIds,
  overlappingUrlRules,
  previousTabModeFromStorage,
  smartGroupPatterns,
  tabRoleForUrl,
  tabRoleLabel,
  trainingPatternForUrl,
} from './core.js';
import {
  HOME_BASE_DUPLICATE_ACTION_STORAGE_KEY,
  OPENER_INHERITANCE_STORAGE_KEY,
  SETTINGS_VERSION_STORAGE_KEY,
  WORKSPACE_SOURCE_SECRETS_STORAGE_KEY,
  WORKSPACE_SOURCES_STORAGE_KEY,
  normalizeWorkspaceSource,
  normalizeWorkspaceSources,
} from './sources.js';
import {
  ensureSettingsMigrated,
  homeBaseDuplicateActionFromStorage,
  openerInheritanceFromStorage,
} from './settings.js';
import { sourceAccessDisclosure } from './guidance.js';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  createBackup,
  plainObject,
  settingsImportChanges,
} from './backup.js';

const form = document.getElementById('settings-form');
const enabledInput = document.getElementById('enabled');
const openerInheritanceInput = document.getElementById('opener-inheritance');
const homeBaseDuplicateActionInput = document.getElementById('home-base-duplicate-action');
const activateOpenedTabsInput = document.getElementById('activate-opened-tabs');
const temporaryActivationShortcut = document.getElementById('temporary-activation-shortcut');
const changeTemporaryActivationShortcut = document.getElementById('change-temporary-activation-shortcut');
const temporaryActivationShortcutStatus = document.getElementById('temporary-activation-shortcut-status');
const previousTabShortcut = document.getElementById('previous-tab-shortcut');
const changePreviousTabShortcut = document.getElementById('change-previous-tab-shortcut');
const previousTabShortcutStatus = document.getElementById('previous-tab-shortcut-status');
const previousTabMode = document.getElementById('previous-tab-mode');
const autoOrganizeGroupsInput = document.getElementById('auto-organize-groups');
const status = document.getElementById('form-status');
const windowAutomationForm = document.getElementById('window-automation-form');
const windowModeAll = document.getElementById('window-mode-all');
const windowModeSelected = document.getElementById('window-mode-selected');
const windowAutomationList = document.getElementById('window-automation-list');
const windowAutomationStatus = document.getElementById('window-automation-status');
const refreshWindowList = document.getElementById('refresh-window-list');
const trainedRules = document.getElementById('trained-rules');
const clientRuleForm = document.getElementById('client-rule-form');
const clientRuleName = document.getElementById('client-rule-name');
const clientRuleEpicId = document.getElementById('client-rule-epic-id');
const clientRulePattern = document.getElementById('client-rule-pattern');
const clientRuleSubmit = document.getElementById('client-rule-submit');
const clientRuleCancel = document.getElementById('client-rule-cancel');
const clientRuleStatus = document.getElementById('client-rule-status');
const exportSettingsButton = document.getElementById('export-settings');
const importSettingsInput = document.getElementById('import-settings');
const backupStatus = document.getElementById('backup-status');
const backupPreviewPanel = document.getElementById('backup-preview-panel');
const backupPreview = document.getElementById('backup-preview');
const copyBackupButton = document.getElementById('copy-backup');
const smartGroupForm = document.getElementById('smart-group-form');
const smartGroupName = document.getElementById('smart-group-name');
const smartGroupPattern = document.getElementById('smart-group-pattern');
const smartGroupStatus = document.getElementById('smart-group-status');
const smartGroupOverlap = document.getElementById('smart-group-overlap');
const smartGroups = document.getElementById('smart-groups');
const clientRuleOverlap = document.getElementById('client-rule-overlap');
const ruleTesterForm = document.getElementById('rule-tester-form');
const ruleTesterUrl = document.getElementById('rule-tester-url');
const ruleTesterResult = document.getElementById('rule-tester-result');
const managedGroupTypeOrder = document.getElementById('managed-group-order');
const managedGroupOrderStatus = document.getElementById('managed-group-order-status');
const browserPageSmartGroupInput = document.getElementById('browser-page-smart-group');
const browserPageSmartGroupStatus = document.getElementById('browser-page-smart-group-status');
const workspaceSourcesElement = document.getElementById('workspace-sources');
const workspaceSourceForm = document.getElementById('workspace-source-form');
const workspaceSourceJson = document.getElementById('workspace-source-json');
const workspaceSourceClear = document.getElementById('workspace-source-clear');
const workspaceSourceStatus = document.getElementById('workspace-source-status');
const sourcePermissionDialog = document.getElementById('source-permission-dialog');
const sourcePermissionCopy = document.getElementById('source-permission-copy');
const sourcePermissionOrigins = document.getElementById('source-permission-origins');
const sourcePermissionCancel = document.getElementById('source-permission-cancel');
const sourcePermissionContinue = document.getElementById('source-permission-continue');
const managedGroupTypes = [
  { id: 'client', label: 'Connected workspaces', detail: 'Optional connections and saved destination rules' },
  { id: 'iteration', label: 'Connected collections', detail: 'Timeboxes or collections supplied by optional connections' },
  { id: 'smart', label: 'Smart Groups', detail: 'Your explicit URL rules, in the individual order below' },
  { id: 'focus-smart', label: 'Focus Smart Groups', detail: 'The designated protected Smart Group' },
];
let editingClientRulePattern = null;
let pendingSourceAccess = null;

function updateWindowAutomationControls() {
  const allWindows = windowModeAll.checked;
  windowAutomationList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    if (allWindows) input.checked = true;
    input.disabled = allWindows;
    input.closest('.window-automation-row')?.classList.toggle('is-disabled', allWindows);
  });
}

async function loadWindowAutomationPolicy() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_WINDOW_AUTOMATION_POLICY' });
  if (!response?.ok) throw new Error(response?.message || 'Window automation settings could not be loaded.');
  windowModeAll.checked = response.mode !== 'selected';
  windowModeSelected.checked = response.mode === 'selected';
  const selectedIds = new Set((response.selectedWindowIds || []).map(Number));
  windowAutomationList.replaceChildren();
  if (!response.windows?.length) {
    const empty = document.createElement('p');
    empty.className = 'field-help';
    empty.textContent = 'No normal Chrome windows are currently open.';
    windowAutomationList.append(empty);
  } else {
    response.windows.forEach((window) => {
      const row = document.createElement('label');
      row.className = 'window-automation-row';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = String(window.id);
      input.checked = response.mode === 'all' || selectedIds.has(Number(window.id));
      const copy = document.createElement('span');
      copy.className = 'window-automation-copy';
      const title = document.createElement('strong');
      title.textContent = `${window.label}${window.focused ? ' · Current' : ''}`;
      const detail = document.createElement('small');
      detail.textContent = `${window.detail} · ${window.tabCount} tab${window.tabCount === 1 ? '' : 's'}`;
      copy.append(title, detail);
      row.append(input, copy);
      windowAutomationList.append(row);
    });
  }
  updateWindowAutomationControls();
  return response;
}

const BACKUP_STORAGE_KEYS = [
  SETTINGS_VERSION_STORAGE_KEY,
  ENABLED_STORAGE_KEY,
  OPENER_INHERITANCE_STORAGE_KEY,
  HOME_BASE_DUPLICATE_ACTION_STORAGE_KEY,
  WORKSPACE_SOURCES_STORAGE_KEY,
  ACTIVATE_OPENED_TABS_STORAGE_KEY,
  AUTO_ORGANIZE_GROUPS_STORAGE_KEY,
  STALE_TAB_DAYS_STORAGE_KEY,
  MANAGED_GROUP_COLORS_STORAGE_KEY,
  MANAGED_GROUP_TYPE_ENABLED_STORAGE_KEY,
  MANAGED_GROUP_TYPE_ORDER_STORAGE_KEY,
  BROWSER_PAGE_SMART_GROUP_STORAGE_KEY,
  PERSISTENT_HOME_BASES_STORAGE_KEY,
  SMART_GROUP_ORDER_STORAGE_KEY,
  SMART_GROUPS_STORAGE_KEY,
  TRAINED_RULES_STORAGE_KEY,
  CLIENT_CATALOG_STORAGE_KEY,
  SAVED_CLIENT_GROUPS_STORAGE_KEY,
  WINDOW_AUTOMATION_PREFERENCE_STORAGE_KEY,
];
const RUNTIME_STORAGE_KEYS = [GROUP_RECORDS_STORAGE_KEY, TAB_CONTEXTS_STORAGE_KEY, FOCUS_HELD_TABS_STORAGE_KEY, LAST_ACTION_STORAGE_KEY, ACTIVITY_HISTORY_STORAGE_KEY];

async function exportSettings() {
  const stored = await chrome.storage.local.get(BACKUP_STORAGE_KEYS);
  const exportedAt = new Date().toISOString();
  const backup = createBackup(stored, exportedAt);
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `tab-bundlr-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  backupPreview.textContent = JSON.stringify(backup, null, 2);
  backupPreviewPanel.hidden = false;
  backupPreviewPanel.open = true;
  copyBackupButton.hidden = false;
  backupStatus.textContent = 'Exported settings without credentials or browser-session state.';
}

async function importSettings(file) {
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    if (backup?.format !== BACKUP_FORMAT || ![1, BACKUP_VERSION].includes(backup?.version) || !plainObject(backup.settings)) {
      throw new Error('That file is not a supported Tab Bundlr settings backup.');
    }
    if (!window.confirm('Import these Tab Bundlr settings? Supplied values will update the current settings and clear saved connection credentials.')) return;
    const current = await chrome.storage.local.get(BACKUP_STORAGE_KEYS);
    const settings = settingsImportChanges(current, backup.settings);
    await chrome.storage.local.remove([...RUNTIME_STORAGE_KEYS, CLIENT_CATALOG_STORAGE_KEY]);
    await chrome.storage.local.set(settings);
    await Promise.all([loadSettings(), renderTrainedRules(), renderSmartGroups(), renderManagedGroupOrder(), renderWorkspaceSources()]);
    await chrome.runtime.sendMessage({ type: 'SYNC_NOW' });
    backupStatus.textContent = backup.version === 1
      ? 'Imported legacy settings without its saved token. Add credentials to the matching connection before enabling it.'
      : 'Imported settings. Optional connections are disabled and credentials were not imported.';
  } catch (error) {
    backupStatus.textContent = error instanceof Error ? error.message : 'The settings backup could not be imported.';
  } finally {
    importSettingsInput.value = '';
  }
}

async function moveManagedGroupType(type, direction) {
  const stored = await chrome.storage.local.get(MANAGED_GROUP_TYPE_ORDER_STORAGE_KEY);
  const order = orderedManagedGroupTypes(stored[MANAGED_GROUP_TYPE_ORDER_STORAGE_KEY]);
  const index = order.indexOf(type);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return;
  [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
  await chrome.storage.local.set({ [MANAGED_GROUP_TYPE_ORDER_STORAGE_KEY]: order });
  await renderManagedGroupOrder();
}

async function renderManagedGroupOrder() {
  const stored = await chrome.storage.local.get([
    MANAGED_GROUP_COLORS_STORAGE_KEY,
    MANAGED_GROUP_TYPE_ENABLED_STORAGE_KEY,
    MANAGED_GROUP_TYPE_ORDER_STORAGE_KEY,
  ]);
  const order = orderedManagedGroupTypes(stored[MANAGED_GROUP_TYPE_ORDER_STORAGE_KEY]);
  const colors = stored[MANAGED_GROUP_COLORS_STORAGE_KEY] || {};
  const enabledTypes = normalizeManagedGroupTypeEnabled(stored[MANAGED_GROUP_TYPE_ENABLED_STORAGE_KEY]);
  const typeById = new Map(managedGroupTypes.map((type) => [type.id, type]));
  managedGroupTypeOrder.replaceChildren();
  order.forEach((typeId, index) => {
    const type = typeById.get(typeId);
    if (!type) return;
    const row = document.createElement('div');
    row.className = 'managed-order-row';
    const copy = document.createElement('div');
    copy.className = 'managed-order-copy';
    const title = document.createElement('strong');
    title.textContent = type.label;
    const detail = document.createElement('small');
    detail.textContent = type.detail;
    copy.append(title, detail);
    const actions = document.createElement('div');
    actions.className = 'managed-order-actions';
    const toggle = document.createElement('label');
    toggle.className = 'managed-order-toggle';
    toggle.title = `Enable ${type.label}`;
    const toggleCopy = document.createElement('span');
    toggleCopy.textContent = 'Enabled';
    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = enabledTypes[type.id];
    toggleInput.setAttribute('aria-label', `Enable ${type.label}`);
    toggleInput.addEventListener('change', async () => {
      const current = await chrome.storage.local.get(MANAGED_GROUP_TYPE_ENABLED_STORAGE_KEY);
      const nextEnabled = normalizeManagedGroupTypeEnabled(current[MANAGED_GROUP_TYPE_ENABLED_STORAGE_KEY]);
      nextEnabled[type.id] = toggleInput.checked;
      await chrome.storage.local.set({ [MANAGED_GROUP_TYPE_ENABLED_STORAGE_KEY]: nextEnabled });
      row.classList.toggle('is-disabled', !toggleInput.checked);
      color.disabled = !toggleInput.checked;
      managedGroupOrderStatus.textContent = toggleInput.checked
        ? `${type.label} enabled. Open tabs will be assigned to this category again.`
        : `${type.label} disabled. Open tabs will fall through to other enabled rules.`;
    });
    toggle.append(toggleInput, toggleCopy);
    const color = document.createElement('select');
    color.className = 'managed-order-color';
    color.setAttribute('aria-label', `${type.label} color`);
    const automatic = document.createElement('option');
    automatic.value = 'auto';
    automatic.textContent = 'Automatic';
    color.append(automatic);
    const uniqueAutomatic = document.createElement('option');
    uniqueAutomatic.value = UNIQUE_AUTO_COLOR;
    uniqueAutomatic.textContent = 'Unique automatic';
    color.append(uniqueAutomatic);
    CHROME_GROUP_COLORS.forEach((candidate) => {
      const option = document.createElement('option');
      option.value = candidate;
      option.textContent = colorLabel(candidate);
      color.append(option);
    });
    color.value = CHROME_GROUP_COLORS.includes(colors[type.id])
      ? colors[type.id]
      : colors[type.id] === UNIQUE_AUTO_COLOR ? UNIQUE_AUTO_COLOR : 'auto';
    color.disabled = !enabledTypes[type.id];
    color.addEventListener('change', async () => {
      const current = await chrome.storage.local.get(MANAGED_GROUP_COLORS_STORAGE_KEY);
      const nextColors = current[MANAGED_GROUP_COLORS_STORAGE_KEY] && typeof current[MANAGED_GROUP_COLORS_STORAGE_KEY] === 'object'
        ? { ...current[MANAGED_GROUP_COLORS_STORAGE_KEY] }
        : {};
      nextColors[type.id] = color.value === 'auto' ? null : color.value;
      await chrome.storage.local.set({ [MANAGED_GROUP_COLORS_STORAGE_KEY]: nextColors });
      managedGroupOrderStatus.textContent = `${type.label} color saved. Existing managed groups will update.`;
    });
    const moveUp = document.createElement('button');
    moveUp.type = 'button';
    moveUp.className = 'secondary managed-order-button';
    moveUp.textContent = '↑';
    moveUp.title = `Move ${type.label} up`;
    moveUp.setAttribute('aria-label', `Move ${type.label} up`);
    moveUp.disabled = index === 0;
    moveUp.addEventListener('click', () => moveManagedGroupType(typeId, -1));
    const moveDown = document.createElement('button');
    moveDown.type = 'button';
    moveDown.className = 'secondary managed-order-button';
    moveDown.textContent = '↓';
    moveDown.title = `Move ${type.label} down`;
    moveDown.setAttribute('aria-label', `Move ${type.label} down`);
    moveDown.disabled = index === order.length - 1;
    moveDown.addEventListener('click', () => moveManagedGroupType(typeId, 1));
    actions.append(toggle, color, moveUp, moveDown);
    row.append(copy, actions);
    row.classList.toggle('is-disabled', !enabledTypes[type.id]);
    managedGroupTypeOrder.append(row);
  });
}

async function moveSmartGroup(groupId, direction) {
  const stored = await chrome.storage.local.get([SMART_GROUPS_STORAGE_KEY, SMART_GROUP_ORDER_STORAGE_KEY]);
  const groups = Array.isArray(stored[SMART_GROUPS_STORAGE_KEY]) ? stored[SMART_GROUPS_STORAGE_KEY] : [];
  const order = orderedSmartGroupIds(groups, stored[SMART_GROUP_ORDER_STORAGE_KEY]);
  const index = order.indexOf(String(groupId));
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return;
  [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
  await chrome.storage.local.set({ [SMART_GROUP_ORDER_STORAGE_KEY]: order });
  await renderSmartGroups();
}

async function renameSmartGroup(groupId, value) {
  const rawName = String(value || '').trim();
  const name = normalizeEpicName(rawName);
  if (!rawName || name === 'Unnamed Workspace') {
    smartGroupStatus.textContent = 'Add a name for this Smart Group.';
    return;
  }
  const stored = await chrome.storage.local.get(SMART_GROUPS_STORAGE_KEY);
  const groups = Array.isArray(stored[SMART_GROUPS_STORAGE_KEY]) ? stored[SMART_GROUPS_STORAGE_KEY] : [];
  const group = groups.find((candidate) => String(candidate.id) === String(groupId));
  if (!group) {
    smartGroupStatus.textContent = 'That Smart Group no longer exists.';
    return;
  }
  if (groups.some((candidate) => (
    String(candidate.id) !== String(groupId)
    && String(candidate.name || '').trim().toLowerCase() === name.toLowerCase()
  ))) {
    smartGroupStatus.textContent = `A Smart Group named ${name} already exists.`;
    return;
  }
  await chrome.storage.local.set({
    [SMART_GROUPS_STORAGE_KEY]: groups.map((candidate) => String(candidate.id) === String(groupId)
      ? { ...candidate, name, updatedAt: new Date().toISOString() }
      : candidate),
  });
  smartGroupStatus.textContent = `Renamed ${group.name || 'Smart Group'} to ${name}.`;
  await renderSmartGroups();
}

async function loadSettings() {
  await ensureSettingsMigrated(chrome.storage.local);
  const stored = await chrome.storage.local.get([
    ENABLED_STORAGE_KEY,
    OPENER_INHERITANCE_STORAGE_KEY,
    HOME_BASE_DUPLICATE_ACTION_STORAGE_KEY,
    ACTIVATE_OPENED_TABS_STORAGE_KEY,
    PREVIOUS_TAB_MODE_STORAGE_KEY,
    AUTO_ORGANIZE_GROUPS_STORAGE_KEY,
  ]);
  enabledInput.checked = enabledFromStorage(stored[ENABLED_STORAGE_KEY]);
  openerInheritanceInput.checked = openerInheritanceFromStorage(stored[OPENER_INHERITANCE_STORAGE_KEY]);
  homeBaseDuplicateActionInput.value = homeBaseDuplicateActionFromStorage(stored[HOME_BASE_DUPLICATE_ACTION_STORAGE_KEY]);
  activateOpenedTabsInput.checked = activateOpenedTabsFromStorage(stored[ACTIVATE_OPENED_TABS_STORAGE_KEY]);
  previousTabMode.value = previousTabModeFromStorage(stored[PREVIOUS_TAB_MODE_STORAGE_KEY]);
  autoOrganizeGroupsInput.checked = stored[AUTO_ORGANIZE_GROUPS_STORAGE_KEY] === undefined
    ? DEFAULT_AUTO_ORGANIZE_GROUPS
    : stored[AUTO_ORGANIZE_GROUPS_STORAGE_KEY] === true;
  status.textContent = enabledInput.checked
    ? 'Automatic Tab Bundling is on.'
    : 'Manual mode is on. Use Fix and Organize when you want Tab Bundlr to move tabs.';
}

async function loadTemporaryActivationShortcut() {
  const commands = await chrome.commands.getAll();
  const command = commands.find((candidate) => candidate.name === TEMPORARY_ACTIVATION_COMMAND);
  temporaryActivationShortcut.textContent = command?.shortcut || 'Not set';
}

async function loadPreviousTabShortcut() {
  const commands = await chrome.commands.getAll();
  const command = commands.find((candidate) => candidate.name === PREVIOUS_TAB_COMMAND);
  previousTabShortcut.textContent = command?.shortcut || 'Not set';
}

async function releaseUnusedSourceOrigins(origins) {
  if (!chrome.permissions?.remove || !origins.length) return;
  const stored = await chrome.storage.local.get(WORKSPACE_SOURCES_STORAGE_KEY);
  const usedOrigins = new Set(normalizeWorkspaceSources(stored[WORKSPACE_SOURCES_STORAGE_KEY])
    .filter((source) => source.enabled)
    .flatMap((source) => source.permissionOrigins));
  const unused = origins.filter((origin) => !usedOrigins.has(origin));
  if (unused.length) await chrome.permissions.remove({ origins: unused }).catch(() => false);
}

async function saveWorkspaceSourceState(sourceId, enabled) {
  const stored = await chrome.storage.local.get([WORKSPACE_SOURCES_STORAGE_KEY, WORKSPACE_SOURCE_SECRETS_STORAGE_KEY]);
  const sources = normalizeWorkspaceSources(stored[WORKSPACE_SOURCES_STORAGE_KEY]);
  const source = sources.find((candidate) => candidate.id === sourceId);
  if (!source) throw new Error('That connection no longer exists. Reload this page and try again.');
  const secrets = plainObject(stored[WORKSPACE_SOURCE_SECRETS_STORAGE_KEY]);
  if (enabled && source.credentials.some((credential) => !String(secrets[source.id]?.[credential.id] || '').trim())) {
    throw new Error(`Save the required credentials for ${source.name} first.`);
  }
  if (enabled && source.permissionOrigins.length) {
    const granted = await chrome.permissions.request({ origins: source.permissionOrigins });
    if (!granted) throw new Error(`${source.name} remains off because service access was not granted.`);
  }
  await chrome.storage.local.set({
    [WORKSPACE_SOURCES_STORAGE_KEY]: sources.map((candidate) => (
      candidate.id === sourceId ? { ...candidate, enabled } : candidate
    )),
  });
  if (!enabled) await releaseUnusedSourceOrigins(source.permissionOrigins);
}

function showWorkspaceSourceStatus(message, tone = 'info') {
  workspaceSourceStatus.textContent = message;
  workspaceSourceStatus.dataset.tone = tone;
}

function openSourcePermissionDisclosure(source) {
  const disclosure = sourceAccessDisclosure(source, false);
  pendingSourceAccess = source;
  sourcePermissionCopy.textContent = `${disclosure.name} needs permission before it can make read-only requests to:`;
  sourcePermissionOrigins.replaceChildren(...disclosure.origins.map((origin) => {
    const item = document.createElement('li');
    item.textContent = origin;
    return item;
  }));
  sourcePermissionDialog.showModal();
}

async function applyWorkspaceSourceState(source, enabled, successMessage) {
  try {
    await saveWorkspaceSourceState(source.id, enabled);
    showWorkspaceSourceStatus(successMessage, 'success');
    await renderWorkspaceSources();
    return true;
  } catch (error) {
    showWorkspaceSourceStatus(error.message || 'This connection could not be updated.', 'error');
    return false;
  }
}

async function renderWorkspaceSources() {
  const stored = await chrome.storage.local.get([WORKSPACE_SOURCES_STORAGE_KEY, WORKSPACE_SOURCE_SECRETS_STORAGE_KEY]);
  const sources = normalizeWorkspaceSources(stored[WORKSPACE_SOURCES_STORAGE_KEY]);
  const secrets = plainObject(stored[WORKSPACE_SOURCE_SECRETS_STORAGE_KEY]);
  workspaceSourcesElement.replaceChildren();
  if (!sources.length) {
    const empty = document.createElement('p');
    empty.className = 'field-help';
    empty.textContent = 'No optional connections are configured. Smart Groups and saved URL rules work without an account or external service.';
    workspaceSourcesElement.append(empty);
    return;
  }
  const sourceAccess = new Map(await Promise.all(sources.map(async (source) => {
    if (!source.permissionOrigins.length || !chrome.permissions?.contains) return [source.id, true];
    const granted = await chrome.permissions.contains({ origins: source.permissionOrigins }).catch(() => false);
    return [source.id, granted];
  })));
  sources.forEach((source) => {
    const accessGranted = sourceAccess.get(source.id) !== false;
    const row = document.createElement('div');
    row.className = 'trained-rule';
    const copy = document.createElement('div');
    copy.className = 'trained-rule-copy';
    const title = document.createElement('strong');
    title.textContent = source.name;
    const detail = document.createElement('small');
    const state = source.enabled
      ? accessGranted ? 'On' : 'On, needs service access'
      : 'Off';
    detail.textContent = `${state} · ${source.precedence === 'before-rules' ? 'Checked before URL rules' : 'Checked after URL rules'}`;
    const origins = document.createElement('code');
    origins.textContent = source.permissionOrigins.length ? source.permissionOrigins.join(', ') : 'No service address required';
    copy.append(title, detail, origins);

    const controls = document.createElement('div');
    controls.className = 'trained-rule-actions';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = source.enabled && accessGranted ? 'secondary' : '';
    toggle.textContent = source.enabled && !accessGranted ? 'Review access' : source.enabled ? 'Turn off' : 'Turn on';
    toggle.addEventListener('click', async () => {
      const nextEnabled = source.enabled && accessGranted ? false : true;
      if (nextEnabled && source.credentials.some((credential) => !String(secrets[source.id]?.[credential.id] || '').trim())) {
        showWorkspaceSourceStatus(`Save the required credentials for ${source.name} before turning it on.`, 'error');
        return;
      }
      const disclosure = sourceAccessDisclosure(source, accessGranted);
      if (nextEnabled && disclosure.required) {
        openSourcePermissionDisclosure(source);
        return;
      }
      await applyWorkspaceSourceState(
        source,
        nextEnabled,
        `${source.name} is ${nextEnabled ? 'on' : 'off'}.`,
      );
    });
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'secondary';
    edit.textContent = 'Edit JSON';
    edit.addEventListener('click', () => {
      workspaceSourceJson.value = JSON.stringify(source, null, 2);
      workspaceSourceJson.focus();
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'secondary';
    remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      if (!window.confirm(`Remove ${source.name} and its locally saved credentials?`)) return;
      const current = await chrome.storage.local.get([WORKSPACE_SOURCES_STORAGE_KEY, WORKSPACE_SOURCE_SECRETS_STORAGE_KEY]);
      const nextSecrets = { ...plainObject(current[WORKSPACE_SOURCE_SECRETS_STORAGE_KEY]) };
      delete nextSecrets[source.id];
      await chrome.storage.local.set({
        [WORKSPACE_SOURCES_STORAGE_KEY]: normalizeWorkspaceSources(current[WORKSPACE_SOURCES_STORAGE_KEY])
          .filter((candidate) => candidate.id !== source.id),
        [WORKSPACE_SOURCE_SECRETS_STORAGE_KEY]: nextSecrets,
      });
      await releaseUnusedSourceOrigins(source.permissionOrigins);
      showWorkspaceSourceStatus(`Removed ${source.name} and its locally saved credentials.`, 'success');
      await renderWorkspaceSources();
    });
    controls.append(toggle, edit, remove);
    row.append(copy, controls);

    if (source.credentials.length) {
      const credentials = document.createElement('div');
      credentials.className = 'source-credentials';
      source.credentials.forEach((credential) => {
        const label = document.createElement('label');
        label.textContent = credential.label;
        const input = document.createElement('input');
        input.type = 'password';
        input.autocomplete = 'off';
        input.dataset.credentialId = credential.id;
        input.value = String(secrets[source.id]?.[credential.id] || '');
        label.append(input);
        credentials.append(label);
      });
      const saveCredentials = document.createElement('button');
      saveCredentials.type = 'button';
      saveCredentials.className = 'secondary';
      saveCredentials.textContent = 'Save credentials';
      saveCredentials.addEventListener('click', async () => {
        const current = await chrome.storage.local.get(WORKSPACE_SOURCE_SECRETS_STORAGE_KEY);
        const nextSecrets = { ...plainObject(current[WORKSPACE_SOURCE_SECRETS_STORAGE_KEY]) };
        nextSecrets[source.id] = Object.fromEntries([...credentials.querySelectorAll('input')]
          .map((input) => [input.dataset.credentialId, input.value.trim()]));
        await chrome.storage.local.set({ [WORKSPACE_SOURCE_SECRETS_STORAGE_KEY]: nextSecrets });
        showWorkspaceSourceStatus(`Saved ${source.name} credentials in Chrome on this device. They will not be exported.`, 'success');
      });
      credentials.append(saveCredentials);
      const credentialHelp = document.createElement('small');
      credentialHelp.className = 'credential-help';
      credentialHelp.textContent = 'Credentials stay in Chrome extension storage and are sent only to this connection\'s listed service addresses.';
      credentials.append(credentialHelp);
      row.append(credentials);
    }
    workspaceSourcesElement.append(row);
  });
}

function colorLabel(color) {
  return color.charAt(0).toUpperCase() + color.slice(1);
}

async function renderTrainedRules() {
  const stored = await chrome.storage.local.get(TRAINED_RULES_STORAGE_KEY);
  const rules = Array.isArray(stored[TRAINED_RULES_STORAGE_KEY]) ? stored[TRAINED_RULES_STORAGE_KEY] : [];
  trainedRules.replaceChildren();
  if (!rules.length) {
    const empty = document.createElement('p');
    empty.className = 'field-help';
    empty.textContent = 'No saved workspace links yet. Use Teach in the popup while a relevant tab is active.';
    trainedRules.append(empty);
    return;
  }
  const groupedRules = new Map();
  rules.forEach((rule) => {
    const key = String(rule.epicId || rule.epicName || 'unknown').toLowerCase();
    if (!groupedRules.has(key)) groupedRules.set(key, { name: rule.epicName || 'Unnamed Workspace', rules: [] });
    groupedRules.get(key).rules.push(rule);
  });
  [...groupedRules.values()]
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))
    .forEach((clientGroup) => {
      const disclosure = document.createElement('details');
      disclosure.className = 'client-rule-group';
      const summary = document.createElement('summary');
      const summaryCopy = document.createElement('div');
      summaryCopy.className = 'smart-group-summary-copy';
      const title = document.createElement('strong');
      title.textContent = clientGroup.name;
      const count = document.createElement('small');
      count.textContent = `${clientGroup.rules.length} URL rule${clientGroup.rules.length === 1 ? '' : 's'}`;
      summaryCopy.append(title, count);
      summary.append(summaryCopy);
      disclosure.append(summary);

      const ruleList = document.createElement('div');
      ruleList.className = 'client-rule-patterns';
      [...clientGroup.rules]
        .sort((left, right) => String(left.pattern).localeCompare(String(right.pattern), undefined, { sensitivity: 'base' }))
        .forEach((rule) => {
          const row = document.createElement('div');
          row.className = 'trained-rule';
          const copy = document.createElement('div');
          copy.className = 'trained-rule-copy';
          const role = document.createElement('strong');
          role.textContent = rule.roleLabel || 'Web';
          const pattern = document.createElement('code');
          pattern.textContent = rule.pattern;
          copy.append(role, pattern);
          const actions = document.createElement('div');
          actions.className = 'trained-rule-actions';
          const edit = document.createElement('button');
          edit.type = 'button';
          edit.className = 'secondary trained-rule-edit';
          edit.textContent = 'Edit';
          edit.addEventListener('click', () => {
            editingClientRulePattern = rule.pattern;
            clientRuleName.value = rule.epicName || '';
            clientRuleEpicId.value = rule.epicId || '';
            clientRulePattern.value = rule.pattern || '';
            clientRuleSubmit.textContent = 'Save rule';
            clientRuleCancel.hidden = false;
            clientRuleStatus.textContent = `Editing ${rule.pattern}.`;
            clientRuleName.focus();
          });
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'secondary trained-rule-remove';
          remove.textContent = 'Remove';
          remove.addEventListener('click', async () => {
            const current = await chrome.storage.local.get(TRAINED_RULES_STORAGE_KEY);
            const next = (Array.isArray(current[TRAINED_RULES_STORAGE_KEY]) ? current[TRAINED_RULES_STORAGE_KEY] : [])
              .filter((candidate) => candidate.pattern !== rule.pattern);
            await chrome.storage.local.set({ [TRAINED_RULES_STORAGE_KEY]: next });
            if (editingClientRulePattern === rule.pattern) resetClientRuleForm();
            await renderTrainedRules();
          });
          actions.append(edit, remove);
          row.append(copy, actions);
          ruleList.append(row);
        });
      disclosure.append(ruleList);
      trainedRules.append(disclosure);
    });
}

function resetClientRuleForm() {
  editingClientRulePattern = null;
  clientRuleForm.reset();
  clientRuleSubmit.textContent = 'Add rule';
  clientRuleCancel.hidden = true;
  clientRuleStatus.textContent = '';
  clientRuleOverlap.textContent = '';
}

function overlapMessage(overlaps) {
  if (!overlaps.length) return '';
  const first = overlaps[0];
  const relation = first.relation === 'equal'
    ? 'uses the same prefix as'
    : first.relation === 'existing-broader'
      ? 'is more specific than'
      : 'is broader than';
  const extra = overlaps.length > 1 ? `, plus ${overlaps.length - 1} other overlapping rule${overlaps.length === 2 ? '' : 's'}` : '';
  return `Overlap: this prefix ${relation} ${first.type === 'smart' ? 'Smart Group' : 'workspace rule'} ${first.name}${extra}. Longest-prefix priority will decide the winner.`;
}

async function showSmartGroupOverlap() {
  const stored = await chrome.storage.local.get([SMART_GROUPS_STORAGE_KEY, TRAINED_RULES_STORAGE_KEY]);
  const groups = Array.isArray(stored[SMART_GROUPS_STORAGE_KEY]) ? stored[SMART_GROUPS_STORAGE_KEY] : [];
  const rules = Array.isArray(stored[TRAINED_RULES_STORAGE_KEY]) ? stored[TRAINED_RULES_STORAGE_KEY] : [];
  const existing = groups.find((group) => String(group.name || '').trim().toLowerCase() === smartGroupName.value.trim().toLowerCase());
  smartGroupOverlap.textContent = overlapMessage(overlappingUrlRules(
    smartGroupPattern.value,
    groups,
    rules,
    existing ? { type: 'smart', id: String(existing.id) } : {},
  ));
}

async function showClientRuleOverlap() {
  const stored = await chrome.storage.local.get([SMART_GROUPS_STORAGE_KEY, TRAINED_RULES_STORAGE_KEY]);
  const groups = Array.isArray(stored[SMART_GROUPS_STORAGE_KEY]) ? stored[SMART_GROUPS_STORAGE_KEY] : [];
  const rules = Array.isArray(stored[TRAINED_RULES_STORAGE_KEY]) ? stored[TRAINED_RULES_STORAGE_KEY] : [];
  clientRuleOverlap.textContent = overlapMessage(overlappingUrlRules(
    clientRulePattern.value,
    groups,
    rules,
    editingClientRulePattern
      ? { type: 'learned', id: clientRuleEpicId.value.trim(), pattern: editingClientRulePattern }
      : { type: 'learned' },
  ));
}

async function testUrlRules(value) {
  const stored = await chrome.storage.local.get([SMART_GROUPS_STORAGE_KEY, TRAINED_RULES_STORAGE_KEY]);
  const groups = Array.isArray(stored[SMART_GROUPS_STORAGE_KEY]) ? stored[SMART_GROUPS_STORAGE_KEY] : [];
  const rules = Array.isArray(stored[TRAINED_RULES_STORAGE_KEY]) ? stored[TRAINED_RULES_STORAGE_KEY] : [];
  const analysis = analyzeUrlRules(groups, rules, value);
  ruleTesterResult.replaceChildren();
  const summary = document.createElement('strong');
  summary.textContent = analysis.reason;
  ruleTesterResult.append(summary);
  if (!analysis.matches.length) return;
  const list = document.createElement('ol');
  analysis.matches.forEach((match, index) => {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${index === 0 ? 'Winner' : `Match ${index + 1}`}: ${match.type === 'smart' ? 'Smart Group' : 'Workspace'} ${match.name}`;
    const pattern = document.createElement('code');
    pattern.textContent = match.pattern;
    item.append(label, pattern);
    list.append(item);
  });
  ruleTesterResult.append(list);
}

function newSmartGroupId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `smart-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function renderSmartGroups() {
  const stored = await chrome.storage.local.get([
    SMART_GROUPS_STORAGE_KEY,
    SMART_GROUP_ORDER_STORAGE_KEY,
    BROWSER_PAGE_SMART_GROUP_STORAGE_KEY,
  ]);
  const groups = Array.isArray(stored[SMART_GROUPS_STORAGE_KEY]) ? stored[SMART_GROUPS_STORAGE_KEY] : [];
  renderBrowserPageSmartGroup(groups, stored[BROWSER_PAGE_SMART_GROUP_STORAGE_KEY]);
  const groupOrder = orderedSmartGroupIds(groups, stored[SMART_GROUP_ORDER_STORAGE_KEY]);
  const groupById = new Map(groups.map((group) => [String(group.id), group]));
  smartGroups.replaceChildren();
  if (!groups.length) {
    const empty = document.createElement('p');
    empty.className = 'field-help';
    empty.textContent = 'No Smart Groups yet. Add a URL prefix above to create one.';
    smartGroups.append(empty);
    return;
  }
  groupOrder
    .map((id) => groupById.get(id))
    .filter(Boolean)
    .forEach((group, groupIndex, orderedGroups) => {
      const disclosure = document.createElement('details');
      disclosure.className = 'smart-group';
      const summary = document.createElement('summary');
      const copy = document.createElement('div');
      copy.className = 'smart-group-summary-copy';
      const title = document.createElement('strong');
      title.textContent = group.name || 'Unnamed Smart Group';
      const count = document.createElement('small');
      const patternCount = smartGroupPatterns(group).length;
      count.textContent = `${group.focusMode ? 'Focus Group · ' : ''}${patternCount} URL prefix${patternCount === 1 ? '' : 'es'}`;
      copy.append(title, count);
      summary.append(copy);
      disclosure.append(summary);

      const renameForm = document.createElement('form');
      renameForm.className = 'smart-group-rename-form';
      renameForm.hidden = true;
      const renameLabel = document.createElement('label');
      renameLabel.textContent = 'Smart Group name';
      const renameInput = document.createElement('input');
      renameInput.type = 'text';
      renameInput.maxLength = 80;
      renameInput.value = group.name || '';
      renameInput.required = true;
      const renameActions = document.createElement('div');
      renameActions.className = 'actions';
      const renameSave = document.createElement('button');
      renameSave.type = 'submit';
      renameSave.textContent = 'Save';
      const renameCancel = document.createElement('button');
      renameCancel.type = 'button';
      renameCancel.className = 'secondary';
      renameCancel.textContent = 'Cancel';
      renameCancel.addEventListener('click', (event) => {
        event.preventDefault();
        renameForm.hidden = true;
        renameInput.value = group.name || '';
      });
      renameActions.append(renameSave, renameCancel);
      renameForm.append(renameLabel, renameInput, renameActions);
      renameForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        await renameSmartGroup(group.id, renameInput.value);
      });
      disclosure.append(renameForm);

      const patternList = document.createElement('div');
      patternList.className = 'smart-group-patterns';
      smartGroupPatterns(group)
        .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
        .forEach((pattern) => {
          const patternRow = document.createElement('div');
          patternRow.className = 'smart-group-pattern-row';
          const patternText = document.createElement('code');
          patternText.className = 'smart-group-pattern';
          patternText.textContent = pattern;
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'secondary smart-group-pattern-remove';
          remove.textContent = 'Remove URL';
          remove.addEventListener('click', async () => {
            const current = await chrome.storage.local.get([SMART_GROUPS_STORAGE_KEY, SMART_GROUP_ORDER_STORAGE_KEY]);
            const currentGroups = Array.isArray(current[SMART_GROUPS_STORAGE_KEY]) ? current[SMART_GROUPS_STORAGE_KEY] : [];
            const currentGroup = currentGroups.find((candidate) => candidate.id === group.id);
            if (!currentGroup) return;
            const remainingPatterns = smartGroupPatterns(currentGroup).filter((candidate) => candidate !== pattern);
            const next = remainingPatterns.length
              ? currentGroups.map((candidate) => candidate.id === group.id
                ? { ...candidate, patterns: remainingPatterns, updatedAt: new Date().toISOString() }
                : candidate)
              : currentGroups.filter((candidate) => candidate.id !== group.id);
            const nextStorage = { [SMART_GROUPS_STORAGE_KEY]: next };
            if (!remainingPatterns.length) {
              nextStorage[SMART_GROUP_ORDER_STORAGE_KEY] = (Array.isArray(current[SMART_GROUP_ORDER_STORAGE_KEY]) ? current[SMART_GROUP_ORDER_STORAGE_KEY] : [])
                .filter((id) => String(id) !== String(group.id));
            }
            await chrome.storage.local.set(nextStorage);
            smartGroupStatus.textContent = remainingPatterns.length
              ? `Removed ${pattern} from ${group.name || 'Smart Group'}.`
              : `Removed the last URL from ${group.name || 'Smart Group'}.`;
            await renderSmartGroups();
          });
          patternRow.append(patternText, remove);
          patternList.append(patternRow);
        });
      disclosure.append(patternList);

      const orderActions = document.createElement('div');
      orderActions.className = 'smart-group-order-actions';
      const rename = document.createElement('button');
      rename.type = 'button';
      rename.className = 'secondary smart-group-rename-button';
      rename.textContent = 'Rename';
      rename.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        disclosure.open = true;
        renameForm.hidden = false;
        renameInput.focus();
        renameInput.select();
      });
      const focusSetting = document.createElement('label');
      focusSetting.className = 'toggle-row smart-group-focus-setting';
      const focusCopy = document.createElement('span');
      const focusTitle = document.createElement('strong');
      focusTitle.textContent = 'Use as Focus Group';
      const focusHelp = document.createElement('small');
      focusHelp.textContent = 'Keep manually placed tabs here until you drag them out. Only one Smart Group can use Focus behavior.';
      focusCopy.append(focusTitle, focusHelp);
      const focusMode = document.createElement('input');
      focusMode.type = 'checkbox';
      focusMode.checked = group.focusMode === true;
      focusMode.setAttribute('aria-label', `Use ${group.name || 'this Smart Group'} as the Focus Group`);
      focusMode.addEventListener('change', async () => {
        const current = await chrome.storage.local.get(SMART_GROUPS_STORAGE_KEY);
        const currentGroups = Array.isArray(current[SMART_GROUPS_STORAGE_KEY]) ? current[SMART_GROUPS_STORAGE_KEY] : [];
        const enabling = focusMode.checked;
        await chrome.storage.local.set({
          [SMART_GROUPS_STORAGE_KEY]: currentGroups.map((candidate) => ({
            ...candidate,
            focusMode: enabling && String(candidate.id) === String(group.id),
            updatedAt: String(candidate.id) === String(group.id) ? new Date().toISOString() : candidate.updatedAt,
          })),
        });
        smartGroupStatus.textContent = enabling
          ? `${group.name} is now the Focus Group. Tabs dragged into it will stay until moved out.`
          : `${group.name} is now a standard Smart Group.`;
        await renderSmartGroups();
      });
      focusSetting.append(focusCopy, focusMode);
      disclosure.append(focusSetting);
      const moveUp = document.createElement('button');
      moveUp.type = 'button';
      moveUp.className = 'secondary smart-group-order-button';
      moveUp.textContent = '↑';
      moveUp.title = `Move ${group.name || 'Smart Group'} up`;
      moveUp.setAttribute('aria-label', `Move ${group.name || 'Smart Group'} up`);
      moveUp.disabled = groupIndex === 0;
      moveUp.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        moveSmartGroup(group.id, -1);
      });
      const moveDown = document.createElement('button');
      moveDown.type = 'button';
      moveDown.className = 'secondary smart-group-order-button';
      moveDown.textContent = '↓';
      moveDown.title = `Move ${group.name || 'Smart Group'} down`;
      moveDown.setAttribute('aria-label', `Move ${group.name || 'Smart Group'} down`);
      moveDown.disabled = groupIndex === orderedGroups.length - 1;
      moveDown.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        moveSmartGroup(group.id, 1);
      });
      orderActions.append(rename, moveUp, moveDown);
      disclosure.append(orderActions);

      smartGroups.append(disclosure);
    });
}

function renderBrowserPageSmartGroup(groups, selectedId) {
  const standardGroups = (Array.isArray(groups) ? groups : [])
    .filter((group) => group?.focusMode !== true)
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), undefined, { sensitivity: 'base' }));
  browserPageSmartGroupInput.replaceChildren();
  const ignored = document.createElement('option');
  ignored.value = '';
  ignored.textContent = 'Ignore browser pages';
  browserPageSmartGroupInput.append(ignored);
  standardGroups.forEach((group) => {
    const option = document.createElement('option');
    option.value = String(group.id);
    option.textContent = group.name || 'Unnamed Smart Group';
    browserPageSmartGroupInput.append(option);
  });
  const selectedGroup = browserPageSmartGroup(standardGroups, selectedId);
  browserPageSmartGroupInput.value = selectedGroup ? String(selectedGroup.id) : '';
  browserPageSmartGroupInput.disabled = standardGroups.length === 0;
}

windowModeAll.addEventListener('change', updateWindowAutomationControls);
windowModeSelected.addEventListener('change', updateWindowAutomationControls);

browserPageSmartGroupInput.addEventListener('change', async () => {
  const groupId = browserPageSmartGroupInput.value;
  if (groupId) {
    await chrome.storage.local.set({ [BROWSER_PAGE_SMART_GROUP_STORAGE_KEY]: groupId });
  } else {
    await chrome.storage.local.remove(BROWSER_PAGE_SMART_GROUP_STORAGE_KEY);
  }
  await chrome.runtime.sendMessage({ type: 'SYNC_NOW' });
  const selected = browserPageSmartGroupInput.selectedOptions[0]?.textContent;
  browserPageSmartGroupStatus.textContent = groupId
    ? `Browser pages will join ${selected}. Existing Chrome pages were re-evaluated.`
    : 'Browser pages will stay visible but will not count as unassigned.';
});

windowAutomationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const selectedWindowIds = [...windowAutomationList.querySelectorAll('input[type="checkbox"]:checked')]
    .map((input) => Number(input.value))
    .filter(Number.isInteger);
  const response = await chrome.runtime.sendMessage({
    type: 'SET_WINDOW_AUTOMATION_POLICY',
    mode: windowModeSelected.checked ? 'selected' : 'all',
    selectedWindowIds,
  });
  windowAutomationStatus.textContent = response?.message || 'Window automation settings could not be saved.';
});

refreshWindowList.addEventListener('click', () => {
  loadWindowAutomationPolicy()
    .then(() => { windowAutomationStatus.textContent = 'Refreshed the open Chrome windows.'; })
    .catch((error) => { windowAutomationStatus.textContent = error.message; });
});

changeTemporaryActivationShortcut.addEventListener('click', async () => {
  try {
    await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    temporaryActivationShortcutStatus.textContent = 'Set the Tab Bundlr shortcut in Chrome, then return here to see the updated binding.';
  } catch {
    temporaryActivationShortcutStatus.textContent = 'Open chrome://extensions/shortcuts to change the binding.';
  }
});

changePreviousTabShortcut.addEventListener('click', async () => {
  try {
    await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    previousTabShortcutStatus.textContent = 'Set the Tab Bundlr shortcut in Chrome, then return here to see the updated binding.';
  } catch {
    previousTabShortcutStatus.textContent = 'Open chrome://extensions/shortcuts to change the binding.';
  }
});

window.addEventListener('focus', () => {
  Promise.all([
    loadTemporaryActivationShortcut(),
    loadPreviousTabShortcut(),
  ]).catch(() => {
    temporaryActivationShortcut.textContent = 'Unavailable';
    previousTabShortcut.textContent = 'Unavailable';
  });
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await chrome.storage.local.set({
    [ENABLED_STORAGE_KEY]: enabledInput.checked,
    [OPENER_INHERITANCE_STORAGE_KEY]: openerInheritanceInput.checked,
    [HOME_BASE_DUPLICATE_ACTION_STORAGE_KEY]: homeBaseDuplicateActionFromStorage(homeBaseDuplicateActionInput.value),
    [ACTIVATE_OPENED_TABS_STORAGE_KEY]: activateOpenedTabsInput.checked,
    [PREVIOUS_TAB_MODE_STORAGE_KEY]: previousTabModeFromStorage(previousTabMode.value),
    [AUTO_ORGANIZE_GROUPS_STORAGE_KEY]: autoOrganizeGroupsInput.checked,
  });
  status.textContent = enabledInput.checked ? 'Saved. Automatic grouping is on.' : 'Saved. Automatic grouping is off.';
});

clientRuleForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = normalizeEpicName(clientRuleName.value);
  const epicId = clientRuleEpicId.value.trim();
  const pattern = trainingPatternForUrl(clientRulePattern.value.trim());
  if (!name || name === 'Unnamed Workspace' || !epicId || !pattern) {
    clientRuleStatus.textContent = 'Add a workspace name, workspace ID, and valid http or https URL prefix.';
    return;
  }
  const stored = await chrome.storage.local.get(TRAINED_RULES_STORAGE_KEY);
  const rules = Array.isArray(stored[TRAINED_RULES_STORAGE_KEY]) ? stored[TRAINED_RULES_STORAGE_KEY] : [];
  const patternKey = clientRulePatternKey(pattern);
  const editingPatternKey = clientRulePatternKey(editingClientRulePattern);
  const conflict = rules.find((rule) => (
    clientRulePatternKey(rule.pattern) === patternKey
    && (!editingPatternKey || clientRulePatternKey(rule.pattern) !== editingPatternKey)
  ));
  if (conflict) {
    clientRuleStatus.textContent = `That URL prefix is already assigned to ${conflict.epicName || 'another workspace'}.`;
    return;
  }
  const next = rules
    .filter((rule) => {
      const ruleKey = clientRulePatternKey(rule.pattern);
      return ruleKey !== editingPatternKey && ruleKey !== patternKey;
    })
    .concat({
      pattern,
      epicId,
      epicName: name,
      roleLabel: tabRoleLabel(tabRoleForUrl(pattern)),
      updatedAt: new Date().toISOString(),
    });
  await chrome.storage.local.set({ [TRAINED_RULES_STORAGE_KEY]: next });
  const message = editingClientRulePattern ? `Updated the rule for ${name}.` : `Added a workspace link rule for ${name}.`;
  resetClientRuleForm();
  clientRuleStatus.textContent = message;
  await renderTrainedRules();
});

clientRuleCancel.addEventListener('click', resetClientRuleForm);

clientRulePattern.addEventListener('change', () => showClientRuleOverlap().catch(() => {}));
clientRuleEpicId.addEventListener('change', () => showClientRuleOverlap().catch(() => {}));
smartGroupPattern.addEventListener('change', () => showSmartGroupOverlap().catch(() => {}));
smartGroupName.addEventListener('change', () => showSmartGroupOverlap().catch(() => {}));

ruleTesterForm.addEventListener('submit', (event) => {
  event.preventDefault();
  testUrlRules(ruleTesterUrl.value).catch((error) => {
    ruleTesterResult.textContent = error instanceof Error ? error.message : 'The URL could not be tested.';
  });
});

exportSettingsButton.addEventListener('click', () => {
  exportSettings().catch((error) => {
    backupStatus.textContent = error instanceof Error ? error.message : 'The settings backup could not be exported.';
  });
});

importSettingsInput.addEventListener('change', () => {
  importSettings(importSettingsInput.files?.[0]).catch((error) => {
    backupStatus.textContent = error instanceof Error ? error.message : 'The settings backup could not be imported.';
  });
});

copyBackupButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(backupPreview.textContent || '');
    backupStatus.textContent = 'Copied the exported JSON to the clipboard.';
  } catch {
    backupStatus.textContent = 'The JSON is visible above, but could not be copied automatically.';
  }
});

workspaceSourceForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const source = normalizeWorkspaceSource({
      ...JSON.parse(workspaceSourceJson.value),
      enabled: false,
    });
    const stored = await chrome.storage.local.get(WORKSPACE_SOURCES_STORAGE_KEY);
    const sources = normalizeWorkspaceSources(stored[WORKSPACE_SOURCES_STORAGE_KEY]);
    await chrome.storage.local.set({
      [WORKSPACE_SOURCES_STORAGE_KEY]: [...sources.filter((candidate) => candidate.id !== source.id), source],
    });
    showWorkspaceSourceStatus(`Saved ${source.name} off. Review its service addresses and credentials before turning it on.`, 'success');
    workspaceSourceJson.value = '';
    await renderWorkspaceSources();
  } catch (error) {
    showWorkspaceSourceStatus(error instanceof Error ? error.message : 'That connection JSON is invalid.', 'error');
  }
});

workspaceSourceClear.addEventListener('click', () => {
  workspaceSourceJson.value = '';
  workspaceSourceStatus.textContent = '';
  workspaceSourceStatus.dataset.tone = 'info';
});

sourcePermissionCancel.addEventListener('click', () => {
  pendingSourceAccess = null;
  sourcePermissionDialog.close();
  showWorkspaceSourceStatus('Connection access was not requested.');
});

sourcePermissionDialog.addEventListener('cancel', () => {
  pendingSourceAccess = null;
  showWorkspaceSourceStatus('Connection access was not requested.');
});

sourcePermissionContinue.addEventListener('click', async () => {
  const source = pendingSourceAccess;
  if (!source) {
    sourcePermissionDialog.close();
    return;
  }
  sourcePermissionContinue.disabled = true;
  try {
    const updated = await applyWorkspaceSourceState(source, true, `${source.name} is on and can use its approved service addresses.`);
    if (updated) {
      pendingSourceAccess = null;
      sourcePermissionDialog.close();
    }
  } finally {
    sourcePermissionContinue.disabled = false;
  }
});

smartGroupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = normalizeEpicName(smartGroupName.value);
  const pattern = trainingPatternForUrl(smartGroupPattern.value.trim());
  if (!name || name === 'Unnamed Workspace') {
    smartGroupStatus.textContent = 'Add a name for this Smart Group.';
    return;
  }
  if (!pattern) {
    smartGroupStatus.textContent = 'Use an http or https URL prefix.';
    return;
  }

  const stored = await chrome.storage.local.get([SMART_GROUPS_STORAGE_KEY, SMART_GROUP_ORDER_STORAGE_KEY]);
  const groups = Array.isArray(stored[SMART_GROUPS_STORAGE_KEY]) ? stored[SMART_GROUPS_STORAGE_KEY] : [];
  const owner = groups.find((group) => smartGroupPatterns(group).includes(pattern));
  const existing = groups.find((group) => String(group.name || '').toLowerCase() === name.toLowerCase());
  if (owner && owner.id !== existing?.id) {
    smartGroupStatus.textContent = `That URL prefix is already assigned to ${owner.name || 'another Smart Group'}.`;
    return;
  }
  if (existing) {
    if (smartGroupPatterns(existing).includes(pattern)) {
      smartGroupStatus.textContent = `${existing.name} already covers that URL prefix.`;
      return;
    }
    existing.patterns = [...smartGroupPatterns(existing), pattern];
    existing.updatedAt = new Date().toISOString();
    await chrome.storage.local.set({ [SMART_GROUPS_STORAGE_KEY]: groups });
    smartGroupStatus.textContent = `Added another URL prefix to ${existing.name}.`;
  } else {
    const id = newSmartGroupId();
    groups.push({
      id,
      name,
      patterns: [pattern],
      focusMode: false,
      updatedAt: new Date().toISOString(),
    });
    await chrome.storage.local.set({
      [SMART_GROUPS_STORAGE_KEY]: groups,
      [SMART_GROUP_ORDER_STORAGE_KEY]: [...orderedSmartGroupIds(groups.slice(0, -1), stored[SMART_GROUP_ORDER_STORAGE_KEY]), id],
    });
    smartGroupStatus.textContent = `Created ${name}. Matching tabs will join it.`;
  }
  smartGroupPattern.value = '';
  smartGroupOverlap.textContent = '';
  await renderSmartGroups();
});

loadSettings().catch(() => {
  enabledInput.checked = false;
  status.textContent = 'Settings could not be loaded. Reload this page and try again.';
});

loadTemporaryActivationShortcut().catch(() => {
  temporaryActivationShortcut.textContent = 'Unavailable';
  temporaryActivationShortcutStatus.textContent = 'Open Chrome extension shortcuts to review the current binding.';
});

loadPreviousTabShortcut().catch(() => {
  previousTabShortcut.textContent = 'Unavailable';
  previousTabShortcutStatus.textContent = 'Open Chrome extension shortcuts to review the current binding.';
});

loadWindowAutomationPolicy().catch((error) => {
  windowAutomationStatus.textContent = error.message;
});

renderTrainedRules().catch(() => {
  trainedRules.textContent = 'Saved workspace rules could not be loaded. Reload this page and try again.';
});

renderSmartGroups().catch(() => {
  smartGroups.textContent = 'Smart Groups could not be loaded.';
});

renderManagedGroupOrder().catch(() => {
  managedGroupTypeOrder.textContent = 'Managed group order could not be loaded.';
});

renderWorkspaceSources().catch(() => {
  workspaceSourcesElement.textContent = 'Optional connections could not be loaded. Reload this page and try again.';
});
