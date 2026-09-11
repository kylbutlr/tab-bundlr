import {
  ACTIVATE_OPENED_TABS_STORAGE_KEY,
  AUTO_ORGANIZE_GROUPS_STORAGE_KEY,
  BROWSER_PAGE_SMART_GROUP_STORAGE_KEY,
  CHROME_GROUP_COLORS,
  CLIENT_CATALOG_STORAGE_KEY,
  DEFAULT_STALE_TAB_DAYS,
  ENABLED_STORAGE_KEY,
  MANAGED_GROUP_COLORS_STORAGE_KEY,
  MANAGED_GROUP_TYPE_ENABLED_STORAGE_KEY,
  MANAGED_GROUP_TYPE_ORDER_STORAGE_KEY,
  PERSISTENT_HOME_BASES_STORAGE_KEY,
  PREVIOUS_TAB_MODE_STORAGE_KEY,
  SAVED_CLIENT_GROUPS_STORAGE_KEY,
  SMART_GROUPS_STORAGE_KEY,
  SMART_GROUP_ORDER_STORAGE_KEY,
  STALE_TAB_DAY_OPTIONS,
  STALE_TAB_DAYS_STORAGE_KEY,
  TRAINED_RULES_STORAGE_KEY,
  UNIQUE_AUTO_COLOR,
  WINDOW_AUTOMATION_PREFERENCE_STORAGE_KEY,
  normalizeEpicName,
  normalizeManagedGroupTypeEnabled,
  normalizePersistentHomeBases,
  previousTabModeFromStorage,
  normalizeWindowAutomationPreference,
  orderedManagedGroupTypes,
  smartGroupPatterns,
} from './core.js';
import {
  CURRENT_SETTINGS_VERSION,
  HOME_BASE_DUPLICATE_ACTION_STORAGE_KEY,
  OPENER_INHERITANCE_STORAGE_KEY,
  SETTINGS_VERSION_STORAGE_KEY,
  WORKSPACE_SOURCE_SECRETS_STORAGE_KEY,
  WORKSPACE_SOURCES_STORAGE_KEY,
  normalizeWorkspaceSources,
} from './sources.js';
import { homeBaseDuplicateActionFromStorage, openerInheritanceFromStorage } from './settings.js';

export const BACKUP_FORMAT = 'tab-bundlr-settings';
export const BACKUP_VERSION = 2;

