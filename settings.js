import { ENABLED_STORAGE_KEY, TOKEN_STORAGE_KEY } from './core.js';
import {
  CURRENT_SETTINGS_VERSION,
  DEFAULT_OPENER_INHERITANCE,
  HOME_BASE_DUPLICATE_ACTION_STORAGE_KEY,
  HOME_BASE_DUPLICATE_REMOVE_EXACT,
  HOME_BASE_DUPLICATE_REVIEW,
  OPENER_INHERITANCE_STORAGE_KEY,
  SETTINGS_VERSION_STORAGE_KEY,
  WORKSPACE_SOURCE_SECRETS_STORAGE_KEY,
  WORKSPACE_SOURCES_STORAGE_KEY,
  normalizeWorkspaceSources,
  shortcutWorkspaceSource,
} from './sources.js';

const LEGACY_PROFILE_KEYS = [
  TOKEN_STORAGE_KEY,
  ENABLED_STORAGE_KEY,
  'smartGroups',
  'trainedRules',
  'savedClientGroups',
  'clientCatalog',
  'persistentHomeBases',
  'managedGroupTypeEnabled',
];

const MIGRATION_STORAGE_KEYS = [
  SETTINGS_VERSION_STORAGE_KEY,
  WORKSPACE_SOURCES_STORAGE_KEY,
  WORKSPACE_SOURCE_SECRETS_STORAGE_KEY,
  HOME_BASE_DUPLICATE_ACTION_STORAGE_KEY,
  OPENER_INHERITANCE_STORAGE_KEY,
  ...LEGACY_PROFILE_KEYS,
];

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function legacyWorkspaceSlug(token) {
  return /^sct_(?:r|rw)_([^_]+)_/i.exec(String(token || '').trim())?.[1] || 'workspace';
}

export function homeBaseDuplicateActionFromStorage(value) {
  return value === HOME_BASE_DUPLICATE_REMOVE_EXACT
    ? HOME_BASE_DUPLICATE_REMOVE_EXACT
    : HOME_BASE_DUPLICATE_REVIEW;
}

export function openerInheritanceFromStorage(value) {
  return value === undefined ? DEFAULT_OPENER_INHERITANCE : value === true;
}

export function migrateLegacySettings(stored) {
  const source = plainObject(stored);
  if (Number(source[SETTINGS_VERSION_STORAGE_KEY]) >= CURRENT_SETTINGS_VERSION) {
    return {
      migrated: false,
      freshInstall: false,
      settings: {
        [SETTINGS_VERSION_STORAGE_KEY]: CURRENT_SETTINGS_VERSION,
        [WORKSPACE_SOURCES_STORAGE_KEY]: normalizeWorkspaceSources(source[WORKSPACE_SOURCES_STORAGE_KEY]),
        [WORKSPACE_SOURCE_SECRETS_STORAGE_KEY]: plainObject(source[WORKSPACE_SOURCE_SECRETS_STORAGE_KEY]),
        [HOME_BASE_DUPLICATE_ACTION_STORAGE_KEY]: homeBaseDuplicateActionFromStorage(source[HOME_BASE_DUPLICATE_ACTION_STORAGE_KEY]),
        [OPENER_INHERITANCE_STORAGE_KEY]: openerInheritanceFromStorage(source[OPENER_INHERITANCE_STORAGE_KEY]),
      },
      removeKeys: [],
    };
  }

  const legacyInstall = LEGACY_PROFILE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(source, key));
  const token = String(source[TOKEN_STORAGE_KEY] || '').trim();
  // The pre-v2 token convention carried the workspace slug. Migration exposes that value as profile data.
  const workspaceSources = legacyInstall ? [shortcutWorkspaceSource({
    enabled: Boolean(token),
    workspaceSlug: legacyWorkspaceSlug(token),
  })] : [];
  return {
    migrated: true,
    freshInstall: !legacyInstall,
    settings: {
      [SETTINGS_VERSION_STORAGE_KEY]: CURRENT_SETTINGS_VERSION,
      [ENABLED_STORAGE_KEY]: legacyInstall
        ? source[ENABLED_STORAGE_KEY] !== false
        : false,
      [WORKSPACE_SOURCES_STORAGE_KEY]: workspaceSources,
      [WORKSPACE_SOURCE_SECRETS_STORAGE_KEY]: token ? { shortcut: { apiToken: token } } : {},
      [HOME_BASE_DUPLICATE_ACTION_STORAGE_KEY]: legacyInstall
        ? HOME_BASE_DUPLICATE_REMOVE_EXACT
        : HOME_BASE_DUPLICATE_REVIEW,
      [OPENER_INHERITANCE_STORAGE_KEY]: DEFAULT_OPENER_INHERITANCE,
    },
    removeKeys: token ? [TOKEN_STORAGE_KEY] : [],
  };
}

export async function ensureSettingsMigrated(storageArea) {
  const stored = await storageArea.get(MIGRATION_STORAGE_KEYS);
  const migration = migrateLegacySettings(stored);
  await storageArea.set(migration.settings);
  if (migration.removeKeys.length) await storageArea.remove(migration.removeKeys);
  return migration;
}