export function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function normalizeBackupSettings(raw) {
  const source = plainObject(raw);
  const colors = plainObject(source[MANAGED_GROUP_COLORS_STORAGE_KEY]);
  const normalizedColors = Object.fromEntries(Object.entries(colors)
    .filter(([key, value]) => ['client', 'iteration', 'smart', 'focus-smart'].includes(key)
      && (value === null || value === UNIQUE_AUTO_COLOR || CHROME_GROUP_COLORS.includes(value))));
  const smartGroupCandidates = (Array.isArray(source[SMART_GROUPS_STORAGE_KEY]) ? source[SMART_GROUPS_STORAGE_KEY] : [])
    .map((group) => ({
      id: String(group?.id || '').trim(),
      name: normalizeEpicName(group?.name),
      patterns: smartGroupPatterns(group),
      requestedFocusMode: group?.focusMode === true,
      updatedAt: group?.updatedAt || new Date().toISOString(),
    }))
    .filter((group) => group.id && group.name !== 'Unnamed Workspace' && group.patterns.length);
  let focusModeAssigned = false;
  const smartGroups = smartGroupCandidates.map(({ requestedFocusMode, ...group }) => ({
    ...group,
    focusMode: requestedFocusMode && !focusModeAssigned
      ? (focusModeAssigned = true)
      : false,
  }));
  const trainedRules = (Array.isArray(source[TRAINED_RULES_STORAGE_KEY]) ? source[TRAINED_RULES_STORAGE_KEY] : [])
    .map((rule) => ({
      pattern: String(rule?.pattern || '').trim(),
      epicId: String(rule?.epicId || '').trim(),
      epicName: normalizeEpicName(rule?.epicName),
      roleLabel: String(rule?.roleLabel || 'Web'),
      updatedAt: rule?.updatedAt || new Date().toISOString(),
    }))
    .filter((rule) => rule.pattern && rule.epicId && rule.epicName !== 'Unnamed Workspace');
  const hasSavedClientGroups = Array.isArray(source[SAVED_CLIENT_GROUPS_STORAGE_KEY]);
  const savedClientGroups = (hasSavedClientGroups
    ? source[SAVED_CLIENT_GROUPS_STORAGE_KEY]
    : Array.isArray(source[CLIENT_CATALOG_STORAGE_KEY]) ? source[CLIENT_CATALOG_STORAGE_KEY] : [])
    .map((entry) => ({
      epicId: String(entry?.epicId || '').trim(),
      epicName: String(entry?.epicName || '').trim(),
      archived: entry?.archived === true,
      curated: entry?.curated === true,
      updatedAt: entry?.updatedAt || new Date().toISOString(),
    }))
    .filter((entry) => entry.epicId && entry.epicName)
    .filter((entry) => hasSavedClientGroups || entry.curated || trainedRules.some((rule) => rule.epicId === entry.epicId))
    .map(({ epicId, epicName, archived, updatedAt }) => ({ epicId, epicName, archived, updatedAt }));
  const staleDays = Number(source[STALE_TAB_DAYS_STORAGE_KEY]);
  const browserPageSmartGroupId = String(source[BROWSER_PAGE_SMART_GROUP_STORAGE_KEY] || '').trim();
  return {
    [SETTINGS_VERSION_STORAGE_KEY]: CURRENT_SETTINGS_VERSION,
    [ENABLED_STORAGE_KEY]: source[ENABLED_STORAGE_KEY] !== false,
    [OPENER_INHERITANCE_STORAGE_KEY]: openerInheritanceFromStorage(source[OPENER_INHERITANCE_STORAGE_KEY]),
    [HOME_BASE_DUPLICATE_ACTION_STORAGE_KEY]: homeBaseDuplicateActionFromStorage(source[HOME_BASE_DUPLICATE_ACTION_STORAGE_KEY]),
    [WORKSPACE_SOURCES_STORAGE_KEY]: normalizeWorkspaceSources(source[WORKSPACE_SOURCES_STORAGE_KEY]),
    [ACTIVATE_OPENED_TABS_STORAGE_KEY]: source[ACTIVATE_OPENED_TABS_STORAGE_KEY] === true,
    [PREVIOUS_TAB_MODE_STORAGE_KEY]: previousTabModeFromStorage(source[PREVIOUS_TAB_MODE_STORAGE_KEY]),
    [AUTO_ORGANIZE_GROUPS_STORAGE_KEY]: source[AUTO_ORGANIZE_GROUPS_STORAGE_KEY] === true,
    [WINDOW_AUTOMATION_PREFERENCE_STORAGE_KEY]: normalizeWindowAutomationPreference(
      source[WINDOW_AUTOMATION_PREFERENCE_STORAGE_KEY],
    ),
    [STALE_TAB_DAYS_STORAGE_KEY]: STALE_TAB_DAY_OPTIONS.includes(staleDays) ? staleDays : DEFAULT_STALE_TAB_DAYS,
    [MANAGED_GROUP_COLORS_STORAGE_KEY]: normalizedColors,
    [MANAGED_GROUP_TYPE_ENABLED_STORAGE_KEY]: normalizeManagedGroupTypeEnabled(source[MANAGED_GROUP_TYPE_ENABLED_STORAGE_KEY]),
    [MANAGED_GROUP_TYPE_ORDER_STORAGE_KEY]: orderedManagedGroupTypes(source[MANAGED_GROUP_TYPE_ORDER_STORAGE_KEY]),
    [BROWSER_PAGE_SMART_GROUP_STORAGE_KEY]: smartGroups.some((group) => (
      group.focusMode !== true && String(group.id) === browserPageSmartGroupId
    )) ? browserPageSmartGroupId : '',
    [PERSISTENT_HOME_BASES_STORAGE_KEY]: normalizePersistentHomeBases(source[PERSISTENT_HOME_BASES_STORAGE_KEY]),
    [SMART_GROUP_ORDER_STORAGE_KEY]: [...new Set(Array.isArray(source[SMART_GROUP_ORDER_STORAGE_KEY]) ? source[SMART_GROUP_ORDER_STORAGE_KEY].map(String) : [])],
    [SMART_GROUPS_STORAGE_KEY]: smartGroups,
    [TRAINED_RULES_STORAGE_KEY]: trainedRules,
    [SAVED_CLIENT_GROUPS_STORAGE_KEY]: savedClientGroups,
  };
}

export function createBackup(stored, exportedAt = new Date().toISOString()) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    settings: normalizeBackupSettings(stored),
  };
}

export function mergeBackupSettings(current, imported) {
  const importedObject = plainObject(imported);
  const merged = {
    ...plainObject(current),
    ...importedObject,
  };
  if (Array.isArray(importedObject[WORKSPACE_SOURCES_STORAGE_KEY])) {
    merged[WORKSPACE_SOURCES_STORAGE_KEY] = importedObject[WORKSPACE_SOURCES_STORAGE_KEY]
      .map((source) => ({ ...plainObject(source), enabled: false }));
  }
  delete merged.shortcutReadToken;
  delete merged.workspaceSourceSecrets;
  if (!Array.isArray(importedObject[SAVED_CLIENT_GROUPS_STORAGE_KEY])
    && Array.isArray(importedObject[CLIENT_CATALOG_STORAGE_KEY])) {
    const importedRules = Array.isArray(importedObject[TRAINED_RULES_STORAGE_KEY])
      ? importedObject[TRAINED_RULES_STORAGE_KEY]
      : [];
    const importedEpicIds = new Set(importedRules.map((rule) => String(rule?.epicId || '').trim()));
    merged[SAVED_CLIENT_GROUPS_STORAGE_KEY] = importedObject[CLIENT_CATALOG_STORAGE_KEY]
      .filter((entry) => entry?.curated === true || importedEpicIds.has(String(entry?.epicId || '').trim()));
  }
  return normalizeBackupSettings({
    ...merged,
  });
}

export function settingsImportChanges(current, imported) {
  return {
    ...mergeBackupSettings(current, imported),
    [WORKSPACE_SOURCE_SECRETS_STORAGE_KEY]: {},
  };
}

export function backupJson(stored, exportedAt = new Date().toISOString()) {
  return JSON.stringify(createBackup(stored, exportedAt), null, 2);
}
