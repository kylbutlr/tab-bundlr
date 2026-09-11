import {
  ACTIVITY_HISTORY_STORAGE_KEY,
  ACTIVATE_OPENED_TABS_STORAGE_KEY,
  AUTO_ORGANIZE_GROUPS_STORAGE_KEY,
  BROWSER_PAGE_SMART_GROUP_STORAGE_KEY,
  CLIENT_CATALOG_STORAGE_KEY,
  DEFAULT_ENABLED,
  DEFAULT_AUTO_ORGANIZE_GROUPS,
  ENABLED_STORAGE_KEY,
  FOCUS_HELD_TABS_STORAGE_KEY,
  FOCUS_GROUPS_STORAGE_KEY,
  GROUP_RECORDS_STORAGE_KEY,
  LAST_ACTION_STORAGE_KEY,
  MANAGED_GROUP_COLORS_STORAGE_KEY,
  MANAGED_GROUP_TYPE_ENABLED_STORAGE_KEY,
  MANAGED_GROUP_TYPE_ORDER_STORAGE_KEY,
  PAUSED_WINDOW_IDS_STORAGE_KEY,
  PERSISTENT_HOME_BASE_ANCHORS_STORAGE_KEY,
  PERSISTENT_HOME_BASES_STORAGE_KEY,
  PREVIOUS_TAB_COMMAND,
  PREVIOUS_TAB_MODE_STORAGE_KEY,
  SELECTED_WINDOW_IDS_STORAGE_KEY,
  SMART_GROUPS_STORAGE_KEY,
  SMART_GROUP_ORDER_STORAGE_KEY,
  SAVED_CLIENT_GROUPS_STORAGE_KEY,
  TAB_CONTEXTS_STORAGE_KEY,
  TAB_ACTIVATION_HISTORY_STORAGE_KEY,
  TEMPORARY_ACTIVATION_COMMAND,
  TEMPORARY_ACTIVATION_OVERRIDE_DURATION_MS,
  TEMPORARY_ACTIVATION_OVERRIDE_UNTIL_STORAGE_KEY,
  TRAINED_RULES_STORAGE_KEY,
  WINDOW_AUTOMATION_MODE_STORAGE_KEY,
  WINDOW_AUTOMATION_PREFERENCE_STORAGE_KEY,
  appendActivityHistory,
  bestTrainedRuleForUrl,
  bestSmartGroupRuleForUrl,
  bestUrlAssignmentForUrl,
  browserPageSmartGroup,
  canInheritOpenerForTab,
  clientRulePatternKey,
  collisionGroupTitle,
  diagnoseTabAssignment,
  duplicateKeyForUrl,
  externalTabDestinationWindowId,
  activateOpenedTabsFromStorage,
  effectiveActivateOpenedTabs,
  enabledFromStorage,
  focusSmartGroup,
  focusGroupWorkspaceId,
  groupRecordKey,
  isTabEligibleForManualFix,
  isRelevantTabUpdate,
  isBrowserPageUrl,
  managedColorForWorkspace,
  managedGroupTypeIsEnabled,
  managedGroupTitle,
  managedWorkspaceType,
  normalizeEpicName,
  normalizeFocusGroups,
  normalizeManagedGroupTypeEnabled,
  normalizePersistentHomeBases,
  normalizeTabActivationHistory,
  normalizeWindowAutomationPolicy,
  normalizeWindowAutomationPreference,
  normalizeActivityHistory,
  overlappingUrlRules,
  orderedSmartGroupIds,
  persistentHomeBaseForUrl,
  previousTabModeFromStorage,
  previousTabTarget,
  recordTabActivation,
  removeTabFromActivationHistory,
  removeWindowFromActivationHistory,
  setTabActivationHistoryCursor,
  smartGroupWorkspaceId,
  smartGroupPatterns,
  shouldPauseWindowAfterDetachedTab,
  sortManagedGroupRecords,
  tabContextForEpic,
  tabRoleForUrl,
  tabRoleLabel,
  temporaryActivationSecondsRemaining,
  summarizeGroups,
  trainingPatternForUrl,
  restoredWindowAutomationPolicy,
  windowAllowedByPolicy,
} from './core.js';
import {
  HOME_BASE_DUPLICATE_ACTION_STORAGE_KEY,
  HOME_BASE_DUPLICATE_REMOVE_EXACT,
  OPENER_INHERITANCE_STORAGE_KEY,
  WORKSPACE_SOURCE_SECRETS_STORAGE_KEY,
  WORKSPACE_SOURCES_STORAGE_KEY,
  matchingWorkspaceSources,
  normalizeWorkspaceSources,
  resolveWorkspaceSourceMatch,
} from './sources.js';
import {
  ensureSettingsMigrated,
  homeBaseDuplicateActionFromStorage,
  openerInheritanceFromStorage,
} from './settings.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const ERROR_TTL_MS = 30 * 1000;
const EXTERNAL_TAB_ROUTE_CANDIDATE_TTL_MS = 10 * 1000;
const MAX_API_CONCURRENCY = 4;
const SESSION_RECONCILED_STORAGE_KEY = 'sessionReconciled';
const PERSISTENT_HOME_BASES_RECONCILED_STORAGE_KEY = 'persistentHomeBasesReconciled';
const workspaceSourceCache = new Map();
const groupEnsureRequests = new Map();
const tabProcessing = new Map();
const inFlightGroupMoves = new Set();
const groupOrganizationRequests = new Map();
const detachedTabOrigins = new Map();
const pendingExternalTabRoutes = new Map();
const freshExternalGroupTabs = new Map();
const pendingFreshExternalGroups = new Map();
const pausedWindowIds = new Set();
const ignoredTabActivationTargets = new Map();
let windowAutomationPolicy = normalizeWindowAutomationPolicy();
let tabActivationHistory = {};
const localSnapshotRequests = new Map();
const persistentHomeBaseRequests = new Map();
let temporaryActivationBadgeTimer = null;
let tabActivationHistoryWrite = Promise.resolve();
let lastActionWrite = Promise.resolve();
let focusHeldTabsWrite = Promise.resolve();
let persistentHomeBaseAnchorsWrite = Promise.resolve();
let focusHeldTabsReconcileRequest = null;
let focusHeldTabsReconcileAgain = false;
let sessionInitializationRequest = null;
const settingsMigrationReady = ensureSettingsMigrated(chrome.storage.local).catch(() => null);
const pausedWindowIdsReady = chrome.storage.session.get(PAUSED_WINDOW_IDS_STORAGE_KEY)
  .then((stored) => {
    const savedWindowIds = Array.isArray(stored[PAUSED_WINDOW_IDS_STORAGE_KEY])
      ? stored[PAUSED_WINDOW_IDS_STORAGE_KEY]
      : [];
    savedWindowIds.map(Number).filter(Number.isInteger).forEach((windowId) => pausedWindowIds.add(windowId));
  })
  .catch(() => {});
const tabActivationHistoryReady = chrome.storage.session.get(TAB_ACTIVATION_HISTORY_STORAGE_KEY)
  .then((stored) => {
    tabActivationHistory = normalizeTabActivationHistory(stored[TAB_ACTIVATION_HISTORY_STORAGE_KEY]);
  })
  .catch(() => {});
const windowAutomationPolicyReady = Promise.all([
  chrome.storage.session.get([
    WINDOW_AUTOMATION_MODE_STORAGE_KEY,
    SELECTED_WINDOW_IDS_STORAGE_KEY,
  ]),
  chrome.storage.local.get(WINDOW_AUTOMATION_PREFERENCE_STORAGE_KEY),
  chrome.windows.getAll({ windowTypes: ['normal'] }),
])
  .then(async ([stored, localStored, windows]) => {
    const hasSessionPolicy = stored[WINDOW_AUTOMATION_MODE_STORAGE_KEY] === 'all'
      || stored[WINDOW_AUTOMATION_MODE_STORAGE_KEY] === 'selected';
    windowAutomationPolicy = restoredWindowAutomationPolicy(
      stored[WINDOW_AUTOMATION_MODE_STORAGE_KEY],
      stored[SELECTED_WINDOW_IDS_STORAGE_KEY],
      localStored[WINDOW_AUTOMATION_PREFERENCE_STORAGE_KEY],
      windows.map((window) => window.id),
    );
    const hasSavedPreference = Object.prototype.hasOwnProperty.call(
      localStored,
      WINDOW_AUTOMATION_PREFERENCE_STORAGE_KEY,
    );
    const preference = !hasSessionPolicy && hasSavedPreference
      ? normalizeWindowAutomationPreference(localStored[WINDOW_AUTOMATION_PREFERENCE_STORAGE_KEY])
      : {
          mode: windowAutomationPolicy.mode,
          restoreSoleWindow: windowAutomationPolicy.mode === 'selected'
            && windowAutomationPolicy.selectedWindowIds.length > 0,
        };
    await Promise.all([
      chrome.storage.session.set({
        [WINDOW_AUTOMATION_MODE_STORAGE_KEY]: windowAutomationPolicy.mode,
        [SELECTED_WINDOW_IDS_STORAGE_KEY]: windowAutomationPolicy.selectedWindowIds,
      }),
      chrome.storage.local.set({
        [WINDOW_AUTOMATION_PREFERENCE_STORAGE_KEY]: preference,
      }),
    ]);
  })
  .catch(() => {});

function now() {
  return Date.now();
}

function persistTabActivationHistory() {
  const snapshot = tabActivationHistory;
  const write = tabActivationHistoryWrite
    .then(() => chrome.storage.session.set({ [TAB_ACTIVATION_HISTORY_STORAGE_KEY]: snapshot }));
  tabActivationHistoryWrite = write.catch(() => {});
  return write;
}

async function recordActiveTab(tabId, windowId) {
  await tabActivationHistoryReady;
  const normalizedTabId = Number(tabId);
  const normalizedWindowId = Number(windowId);
  const ignored = ignoredTabActivationTargets.get(normalizedTabId);
  if (ignored?.windowId === normalizedWindowId && ignored.expiresAt > now()) {
    ignoredTabActivationTargets.delete(normalizedTabId);
    return;
  }
  ignoredTabActivationTargets.delete(normalizedTabId);
  tabActivationHistory = recordTabActivation(tabActivationHistory, normalizedWindowId, normalizedTabId);
  await persistTabActivationHistory();
}

async function seedActiveTabHistory() {
  if (!chrome.tabs.onActivated) return;
  const activeTabs = await chrome.tabs.query({ active: true });
  await tabActivationHistoryReady;
  let changed = false;
  activeTabs.forEach((tab) => {
    const key = String(Number(tab.windowId));
    if (tabActivationHistory[key]?.tabs?.length) return;
    tabActivationHistory = recordTabActivation(tabActivationHistory, tab.windowId, tab.id);
    changed = true;
  });
  if (changed) await persistTabActivationHistory();
}

async function activatePreviousTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!activeTab || activeTab.id === undefined || activeTab.windowId === undefined) {
    return { ok: false, message: 'No active Chrome tab is available.' };
  }
  const stored = await chrome.storage.local.get(PREVIOUS_TAB_MODE_STORAGE_KEY);
  const mode = previousTabModeFromStorage(stored[PREVIOUS_TAB_MODE_STORAGE_KEY]);
  await tabActivationHistoryReady;
  const key = String(Number(activeTab.windowId));
  if (!tabActivationHistory[key]?.tabs?.includes(Number(activeTab.id))) {
    tabActivationHistory = recordTabActivation(tabActivationHistory, activeTab.windowId, activeTab.id);
  }
  let target = previousTabTarget(tabActivationHistory, activeTab.windowId, activeTab.id, mode);
  while (target) {
    try {
      const targetTab = await chrome.tabs.get(target.tabId);
      if (Number(targetTab.windowId) !== Number(activeTab.windowId)) throw new Error('Tab moved windows.');
      const previousHistory = tabActivationHistory;
      if (mode === 'history') {
        tabActivationHistory = setTabActivationHistoryCursor(
          tabActivationHistory,
          activeTab.windowId,
          target.index,
        );
        ignoredTabActivationTargets.set(Number(target.tabId), {
          windowId: Number(activeTab.windowId),
          expiresAt: now() + 2_000,
        });
      }
      await persistTabActivationHistory();
      try {
        await chrome.tabs.update(target.tabId, { active: true });
      } catch (error) {
        ignoredTabActivationTargets.delete(Number(target.tabId));
        tabActivationHistory = previousHistory;
        await persistTabActivationHistory().catch(() => {});
        throw error;
      }
      return { ok: true, tabId: target.tabId, mode };
    } catch {
      ignoredTabActivationTargets.delete(Number(target.tabId));
      tabActivationHistory = removeTabFromActivationHistory(tabActivationHistory, target.tabId);
      await persistTabActivationHistory().catch(() => {});
      target = previousTabTarget(tabActivationHistory, activeTab.windowId, activeTab.id, mode);
    }
  }
  return { ok: false, message: 'No earlier tab is available in this window.' };
}

async function forgetTabActivation(tabId) {
  await tabActivationHistoryReady;
  ignoredTabActivationTargets.delete(Number(tabId));
  tabActivationHistory = removeTabFromActivationHistory(tabActivationHistory, tabId);
  await persistTabActivationHistory();
}

async function forgetWindowTabActivationHistory(windowId) {
  await tabActivationHistoryReady;
  tabActivationHistory = removeWindowFromActivationHistory(tabActivationHistory, windowId);
  await persistTabActivationHistory();
}

function rememberFreshExternalGroupTab(tabId, sourceWindowId) {
  const normalizedTabId = Number(tabId);
  const expiresAt = now() + EXTERNAL_TAB_ROUTE_CANDIDATE_TTL_MS;
  freshExternalGroupTabs.set(normalizedTabId, {
    sourceWindowId: Number(sourceWindowId),
    expiresAt,
  });
  const cleanupTimer = setTimeout(() => {
    if (freshExternalGroupTabs.get(normalizedTabId)?.expiresAt === expiresAt) {
      freshExternalGroupTabs.delete(normalizedTabId);
    }
  }, EXTERNAL_TAB_ROUTE_CANDIDATE_TTL_MS);
  cleanupTimer?.unref?.();
}

function rememberPendingFreshExternalGroup(groupId, sourceWindowId) {
  const normalizedGroupId = Number(groupId);
  const expiresAt = now() + EXTERNAL_TAB_ROUTE_CANDIDATE_TTL_MS;
  pendingFreshExternalGroups.set(normalizedGroupId, {
    sourceWindowId: Number(sourceWindowId),
    expiresAt,
  });
  const cleanupTimer = setTimeout(() => {
    if (pendingFreshExternalGroups.get(normalizedGroupId)?.expiresAt === expiresAt) {
      pendingFreshExternalGroups.delete(normalizedGroupId);
    }
  }, EXTERNAL_TAB_ROUTE_CANDIDATE_TTL_MS);
  cleanupTimer?.unref?.();
}

function cachedLocalSnapshot(name, loader) {
  if (localSnapshotRequests.has(name)) return localSnapshotRequests.get(name);
  const request = Promise.resolve()
    .then(loader)
    .catch((error) => {
      if (localSnapshotRequests.get(name) === request) localSnapshotRequests.delete(name);
      throw error;
    });
  localSnapshotRequests.set(name, request);
  return request;
}

function invalidateLocalSnapshots(...names) {
  names.forEach((name) => localSnapshotRequests.delete(name));
}

async function persistPausedWindowIds() {
  await pausedWindowIdsReady;
  await chrome.storage.session.set({
    [PAUSED_WINDOW_IDS_STORAGE_KEY]: [...pausedWindowIds].sort((left, right) => left - right),
  });
}

async function isWindowPaused(windowId) {
  const state = await getWindowAutomationState(windowId);
  return state.windowPaused;
}

async function getWindowAutomationState(windowId) {
  await Promise.all([pausedWindowIdsReady, windowAutomationPolicyReady]);
  const normalizedWindowId = Number(windowId);
  const manuallyPaused = pausedWindowIds.has(normalizedWindowId);
  const policyAllowed = windowAllowedByPolicy(normalizedWindowId, windowAutomationPolicy);
  return {
    manuallyPaused,
    policyAllowed,
    windowPaused: manuallyPaused || !policyAllowed,
    windowPauseReason: manuallyPaused ? 'manual' : policyAllowed ? null : 'not-selected',
  };
}

async function setWindowAutomationPolicy(mode, selectedWindowIds) {
  await windowAutomationPolicyReady;
  windowAutomationPolicy = normalizeWindowAutomationPolicy(mode, selectedWindowIds);
  await Promise.all([
    chrome.storage.session.set({
      [WINDOW_AUTOMATION_MODE_STORAGE_KEY]: windowAutomationPolicy.mode,
      [SELECTED_WINDOW_IDS_STORAGE_KEY]: windowAutomationPolicy.selectedWindowIds,
    }),
    chrome.storage.local.set({
      [WINDOW_AUTOMATION_PREFERENCE_STORAGE_KEY]: {
        mode: windowAutomationPolicy.mode,
        restoreSoleWindow: windowAutomationPolicy.mode === 'selected'
          && windowAutomationPolicy.selectedWindowIds.length > 0,
      },
    }),
  ]);
  return windowAutomationPolicy;
}

async function setWindowPaused(windowId, paused) {
  const normalizedWindowId = Number(windowId);
  if (!Number.isInteger(normalizedWindowId)) return false;
  await pausedWindowIdsReady;
  if (paused) pausedWindowIds.add(normalizedWindowId);
  else pausedWindowIds.delete(normalizedWindowId);
  await persistPausedWindowIds();
  return pausedWindowIds.has(normalizedWindowId);
}

async function getSettings() {
  return cachedLocalSnapshot('settings', async () => {
    await settingsMigrationReady;
    const stored = await chrome.storage.local.get([
      ENABLED_STORAGE_KEY,
      ACTIVATE_OPENED_TABS_STORAGE_KEY,
      OPENER_INHERITANCE_STORAGE_KEY,
      WORKSPACE_SOURCES_STORAGE_KEY,
      WORKSPACE_SOURCE_SECRETS_STORAGE_KEY,
    ]);
    const sources = normalizeWorkspaceSources(stored[WORKSPACE_SOURCES_STORAGE_KEY]);
    const sourceSecrets = stored[WORKSPACE_SOURCE_SECRETS_STORAGE_KEY]
      && typeof stored[WORKSPACE_SOURCE_SECRETS_STORAGE_KEY] === 'object'
      ? stored[WORKSPACE_SOURCE_SECRETS_STORAGE_KEY]
      : {};
    return {
      enabled: enabledFromStorage(stored[ENABLED_STORAGE_KEY]),
      activateOpenedTabs: activateOpenedTabsFromStorage(stored[ACTIVATE_OPENED_TABS_STORAGE_KEY]),
      openerInheritance: openerInheritanceFromStorage(stored[OPENER_INHERITANCE_STORAGE_KEY]),
      sources,
      sourceSecrets,
    };
  });
}

async function getWorkspaceSources() {
  return cachedLocalSnapshot('workspaceSources', async () => {
    await settingsMigrationReady;
    const stored = await chrome.storage.local.get(WORKSPACE_SOURCES_STORAGE_KEY);
    return normalizeWorkspaceSources(stored[WORKSPACE_SOURCES_STORAGE_KEY]);
  });
}

async function getWorkspaceSourceSecrets() {
  return cachedLocalSnapshot('workspaceSourceSecrets', async () => {
    await settingsMigrationReady;
    const stored = await chrome.storage.local.get(WORKSPACE_SOURCE_SECRETS_STORAGE_KEY);
    const value = stored[WORKSPACE_SOURCE_SECRETS_STORAGE_KEY];
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  });
}

async function getHomeBaseDuplicateAction() {
  return cachedLocalSnapshot('homeBaseDuplicateAction', async () => {
    await settingsMigrationReady;
    const stored = await chrome.storage.local.get(HOME_BASE_DUPLICATE_ACTION_STORAGE_KEY);
    return homeBaseDuplicateActionFromStorage(stored[HOME_BASE_DUPLICATE_ACTION_STORAGE_KEY]);
  });
}

async function activateOpenedTabsForCurrentSession(configuredValue) {
  const stored = await chrome.storage.session.get(TEMPORARY_ACTIVATION_OVERRIDE_UNTIL_STORAGE_KEY);
  const overrideUntil = Number(stored[TEMPORARY_ACTIVATION_OVERRIDE_UNTIL_STORAGE_KEY]);
  if (!Number.isFinite(overrideUntil) || overrideUntil <= Date.now()) {
    if (stored[TEMPORARY_ACTIVATION_OVERRIDE_UNTIL_STORAGE_KEY] !== undefined) {
      await chrome.storage.session.remove(TEMPORARY_ACTIVATION_OVERRIDE_UNTIL_STORAGE_KEY);
    }
    return activateOpenedTabsFromStorage(configuredValue);
  }
  return effectiveActivateOpenedTabs(configuredValue, overrideUntil);
}

async function startTemporaryActivationOverride() {
  const overrideUntil = Date.now() + TEMPORARY_ACTIVATION_OVERRIDE_DURATION_MS;
  await chrome.storage.session.set({
    [TEMPORARY_ACTIVATION_OVERRIDE_UNTIL_STORAGE_KEY]: overrideUntil,
  });
  await renderTemporaryActivationBadge(overrideUntil);
  return overrideUntil;
}

async function renderTemporaryActivationBadge(overrideUntil) {
  if (temporaryActivationBadgeTimer !== null) {
    clearTimeout(temporaryActivationBadgeTimer);
    temporaryActivationBadgeTimer = null;
  }
  const secondsRemaining = temporaryActivationSecondsRemaining(overrideUntil);
  if (secondsRemaining === 0) {
    await chrome.storage.session.remove(TEMPORARY_ACTIVATION_OVERRIDE_UNTIL_STORAGE_KEY);
    if (chrome.action) {
      await Promise.all([
        chrome.action.setBadgeText({ text: '' }),
        chrome.action.setTitle({ title: 'Tab Bundlr' }),
      ]);
    }
    return;
  }
  if (chrome.action) {
    await Promise.all([
      chrome.action.setBadgeBackgroundColor({ color: '#246b53' }),
      chrome.action.setBadgeText({ text: String(secondsRemaining) }),
      chrome.action.setTitle({ title: `Tab Bundlr: temporary activation override (${secondsRemaining}s)` }),
    ]);
  }
  temporaryActivationBadgeTimer = setTimeout(() => {
    renderTemporaryActivationBadge(overrideUntil).catch(() => {});
  }, 1000);
}

async function restoreTemporaryActivationBadge() {
  const stored = await chrome.storage.session.get(TEMPORARY_ACTIVATION_OVERRIDE_UNTIL_STORAGE_KEY);
  await renderTemporaryActivationBadge(stored[TEMPORARY_ACTIVATION_OVERRIDE_UNTIL_STORAGE_KEY]);
}

async function getPersistentHomeBases() {
  return cachedLocalSnapshot('persistentHomeBases', async () => {
    const stored = await chrome.storage.local.get(PERSISTENT_HOME_BASES_STORAGE_KEY);
    return normalizePersistentHomeBases(stored[PERSISTENT_HOME_BASES_STORAGE_KEY]);
  });
}

async function getPersistentHomeBaseAnchors() {
  const stored = await chrome.storage.session.get(PERSISTENT_HOME_BASE_ANCHORS_STORAGE_KEY);
  const source = stored[PERSISTENT_HOME_BASE_ANCHORS_STORAGE_KEY];
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  return Object.fromEntries(Object.entries(source)
    .map(([tabId, url]) => [String(Number(tabId)), duplicateKeyForUrl(url)])
    .filter(([tabId, url]) => Number.isInteger(Number(tabId)) && url));
}

async function updatePersistentHomeBaseAnchors(update) {
  let result = {};
  persistentHomeBaseAnchorsWrite = persistentHomeBaseAnchorsWrite.then(async () => {
    const stored = await chrome.storage.session.get(PERSISTENT_HOME_BASE_ANCHORS_STORAGE_KEY);
    const source = stored[PERSISTENT_HOME_BASE_ANCHORS_STORAGE_KEY];
    const current = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
    result = Object.fromEntries(Object.entries(update({ ...current }) || {})
      .map(([tabId, url]) => [String(Number(tabId)), duplicateKeyForUrl(url)])
      .filter(([tabId, url]) => Number.isInteger(Number(tabId)) && url));
    await chrome.storage.session.set({ [PERSISTENT_HOME_BASE_ANCHORS_STORAGE_KEY]: result });
  });
  await persistentHomeBaseAnchorsWrite;
  return result;
}

async function forgetPersistentHomeBaseAnchor(tabId) {
  await updatePersistentHomeBaseAnchors((anchors) => {
    delete anchors[String(tabId)];
    return anchors;
  });
}

async function getRecords() {
  const stored = await chrome.storage.local.get(GROUP_RECORDS_STORAGE_KEY);
  return stored[GROUP_RECORDS_STORAGE_KEY] || {};
}

async function setRecords(records) {
  await chrome.storage.local.set({ [GROUP_RECORDS_STORAGE_KEY]: records });
}

async function getContexts() {
  const stored = await chrome.storage.local.get(TAB_CONTEXTS_STORAGE_KEY);
  return stored[TAB_CONTEXTS_STORAGE_KEY] || {};
}

async function setContexts(contexts) {
  await chrome.storage.local.set({ [TAB_CONTEXTS_STORAGE_KEY]: contexts });
}

async function getFocusHeldTabs() {
  const stored = await chrome.storage.local.get(FOCUS_HELD_TABS_STORAGE_KEY);
  return stored[FOCUS_HELD_TABS_STORAGE_KEY] && typeof stored[FOCUS_HELD_TABS_STORAGE_KEY] === 'object'
    ? stored[FOCUS_HELD_TABS_STORAGE_KEY]
    : {};
}

async function markTabFocusHeld(tabId, groupId) {
  focusHeldTabsWrite = focusHeldTabsWrite.then(async () => {
    const heldTabs = await getFocusHeldTabs();
    heldTabs[String(tabId)] = Number(groupId);
    await chrome.storage.local.set({ [FOCUS_HELD_TABS_STORAGE_KEY]: heldTabs });
  });
  return focusHeldTabsWrite;
}

async function releaseTabFocusHold(tabId) {
  let previousGroupId = null;
  focusHeldTabsWrite = focusHeldTabsWrite.then(async () => {
    const heldTabs = await getFocusHeldTabs();
    if (heldTabs[String(tabId)] === undefined) return;
    previousGroupId = Number(heldTabs[String(tabId)]);
    delete heldTabs[String(tabId)];
    await chrome.storage.local.set({ [FOCUS_HELD_TABS_STORAGE_KEY]: heldTabs });
  });
  await focusHeldTabsWrite;
  return previousGroupId;
}

async function getTrainedRules() {
  return cachedLocalSnapshot('trainedRules', async () => {
    const stored = await chrome.storage.local.get(TRAINED_RULES_STORAGE_KEY);
    return Array.isArray(stored[TRAINED_RULES_STORAGE_KEY]) ? stored[TRAINED_RULES_STORAGE_KEY] : [];
  });
}

async function setTrainedRules(rules) {
  await chrome.storage.local.set({ [TRAINED_RULES_STORAGE_KEY]: rules });
  invalidateLocalSnapshots('trainedRules');
}

async function getSavedClientGroups() {
  const stored = await chrome.storage.local.get([
    SAVED_CLIENT_GROUPS_STORAGE_KEY,
    CLIENT_CATALOG_STORAGE_KEY,
    TRAINED_RULES_STORAGE_KEY,
    GROUP_RECORDS_STORAGE_KEY,
  ]);
  if (Array.isArray(stored[SAVED_CLIENT_GROUPS_STORAGE_KEY])) {
    return mergeSavedClientGroupEntries(stored[SAVED_CLIENT_GROUPS_STORAGE_KEY]);
  }

  const trainedRules = Array.isArray(stored[TRAINED_RULES_STORAGE_KEY]) ? stored[TRAINED_RULES_STORAGE_KEY] : [];
  const records = stored[GROUP_RECORDS_STORAGE_KEY] && typeof stored[GROUP_RECORDS_STORAGE_KEY] === 'object'
    ? stored[GROUP_RECORDS_STORAGE_KEY]
    : {};
  const migrated = mergeSavedClientGroupEntries([
    ...(Array.isArray(stored[CLIENT_CATALOG_STORAGE_KEY])
      ? stored[CLIENT_CATALOG_STORAGE_KEY].filter((entry) => entry?.curated === true)
      : []),
    ...trainedRules.map((rule) => ({ epicId: rule.epicId, epicName: rule.epicName })),
    ...Object.values(records)
      .filter((record) => record?.workspaceType === 'epic' && record.epicId && record.epicName)
      .map((record) => ({ epicId: record.epicId, epicName: record.epicName })),
  ]);
  await chrome.storage.local.set({ [SAVED_CLIENT_GROUPS_STORAGE_KEY]: migrated });
  if (Object.prototype.hasOwnProperty.call(stored, CLIENT_CATALOG_STORAGE_KEY)) {
    await chrome.storage.local.remove(CLIENT_CATALOG_STORAGE_KEY);
  }
  return migrated;
}

function mergeSavedClientGroupEntries(entries) {
  const byId = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const epicId = String(entry?.epicId ?? entry?.id ?? '').trim();
    const epicName = String(entry?.epicName ?? entry?.name ?? '').trim();
    if (!epicId || !epicName) return;
    byId.set(epicId, {
      epicId,
      epicName,
      archived: entry?.archived === true,
      updatedAt: entry?.updatedAt || new Date().toISOString(),
    });
  });
  return [...byId.values()].sort((left, right) => Number(left.archived) - Number(right.archived)
    || left.epicName.localeCompare(right.epicName, undefined, { sensitivity: 'base' }));
}

async function rememberSavedClientGroups(entries) {
  const current = await getSavedClientGroups();
  const next = mergeSavedClientGroupEntries([
    ...current,
    ...(Array.isArray(entries) ? entries : []),
  ]);
  await chrome.storage.local.set({ [SAVED_CLIENT_GROUPS_STORAGE_KEY]: next });
  return next;
}

async function getSmartGroups() {
  return cachedLocalSnapshot('smartGroups', async () => {
    const stored = await chrome.storage.local.get(SMART_GROUPS_STORAGE_KEY);
    return Array.isArray(stored[SMART_GROUPS_STORAGE_KEY]) ? stored[SMART_GROUPS_STORAGE_KEY] : [];
  });
}

async function getBrowserPageSmartGroupId() {
  return cachedLocalSnapshot('browserPageSmartGroupId', async () => {
    const stored = await chrome.storage.local.get(BROWSER_PAGE_SMART_GROUP_STORAGE_KEY);
    return String(stored[BROWSER_PAGE_SMART_GROUP_STORAGE_KEY] || '').trim();
  });
}

async function getFocusGroups() {
  const stored = await chrome.storage.local.get(FOCUS_GROUPS_STORAGE_KEY);
  return normalizeFocusGroups(stored[FOCUS_GROUPS_STORAGE_KEY]);
}

async function setFocusGroups(groups) {
  const normalized = normalizeFocusGroups(groups);
  await chrome.storage.local.set({ [FOCUS_GROUPS_STORAGE_KEY]: normalized });
  return normalized;
}

async function getSmartGroupOrder() {
  return cachedLocalSnapshot('smartGroupOrder', async () => {
    const stored = await chrome.storage.local.get(SMART_GROUP_ORDER_STORAGE_KEY);
    return Array.isArray(stored[SMART_GROUP_ORDER_STORAGE_KEY]) ? stored[SMART_GROUP_ORDER_STORAGE_KEY].map(String) : [];
  });
}

async function getManagedGroupTypeOrder() {
  return cachedLocalSnapshot('managedGroupTypeOrder', async () => {
    const stored = await chrome.storage.local.get(MANAGED_GROUP_TYPE_ORDER_STORAGE_KEY);
    return Array.isArray(stored[MANAGED_GROUP_TYPE_ORDER_STORAGE_KEY])
      ? stored[MANAGED_GROUP_TYPE_ORDER_STORAGE_KEY].map(String)
      : [];
  });
}

async function getManagedGroupTypeEnabled() {
  return cachedLocalSnapshot('managedGroupTypeEnabled', async () => {
    const stored = await chrome.storage.local.get(MANAGED_GROUP_TYPE_ENABLED_STORAGE_KEY);
    return normalizeManagedGroupTypeEnabled(stored[MANAGED_GROUP_TYPE_ENABLED_STORAGE_KEY]);
  });
}

async function getManagedGroupColors() {
  return cachedLocalSnapshot('managedGroupColors', async () => {
    const stored = await chrome.storage.local.get(MANAGED_GROUP_COLORS_STORAGE_KEY);
    return stored[MANAGED_GROUP_COLORS_STORAGE_KEY] && typeof stored[MANAGED_GROUP_COLORS_STORAGE_KEY] === 'object'
      ? stored[MANAGED_GROUP_COLORS_STORAGE_KEY]
      : {};
  });
}

async function autoOrganizeGroupsEnabled() {
  return cachedLocalSnapshot('autoOrganizeGroups', async () => {
    const stored = await chrome.storage.local.get(AUTO_ORGANIZE_GROUPS_STORAGE_KEY);
    return stored[AUTO_ORGANIZE_GROUPS_STORAGE_KEY] === undefined
      ? DEFAULT_AUTO_ORGANIZE_GROUPS
      : stored[AUTO_ORGANIZE_GROUPS_STORAGE_KEY] === true;
  });
}

async function rememberTabContext(tabId, context) {
  const contexts = await getContexts();
  contexts[String(tabId)] = context;
  await setContexts(contexts);
}

async function forgetTabContext(tabId) {
  const contexts = await getContexts();
  delete contexts[String(tabId)];
  await setContexts(contexts);
}

async function contextForTab(tabId) {
  const contexts = await getContexts();
  return contexts[String(tabId)] || null;
}

async function pruneContexts(openTabs = null) {
  const [tabs, contexts] = await Promise.all([
    openTabs || chrome.tabs.query({}),
    getContexts(),
  ]);
  const openTabIds = new Set(tabs.map((tab) => String(tab.id)));
  const pruned = Object.fromEntries(Object.entries(contexts).filter(([tabId]) => openTabIds.has(tabId)));
  if (Object.keys(pruned).length !== Object.keys(contexts).length) await setContexts(pruned);
}

async function cachedWorkspaceSourceResolution(match, sourceSecrets) {
  const secrets = sourceSecrets?.[match.source.id] || {};
  const key = `${match.source.id}:${match.route.id}:${JSON.stringify(match.captures)}`;
  const cached = workspaceSourceCache.get(key);
  if (cached && cached.expiresAt > now()) {
    if (cached.error && cached.errorExpiresAt > now()) throw new Error(cached.error);
    if (cached.result) return cached.result;
  }
  const request = resolveWorkspaceSourceMatch(match, secrets)
    .then((result) => {
      workspaceSourceCache.set(key, { result, expiresAt: now() + CACHE_TTL_MS });
      return result;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : 'Workspace Source request failed.';
      workspaceSourceCache.set(key, { error: message, expiresAt: now() + ERROR_TTL_MS, errorExpiresAt: now() + ERROR_TTL_MS });
      throw error;
    });
  return request;
}

function sourceWorkspaceType(match) {
  return match?.route?.placement?.workspaceType === 'collection' ? 'iteration' : 'client';
}

function workspaceSourceIsAutomatic(value, enabledTypes, sources) {
  return enabledSourceMatches(sources, value)
    .some((match) => managedGroupTypeIsEnabled(enabledTypes, sourceWorkspaceType(match)));
}

function enabledSourceMatches(sources, value) {
  return matchingWorkspaceSources(sources, value).filter((match) => match.source.enabled);
}

async function runWithConcurrency(items, worker, limit = MAX_API_CONCURRENCY) {
  let nextIndex = 0;
  async function runner() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runner()));
}

async function groupById(windowId) {
  const groups = await chrome.tabGroups.query({ windowId });
  return new Map(groups.map((group) => [Number(group.id), group]));
}

function recordWithFocusCategory(record, designatedFocusGroup) {
  if (!record) return record;
  return {
    ...record,
    isFocusGroup: Boolean(record.workspaceType === 'smart'
      && designatedFocusGroup
      && String(record.smartGroupId) === String(designatedFocusGroup.id)),
  };
}

async function organizeWindow(windowId) {
  const normalizedWindowId = Number(windowId);
  if (await isWindowPaused(normalizedWindowId)) {
    return { ok: true, organizedCount: 0, failedCount: 0, skipped: true, windowPaused: true };
  }
  if (groupOrganizationRequests.has(normalizedWindowId)) return groupOrganizationRequests.get(normalizedWindowId);

  const request = (async () => {
    const [groups, records, smartGroups, smartGroupOrder, managedGroupTypeOrder, managedGroupColors] = await Promise.all([
      chrome.tabGroups.query({ windowId: normalizedWindowId }),
      getRecords(),
      getSmartGroups(),
      getSmartGroupOrder(),
      getManagedGroupTypeOrder(),
      getManagedGroupColors(),
    ]);
    const designatedFocusGroup = focusSmartGroup(smartGroups);
    const managedRecords = groups
      .map((group) => recordForGroup(records, group.id, normalizedWindowId))
      .filter(Boolean)
      .map((record) => recordWithFocusCategory(record, designatedFocusGroup));
    const orderedRecords = sortManagedGroupRecords(managedRecords, smartGroupOrder, managedGroupTypeOrder);
    let currentTabs = await chrome.tabs.query({ windowId: normalizedWindowId });
    let targetIndex = currentTabs.filter((tab) => tab.pinned).length;
    let organizedCount = 0;
    let failedCount = 0;

    for (const record of orderedRecords) {
      const group = groups.find((candidate) => Number(candidate.id) === Number(record.groupId));
      if (!group) continue;
      const color = managedColorForWorkspace(record, managedGroupColors);
      if (group.color !== color) {
        try {
          await chrome.tabGroups.update(group.id, { color });
        } catch {
          failedCount += 1;
        }
      }
      const groupTabs = currentTabs
        .filter((tab) => Number(tab.groupId) === Number(group.id))
        .sort((left, right) => Number(left.index) - Number(right.index));
      if (!groupTabs.length) continue;
      const groupStart = Number(groupTabs[0].index);
      if (groupStart !== targetIndex) {
        try {
          await chrome.tabGroups.move(group.id, { index: targetIndex });
          organizedCount += 1;
          currentTabs = await chrome.tabs.query({ windowId: normalizedWindowId });
        } catch {
          failedCount += 1;
        }
      }
      const liveGroupTabs = currentTabs
        .filter((tab) => Number(tab.groupId) === Number(group.id))
        .sort((left, right) => Number(left.index) - Number(right.index));
      if (liveGroupTabs.length) targetIndex = Number(liveGroupTabs.at(-1).index) + 1;
    }

    return { ok: failedCount === 0, organizedCount, failedCount };
  })().finally(() => groupOrganizationRequests.delete(normalizedWindowId));

  groupOrganizationRequests.set(normalizedWindowId, request);
  return request;
}

async function applyManagedGroupColors(windowId) {
  if (await isWindowPaused(windowId)) return;
  const [groups, records, smartGroups, configuredColors] = await Promise.all([
    chrome.tabGroups.query({ windowId: Number(windowId) }),
    getRecords(),
    getSmartGroups(),
    getManagedGroupColors(),
  ]);
  const designatedFocusGroup = focusSmartGroup(smartGroups);
  await Promise.all(groups.map(async (group) => {
    const record = recordWithFocusCategory(
      recordForGroup(records, group.id, Number(windowId)),
      designatedFocusGroup,
    );
    if (!record) return;
    const color = managedColorForWorkspace(record, configuredColors);
    if (group.color === color) return;
    try {
      await chrome.tabGroups.update(group.id, { color });
    } catch {
      // A window or group can disappear while colors are being applied.
    }
  }));
}

async function maybeOrganizeWindow(windowId) {
  if (!(await autoOrganizeGroupsEnabled())) return { ok: true, organizedCount: 0, skipped: true };
  return organizeWindow(windowId);
}

async function organizeCurrentWindow() {
  const currentWindow = await chrome.windows.getCurrent();
  const automationState = await getWindowAutomationState(currentWindow.id);
  const result = await organizeWindow(currentWindow.id);
  if (result.windowPaused) {
    return {
      ...result,
      message: automationState.windowPauseReason === 'not-selected'
        ? 'This window is excluded by Window automation. Select it in Settings before organizing.'
        : 'Tab Bundlr is paused in this window. Resume it before organizing.',
    };
  }
  return {
    ...result,
    message: result.failedCount
      ? `Ordered ${result.organizedCount} managed group${result.organizedCount === 1 ? '' : 's'}; ${result.failedCount} could not move. Pinned tabs were left untouched.`
      : result.organizedCount
        ? `Ordered ${result.organizedCount} managed group${result.organizedCount === 1 ? '' : 's'}. Pinned tabs were left untouched.`
        : 'Managed groups were already in order. Pinned tabs were left untouched.',
  };
}

async function ensureEpicGroup(windowId, epicId, epicName, targetTabId, targetGroupId, workspaceType = 'epic', smartGroupId = null, focusGroupId = null) {
  const key = groupRecordKey(windowId, epicId, workspaceType);
  if (groupEnsureRequests.has(key)) return groupEnsureRequests.get(key);

  const request = (async () => {
    const normalizedName = normalizeEpicName(epicName);
    const [records, smartGroups, managedGroupColors] = await Promise.all([
      getRecords(),
      getSmartGroups(),
      getManagedGroupColors(),
    ]);
    const color = managedColorForWorkspace(recordWithFocusCategory(
      { workspaceType, epicId, smartGroupId, focusGroupId },
      focusSmartGroup(smartGroups),
    ), managedGroupColors);
    const record = records[key];
    const groups = await groupById(windowId);
    let group = record?.groupId !== undefined ? groups.get(Number(record.groupId)) : null;

    if (!group && Number(targetGroupId) >= 0) {
      const targetGroup = groups.get(Number(targetGroupId));
      const targetGroupOwner = targetGroup ? recordForGroup(records, targetGroup.id, windowId) : null;
      if (targetGroup?.title === normalizedName && (!targetGroupOwner || targetGroupOwner === record)) {
        group = targetGroup;
      }
    }

    if (!group && record?.title) {
      const sameTitleGroup = [...groups.values()].find((candidate) => candidate.title === record.title) || null;
      const sameNameGroupExists = [...groups.values()].some((candidate) => candidate.title === normalizedName);
      const savedTitleIsMarked = record.title.endsWith(' · Tab Bundlr');
      if (sameTitleGroup && (savedTitleIsMarked || !sameNameGroupExists)) group = sameTitleGroup;
    }

    if (!group) {
      const exactNameGroup = [...groups.values()].find((candidate) => candidate.title === normalizedName);
      const markedName = collisionGroupTitle(normalizedName);
      group = exactNameGroup ? null : [...groups.values()].find((candidate) => candidate.title === markedName) || null;
      if (!group && exactNameGroup) {
        const title = markedName;
        const groupId = await chrome.tabs.group({ tabIds: [targetTabId] });
        group = await chrome.tabGroups.update(groupId, { title, color });
      }
    }

    if (!group) {
      const groupId = await chrome.tabs.group({ tabIds: [targetTabId] });
      group = await chrome.tabGroups.update(groupId, { title: normalizedName, color });
    }

    const managedTitle = managedGroupTitle(normalizedName, group.id, [...groups.values()]);
    if (group.title !== managedTitle || group.color !== color) {
      group = await chrome.tabGroups.update(group.id, { title: managedTitle, color });
    }

    records[key] = {
      epicId: String(epicId),
      epicName: normalizedName,
      workspaceType: String(workspaceType || 'epic'),
      smartGroupId: smartGroupId ? String(smartGroupId) : null,
      focusGroupId: focusGroupId ? String(focusGroupId) : null,
      groupId: Number(group.id),
      title: group.title || managedTitle,
      color,
      windowId: Number(windowId),
      updatedAt: new Date().toISOString(),
    };
    await setRecords(records);
    return group;
  })().finally(() => groupEnsureRequests.delete(key));

  groupEnsureRequests.set(key, request);
  return request;
}

function activityId() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `activity-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function activityLabel(move) {
  const destination = move.workspaceName || 'a managed group';
  if (move.reason === 'focus-group-start') return `Started Focus Group ${destination}`;
  if (move.reason === 'focus-opener-inherit') return `Kept opened tab in ${destination}`;
  if (move.reason === 'manual-add' || move.reason === 'review-move-once') return `Moved ${move.tabTitle || 'tab'} to ${destination}`;
  if (move.reason === 'opener-inherit') return `Inherited ${destination} from opener`;
  if (move.reason === 'smart-group-add' || move.reason === 'learned-rule-add') return `Assigned ${move.tabTitle || 'tab'} to ${destination}`;
  return `Grouped ${move.tabTitle || 'tab'} in ${destination}`;
}

async function focusRecordForTab(tab) {
  if (!tab || Number(tab.groupId ?? -1) < 0) return null;
  const [records, smartGroups, enabledTypes] = await Promise.all([getRecords(), getSmartGroups(), getManagedGroupTypeEnabled()]);
  if (!enabledTypes['focus-smart']) return null;
  const record = recordForGroup(records, tab.groupId, tab.windowId);
  const focusGroup = focusSmartGroup(smartGroups);
  return record?.workspaceType === 'smart'
    && focusGroup
    && String(record.smartGroupId) === String(focusGroup.id)
    ? record
    : null;
}

function tabContextForFocus(record, tab, source = 'focus') {
  return tabContextForEpic({
    epicId: record.epicId,
    epicName: record.epicName,
    groupId: record.groupId,
    windowId: tab.windowId,
    storyId: null,
    source,
    workspaceType: 'focus',
    focusGroupId: record.focusGroupId,
  });
}

async function getActivityHistory() {
  const stored = await chrome.storage.local.get([ACTIVITY_HISTORY_STORAGE_KEY, LAST_ACTION_STORAGE_KEY]);
  const current = normalizeActivityHistory(stored[ACTIVITY_HISTORY_STORAGE_KEY]);
  if (current.length || !stored[LAST_ACTION_STORAGE_KEY]?.moves?.length) return current;
  const legacy = {
    id: `legacy-${Date.parse(stored[LAST_ACTION_STORAGE_KEY].createdAt || '') || Date.now()}`,
    createdAt: stored[LAST_ACTION_STORAGE_KEY].createdAt || new Date().toISOString(),
    label: `${stored[LAST_ACTION_STORAGE_KEY].moves.length} earlier tab move${stored[LAST_ACTION_STORAGE_KEY].moves.length === 1 ? '' : 's'}`,
    reason: 'legacy',
    moves: stored[LAST_ACTION_STORAGE_KEY].moves,
  };
  const migrated = normalizeActivityHistory([legacy]);
  await chrome.storage.local.set({ [ACTIVITY_HISTORY_STORAGE_KEY]: migrated });
  await chrome.storage.local.remove(LAST_ACTION_STORAGE_KEY);
  return migrated;
}

async function appendLastAction(move) {
  lastActionWrite = lastActionWrite.then(async () => {
    const current = await getActivityHistory();
    const activity = {
      id: activityId(),
      createdAt: new Date().toISOString(),
      label: activityLabel(move),
      reason: move.reason,
      moves: [move],
    };
    await chrome.storage.local.set({ [ACTIVITY_HISTORY_STORAGE_KEY]: appendActivityHistory(current, activity) });
  });
  return lastActionWrite;
}

async function moveTabToEpic(tab, context, reason) {
  if (tab?.pinned) return { moved: false, skipped: true, status: 'pinned-skipped', reason };
  const currentFocusRecord = await focusRecordForTab(tab);
  if (currentFocusRecord && String(context.smartGroupId || '') !== String(currentFocusRecord.smartGroupId || '')) {
    return { moved: false, skipped: true, status: 'focus-protected', reason };
  }
  const group = await ensureEpicGroup(
    tab.windowId,
    context.epicId,
    context.epicName,
    tab.id,
    Number(tab.groupId ?? -1),
    context.workspaceType,
    context.smartGroupId,
    context.focusGroupId,
  );
  const currentGroupId = Number(tab.groupId ?? -1);
  if (currentGroupId === Number(group.id)) {
    await rememberTabContext(tab.id, tabContextForEpic({ ...context, groupId: group.id, windowId: tab.windowId }));
    return { moved: false, groupId: Number(group.id), reason };
  }

  const moveKey = `${tab.id}:${group.id}`;
  if (inFlightGroupMoves.has(moveKey)) return { moved: false, groupId: Number(group.id), reason };
  inFlightGroupMoves.add(moveKey);
  try {
    await chrome.tabs.group({ tabIds: [tab.id], groupId: group.id });
    await rememberTabContext(tab.id, tabContextForEpic({ ...context, groupId: group.id, windowId: tab.windowId }));
    await appendLastAction({
      tabId: Number(tab.id),
      tabTitle: tab.title || tab.url || 'Tab',
      previousGroupId: currentGroupId,
      groupId: Number(group.id),
      epicId: String(context.epicId),
      workspaceName: context.epicName,
      url: tab.url || '',
      reason,
    });
    maybeOrganizeWindow(tab.windowId).catch(() => {});
    return { moved: true, groupId: Number(group.id), reason };
  } finally {
    inFlightGroupMoves.delete(moveKey);
  }
}

async function processTrainedTab(tab, reason = 'trained-rule', { ignoreEnabled = false } = {}) {
  const rules = await getTrainedRules();
  const rule = bestTrainedRuleForUrl(rules, tab.url);
  if (!rule) return { status: 'ignored' };
  const settings = await getSettings();
  if (!settings.enabled && !ignoreEnabled) return { status: 'disabled', rule: rule.pattern };
  if (!managedGroupTypeIsEnabled(await getManagedGroupTypeEnabled(), 'client')) return { status: 'category-disabled', workspaceType: 'client', rule: rule.pattern };

  const records = await getRecords();
  const record = records[groupRecordKey(tab.windowId, rule.epicId)];
  const epicName = record?.epicName || rule.epicName;
  if (!rule.epicId || !epicName) return { status: 'rule-incomplete', rule: rule.pattern };
  return moveTabToEpic(tab, tabContextForEpic({
    epicId: rule.epicId,
    epicName,
    groupId: -1,
    windowId: tab.windowId,
    source: 'learned',
  }), reason);
}

async function processSmartGroupTab(tab, reason = 'smart-group', { ignoreEnabled = false } = {}) {
  const smartGroups = await getSmartGroups();
  const rule = bestSmartGroupRuleForUrl(smartGroups, tab.url);
  if (!rule) return { status: 'ignored' };
  const settings = await getSettings();
  if (!settings.enabled && !ignoreEnabled) return { status: 'disabled', rule: rule.pattern };
  const workspaceType = rule.focusMode === true ? 'focus-smart' : 'smart';
  if (!managedGroupTypeIsEnabled(await getManagedGroupTypeEnabled(), workspaceType)) return { status: 'category-disabled', workspaceType, rule: rule.pattern };
  if (!rule.id || !rule.name) return { status: 'smart-group-incomplete', rule: rule.pattern };
  return moveTabToEpic(tab, tabContextForEpic({
    epicId: smartGroupWorkspaceId(rule.id),
    epicName: rule.name,
    groupId: -1,
    windowId: tab.windowId,
    source: 'smart',
    workspaceType: 'smart',
    smartGroupId: rule.id,
  }), reason);
}

async function processBrowserPageTab(tab, reason = 'browser-page', {
  ignoreEnabled = false,
  smartGroups: providedSmartGroups = null,
  enabledTypes: providedEnabledTypes = null,
  configuredGroupId = null,
} = {}) {
  if (!isBrowserPageUrl(tab?.url)) return { status: 'ignored' };
  const settings = await getSettings();
  if (!settings.enabled && !ignoreEnabled) return { status: 'disabled' };
  const [smartGroups, enabledTypes, groupId] = await Promise.all([
    providedSmartGroups || getSmartGroups(),
    providedEnabledTypes || getManagedGroupTypeEnabled(),
    configuredGroupId === null ? getBrowserPageSmartGroupId() : configuredGroupId,
  ]);
  if (!managedGroupTypeIsEnabled(enabledTypes, 'smart')) {
    return { status: 'category-disabled', workspaceType: 'smart' };
  }
  const group = browserPageSmartGroup(smartGroups, groupId);
  if (!group) return { status: 'ignored' };
  return moveTabToEpic(tab, tabContextForEpic({
    epicId: smartGroupWorkspaceId(group.id),
    epicName: group.name,
    groupId: -1,
    windowId: tab.windowId,
    source: 'browser-page',
    workspaceType: 'smart',
    smartGroupId: group.id,
  }), reason);
}

async function processWorkspaceSourceTab(tab, reason = 'workspace-source', {
  ignoreEnabled = false,
  match: providedMatch = null,
} = {}) {
  const settings = await getSettings();
  if (!settings.enabled && !ignoreEnabled) return { status: 'disabled' };
  const match = providedMatch || enabledSourceMatches(settings.sources, tab?.url)[0];
  if (!match) return { status: 'ignored' };
  const workspaceType = sourceWorkspaceType(match);
  if (!managedGroupTypeIsEnabled(await getManagedGroupTypeEnabled(), workspaceType)) {
    return { status: 'category-disabled', workspaceType };
  }
  const result = await cachedWorkspaceSourceResolution(match, settings.sourceSecrets);
  if (result.status !== 'resolved') return result;
  if (workspaceType === 'client') {
    await rememberSavedClientGroups([{ epicId: result.workspaceId, epicName: result.workspaceName }]);
  }
  return moveTabToEpic(tab, tabContextForEpic({
    epicId: result.workspaceId,
    epicName: result.workspaceName,
    groupId: -1,
    windowId: tab.windowId,
    storyId: result.itemId || null,
    source: `workspace-source:${result.sourceId}:${result.routeId}`,
    workspaceType: workspaceType === 'iteration' ? 'iteration' : 'epic',
  }), reason);
}

async function tabIsInManualGroup(tab) {
  const groupId = Number(tab?.groupId ?? -1);
  if (groupId < 0) return false;
  const records = await getRecords();
  if (recordForGroup(records, groupId, tab.windowId)) return false;
  const groups = await chrome.tabGroups.query({ windowId: Number(tab.windowId) });
  const currentGroup = groups.find((group) => Number(group.id) === groupId);
  if (!currentGroup?.title) return true;
  const knownManagedTitle = Object.values(records).some((record) => (
    record?.title === currentGroup.title || record?.epicName === currentGroup.title
  ));
  return !knownManagedTitle;
}

async function processTab(tab, reason, options = {}) {
  if (tab?.pinned) return { status: 'pinned-skipped' };
  if (await isWindowPaused(tab?.windowId)) return { status: 'window-paused' };
  const focusRecord = await focusRecordForTab(tab);
  if (focusRecord) {
    await markTabFocusHeld(tab.id, focusRecord.groupId);
    return { status: 'focus-protected', groupId: Number(focusRecord.groupId) };
  }
  if (await tabIsInManualGroup(tab)) return { status: 'manual-group-protected' };
  const enabledTypes = await getManagedGroupTypeEnabled();
  const [smartGroups, trainedRules, browserPageGroupId, sources] = await Promise.all([
    getSmartGroups(),
    getTrainedRules(),
    getBrowserPageSmartGroupId(),
    getWorkspaceSources(),
  ]);
  if (isBrowserPageUrl(tab.url)) {
    return processBrowserPageTab(tab, reason, {
      ...options,
      smartGroups,
      enabledTypes,
      configuredGroupId: browserPageGroupId,
    });
  }
  const sourceMatches = enabledSourceMatches(sources, tab.url)
    .filter((match) => managedGroupTypeIsEnabled(enabledTypes, sourceWorkspaceType(match)));
  const preferredSource = sourceMatches.find((match) => match.source.precedence === 'before-rules');
  if (preferredSource) return processWorkspaceSourceTab(tab, reason, { ...options, match: preferredSource });
  const assignment = bestUrlAssignmentForUrl(smartGroups, trainedRules, tab.url, enabledTypes);
  if (assignment?.type === 'smart') return processSmartGroupTab(tab, reason, options);
  if (assignment?.type === 'learned') return processTrainedTab(tab, reason, options);
  if (sourceMatches[0]) return processWorkspaceSourceTab(tab, reason, { ...options, match: sourceMatches[0] });
  return { status: 'ignored' };
}

async function knownAutoTab(tab, rules = null, smartGroups = null) {
  const [trainedRules, groups, enabledTypes, browserPageGroupId, sources] = await Promise.all([
    rules || getTrainedRules(),
    smartGroups || getSmartGroups(),
    getManagedGroupTypeEnabled(),
    getBrowserPageSmartGroupId(),
    getWorkspaceSources(),
  ]);
  return Boolean(
    enabledSourceMatches(sources, tab.url).some((match) => managedGroupTypeIsEnabled(enabledTypes, sourceWorkspaceType(match)))
    || (isBrowserPageUrl(tab.url) && enabledTypes.smart && browserPageSmartGroup(groups, browserPageGroupId))
    || bestUrlAssignmentForUrl(groups, trainedRules, tab.url, enabledTypes),
  );
}

async function inheritFocusFromOpener(tab) {
  const hasOpener = tab?.openerTabId !== undefined && tab.openerTabId !== -1;
  if (!hasOpener || !canInheritOpenerForTab(tab)) return null;
  try {
    const opener = await chrome.tabs.get(tab.openerTabId);
    const focusRecord = await focusRecordForTab(opener);
    if (!focusRecord) return null;
    const previousGroupId = Number(tab.groupId ?? -1);
    if (previousGroupId !== Number(focusRecord.groupId)) {
      await chrome.tabs.group({ tabIds: [tab.id], groupId: Number(focusRecord.groupId) });
    }
    await markTabFocusHeld(tab.id, focusRecord.groupId);
    if (previousGroupId !== Number(focusRecord.groupId)) {
      await appendLastAction({
        tabId: Number(tab.id),
        tabTitle: tab.title || tab.url || 'Tab',
        previousGroupId,
        groupId: Number(focusRecord.groupId),
        epicId: String(focusRecord.epicId),
        workspaceName: focusRecord.epicName,
        url: tab.url || '',
        reason: 'focus-opener-inherit',
      });
    }
    return { moved: previousGroupId !== Number(focusRecord.groupId), status: 'focus-protected', groupId: Number(focusRecord.groupId) };
  } catch {
    return null;
  }
}

function queuePersistentHomeBaseRequest(homeBaseUrl, operation) {
  const key = duplicateKeyForUrl(homeBaseUrl);
  if (!key) return Promise.resolve({ status: 'invalid-home-base' });
  const previous = persistentHomeBaseRequests.get(key) || Promise.resolve();
  const request = previous
    .catch(() => {})
    .then(operation)
    .finally(() => {
      if (persistentHomeBaseRequests.get(key) === request) persistentHomeBaseRequests.delete(key);
    });
  persistentHomeBaseRequests.set(key, request);
  return request;
}

function samePersistentHomeBasePage(leftValue, rightValue) {
  const leftExactUrl = duplicateKeyForUrl(leftValue);
  const rightExactUrl = duplicateKeyForUrl(rightValue);
  if (!leftExactUrl || !rightExactUrl) return false;
  const leftUrl = new URL(leftExactUrl);
  const rightUrl = new URL(rightExactUrl);
  return leftUrl.origin === rightUrl.origin && leftUrl.pathname === rightUrl.pathname;
}

async function updatePersistentHomeBaseUrl(previousUrl, nextUrl, tab) {
  const previousExactUrl = duplicateKeyForUrl(previousUrl);
  const nextExactUrl = duplicateKeyForUrl(nextUrl);
  if (!previousExactUrl || !nextExactUrl) return { status: 'invalid-home-base' };
  const configured = await getPersistentHomeBases();
  const nextConfigured = normalizePersistentHomeBases(configured
    .filter((url) => url !== previousExactUrl)
    .concat(nextExactUrl));
  await chrome.storage.local.set({ [PERSISTENT_HOME_BASES_STORAGE_KEY]: nextConfigured });
  invalidateLocalSnapshots('persistentHomeBases');
  await updatePersistentHomeBaseAnchors((anchors) => {
    const nextAnchors = Object.fromEntries(Object.entries(anchors)
      .filter(([, url]) => duplicateKeyForUrl(url) !== previousExactUrl));
    nextAnchors[String(tab.id)] = nextExactUrl;
    return nextAnchors;
  });
  const reconciled = await reconcilePersistentHomeBase(nextExactUrl, {
    preferredTabId: tab.id,
    windowId: tab.windowId,
    index: tab.index,
  });
  return {
    ...reconciled,
    status: 'updated',
    previousHomeBaseUrl: previousExactUrl,
    homeBaseUrl: nextExactUrl,
  };
}

async function reconcilePersistentHomeBase(homeBaseUrl, {
  preferredTabId = null,
  windowId = null,
  index = null,
  createIfMissing = false,
} = {}) {
  const exactUrl = duplicateKeyForUrl(homeBaseUrl);
  if (!exactUrl) return { status: 'invalid-home-base' };
  return queuePersistentHomeBaseRequest(exactUrl, async () => {
    const configured = await getPersistentHomeBases();
    if (!configured.includes(exactUrl)) {
      await updatePersistentHomeBaseAnchors((anchors) => Object.fromEntries(
        Object.entries(anchors).filter(([, url]) => duplicateKeyForUrl(url) !== exactUrl),
      ));
      return { status: 'not-configured', homeBaseUrl: exactUrl };
    }

    const [tabs, anchors] = await Promise.all([
      chrome.tabs.query({}),
      getPersistentHomeBaseAnchors(),
    ]);
    const candidates = tabs.filter((tab) => !tab.pinned && duplicateKeyForUrl(tab.url) === exactUrl);
    if (!candidates.length && createIfMissing) {
      const samePageCandidates = tabs.filter((tab) => !tab.pinned && samePersistentHomeBasePage(tab.url, exactUrl));
      const samePageKeeper = samePageCandidates.find((tab) => tab.active)
        || [...samePageCandidates].sort((left, right) => Number(left.id) - Number(right.id))[0]
        || null;
      if (samePageKeeper) {
        return updatePersistentHomeBaseUrl(exactUrl, samePageKeeper.url, samePageKeeper);
      }
    }
    const preferredId = Number(preferredTabId);
    const anchoredIds = new Set(Object.entries(anchors)
      .filter(([, url]) => duplicateKeyForUrl(url) === exactUrl)
      .map(([tabId]) => Number(tabId)));
    const preferred = candidates.find((tab) => Number(tab.id) === preferredId) || null;
    let keeper = (preferred?.active ? preferred : null)
      || candidates.find((tab) => anchoredIds.has(Number(tab.id)))
      || preferred
      || candidates.find((tab) => tab.active)
      || [...candidates].sort((left, right) => Number(left.id) - Number(right.id))[0]
      || null;
    let created = false;
    if (!keeper && createIfMissing) {
      const createProperties = { url: exactUrl, active: false };
      if (windowId !== null && Number.isInteger(Number(windowId))) createProperties.windowId = Number(windowId);
      if (index !== null && Number.isInteger(Number(index))) createProperties.index = Number(index) + 1;
      keeper = await chrome.tabs.create(createProperties);
      created = true;
    }
    const duplicateIds = candidates
      .filter((tab) => !keeper || Number(tab.id) !== Number(keeper.id))
      .map((tab) => Number(tab.id));
    const duplicateAction = await getHomeBaseDuplicateAction();
    const removedIds = duplicateAction === HOME_BASE_DUPLICATE_REMOVE_EXACT ? duplicateIds : [];
    if (removedIds.length) await chrome.tabs.remove(removedIds);
    await updatePersistentHomeBaseAnchors((current) => {
      const next = Object.fromEntries(Object.entries(current)
        .filter(([, url]) => duplicateKeyForUrl(url) !== exactUrl));
      if (keeper) next[String(keeper.id)] = exactUrl;
      return next;
    });
    return {
      status: removedIds.length ? 'deduplicated' : duplicateIds.length ? 'duplicates-found' : created ? 'created' : keeper ? 'anchored' : 'missing',
      homeBaseUrl: exactUrl,
      tabId: keeper ? Number(keeper.id) : null,
      duplicateCount: duplicateIds.length,
      removedCount: removedIds.length,
      created,
    };
  });
}

async function handlePersistentHomeBaseTabUpdate(changeInfo, tab) {
  if (!tab || tab.id === undefined || tab.pinned || !changeInfo?.url) return null;
  const [configured, anchors] = await Promise.all([
    getPersistentHomeBases(),
    getPersistentHomeBaseAnchors(),
  ]);
  const anchoredUrl = duplicateKeyForUrl(anchors[String(tab.id)]);
  if (anchoredUrl && !configured.includes(anchoredUrl)) {
    await forgetPersistentHomeBaseAnchor(tab.id);
    return null;
  }
  const currentHomeBase = persistentHomeBaseForUrl(changeInfo.url || tab.url, configured);
  if (anchoredUrl && currentHomeBase !== anchoredUrl) {
    const nextExactUrl = duplicateKeyForUrl(changeInfo.url || tab.url);
    if (samePersistentHomeBasePage(anchoredUrl, nextExactUrl)) {
      return updatePersistentHomeBaseUrl(anchoredUrl, nextExactUrl, tab);
    }
    const restored = await reconcilePersistentHomeBase(anchoredUrl, {
      windowId: tab.windowId,
      index: tab.index,
      createIfMissing: true,
    });
    return { ...restored, status: 'restored' };
  }
  if (!currentHomeBase) return null;
  return reconcilePersistentHomeBase(currentHomeBase, {
    preferredTabId: tab.id,
    windowId: tab.windowId,
    index: tab.index,
  });
}

async function reconcilePersistentHomeBases({ createIfMissing = false } = {}) {
  const homeBases = await getPersistentHomeBases();
  const results = [];
  for (const homeBaseUrl of homeBases) {
    results.push(await reconcilePersistentHomeBase(homeBaseUrl, { createIfMissing }));
  }
  const reconciledHomeBases = await getPersistentHomeBases();
  await updatePersistentHomeBaseAnchors((anchors) => Object.fromEntries(Object.entries(anchors)
    .filter(([, url]) => reconciledHomeBases.includes(duplicateKeyForUrl(url)))));
  return results;
}

async function handlePersistentHomeBaseTabRemoved(tabId, removeInfo = {}) {
  const anchors = await getPersistentHomeBaseAnchors();
  const anchoredUrl = duplicateKeyForUrl(anchors[String(tabId)]);
  await forgetPersistentHomeBaseAnchor(tabId);
  if (!anchoredUrl || removeInfo.isWindowClosing === true) return null;
  return reconcilePersistentHomeBase(anchoredUrl, {
    windowId: removeInfo.windowId,
    createIfMissing: true,
  });
}

async function setActiveTabPersistentHomeBase(windowId, enabled) {
  if (await isWindowPaused(windowId)) {
    return { ok: false, message: 'Resume this window before changing its home base.' };
  }
  const tabs = await chrome.tabs.query({ windowId: Number(windowId) });
  const activeTab = tabs.find((tab) => tab.active) || null;
  const exactUrl = duplicateKeyForUrl(activeTab?.url);
  if (!activeTab || activeTab.pinned || !exactUrl) {
    return { ok: false, message: 'Choose a regular web page to keep as a home base.' };
  }
  const current = await getPersistentHomeBases();
  const next = normalizePersistentHomeBases(enabled
    ? [...current, exactUrl]
    : current.filter((url) => url !== exactUrl));
  await chrome.storage.local.set({ [PERSISTENT_HOME_BASES_STORAGE_KEY]: next });
  invalidateLocalSnapshots('persistentHomeBases');
  if (enabled) {
    await reconcilePersistentHomeBase(exactUrl, {
      preferredTabId: activeTab.id,
      windowId: activeTab.windowId,
      index: activeTab.index,
    });
    return { ok: true, message: 'This exact URL is now a home-base tab. Duplicate handling follows your Settings preference.' };
  }
  await updatePersistentHomeBaseAnchors((anchors) => Object.fromEntries(Object.entries(anchors)
    .filter(([, url]) => duplicateKeyForUrl(url) !== exactUrl)));
  return { ok: true, message: 'This URL is no longer kept as a home base.' };
}

async function processCreatedTab(tab) {
  if (!tab || tab.id === undefined || tab.pinned) return;
  const tabId = Number(tab.id);
  await windowAutomationPolicyReady;
  if (Number(tab.index) > 0
    && windowAutomationPolicy.mode === 'selected'
    && windowAutomationPolicy.selectedWindowIds.length === 1
    && !windowAutomationPolicy.selectedWindowIds.includes(Number(tab.windowId))) {
    rememberFreshExternalGroupTab(tabId, tab.windowId);
  }
  if (detachedTabOrigins.has(tabId)) return;
  if (await routeExternalTabToSelectedWindow(tab, { rememberPending: true })) return;
  if (await isWindowPaused(tab.windowId)) return;
  await handlePersistentHomeBaseTabUpdate({ url: tab.url }, tab);
  const settings = await getSettings();
  const hasOpener = tab.openerTabId !== undefined && tab.openerTabId !== -1;
  const activateOpenedTabs = await activateOpenedTabsForCurrentSession(settings.activateOpenedTabs);
  if (activateOpenedTabs && hasOpener) {
    try {
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.tabs.update(tab.id, { active: true });
    } catch {
      // The tab or window may disappear while Chrome is creating it.
    }
  }
  const focusRecord = await focusRecordForTab(tab);
  if (focusRecord) {
    await markTabFocusHeld(tab.id, focusRecord.groupId);
    return;
  }
  if (settings.openerInheritance && await inheritFocusFromOpener(tab)) return;
  const [rules, smartGroups] = await Promise.all([getTrainedRules(), getSmartGroups()]);
  if (await knownAutoTab(tab, rules, smartGroups)) {
    if (!settings.enabled) return;
    await safelyProcess(tab, 'story-opened');
    return;
  }
  if (!hasOpener || !settings.enabled || !settings.openerInheritance || !canInheritOpenerForTab(tab)) return;

  let openerContext = await contextForTab(tab.openerTabId);
  if (!openerContext) {
    try {
      const opener = await chrome.tabs.get(tab.openerTabId);
      if (await knownAutoTab(opener)) {
        await safelyProcess(opener, 'opener-story');
        openerContext = await contextForTab(tab.openerTabId);
      }
    } catch {
      return;
    }
  }
  if (!openerContext) return;

  await moveTabToEpic(tab, tabContextForEpic({ ...openerContext, groupId: openerContext.groupId, windowId: tab.windowId, source: 'opener' }), 'opener-inherit');
}

async function routeExternalTabToSelectedWindow(tab, { rememberPending = false, requirePending = false } = {}) {
  await Promise.all([pausedWindowIdsReady, windowAutomationPolicyReady]);
  const tabId = Number(tab?.id);
  const sourceWindowId = Number(tab?.windowId);
  const pendingRoute = pendingExternalTabRoutes.get(tabId);
  const pendingRouteIsCurrent = pendingRoute
    && pendingRoute.sourceWindowId === sourceWindowId
    && pendingRoute.expiresAt > now();
  if (pendingRoute && !pendingRouteIsCurrent) pendingExternalTabRoutes.delete(tabId);
  if (requirePending && !pendingRouteIsCurrent) return false;
  if (windowAutomationPolicy.mode !== 'selected'
    || windowAutomationPolicy.selectedWindowIds.length !== 1
    || windowAutomationPolicy.selectedWindowIds.includes(sourceWindowId)) {
    pendingExternalTabRoutes.delete(tabId);
    return false;
  }
  const sourceTabs = await chrome.tabs.query({ windowId: sourceWindowId });
  const sourceWindowAlreadyExisted = Number(tab?.index) > 0 || sourceTabs.length > 1;
  if (rememberPending && !tab?.pinned && sourceWindowAlreadyExisted) {
    rememberFreshExternalGroupTab(tabId, sourceWindowId);
  }
  const destinationWindowId = externalTabDestinationWindowId(tab, sourceTabs.length, windowAutomationPolicy);
  if (destinationWindowId === null) {
    const hasNoUrl = !String(tab?.pendingUrl || tab?.url || '').trim();
    const hasNoOpener = tab?.openerTabId === undefined || Number(tab.openerTabId) === -1;
    if (rememberPending && hasNoUrl && hasNoOpener && !tab?.pinned && sourceWindowAlreadyExisted) {
      pendingExternalTabRoutes.set(tabId, {
        sourceWindowId,
        expiresAt: now() + EXTERNAL_TAB_ROUTE_CANDIDATE_TTL_MS,
      });
    } else if (requirePending) {
      pendingExternalTabRoutes.delete(tabId);
    }
    return false;
  }
  pendingExternalTabRoutes.delete(tabId);
  if (pausedWindowIds.has(destinationWindowId)) return false;
  const settings = await getSettings();
  if (!settings.enabled) return false;
  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
  if (!windows.some((window) => Number(window.id) === destinationWindowId)) return false;
  try {
    await chrome.tabs.move(tab.id, { windowId: destinationWindowId, index: -1 });
    if (tab.active) {
      await chrome.windows.update(destinationWindowId, { focused: true });
      await chrome.tabs.update(tab.id, { active: true });
    }
    return true;
  } catch {
    return false;
  }
}

async function processCreatedGroup(group, { rememberPending = true, requirePending = false } = {}) {
  await Promise.all([pausedWindowIdsReady, windowAutomationPolicyReady]);
  const groupId = Number(group?.id);
  const sourceWindowId = Number(group?.windowId);
  const pendingGroup = pendingFreshExternalGroups.get(groupId);
  const pendingGroupIsCurrent = pendingGroup
    && pendingGroup.sourceWindowId === sourceWindowId
    && pendingGroup.expiresAt > now();
  if (pendingGroup && !pendingGroupIsCurrent) pendingFreshExternalGroups.delete(groupId);
  if (requirePending && !pendingGroupIsCurrent) return false;
  if (!Number.isInteger(groupId)
    || !Number.isInteger(sourceWindowId)
    || windowAutomationPolicy.mode !== 'selected'
    || windowAutomationPolicy.selectedWindowIds.length !== 1
    || windowAutomationPolicy.selectedWindowIds.includes(sourceWindowId)) {
    pendingFreshExternalGroups.delete(groupId);
    return false;
  }
  if (rememberPending) rememberPendingFreshExternalGroup(groupId, sourceWindowId);
  const destinationWindowId = windowAutomationPolicy.selectedWindowIds[0];
  if (pausedWindowIds.has(destinationWindowId)) return false;
  const groupTabs = await chrome.tabs.query({ groupId });
  if (!groupTabs.length) return false;
  const checkedAt = now();
  const allTabsWereJustCreated = groupTabs.every((tab) => {
    const candidate = freshExternalGroupTabs.get(Number(tab.id));
    if (candidate && candidate.expiresAt <= checkedAt) freshExternalGroupTabs.delete(Number(tab.id));
    return candidate
      && candidate.expiresAt > checkedAt
      && candidate.sourceWindowId === sourceWindowId;
  });
  if (!allTabsWereJustCreated) {
    pendingFreshExternalGroups.delete(groupId);
    return false;
  }
  const settings = await getSettings();
  if (!settings.enabled) return false;
  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
  if (!windows.some((window) => Number(window.id) === destinationWindowId)) return false;
  groupTabs.forEach((tab) => freshExternalGroupTabs.delete(Number(tab.id)));
  pendingFreshExternalGroups.delete(groupId);
  try {
    await chrome.tabGroups.move(groupId, { windowId: destinationWindowId, index: -1 });
    if (groupTabs.some((tab) => tab.active)) {
      await chrome.windows.update(destinationWindowId, { focused: true });
    }
    return true;
  } catch {
    return false;
  }
}

async function safelyProcess(tab, reason, options = {}) {
  const currentUrl = tab.url || '';
  const key = `${tab.id}:${currentUrl}:${reason}`;
  if (tabProcessing.has(key)) return tabProcessing.get(key);
  const request = processTab(tab, reason, options).catch(() => ({ status: 'error' })).finally(() => tabProcessing.delete(key));
  tabProcessing.set(key, request);
  return request;
}

async function syncExistingStoryTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    await pruneContexts(tabs);
    const [rules, smartGroups, enabledTypes, browserPageGroupId, sources, records, openGroups] = await Promise.all([
      getTrainedRules(),
      getSmartGroups(),
      getManagedGroupTypeEnabled(),
      getBrowserPageSmartGroupId(),
      getWorkspaceSources(),
      getRecords(),
      chrome.tabGroups.query({}),
    ]);
    const knownManagedTitles = new Set(Object.values(records).flatMap((record) => [record?.title, record?.epicName]).filter(Boolean));
    const restorableGroupIds = new Set(openGroups
      .filter((group) => knownManagedTitles.has(group.title))
      .map((group) => Number(group.id)));
    const recognizedTabs = tabs.filter((tab) => (
      !tab.pinned
      && (Number(tab.groupId ?? -1) < 0
        || Boolean(recordForGroup(records, tab.groupId, tab.windowId))
        || restorableGroupIds.has(Number(tab.groupId)))
      && (
      workspaceSourceIsAutomatic(tab.url, enabledTypes, sources)
      || (isBrowserPageUrl(tab.url) && enabledTypes.smart && browserPageSmartGroup(smartGroups, browserPageGroupId))
      || bestUrlAssignmentForUrl(smartGroups, rules, tab.url, enabledTypes)
      )
    ));
    await runWithConcurrency(recognizedTabs, (tab) => safelyProcess(tab, 'startup-sync'));
    await Promise.all([...new Set(tabs.map((tab) => Number(tab.windowId)))].map((windowId) => applyManagedGroupColors(windowId)));
    if (await autoOrganizeGroupsEnabled()) {
      await Promise.all([...new Set(tabs.map((tab) => Number(tab.windowId)))].map((windowId) => organizeWindow(windowId)));
    }
  } catch {
    // A browser window can disappear while startup tabs are being inspected.
  }
}

async function reconcileManagedGroupTypeSettings() {
  const [tabs, records, smartGroups, enabledTypes] = await Promise.all([
    chrome.tabs.query({}),
    getRecords(),
    getSmartGroups(),
    getManagedGroupTypeEnabled(),
  ]);
  const designatedFocusGroup = focusSmartGroup(smartGroups);
  const disabledRecords = Object.entries(records).filter(([, record]) => {
    const workspaceType = managedWorkspaceType(recordWithFocusCategory(record, designatedFocusGroup));
    return !managedGroupTypeIsEnabled(enabledTypes, workspaceType);
  });
  if (!disabledRecords.length) {
    await syncExistingStoryTabs();
    return { releasedCount: 0 };
  }

  const disabledGroupIds = new Set(disabledRecords.map(([, record]) => Number(record.groupId)));
  const releasedTabs = tabs.filter((tab) => !tab.pinned && disabledGroupIds.has(Number(tab.groupId)));
  const nextRecords = { ...records };
  disabledRecords.forEach(([key]) => delete nextRecords[key]);
  await setRecords(nextRecords);

  await Promise.all(releasedTabs.map(async (tab) => {
    await Promise.all([
      forgetTabContext(tab.id),
      releaseTabFocusHold(tab.id),
    ]);
  }));
  if (releasedTabs.length) {
    await chrome.tabs.ungroup(releasedTabs.map((tab) => Number(tab.id)));
    await runWithConcurrency(
      releasedTabs.map((tab) => ({ ...tab, groupId: -1 })),
      (tab) => safelyProcess(tab, 'workspace-category-change', { ignoreEnabled: true }),
    );
  }
  await syncExistingStoryTabs();
  return { releasedCount: releasedTabs.length };
}

async function syncWindowTabs(windowId, reason = 'window-resumed') {
  const normalizedWindowId = Number(windowId);
  if (await isWindowPaused(normalizedWindowId)) return 0;
  const [tabs, groups, records, rules, smartGroups, enabledTypes, browserPageGroupId, sources] = await Promise.all([
    chrome.tabs.query({ windowId: normalizedWindowId }),
    chrome.tabGroups.query({ windowId: normalizedWindowId }),
    getRecords(),
    getTrainedRules(),
    getSmartGroups(),
    getManagedGroupTypeEnabled(),
    getBrowserPageSmartGroupId(),
    getWorkspaceSources(),
  ]);
  const managedGroupIds = new Set(groups
    .filter((group) => recordForGroup(records, group.id, normalizedWindowId))
    .map((group) => Number(group.id)));
  const recognizedTabs = tabs.filter((tab) => (
    !tab.pinned
    && (Number(tab.groupId ?? -1) < 0 || managedGroupIds.has(Number(tab.groupId)))
    && (
      workspaceSourceIsAutomatic(tab.url, enabledTypes, sources)
      || (isBrowserPageUrl(tab.url) && enabledTypes.smart && browserPageSmartGroup(smartGroups, browserPageGroupId))
      || bestUrlAssignmentForUrl(smartGroups, rules, tab.url, enabledTypes)
    )
  ));
  await runWithConcurrency(recognizedTabs, (tab) => safelyProcess(tab, reason));
  await applyManagedGroupColors(normalizedWindowId);
  await maybeOrganizeWindow(normalizedWindowId);
  return recognizedTabs.length;
}

function windowLabel(window, index) {
  const activeTab = Array.isArray(window.tabs)
    ? window.tabs.find((tab) => tab.active) || window.tabs[0]
    : null;
  return {
    id: Number(window.id),
    label: `Window ${index + 1}`,
    detail: activeTab?.title || activeTab?.url || 'No active tab',
    focused: window.focused === true,
    tabCount: Array.isArray(window.tabs) ? window.tabs.length : 0,
  };
}

async function getWindowAutomationPolicyData() {
  await windowAutomationPolicyReady;
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  return {
    ok: true,
    mode: windowAutomationPolicy.mode,
    selectedWindowIds: [...windowAutomationPolicy.selectedWindowIds],
    windows: windows
      .sort((left, right) => Number(right.focused) - Number(left.focused) || Number(left.id) - Number(right.id))
      .map(windowLabel),
  };
}

async function updateWindowAutomationPolicy(mode, selectedWindowIds) {
  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
  const openWindowIds = new Set(windows.map((window) => Number(window.id)));
  const policy = await setWindowAutomationPolicy(
    mode,
    (Array.isArray(selectedWindowIds) ? selectedWindowIds : []).filter((windowId) => openWindowIds.has(Number(windowId))),
  );
  await Promise.all(windows
    .filter((window) => windowAllowedByPolicy(window.id, policy))
    .map((window) => syncWindowTabs(window.id, 'window-policy-enabled')));
  const selectedCount = policy.mode === 'all' ? windows.length : policy.selectedWindowIds.length;
  return {
    ok: true,
    ...policy,
    message: policy.mode === 'all'
      ? 'Tab Bundlr will run in all Chrome windows for this session.'
      : selectedCount
        ? `Tab Bundlr will run in ${selectedCount} selected window${selectedCount === 1 ? '' : 's'} for this session.`
        : 'Tab Bundlr is disabled in every Chrome window for this session.',
  };
}

async function setWindowAutomationPaused(windowId, paused) {
  const normalizedWindowId = Number(windowId);
  const windowExists = await chrome.windows.get(normalizedWindowId).then(() => true).catch(() => false);
  if (!windowExists) return { ok: false, message: 'That Chrome window is no longer open.' };
  await setWindowPaused(normalizedWindowId, paused);
  if (paused) {
    return {
      ok: true,
      windowPaused: true,
      message: 'Tab Bundlr is paused in this window. Tabs will stay where you put them.',
    };
  }
  const automationState = await getWindowAutomationState(normalizedWindowId);
  if (!automationState.policyAllowed) {
    return {
      ok: false,
      windowPaused: true,
      windowPauseReason: 'not-selected',
      message: 'This window is excluded by your Window automation settings.',
    };
  }
  const recognizedCount = await syncWindowTabs(normalizedWindowId);
  return {
    ok: true,
    windowPaused: false,
    recognizedCount,
    message: recognizedCount
      ? `Tab Bundlr resumed and checked ${recognizedCount} recognized tab${recognizedCount === 1 ? '' : 's'}.`
      : 'Tab Bundlr resumed in this window.',
  };
}

async function undoActivity(activityIdValue = null) {
  const history = await getActivityHistory();
  const action = activityIdValue
    ? history.find((candidate) => candidate.id === String(activityIdValue))
    : history[0];
  if (!action?.moves?.length) return { ok: false, message: 'There is no automatic action to undo.' };

  const undone = [];
  for (const move of [...action.moves].reverse()) {
    try {
      const tab = await chrome.tabs.get(move.tabId);
      if (tab.pinned) continue;
      if (Number(tab.groupId) !== Number(move.groupId)) continue;
      if (Number(move.previousGroupId) >= 0) {
        await chrome.tabs.group({ tabIds: [move.tabId], groupId: move.previousGroupId });
      } else {
        await chrome.tabs.ungroup(move.tabId);
      }
      await forgetTabContext(move.tabId);
      undone.push(move.tabId);
    } catch {
      // The user may have closed or moved the tab after the automatic action.
    }
  }
  await chrome.storage.local.set({
    [ACTIVITY_HISTORY_STORAGE_KEY]: history.filter((candidate) => candidate.id !== action.id),
  });
  return { ok: true, undoneCount: undone.length, message: undone.length ? `Undid ${undone.length} automatic tab move${undone.length === 1 ? '' : 's'}.` : 'Nothing still matched the last automatic action.' };
}

function recordForGroup(records, groupId, windowId) {
  return Object.values(records).find((record) => (
    Number(record.groupId) === Number(groupId) && Number(record.windowId) === Number(windowId)
  )) || null;
}

function focusManagedGroupIds(records, smartGroups, windowId = null) {
  const group = focusSmartGroup(smartGroups);
  if (!group) return new Set();
  return new Set(Object.values(records)
    .filter((record) => (
      record?.workspaceType === 'smart'
      && String(record.smartGroupId) === String(group.id)
      && (windowId === null || Number(record.windowId) === Number(windowId))
    ))
    .map((record) => Number(record.groupId)));
}

async function performFocusHeldTabsReconciliation() {
  const [tabs, records, smartGroups, enabledTypes] = await Promise.all([
    chrome.tabs.query({}),
    getRecords(),
    getSmartGroups(),
    getManagedGroupTypeEnabled(),
  ]);
  const focusGroupIds = enabledTypes['focus-smart'] ? focusManagedGroupIds(records, smartGroups) : new Set();
  const heldTabs = Object.fromEntries(tabs
    .filter((tab) => focusGroupIds.has(Number(tab.groupId)))
    .map((tab) => [String(tab.id), Number(tab.groupId)]));
  focusHeldTabsWrite = focusHeldTabsWrite.then(() => chrome.storage.local.set({ [FOCUS_HELD_TABS_STORAGE_KEY]: heldTabs }));
  await focusHeldTabsWrite;
  return heldTabs;
}

async function reconcileFocusHeldTabs() {
  if (focusHeldTabsReconcileRequest) {
    focusHeldTabsReconcileAgain = true;
    return focusHeldTabsReconcileRequest;
  }
  focusHeldTabsReconcileRequest = (async () => {
    let heldTabs = {};
    do {
      focusHeldTabsReconcileAgain = false;
      heldTabs = await performFocusHeldTabsReconciliation();
    } while (focusHeldTabsReconcileAgain);
    return heldTabs;
  })().finally(() => {
    focusHeldTabsReconcileRequest = null;
  });
  return focusHeldTabsReconcileRequest;
}

async function retireLegacyFocusGroups() {
  const [records, contexts] = await Promise.all([getRecords(), getContexts()]);
  const legacyRecordKeys = new Set(Object.entries(records)
    .filter(([, record]) => record?.workspaceType === 'focus')
    .map(([key]) => key));
  const nextRecords = Object.fromEntries(Object.entries(records)
    .filter(([key]) => !legacyRecordKeys.has(key)));
  const nextContexts = Object.fromEntries(Object.entries(contexts)
    .filter(([, context]) => context?.workspaceType !== 'focus'));
  await Promise.all([
    legacyRecordKeys.size ? setRecords(nextRecords) : Promise.resolve(),
    Object.keys(nextContexts).length !== Object.keys(contexts).length ? setContexts(nextContexts) : Promise.resolve(),
    chrome.storage.local.remove(FOCUS_GROUPS_STORAGE_KEY),
  ]);
}

function newFocusGroupId() {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `focus-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function reconcileFocusGroups() {
  const [definitions, records, contexts, groups, tabs] = await Promise.all([
    getFocusGroups(),
    getRecords(),
    getContexts(),
    chrome.tabGroups.query({}),
    chrome.tabs.query({}),
  ]);
  const definitionById = new Map(definitions.map((definition) => [String(definition.id), definition]));
  const groupByKey = new Map(groups.map((group) => [`${Number(group.windowId)}:${Number(group.id)}`, group]));
  const nextRecords = { ...records };
  const nextContexts = { ...contexts };
  let recordsChanged = false;
  let contextsChanged = false;
  const occupiedGroups = new Set(Object.values(records)
    .filter((record) => groupByKey.has(`${Number(record.windowId)}:${Number(record.groupId)}`))
    .map((record) => `${Number(record.windowId)}:${Number(record.groupId)}`));
  const claimedGroups = new Set(Object.values(records)
    .filter((record) => record?.workspaceType === 'focus' && groupByKey.has(`${Number(record.windowId)}:${Number(record.groupId)}`))
    .map((record) => `${Number(record.windowId)}:${Number(record.groupId)}`));

  for (const [key, record] of Object.entries(records)) {
    if (record?.workspaceType !== 'focus') continue;
    const definition = definitionById.get(String(record.focusGroupId));
    let liveGroup = groupByKey.get(`${Number(record.windowId)}:${Number(record.groupId)}`);
    if (!definition) {
      delete nextRecords[key];
      recordsChanged = true;
      Object.entries(nextContexts).forEach(([tabId, context]) => {
        if (context?.workspaceType !== 'focus' || String(context.focusGroupId) !== String(record.focusGroupId)) return;
        delete nextContexts[tabId];
        contextsChanged = true;
      });
      continue;
    }

    if (!liveGroup) {
      const restoredCandidates = groups.filter((group) => (
        !claimedGroups.has(`${Number(group.windowId)}:${Number(group.id)}`)
        && !occupiedGroups.has(`${Number(group.windowId)}:${Number(group.id)}`)
        && (group.title === record.title || group.title === definition.name)
      ));
      if (restoredCandidates.length === 1) {
        liveGroup = restoredCandidates[0];
        claimedGroups.add(`${Number(liveGroup.windowId)}:${Number(liveGroup.id)}`);
        occupiedGroups.add(`${Number(liveGroup.windowId)}:${Number(liveGroup.id)}`);
      }
    }

    const windowId = Number(liveGroup?.windowId ?? record.windowId);
    const windowGroups = groups.filter((group) => Number(group.windowId) === windowId);
    const title = managedGroupTitle(definition.name, liveGroup?.id, windowGroups);
    const updatedRecord = {
      ...record,
      epicName: definition.name,
      groupId: Number(liveGroup?.id ?? record.groupId),
      windowId,
      title,
      updatedAt: definition.updatedAt,
    };
    const nextKey = groupRecordKey(windowId, record.epicId, 'focus');
    if (key !== nextKey) delete nextRecords[key];
    if (
      key !== nextKey
      || record.epicName !== updatedRecord.epicName
      || record.title !== updatedRecord.title
      || Number(record.groupId) !== Number(updatedRecord.groupId)
      || Number(record.windowId) !== Number(updatedRecord.windowId)
    ) {
      nextRecords[nextKey] = updatedRecord;
      recordsChanged = true;
    }
    Object.entries(nextContexts).forEach(([tabId, context]) => {
      if (context?.workspaceType !== 'focus' || String(context.focusGroupId) !== String(record.focusGroupId)) return;
      if (context.epicName === definition.name) return;
      nextContexts[tabId] = { ...context, epicName: definition.name };
      contextsChanged = true;
    });
    if (liveGroup) {
      tabs
        .filter((tab) => Number(tab.windowId) === windowId && Number(tab.groupId) === Number(liveGroup.id))
        .forEach((tab) => {
          const nextContext = tabContextForFocus(updatedRecord, tab);
          if (JSON.stringify(nextContexts[String(tab.id)]) === JSON.stringify(nextContext)) return;
          nextContexts[String(tab.id)] = nextContext;
          contextsChanged = true;
        });
    }
    if (liveGroup && liveGroup.title !== title) {
      try {
        await chrome.tabGroups.update(liveGroup.id, { title });
      } catch {
        // The group can close while saved Focus Group names are being reconciled.
      }
    }
  }

  for (const definition of definitions) {
    const hasRecordedCopy = Object.values(nextRecords).some((record) => (
      record?.workspaceType === 'focus' && String(record.focusGroupId) === String(definition.id)
    ));
    if (hasRecordedCopy) continue;
    const matchingGroups = groups.filter((group) => (
      !claimedGroups.has(`${Number(group.windowId)}:${Number(group.id)}`)
      && !occupiedGroups.has(`${Number(group.windowId)}:${Number(group.id)}`)
      && (group.title === definition.name || group.title === collisionGroupTitle(definition.name))
    ));
    for (const group of matchingGroups) {
      const workspaceId = focusGroupWorkspaceId(definition.id);
      const record = {
        epicId: workspaceId,
        epicName: definition.name,
        workspaceType: 'focus',
        smartGroupId: null,
        focusGroupId: String(definition.id),
        groupId: Number(group.id),
        title: group.title || definition.name,
        color: group.color,
        windowId: Number(group.windowId),
        updatedAt: definition.updatedAt,
      };
      nextRecords[groupRecordKey(group.windowId, workspaceId, 'focus')] = record;
      claimedGroups.add(`${Number(group.windowId)}:${Number(group.id)}`);
      occupiedGroups.add(`${Number(group.windowId)}:${Number(group.id)}`);
      recordsChanged = true;
      tabs
        .filter((tab) => Number(tab.windowId) === Number(group.windowId) && Number(tab.groupId) === Number(group.id))
        .forEach((tab) => {
          nextContexts[String(tab.id)] = tabContextForFocus(record, tab);
          contextsChanged = true;
        });
    }
  }

  if (recordsChanged) await setRecords(nextRecords);
  if (contextsChanged) await setContexts(nextContexts);
}

async function startFocusGroup(focusGroupIdValue, nameValue) {
  const currentWindow = await chrome.windows.getCurrent();
  const windowId = Number(currentWindow.id);
  const [activeTab, definitions, records, groups, configuredColors] = await Promise.all([
    chrome.tabs.query({ windowId, active: true }).then(([tab]) => tab),
    getFocusGroups(),
    getRecords(),
    chrome.tabGroups.query({ windowId }),
    getManagedGroupColors(),
  ]);
  if (!activeTab) return { ok: false, message: 'Choose an active tab first.' };
  if (activeTab.pinned) return { ok: false, message: 'Pinned tabs stay independent of Tab Bundlr groups.' };

  const isNew = String(focusGroupIdValue) === '__new__';
  const name = normalizeEpicName(nameValue);
  if (isNew && name === 'Unnamed Workspace') return { ok: false, message: 'Add a name for the new Focus Group.' };
  if (isNew && definitions.some((definition) => definition.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, message: `A Focus Group named ${name} already exists.` };
  }
  const definition = isNew
    ? { id: newFocusGroupId(), name, updatedAt: new Date().toISOString() }
    : definitions.find((candidate) => String(candidate.id) === String(focusGroupIdValue));
  if (!definition) return { ok: false, message: 'Choose a saved Focus Group or create a new one.' };
  if (isNew) await setFocusGroups([...definitions, definition]);

  const workspaceId = focusGroupWorkspaceId(definition.id);
  const existingRecord = records[groupRecordKey(windowId, workspaceId, 'focus')];
  const existingGroup = existingRecord
    ? groups.find((group) => Number(group.id) === Number(existingRecord.groupId))
    : null;
  const activeRecord = recordForGroup(records, activeTab.groupId, windowId);
  const activeManualGroup = Number(activeTab.groupId ?? -1) >= 0 && !activeRecord
    ? groups.find((group) => Number(group.id) === Number(activeTab.groupId))
    : null;

  if (!existingGroup && activeManualGroup) {
    const title = managedGroupTitle(definition.name, activeManualGroup.id, groups);
    const color = managedColorForWorkspace({
      workspaceType: 'focus',
      epicId: workspaceId,
      focusGroupId: definition.id,
    }, configuredColors);
    const group = await chrome.tabGroups.update(activeManualGroup.id, { title, color });
    records[groupRecordKey(windowId, workspaceId, 'focus')] = {
      epicId: workspaceId,
      epicName: definition.name,
      workspaceType: 'focus',
      smartGroupId: null,
      focusGroupId: String(definition.id),
      groupId: Number(group.id),
      title: group.title || title,
      color,
      windowId,
      updatedAt: new Date().toISOString(),
    };
    await setRecords(records);
    const [groupTabs, contexts] = await Promise.all([
      chrome.tabs.query({ windowId, groupId: Number(group.id) }),
      getContexts(),
    ]);
    groupTabs.forEach((tab) => {
      contexts[String(tab.id)] = tabContextForFocus(records[groupRecordKey(windowId, workspaceId, 'focus')], tab);
    });
    await setContexts(contexts);
    maybeOrganizeWindow(windowId).catch(() => {});
    await focusWorkspace(group.id).catch(() => null);
    return { ok: true, groupId: Number(group.id), message: `Protected ${definition.name} as a Focus Group.` };
  }

  const move = await moveTabToEpic(activeTab, tabContextForEpic({
    epicId: workspaceId,
    epicName: definition.name,
    groupId: existingGroup?.id ?? -1,
    windowId,
    source: 'focus',
    workspaceType: 'focus',
    focusGroupId: definition.id,
  }), 'focus-group-start');
  if (Number.isFinite(Number(move.groupId))) await focusWorkspace(move.groupId).catch(() => null);
  return {
    ok: true,
    groupId: Number(move.groupId),
    message: `${existingGroup ? 'Moved the active tab to' : 'Started'} ${definition.name}. Focus protection is active.`,
  };
}

async function releaseFocusGroup(groupId) {
  const group = await chrome.tabGroups.get(Number(groupId));
  const [records, contexts, tabs] = await Promise.all([
    getRecords(),
    getContexts(),
    chrome.tabs.query({ windowId: group.windowId, groupId: Number(groupId) }),
  ]);
  const recordEntry = Object.entries(records).find(([, record]) => (
    record?.workspaceType === 'focus'
    && Number(record.groupId) === Number(groupId)
    && Number(record.windowId) === Number(group.windowId)
  ));
  if (!recordEntry) return { ok: false, message: 'That group is not protected as a Focus Group.' };
  const [recordKey, record] = recordEntry;
  delete records[recordKey];
  tabs.forEach((tab) => delete contexts[String(tab.id)]);
  const hasOtherOpenCopy = Object.values(records).some((candidate) => (
    candidate?.workspaceType === 'focus'
    && String(candidate.focusGroupId) === String(record.focusGroupId)
  ));
  const definitions = hasOtherOpenCopy
    ? null
    : getFocusGroups().then((groups) => groups.filter((groupDefinition) => String(groupDefinition.id) !== String(record.focusGroupId)));
  await Promise.all([
    setRecords(records),
    setContexts(contexts),
    definitions ? definitions.then((groups) => setFocusGroups(groups)) : Promise.resolve(),
  ]);
  return { ok: true, message: `Released ${record.epicName}. Its tabs remain together as a manual Chrome group.` };
}

async function renameFocusGroup(focusGroupIdValue, nameValue) {
  const definitions = await getFocusGroups();
  const name = normalizeEpicName(nameValue);
  const id = String(focusGroupIdValue || '');
  const current = definitions.find((definition) => definition.id === id);
  if (!current) return { ok: false, message: 'That Focus Group no longer exists.' };
  if (name === 'Unnamed Workspace') return { ok: false, message: 'Add a name for this Focus Group.' };
  if (definitions.some((definition) => definition.id !== id && definition.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, message: `A Focus Group named ${name} already exists.` };
  }
  await setFocusGroups(definitions.map((definition) => definition.id === id
    ? { ...definition, name, updatedAt: new Date().toISOString() }
    : definition));
  await reconcileFocusGroups();
  return { ok: true, message: `Renamed ${current.name} to ${name}.` };
}

async function deleteFocusGroup(focusGroupIdValue) {
  const definitions = await getFocusGroups();
  const id = String(focusGroupIdValue || '');
  const current = definitions.find((definition) => definition.id === id);
  if (!current) return { ok: false, message: 'That Focus Group no longer exists.' };
  await setFocusGroups(definitions.filter((definition) => definition.id !== id));
  await reconcileFocusGroups();
  return { ok: true, message: `Removed ${current.name}. Any open copy is now a manual Chrome group.` };
}

async function focusWorkspace(groupId) {
  const currentWindow = await chrome.windows.getCurrent();
  const windowId = Number(currentWindow.id);
  const [groups, tabs, records] = await Promise.all([
    chrome.tabGroups.query({ windowId }),
    chrome.tabs.query({ windowId }),
    getRecords(),
  ]);
  const target = groups.find((group) => Number(group.id) === Number(groupId));
  const targetRecord = recordForGroup(records, groupId, windowId);
  if (!target || !targetRecord) return { ok: false, message: 'That workspace is no longer open.' };
  const targetTabs = tabs.filter((tab) => Number(tab.groupId) === Number(groupId));
  if (!targetTabs.length) return { ok: false, message: 'That workspace has no open tabs.' };

  await Promise.all(groups
    .filter((group) => Number(group.id) !== Number(groupId) && recordForGroup(records, group.id, windowId))
    .map((group) => chrome.tabGroups.update(group.id, { collapsed: true })));
  await chrome.tabGroups.update(group.id, { collapsed: false });
  await chrome.windows.update(windowId, { focused: true });
  await chrome.tabs.update(targetTabs.find((tab) => tab.active)?.id || targetTabs[0].id, { active: true });
  return { ok: true, message: `Focused ${targetRecord.epicName}.` };
}

async function addActiveTabToWorkspace(groupId) {
  const currentWindow = await chrome.windows.getCurrent();
  const windowId = Number(currentWindow.id);
  const [activeTab] = await chrome.tabs.query({ windowId, active: true });
  return moveTabOnceToWorkspace(activeTab, groupId, 'manual-add');
}

async function moveTabOnceToWorkspace(tab, groupId, reason = 'review-move-once') {
  if (await isWindowPaused(tab?.windowId)) {
    return { ok: false, windowPaused: true, message: 'Select or resume this window before moving tabs with Tab Bundlr.' };
  }
  const [records, smartGroups] = await Promise.all([getRecords(), getSmartGroups()]);
  const record = recordForGroup(records, groupId, tab?.windowId);
  if (!tab || !record) return { ok: false, message: 'Choose an open managed workspace in this tab’s window.' };
  if (tab.pinned) return { ok: false, message: 'Pinned tabs stay independent of Tab Bundlr groups.' };
  if (Number(tab.groupId) === Number(groupId)) return { ok: true, message: 'The tab is already in this workspace.' };

  const previousGroupId = Number(tab.groupId ?? -1);
  await chrome.tabs.group({ tabIds: [tab.id], groupId: Number(groupId) });
  const designatedFocusGroup = focusSmartGroup(smartGroups);
  const isFocusDestination = record.workspaceType === 'smart'
    && designatedFocusGroup
    && String(record.smartGroupId) === String(designatedFocusGroup.id);
  if (isFocusDestination) {
    await markTabFocusHeld(tab.id, groupId);
  } else {
    await rememberTabContext(tab.id, tabContextForEpic({
      epicId: record.epicId,
      epicName: record.epicName,
      groupId,
      windowId: tab.windowId,
      storyId: null,
      source: 'manual',
      workspaceType: record.workspaceType,
      smartGroupId: record.smartGroupId,
      focusGroupId: record.focusGroupId,
    }));
  }
  await appendLastAction({
    tabId: Number(tab.id),
    tabTitle: tab.title || tab.url || 'Tab',
    previousGroupId,
    groupId: Number(groupId),
    epicId: String(record.epicId),
    workspaceName: record.epicName,
    url: tab.url || '',
    reason,
  });
  return {
    ok: true,
    message: isFocusDestination
      ? `Moved ${tab.title || 'the tab'} to ${record.epicName}. It will stay there until you move it out.`
      : `Moved ${tab.title || 'the tab'} to ${record.epicName} without saving a rule.`,
  };
}

async function reviewInboxData() {
  await Promise.all([pausedWindowIdsReady, windowAutomationPolicyReady]);
  const pausedWindows = new Set(pausedWindowIds);
  const [tabs, groups, records, contexts, trainedRules, smartGroups, savedClientGroups, activityHistory, enabledTypes] = await Promise.all([
    chrome.tabs.query({}),
    chrome.tabGroups.query({}),
    getRecords(),
    getContexts(),
    getTrainedRules(),
    getSmartGroups(),
    getSavedClientGroups(),
    getActivityHistory(),
    getManagedGroupTypeEnabled(),
  ]);
  const groupByKey = new Map(groups.map((group) => [`${Number(group.windowId)}:${Number(group.id)}`, group]));
  const managedGroupKeys = new Set(Object.values(records).map((record) => `${Number(record.windowId)}:${Number(record.groupId)}`));
  const focusIds = focusManagedGroupIds(records, smartGroups);
  const focusGroupKeys = new Set(Object.values(records)
    .filter((record) => focusIds.has(Number(record.groupId)))
    .map((record) => `${Number(record.windowId)}:${Number(record.groupId)}`));
  const unassignedTabs = tabs
    .filter((tab) => (
      !pausedWindows.has(Number(tab.windowId))
      && windowAllowedByPolicy(tab.windowId, windowAutomationPolicy)
    ))
    .map((tab) => ({
      tab,
      diagnosis: diagnoseTabAssignment(
        tab,
        smartGroups,
        trainedRules,
        contexts[String(tab.id)] || null,
        managedGroupKeys,
        focusGroupKeys,
        enabledTypes,
      ),
    }))
    .filter(({ diagnosis }) => diagnosis.state === 'unassigned')
    .sort((left, right) => Number(right.tab.active) - Number(left.tab.active)
      || Number(right.tab.lastAccessed || 0) - Number(left.tab.lastAccessed || 0))
    .map(({ tab, diagnosis }) => ({
      id: Number(tab.id),
      windowId: Number(tab.windowId),
      groupId: Number(tab.groupId ?? -1),
      title: tab.title || tab.url || 'Untitled tab',
      url: tab.url || '',
      roleLabel: tabRoleLabel(tabRoleForUrl(tab.url)),
      groupLabel: Number(tab.groupId ?? -1) >= 0
        ? groupByKey.get(`${Number(tab.windowId)}:${Number(tab.groupId)}`)?.title || 'Managed group'
        : 'Ungrouped',
      proposedPattern: diagnosis.normalizedUrl,
      reason: diagnosis.reason,
    }));
  const openDestinations = Object.values(records)
    .filter((record) => (
      !pausedWindows.has(Number(record.windowId))
      && windowAllowedByPolicy(record.windowId, windowAutomationPolicy)
    ))
    .filter((record) => groupByKey.has(`${Number(record.windowId)}:${Number(record.groupId)}`))
    .map((record) => ({
      groupId: Number(record.groupId),
      windowId: Number(record.windowId),
      name: record.epicName,
      workspaceType: record.workspaceType,
    }));
  const clientGroups = mergeSavedClientGroupEntries([
    ...savedClientGroups,
    ...Object.values(records)
      .filter((record) => record?.workspaceType === 'epic')
      .map((record) => ({ epicId: record.epicId, epicName: record.epicName })),
  ]);
  return {
    ok: true,
    unassignedTabs,
    smartGroups: smartGroups.map((group) => ({ id: String(group.id), name: group.name })),
    clientGroups,
    openDestinations,
    activityHistory: activityHistory.map((activity) => ({
      id: activity.id,
      createdAt: activity.createdAt,
      label: activity.label,
      reason: activity.reason,
      moveCount: activity.moves.length,
    })),
  };
}

async function assignReviewTab({ tabId, assignmentType, targetId, targetName, pattern: patternValue }) {
  const tab = await chrome.tabs.get(Number(tabId));
  if (await isWindowPaused(tab.windowId)) {
    return { ok: false, windowPaused: true, message: 'Select or resume this window before assigning its tabs.' };
  }
  const [records, contexts, smartGroups, trainedRules, enabledTypes, sources] = await Promise.all([
    getRecords(),
    getContexts(),
    getSmartGroups(),
    getTrainedRules(),
    getManagedGroupTypeEnabled(),
    getWorkspaceSources(),
  ]);
  if (workspaceSourceIsAutomatic(tab.url, enabledTypes, sources)) {
    return { ok: false, message: 'This tab is controlled by an enabled Workspace Source.' };
  }
  const managedGroupKeys = new Set(Object.values(records).map((record) => `${Number(record.windowId)}:${Number(record.groupId)}`));
  const focusIds = focusManagedGroupIds(records, smartGroups);
  const focusGroupKeys = new Set(Object.values(records)
    .filter((record) => focusIds.has(Number(record.groupId)))
    .map((record) => `${Number(record.windowId)}:${Number(record.groupId)}`));
  const diagnosis = diagnoseTabAssignment(
    tab,
    smartGroups,
    trainedRules,
    contexts[String(tab.id)] || null,
    managedGroupKeys,
    focusGroupKeys,
    enabledTypes,
  );
  if (diagnosis.state !== 'unassigned') return { ok: false, message: diagnosis.reason };
  if (assignmentType === 'move-once') return moveTabOnceToWorkspace(tab, Number(targetId), 'review-move-once');

  const pattern = trainingPatternForUrl(patternValue || tab.url);
  if (!pattern) return { ok: false, message: 'Use an http or https URL prefix.' };
  if (assignmentType === 'smart') {
    const target = smartGroups.find((group) => String(group.id) === String(targetId));
    if (!target) return { ok: false, message: 'Choose an existing Smart Group.' };
    const targetWorkspaceType = target.focusMode === true ? 'focus-smart' : 'smart';
    if (!managedGroupTypeIsEnabled(enabledTypes, targetWorkspaceType)) {
      return { ok: false, message: `${targetWorkspaceType === 'focus-smart' ? 'Focus Smart Groups are' : 'Smart Groups are'} disabled in Workspace settings.` };
    }
    const owner = smartGroups.find((group) => smartGroupPatterns(group).includes(pattern));
    if (owner && String(owner.id) !== String(target.id)) return { ok: false, message: `That prefix already belongs to ${owner.name}.` };
    const nextGroups = smartGroups.map((group) => String(group.id) === String(target.id)
      ? { ...group, patterns: [...new Set([...smartGroupPatterns(group), pattern])], updatedAt: new Date().toISOString() }
      : group);
    await chrome.storage.local.set({ [SMART_GROUPS_STORAGE_KEY]: nextGroups });
    invalidateLocalSnapshots('smartGroups');
    const move = await processTab(tab, 'smart-group-add', { ignoreEnabled: true });
    return { ok: true, moved: Boolean(move?.moved), message: `Assigned ${tab.title || 'the tab'} to ${target.name}.` };
  }
  if (assignmentType === 'client') {
    if (!managedGroupTypeIsEnabled(enabledTypes, 'client')) {
      return { ok: false, message: 'Saved workspaces are disabled in Workspace settings.' };
    }
    const epicId = String(targetId || '').trim();
    const epicName = normalizeEpicName(targetName);
    if (!epicId || epicName === 'Unnamed Workspace') return { ok: false, message: 'Choose a saved workspace.' };
    await setTrainedRules([
      ...trainedRules.filter((rule) => clientRulePatternKey(rule.pattern) !== clientRulePatternKey(pattern)),
      { pattern, epicId, epicName, roleLabel: tabRoleLabel(tabRoleForUrl(tab.url)), updatedAt: new Date().toISOString() },
    ]);
    await rememberSavedClientGroups([{ epicId, epicName }]);
    const move = await moveTabToEpic(tab, tabContextForEpic({
      epicId,
      epicName,
      groupId: -1,
      windowId: tab.windowId,
      source: 'learned',
    }), 'learned-rule-add');
    return { ok: true, moved: Boolean(move?.moved), message: `Assigned ${tab.title || 'the tab'} to ${epicName}.` };
  }
  return { ok: false, message: 'Choose a Smart Group, saved workspace, or one-time destination.' };
}

async function teachActiveTabToWorkspace(groupId) {
  const currentWindow = await chrome.windows.getCurrent();
  const windowId = Number(currentWindow.id);
  if (await isWindowPaused(windowId)) {
    return { ok: false, windowPaused: true, message: 'Select or resume this window before remembering a link.' };
  }
  const [activeTab, records, rules, enabledTypes, sources] = await Promise.all([
    chrome.tabs.query({ windowId, active: true }).then(([tab]) => tab),
    getRecords(),
    getTrainedRules(),
    getManagedGroupTypeEnabled(),
    getWorkspaceSources(),
  ]);
  const record = recordForGroup(records, groupId, windowId);
  const pattern = trainingPatternForUrl(activeTab?.url);
  if (!activeTab || !record) return { ok: false, message: 'Choose an open saved workspace first.' };
  if (activeTab.pinned) return { ok: false, message: 'Pinned tabs stay independent of Tab Bundlr groups.' };
  if (!pattern) return { ok: false, message: 'This tab cannot be learned as a workspace link.' };
  if (!managedGroupTypeIsEnabled(enabledTypes, 'client')) {
    return { ok: false, message: 'Saved workspaces are disabled in Workspace settings.' };
  }
  if (workspaceSourceIsAutomatic(activeTab.url, enabledTypes, sources)) {
    return { ok: false, message: 'This tab is controlled by an enabled Workspace Source.' };
  }

  const coveredRule = bestTrainedRuleForUrl(rules, activeTab.url);
  if (coveredRule && String(coveredRule.epicId) === String(record.epicId)) {
    const move = await moveTabToEpic(activeTab, tabContextForEpic({
      epicId: record.epicId,
      epicName: record.epicName,
      groupId,
      windowId,
      source: 'learned',
    }), 'learned-rule');
    return {
      ok: true,
      alreadyCovered: true,
      moved: move.moved,
      message: move.moved
        ? `Already covered by ${record.epicName}; moved the tab into that workspace.`
        : `Already covered by ${record.epicName}. No new rule was added.`,
    };
  }

  const nextRules = [
    ...rules.filter((rule) => clientRulePatternKey(rule.pattern) !== clientRulePatternKey(pattern)),
    {
      pattern,
      epicId: String(record.epicId),
      epicName: record.epicName,
      roleLabel: tabRoleLabel(tabRoleForUrl(activeTab.url)),
      updatedAt: new Date().toISOString(),
    },
  ];
  await setTrainedRules(nextRules);
  await moveTabToEpic(activeTab, tabContextForEpic({
    epicId: record.epicId,
    epicName: record.epicName,
    groupId,
    windowId,
    source: 'learned',
  }), 'learned-rule');
  return { ok: true, message: `Learned ${pattern} for ${record.epicName}.` };
}

async function addClientRuleForActiveTab(groupId, value, epicNameValue, epicIdValue, requestedWindowId = null) {
  const parsedWindowId = Number(requestedWindowId);
  const windowId = Number.isInteger(parsedWindowId) && parsedWindowId >= 0
    ? parsedWindowId
    : Number((await chrome.windows.getCurrent()).id);
  if (await isWindowPaused(windowId)) {
    return { ok: false, windowPaused: true, message: 'Select or resume this window before adding a workspace rule from its active tab.' };
  }
  const [activeTab, records, rules, enabledTypes, sources] = await Promise.all([
    chrome.tabs.query({ windowId, active: true }).then(([tab]) => tab),
    getRecords(),
    getTrainedRules(),
    getManagedGroupTypeEnabled(),
    getWorkspaceSources(),
  ]);
  const existingRecord = groupId ? recordForGroup(records, groupId, windowId) : null;
  const isNewClient = String(groupId) === '__new__';
  const isCatalogClient = String(groupId).startsWith('catalog:');
  const createsClientGroup = isNewClient || isCatalogClient;
  const record = existingRecord || (createsClientGroup ? {
    epicId: String(epicIdValue || '').trim(),
    epicName: normalizeEpicName(epicNameValue),
    workspaceType: 'epic',
  } : null);
  const pattern = trainingPatternForUrl(value || activeTab?.url);
  if (!activeTab || !record) return { ok: false, message: 'Choose an existing saved workspace or create a new one.' };
  if (createsClientGroup && (!record.epicId || record.epicName === 'Unnamed Workspace')) {
    return { ok: false, message: 'Add a workspace name and ID.' };
  }
  if (record.workspaceType && record.workspaceType !== 'epic') return { ok: false, message: 'Choose a saved workspace, not a Smart Group or collection group.' };
  if (activeTab.pinned) return { ok: false, message: 'Pinned tabs stay independent of Tab Bundlr groups.' };
  if (!pattern) return { ok: false, message: 'Use an http or https URL prefix.' };
  if (!managedGroupTypeIsEnabled(enabledTypes, 'client')) {
    return { ok: false, message: 'Saved workspaces are disabled in Workspace settings.' };
  }
  if (workspaceSourceIsAutomatic(activeTab.url, enabledTypes, sources)) {
    return { ok: false, message: 'This tab is controlled by an enabled Workspace Source.' };
  }

  const patternKey = clientRulePatternKey(pattern);
  const existingRule = rules.find((rule) => clientRulePatternKey(rule.pattern) === patternKey);
  const nextRules = rules
    .filter((rule) => clientRulePatternKey(rule.pattern) !== patternKey)
    .concat({
      pattern,
      epicId: String(record.epicId),
      epicName: record.epicName,
      roleLabel: tabRoleLabel(tabRoleForUrl(activeTab.url)),
      updatedAt: new Date().toISOString(),
    });
  await setTrainedRules(nextRules);
  await rememberSavedClientGroups([{ epicId: record.epicId, epicName: record.epicName }]);
  const move = createsClientGroup
    ? await moveTabToEpic(activeTab, tabContextForEpic({
      epicId: record.epicId,
      epicName: record.epicName,
      groupId: -1,
      windowId,
      source: 'learned',
    }), 'learned-rule-add')
    : await processTab(activeTab, 'learned-rule-add', { ignoreEnabled: true });
  const change = existingRule
    ? String(existingRule.epicId) === String(record.epicId) ? 'Updated' : 'Reassigned'
    : 'Added';
  return {
    ok: true,
    moved: Boolean(move?.moved),
    message: `${change} ${pattern} for ${record.epicName}${move?.moved ? '. Moved the active tab.' : '.'}`,
  };
}

async function fixCurrentWindow() {
  const currentWindow = await chrome.windows.getCurrent();
  const windowId = Number(currentWindow.id);
  const automationState = await getWindowAutomationState(windowId);
  if (automationState.windowPaused) {
    return {
      ok: false,
      windowPaused: true,
      message: automationState.windowPauseReason === 'not-selected'
        ? 'This window is excluded by Window automation. Select it in Settings before running Fix.'
        : 'Tab Bundlr is paused in this window. Resume it before running Fix.',
    };
  }
  const [tabs, groups, records, rules, smartGroups, enabledTypes, sources] = await Promise.all([
    chrome.tabs.query({ windowId }),
    chrome.tabGroups.query({ windowId }),
    getRecords(),
    getTrainedRules(),
    getSmartGroups(),
    getManagedGroupTypeEnabled(),
    getWorkspaceSources(),
  ]);
  const managedGroupIds = new Set(
    groups
      .filter((group) => recordForGroup(records, group.id, windowId))
      .map((group) => Number(group.id)),
  );
  const focusGroupIds = focusManagedGroupIds(records, smartGroups, windowId);
  const pinnedTabs = tabs.filter((tab) => tab.pinned);
  const manualGroupTabs = tabs.filter((tab) => !tab.pinned && Number(tab.groupId ?? -1) >= 0 && !managedGroupIds.has(Number(tab.groupId)));
  const protectedTabs = tabs.filter((tab) => !tab.pinned && focusGroupIds.has(Number(tab.groupId)));
  const eligibleTabs = tabs.filter((tab) => isTabEligibleForManualFix(tab, managedGroupIds, focusGroupIds));
  const recognizedTabs = eligibleTabs.filter((tab) => (
    workspaceSourceIsAutomatic(tab.url, enabledTypes, sources)
    || bestUrlAssignmentForUrl(smartGroups, rules, tab.url, enabledTypes)
  ));
  const results = [];
  await runWithConcurrency(recognizedTabs, async (tab) => {
    results.push(await safelyProcess(tab, 'manual-fix', { ignoreEnabled: true }));
  });
  const organization = await organizeWindow(windowId);
  const movedCount = results.filter((result) => result?.moved).length;
  const failedCount = results.filter((result) => result?.status === 'error').length;
  const manualMessage = manualGroupTabs.length
    ? ` Skipped ${manualGroupTabs.length} tab${manualGroupTabs.length === 1 ? '' : 's'} in manual groups.`
    : '';
  const pinnedMessage = pinnedTabs.length
    ? ` Skipped ${pinnedTabs.length} pinned tab${pinnedTabs.length === 1 ? '' : 's'}.`
    : '';
  const protectedMessage = protectedTabs.length
    ? ` Skipped ${protectedTabs.length} tab${protectedTabs.length === 1 ? '' : 's'} protected by Focus Groups.`
    : '';
  const failureMessage = failedCount
    ? ` ${failedCount} recognized tab${failedCount === 1 ? '' : 's'} could not be resolved.`
    : '';
  return {
    ok: true,
    recognizedCount: recognizedTabs.length,
    movedCount,
    skippedManualCount: manualGroupTabs.length,
    skippedPinnedCount: pinnedTabs.length,
    organizedCount: organization.organizedCount,
    failedCount,
    message: recognizedTabs.length
      ? `Checked ${recognizedTabs.length} recognized tab${recognizedTabs.length === 1 ? '' : 's'} and moved ${movedCount}.${manualMessage}${protectedMessage}${pinnedMessage}${failureMessage}`
      : `No recognized tabs needed a regroup.${manualMessage}${protectedMessage}${pinnedMessage}`,
  };
}

async function addActiveTabToSmartGroup(groupId, value, sourceGroupId = null, newGroupNameValue = '') {
  const currentWindow = await chrome.windows.getCurrent();
  const windowId = Number(currentWindow.id);
  if (await isWindowPaused(windowId)) {
    return { ok: false, windowPaused: true, message: 'Select or resume this window before changing its Smart Group assignment.' };
  }
  const [activeTab, stored, enabledTypes, sources] = await Promise.all([
    chrome.tabs.query({ windowId, active: true }).then(([tab]) => tab),
    chrome.storage.local.get([SMART_GROUPS_STORAGE_KEY, SMART_GROUP_ORDER_STORAGE_KEY]),
    getManagedGroupTypeEnabled(),
    getWorkspaceSources(),
  ]);
  const groups = Array.isArray(stored[SMART_GROUPS_STORAGE_KEY]) ? stored[SMART_GROUPS_STORAGE_KEY] : [];
  const isNewGroup = String(groupId) === '__new__';
  const newGroupName = normalizeEpicName(newGroupNameValue);
  const existingGroup = groups.find((candidate) => String(candidate.id) === String(groupId));
  const pattern = trainingPatternForUrl(value || activeTab?.url);
  if (!activeTab || (!existingGroup && !isNewGroup)) return { ok: false, message: 'Choose an active tab and Smart Group first.' };
  if (activeTab.pinned) return { ok: false, message: 'Pinned tabs stay independent of Tab Bundlr groups.' };
  if (!pattern) return { ok: false, message: 'Use an http or https URL prefix.' };
  if (isNewGroup && (!newGroupName || newGroupName === 'Unnamed Workspace')) return { ok: false, message: 'Add a name for the new Smart Group.' };
  if (isNewGroup && groups.some((candidate) => String(candidate.name || '').toLowerCase() === newGroupName.toLowerCase())) {
    return { ok: false, message: `A Smart Group named ${newGroupName} already exists.` };
  }
  if (workspaceSourceIsAutomatic(activeTab.url, enabledTypes, sources)) {
    return { ok: false, message: 'This tab is controlled by an enabled Workspace Source.' };
  }
  const targetWorkspaceType = existingGroup?.focusMode === true ? 'focus-smart' : 'smart';
  if (!managedGroupTypeIsEnabled(enabledTypes, targetWorkspaceType)) {
    return { ok: false, message: `${targetWorkspaceType === 'focus-smart' ? 'Focus Smart Groups are' : 'Smart Groups are'} disabled in Workspace settings.` };
  }

  const existingOwner = groups.find((candidate) => smartGroupPatterns(candidate).includes(pattern));
  const currentSmartRule = bestSmartGroupRuleForUrl(groups, activeTab.url);
  const sourceGroup = currentSmartRule && String(currentSmartRule.id) === String(sourceGroupId)
    ? groups.find((candidate) => String(candidate.id) === String(sourceGroupId))
    : null;
  if (
    existingOwner
    && String(existingOwner.id) !== String(groupId)
    && String(existingOwner.id) !== String(sourceGroup?.id)
  ) {
    return { ok: false, message: `That URL prefix is already assigned to ${existingOwner.name || 'another Smart Group'}.` };
  }
  if (!isNewGroup && currentSmartRule && String(currentSmartRule.id) === String(groupId) && currentSmartRule.pattern === pattern) {
    return { ok: true, alreadyCovered: true, message: `${existingGroup.name} already covers this active tab.` };
  }

  const group = existingGroup || {
    id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `smart-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: newGroupName,
    patterns: [],
    updatedAt: new Date().toISOString(),
  };
  const currentPatterns = smartGroupPatterns(group);
  const sourcePattern = sourceGroup ? currentSmartRule.pattern : null;
  const nextGroups = (isNewGroup ? [...groups, group] : groups)
    .map((candidate) => {
      if (!sourceGroup || String(candidate.id) !== String(sourceGroup.id) || String(candidate.id) === String(group.id)) return candidate;
      const remainingPatterns = smartGroupPatterns(candidate).filter((candidatePattern) => candidatePattern !== sourcePattern);
      return remainingPatterns.length
        ? { ...candidate, patterns: remainingPatterns, updatedAt: new Date().toISOString() }
        : null;
    })
    .filter(Boolean)
    .map((candidate) => String(candidate.id) === String(group.id)
      ? { ...candidate, patterns: currentPatterns.includes(pattern) ? currentPatterns : [...currentPatterns, pattern], updatedAt: new Date().toISOString() }
      : candidate);
  await chrome.storage.local.set({
    [SMART_GROUPS_STORAGE_KEY]: nextGroups,
    [SMART_GROUP_ORDER_STORAGE_KEY]: orderedSmartGroupIds(nextGroups, stored[SMART_GROUP_ORDER_STORAGE_KEY]),
  });
  invalidateLocalSnapshots('smartGroups', 'smartGroupOrder');
  const move = await processTab(activeTab, 'smart-group-add', { ignoreEnabled: true });
  return {
    ok: true,
    moved: Boolean(move?.moved),
    reassigned: Boolean(sourceGroup && String(sourceGroup.id) !== String(group.id)),
    message: isNewGroup
      ? `Created ${group.name} and added ${pattern}.`
      : sourceGroup && String(sourceGroup.id) !== String(group.id)
      ? `Moved this URL from ${sourceGroup.name} to ${group.name}.`
      : currentPatterns.includes(pattern)
      ? `That URL prefix is already saved to ${group.name}.`
      : `Added ${pattern} to ${group.name}.`,
  };
}

async function openWorkspaceTab(tabId) {
  const tab = await chrome.tabs.get(Number(tabId));
  if (Number(tab.groupId) >= 0) await chrome.tabGroups.update(tab.groupId, { collapsed: false });
  await chrome.windows.update(tab.windowId, { focused: true });
  await chrome.tabs.update(tab.id, { active: true });
  return { ok: true };
}

async function statusForPopup(requestedWindowId) {
  const currentWindow = await chrome.windows.getCurrent();
  const parsedWindowId = Number(requestedWindowId);
  const windowId = Number.isInteger(parsedWindowId) && parsedWindowId >= 0
    ? parsedWindowId
    : Number(currentWindow?.id);
  const [windowAutomationState, settings, groups, tabs, records, contexts, trainedRules, smartGroups, smartGroupOrder, managedGroupTypeOrder, activityHistory, savedClientGroups, enabledTypes, persistentHomeBases, browserPageGroupId] = await Promise.all([
    getWindowAutomationState(windowId),
    getSettings(),
    chrome.tabGroups.query({ windowId }),
    chrome.tabs.query({ windowId }),
    getRecords(),
    getContexts(),
    getTrainedRules(),
    getSmartGroups(),
    getSmartGroupOrder(),
    getManagedGroupTypeOrder(),
    getActivityHistory(),
    getSavedClientGroups(),
    getManagedGroupTypeEnabled(),
    getPersistentHomeBases(),
    getBrowserPageSmartGroupId(),
  ]);
  const { windowPaused, windowPauseReason, manuallyPaused, policyAllowed } = windowAutomationState;
  const designatedFocusGroup = enabledTypes['focus-smart'] ? focusSmartGroup(smartGroups) : null;
  const browserPageGroup = enabledTypes.smart
    ? browserPageSmartGroup(smartGroups, browserPageGroupId)
    : null;
  const summarized = summarizeGroups(groups, tabs).map((group) => {
    const record = recordForGroup(records, group.id, windowId);
    const groupTabs = tabs
      .filter((tab) => Number(tab.groupId) === Number(group.id))
      .map((tab) => {
        const role = tabRoleForUrl(tab.url);
        const browserAssignment = isBrowserPageUrl(tab.url) && browserPageGroup
          ? { type: 'smart', rule: { ...browserPageGroup, pattern: 'chrome://' } }
          : null;
        const assignment = browserAssignment || bestUrlAssignmentForUrl(smartGroups, trainedRules, tab.url, enabledTypes);
        const automaticSource = workspaceSourceIsAutomatic(tab.url, enabledTypes, settings.sources);
        const ignoredBrowserPage = !trainingPatternForUrl(tab.url) && !browserAssignment;
        const isFocusGroup = record?.workspaceType === 'smart'
          && designatedFocusGroup
          && String(record.smartGroupId) === String(designatedFocusGroup.id);
        const coverageLabel = isFocusGroup
          ? 'Temporarily held'
          : assignment?.type === 'smart'
            ? `Smart: ${assignment.rule.name}`
            : assignment?.type === 'learned'
              ? `Taught: ${assignment.rule.epicName}`
              : ignoredBrowserPage ? 'Browser page'
              : automaticSource ? 'Automatic' : 'Not set';
        return {
          id: Number(tab.id),
          title: tab.title || tab.url || 'Untitled tab',
          url: tab.url || '',
          role,
          roleLabel: tabRoleLabel(role),
          source: contexts[String(tab.id)]?.source || (automaticSource ? 'workspace-source' : 'unknown'),
          coverageState: isFocusGroup
            ? 'focus'
            : assignment || automaticSource
              ? 'set'
              : ignoredBrowserPage ? 'ignored' : 'not-set',
          coverageLabel,
          homeBase: Boolean(persistentHomeBaseForUrl(tab.url, persistentHomeBases)),
        };
      });
    const roleCounts = Object.fromEntries(Object.entries(groupTabs.reduce((counts, tab) => {
      counts[tab.roleLabel] = (counts[tab.roleLabel] || 0) + 1;
      return counts;
    }, {})).sort(([left], [right]) => left.localeCompare(right)));
    return {
      ...group,
      managed: Boolean(record),
      epicId: record?.epicId || null,
      epicName: record?.epicName || null,
      workspaceType: record?.workspaceType || 'epic',
      smartGroupId: record?.smartGroupId || null,
      focusGroupId: record?.focusGroupId || null,
      isFocusGroup: Boolean(record?.workspaceType === 'smart'
        && designatedFocusGroup
        && String(record.smartGroupId) === String(designatedFocusGroup.id)),
      firstTabIndex: tabs
        .filter((tab) => Number(tab.groupId) === Number(group.id))
        .reduce((lowest, tab) => Math.min(lowest, Number(tab.index)), Number.MAX_SAFE_INTEGER),
      tabs: groupTabs,
      roleCounts,
    };
  });
  const orderedManaged = sortManagedGroupRecords(
    summarized.filter((group) => group.managed),
    smartGroupOrder,
    managedGroupTypeOrder,
  );
  const orderedSummarized = [
    ...orderedManaged,
    ...summarized
      .filter((group) => !group.managed)
      .sort((left, right) => left.firstTabIndex - right.firstTabIndex),
  ];
  const openClientGroups = orderedSummarized
    .filter((group) => group.managed && group.workspaceType === 'epic')
    .map((group) => ({
      id: Number(group.id),
      epicId: String(group.epicId),
      name: group.epicName || group.title,
      open: true,
    }));
  const openClientEpicIds = new Set(openClientGroups.map((group) => group.epicId));
  const knownClientGroups = mergeSavedClientGroupEntries([
    ...savedClientGroups,
    ...Object.values(records)
      .filter((record) => record?.workspaceType === 'epic' && record.epicId && record.epicName)
      .map((record) => ({ epicId: record.epicId, epicName: record.epicName })),
    ])
    .filter((epic) => !openClientEpicIds.has(epic.epicId))
    .map((epic) => ({
      id: `catalog:${epic.epicId}`,
      epicId: epic.epicId,
      name: epic.epicName,
      open: false,
      archived: epic.archived,
    }));
  const clientGroups = [...openClientGroups, ...knownClientGroups]
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
  const activeTab = tabs.find((tab) => tab.active) || null;
  const activeSourceAutomatic = activeTab
    ? enabledSourceMatches(settings.sources, activeTab.url)
      .some((match) => managedGroupTypeIsEnabled(enabledTypes, sourceWorkspaceType(match)))
    : false;
  const activeRecord = activeTab ? recordForGroup(records, activeTab.groupId, windowId) : null;
  const activeAssignment = activeTab
    ? isBrowserPageUrl(activeTab.url) && browserPageGroup
      ? { type: 'smart', rule: { ...browserPageGroup, pattern: 'chrome://' } }
      : bestUrlAssignmentForUrl(smartGroups, trainedRules, activeTab.url, enabledTypes)
    : null;
  const reviewTabs = windowPaused ? [] : tabs
    .filter((tab) => (
      Number(tab.groupId ?? -1) < 0
      && !tab.pinned
      && trainingPatternForUrl(tab.url)
      && !workspaceSourceIsAutomatic(tab.url, enabledTypes, settings.sources)
      && !bestUrlAssignmentForUrl(smartGroups, trainedRules, tab.url, enabledTypes)
    ))
    .sort((left, right) => Number(right.active) - Number(left.active) || String(left.title || left.url).localeCompare(String(right.title || right.url)))
    .map((tab) => {
      const role = tabRoleForUrl(tab.url);
      return {
        id: Number(tab.id),
        title: tab.title || tab.url || 'Untitled tab',
        url: tab.url || '',
        role,
        roleLabel: tabRoleLabel(role),
        source: 'unknown',
        coverageState: 'not-set',
        coverageLabel: 'Not set',
      };
    });
  const activeAssignmentRule = activeAssignment?.type === 'smart'
    ? {
      type: 'smart',
      smartGroupId: String(activeAssignment.rule.id),
      epicId: smartGroupWorkspaceId(activeAssignment.rule.id),
      epicName: activeAssignment.rule.name,
      pattern: activeAssignment.rule.pattern,
      roleLabel: tabRoleLabel(tabRoleForUrl(activeTab?.url)),
    }
    : activeAssignment?.type === 'learned'
      ? {
        type: 'learned',
        epicId: String(activeAssignment.rule.epicId),
        epicName: activeAssignment.rule.epicName,
        pattern: activeAssignment.rule.pattern,
        roleLabel: activeAssignment.rule.roleLabel || tabRoleLabel(tabRoleForUrl(activeTab?.url)),
      }
      : null;
  return {
    windowId,
    windowPaused,
    windowPauseReason,
    manuallyPaused,
    policyAllowed,
    enabled: settings.enabled,
    groups: orderedSummarized,
    activeTab: activeTab ? {
      id: Number(activeTab.id),
      title: activeTab.title || activeTab.url || 'Untitled tab',
      url: activeTab.url || '',
      groupId: Number(activeTab.groupId ?? -1),
      pinned: Boolean(activeTab.pinned),
      roleLabel: tabRoleLabel(tabRoleForUrl(activeTab.url)),
      source: contexts[String(activeTab.id)]?.source || (activeSourceAutomatic ? 'workspace-source' : 'unknown'),
    } : null,
    homeBaseEligible: Boolean(activeTab && !activeTab.pinned && duplicateKeyForUrl(activeTab.url)),
    activeHomeBaseUrl: activeTab ? persistentHomeBaseForUrl(activeTab.url, persistentHomeBases) : null,
    persistentHomeBaseCount: persistentHomeBases.length,
    currentWorkspace: activeRecord ? {
      groupId: Number(activeRecord.groupId),
      epicId: String(activeRecord.epicId),
      epicName: activeRecord.epicName,
      workspaceType: activeRecord.workspaceType,
      focusGroupId: activeRecord.focusGroupId || null,
      isFocusGroup: Boolean(activeRecord.workspaceType === 'smart'
        && designatedFocusGroup
        && String(activeRecord.smartGroupId) === String(designatedFocusGroup.id)),
    } : null,
    activeAssignment: activeAssignmentRule ? {
      ...activeAssignmentRule,
    } : null,
    activeCoverage: activeRecord?.workspaceType === 'smart'
      && designatedFocusGroup
      && String(activeRecord.smartGroupId) === String(designatedFocusGroup.id)
      ? {
        state: 'focus',
        type: 'focus',
        epicId: activeRecord.epicId,
        epicName: activeRecord.epicName,
      }
      : activeAssignmentRule
      ? {
        state: 'covered',
        type: activeAssignmentRule.type,
        epicId: activeAssignmentRule.epicId,
        epicName: activeAssignmentRule.epicName,
        pattern: activeAssignmentRule.pattern,
      }
      : activeTab
        ? !trainingPatternForUrl(activeTab.url)
          ? { state: 'ignored', type: 'browser' }
          : { state: activeSourceAutomatic ? 'automatic' : 'not-covered' }
        : null,
    trainedRuleCount: trainedRules.length,
    smartGroupCount: smartGroups.filter((group) => group.focusMode !== true).length,
    focusGroupCount: designatedFocusGroup ? 1 : 0,
    workspaceSourceCount: settings.sources.length,
    smartGroups: smartGroups.map((group) => ({
      id: String(group.id),
      name: group.name,
      patterns: smartGroupPatterns(group),
      focusMode: group.focusMode === true,
    })),
    clientGroups,
    reviewTabs,
    canUndo: activityHistory.length > 0,
    recentActivity: activityHistory.slice(0, 5).map((activity) => ({
      id: activity.id,
      createdAt: activity.createdAt,
      label: activity.label,
      reason: activity.reason,
      moveCount: activity.moves.length,
    })),
  };
}

async function processUpdatedTab(changeInfo, tab) {
  if (!isRelevantTabUpdate(changeInfo)) return { status: 'irrelevant-update' };
  if (changeInfo.url && await routeExternalTabToSelectedWindow(tab, { requirePending: true })) {
    return { status: 'routed-to-selected-window' };
  }
  const updatedGroupId = Number(changeInfo.groupId);
  if (Number.isInteger(updatedGroupId)
    && updatedGroupId >= 0
    && await processCreatedGroup(
      { id: updatedGroupId, windowId: tab?.windowId },
      { rememberPending: false, requirePending: true },
    )) {
    return { status: 'routed-group-to-selected-window' };
  }
  if (detachedTabOrigins.has(Number(tab?.id)) || await isWindowPaused(tab?.windowId)) {
    return { status: 'window-paused' };
  }
  await handlePersistentHomeBaseTabUpdate(changeInfo, tab);
  if (Object.prototype.hasOwnProperty.call(changeInfo, 'groupId')) {
    const focusRecord = await focusRecordForTab(tab);
    if (focusRecord) {
      await markTabFocusHeld(tab.id, focusRecord.groupId);
      return;
    }
    const releasedFromGroupId = await releaseTabFocusHold(tab.id);
    if (releasedFromGroupId !== null) {
      await safelyProcess(tab, 'focus-release', { ignoreEnabled: true });
      return;
    }
    const context = await contextForTab(tab.id);
    if (context?.workspaceType === 'focus') {
      await forgetTabContext(tab.id);
    }
  }
  if (!changeInfo.url && changeInfo.status !== 'complete') return;
  const settings = await getSettings();
  if (settings.openerInheritance && await inheritFocusFromOpener(tab)) return;
  await safelyProcess(tab, changeInfo.url ? 'story-navigation' : 'story-ready');
}

async function processAttachedTab(tabId, attachInfo) {
  const normalizedTabId = Number(tabId);
  const sourceWindowId = detachedTabOrigins.get(normalizedTabId);
  if (sourceWindowId === undefined) return;
  try {
    const destinationWindowId = Number(attachInfo?.newWindowId);
    const destinationTabs = await chrome.tabs.query({ windowId: destinationWindowId });
    const destinationAutomationState = await getWindowAutomationState(destinationWindowId);
    if (shouldPauseWindowAfterDetachedTab({
      detachedFromWindowId: sourceWindowId,
      attachedToWindowId: destinationWindowId,
      destinationTabCount: destinationTabs.length,
    })) {
      if (destinationAutomationState.policyAllowed) await setWindowPaused(destinationWindowId, true);
      await forgetTabContext(normalizedTabId);
      await releaseTabFocusHold(normalizedTabId);
      return;
    }
    if (destinationAutomationState.windowPaused) return;
    const tab = destinationTabs.find((candidate) => Number(candidate.id) === normalizedTabId)
      || await chrome.tabs.get(normalizedTabId);
    await safelyProcess(tab, 'window-attached');
  } finally {
    detachedTabOrigins.delete(normalizedTabId);
  }
}

async function forgetWindowAutomationState(windowId) {
  const normalizedWindowId = Number(windowId);
  await Promise.all([pausedWindowIdsReady, windowAutomationPolicyReady]);
  const removedWindowWasSelected = windowAutomationPolicy.selectedWindowIds.includes(normalizedWindowId);
  pausedWindowIds.delete(normalizedWindowId);
  windowAutomationPolicy = normalizeWindowAutomationPolicy(
    windowAutomationPolicy.mode,
    windowAutomationPolicy.selectedWindowIds.filter((id) => id !== normalizedWindowId),
  );
  const [localStored, windows] = await Promise.all([
    chrome.storage.local.get(WINDOW_AUTOMATION_PREFERENCE_STORAGE_KEY),
    chrome.windows.getAll({ windowTypes: ['normal'] }),
  ]);
  const hasSavedPreference = Object.prototype.hasOwnProperty.call(
    localStored,
    WINDOW_AUTOMATION_PREFERENCE_STORAGE_KEY,
  );
  const savedPreference = hasSavedPreference
    ? normalizeWindowAutomationPreference(localStored[WINDOW_AUTOMATION_PREFERENCE_STORAGE_KEY])
    : null;
  if (!removedWindowWasSelected
    && windowAutomationPolicy.mode === 'selected'
    && windowAutomationPolicy.selectedWindowIds.length === 0
    && savedPreference?.restoreSoleWindow === true
    && windows.length === 1) {
    windowAutomationPolicy = normalizeWindowAutomationPolicy('selected', [windows[0].id]);
  }
  const preference = removedWindowWasSelected
    ? {
        mode: windowAutomationPolicy.mode,
        restoreSoleWindow: windowAutomationPolicy.mode === 'selected'
          && windowAutomationPolicy.selectedWindowIds.length > 0,
      }
    : savedPreference || {
        mode: windowAutomationPolicy.mode,
        restoreSoleWindow: windowAutomationPolicy.mode === 'selected'
          && windowAutomationPolicy.selectedWindowIds.length > 0,
      };
  await Promise.all([
    chrome.storage.session.set({
      [PAUSED_WINDOW_IDS_STORAGE_KEY]: [...pausedWindowIds].sort((left, right) => left - right),
      [WINDOW_AUTOMATION_MODE_STORAGE_KEY]: windowAutomationPolicy.mode,
      [SELECTED_WINDOW_IDS_STORAGE_KEY]: windowAutomationPolicy.selectedWindowIds,
    }),
    chrome.storage.local.set({
      [WINDOW_AUTOMATION_PREFERENCE_STORAGE_KEY]: preference,
    }),
  ]);
}

chrome.tabs.onCreated.addListener((tab) => {
  processCreatedTab(tab).catch(() => {});
});

chrome.tabs.onActivated?.addListener((activeInfo) => {
  recordActiveTab(activeInfo.tabId, activeInfo.windowId).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!isRelevantTabUpdate(changeInfo)) return;
  processUpdatedTab(changeInfo, tab).catch(() => {});
});

chrome.tabs.onDetached.addListener((tabId, detachInfo) => {
  pendingExternalTabRoutes.delete(Number(tabId));
  freshExternalGroupTabs.delete(Number(tabId));
  detachedTabOrigins.set(Number(tabId), Number(detachInfo?.oldWindowId));
});

chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
  processAttachedTab(tabId, attachInfo).catch(() => {
    detachedTabOrigins.delete(Number(tabId));
  });
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  pendingExternalTabRoutes.delete(Number(tabId));
  freshExternalGroupTabs.delete(Number(tabId));
  detachedTabOrigins.delete(Number(tabId));
  forgetTabActivation(tabId).catch(() => {});
  forgetTabContext(tabId).catch(() => {});
  releaseTabFocusHold(tabId).catch(() => {});
  return handlePersistentHomeBaseTabRemoved(tabId, removeInfo).catch(() => {});
});

chrome.windows.onRemoved.addListener((windowId) => {
  forgetWindowAutomationState(windowId).catch(() => {});
  forgetWindowTabActivationHistory(windowId).catch(() => {});
});

chrome.tabGroups.onCreated.addListener((group) => {
  processCreatedGroup(group, { rememberPending: true })
    .then(() => reconcileFocusHeldTabs())
    .catch(() => {});
});

chrome.tabGroups.onMoved.addListener(() => {
  reconcileFocusHeldTabs().catch(() => {});
});

chrome.commands?.onCommand.addListener((command) => {
  if (command === TEMPORARY_ACTIVATION_COMMAND) {
    startTemporaryActivationOverride().catch(() => {});
    return;
  }
  if (command === PREVIOUS_TAB_COMMAND) activatePreviousTab().catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'GET_WINDOW_AUTOMATION_POLICY') {
    getWindowAutomationPolicyData().then((result) => sendResponse(result)).catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message?.type === 'SET_WINDOW_AUTOMATION_POLICY') {
    updateWindowAutomationPolicy(message.mode, message.selectedWindowIds).then((result) => sendResponse(result)).catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message?.type === 'GET_STATUS') {
    statusForPopup(message.windowId).then((result) => sendResponse({ ok: true, ...result })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'GET_REVIEW_DATA') {
    reviewInboxData().then((result) => sendResponse(result)).catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message?.type === 'ANALYZE_RULE_PATTERN') {
    Promise.all([getSmartGroups(), getTrainedRules()])
      .then(([smartGroups, trainedRules]) => ({
        ok: true,
        overlaps: overlappingUrlRules(message.pattern, smartGroups, trainedRules, message.exclude || {}),
      }))
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message?.type === 'ASSIGN_REVIEW_TAB') {
    assignReviewTab(message).then((result) => sendResponse(result)).catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message?.type === 'UNDO_LAST_ACTION') {
    undoActivity().then((result) => sendResponse(result)).catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message?.type === 'UNDO_ACTIVITY') {
    undoActivity(message.activityId).then((result) => sendResponse(result)).catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message?.type === 'FOCUS_WORKSPACE') {
    focusWorkspace(message.groupId).then((result) => sendResponse(result)).catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message?.type === 'ADD_ACTIVE_TAB') {
    addActiveTabToWorkspace(message.groupId).then((result) => sendResponse(result)).catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message?.type === 'TEACH_ACTIVE_TAB') {
    teachActiveTabToWorkspace(message.groupId).then((result) => sendResponse(result)).catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message?.type === 'ADD_CLIENT_RULE') {
    addClientRuleForActiveTab(message.groupId, message.pattern, message.epicName, message.epicId, message.windowId).then((result) => sendResponse(result)).catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message?.type === 'FIX_WINDOW') {
    fixCurrentWindow().then((result) => sendResponse(result)).catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message?.type === 'SET_WINDOW_PAUSED') {
    setWindowAutomationPaused(message.windowId, message.paused === true)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message?.type === 'SET_PERSISTENT_HOME_BASE') {
    setActiveTabPersistentHomeBase(message.windowId, message.enabled === true)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message?.type === 'ORGANIZE_WINDOW') {
    organizeCurrentWindow().then((result) => sendResponse(result)).catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message?.type === 'ADD_SMART_GROUP_PATTERN') {
    addActiveTabToSmartGroup(message.groupId, message.pattern, message.sourceGroupId, message.newGroupName).then((result) => sendResponse(result)).catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message?.type === 'OPEN_WORKSPACE_TAB') {
    openWorkspaceTab(message.tabId).then((result) => sendResponse(result)).catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message?.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === 'SYNC_NOW') {
    Promise.all([syncExistingStoryTabs(), reconcilePersistentHomeBases({ createIfMissing: true })])
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return false;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes[ENABLED_STORAGE_KEY] || changes[ACTIVATE_OPENED_TABS_STORAGE_KEY] || changes[OPENER_INHERITANCE_STORAGE_KEY] || changes[WORKSPACE_SOURCES_STORAGE_KEY] || changes[WORKSPACE_SOURCE_SECRETS_STORAGE_KEY]) {
    invalidateLocalSnapshots('settings');
  }
  if (changes[WORKSPACE_SOURCES_STORAGE_KEY]) invalidateLocalSnapshots('workspaceSources');
  if (changes[WORKSPACE_SOURCE_SECRETS_STORAGE_KEY]) invalidateLocalSnapshots('workspaceSourceSecrets');
  if (changes[HOME_BASE_DUPLICATE_ACTION_STORAGE_KEY]) invalidateLocalSnapshots('homeBaseDuplicateAction');
  if (changes[TRAINED_RULES_STORAGE_KEY]) invalidateLocalSnapshots('trainedRules');
  if (changes[SMART_GROUPS_STORAGE_KEY]) invalidateLocalSnapshots('smartGroups');
  if (changes[BROWSER_PAGE_SMART_GROUP_STORAGE_KEY]) invalidateLocalSnapshots('browserPageSmartGroupId');
  if (changes[PERSISTENT_HOME_BASES_STORAGE_KEY]) invalidateLocalSnapshots('persistentHomeBases');
  if (changes[SMART_GROUP_ORDER_STORAGE_KEY]) invalidateLocalSnapshots('smartGroupOrder');
  if (changes[MANAGED_GROUP_TYPE_ENABLED_STORAGE_KEY]) invalidateLocalSnapshots('managedGroupTypeEnabled');
  if (changes[MANAGED_GROUP_TYPE_ORDER_STORAGE_KEY]) invalidateLocalSnapshots('managedGroupTypeOrder');
  if (changes[MANAGED_GROUP_COLORS_STORAGE_KEY]) invalidateLocalSnapshots('managedGroupColors');
  if (changes[AUTO_ORGANIZE_GROUPS_STORAGE_KEY]) invalidateLocalSnapshots('autoOrganizeGroups');
  if (changes[ENABLED_STORAGE_KEY] || changes[ACTIVATE_OPENED_TABS_STORAGE_KEY] || changes[OPENER_INHERITANCE_STORAGE_KEY] || changes[WORKSPACE_SOURCES_STORAGE_KEY] || changes[WORKSPACE_SOURCE_SECRETS_STORAGE_KEY] || changes[HOME_BASE_DUPLICATE_ACTION_STORAGE_KEY] || changes[TRAINED_RULES_STORAGE_KEY] || changes[SAVED_CLIENT_GROUPS_STORAGE_KEY] || changes[CLIENT_CATALOG_STORAGE_KEY] || changes[SMART_GROUPS_STORAGE_KEY] || changes[BROWSER_PAGE_SMART_GROUP_STORAGE_KEY] || changes[PERSISTENT_HOME_BASES_STORAGE_KEY] || changes[SMART_GROUP_ORDER_STORAGE_KEY] || changes[MANAGED_GROUP_TYPE_ENABLED_STORAGE_KEY] || changes[MANAGED_GROUP_TYPE_ORDER_STORAGE_KEY] || changes[MANAGED_GROUP_COLORS_STORAGE_KEY] || changes[AUTO_ORGANIZE_GROUPS_STORAGE_KEY]) {
    if (changes[WORKSPACE_SOURCE_SECRETS_STORAGE_KEY] || changes[WORKSPACE_SOURCES_STORAGE_KEY]) {
      workspaceSourceCache.clear();
    }
    if (changes[MANAGED_GROUP_TYPE_ENABLED_STORAGE_KEY]) {
      reconcileManagedGroupTypeSettings().catch(() => {});
    } else if (changes[ENABLED_STORAGE_KEY]?.newValue === true || changes[WORKSPACE_SOURCES_STORAGE_KEY] || changes[WORKSPACE_SOURCE_SECRETS_STORAGE_KEY] || changes[TRAINED_RULES_STORAGE_KEY] || changes[SMART_GROUPS_STORAGE_KEY] || changes[BROWSER_PAGE_SMART_GROUP_STORAGE_KEY]) {
      syncExistingStoryTabs().catch(() => {});
    }
    if (changes[SMART_GROUPS_STORAGE_KEY] || changes[SMART_GROUP_ORDER_STORAGE_KEY] || changes[MANAGED_GROUP_TYPE_ORDER_STORAGE_KEY] || changes[AUTO_ORGANIZE_GROUPS_STORAGE_KEY]) {
      autoOrganizeGroupsEnabled()
        .then((enabled) => enabled
          ? chrome.windows.getAll({ windowTypes: ['normal'] })
            .then((windows) => Promise.all(windows.map((window) => organizeWindow(window.id))))
          : null)
        .catch(() => {});
    }
    if (changes[MANAGED_GROUP_COLORS_STORAGE_KEY] || changes[SMART_GROUPS_STORAGE_KEY]) {
      chrome.windows.getAll({ windowTypes: ['normal'] })
        .then((windows) => Promise.all(windows.map((window) => applyManagedGroupColors(window.id))))
        .catch(() => {});
    }
    if (changes[SMART_GROUPS_STORAGE_KEY] || changes[MANAGED_GROUP_TYPE_ENABLED_STORAGE_KEY]) reconcileFocusHeldTabs().catch(() => {});
    if (changes[PERSISTENT_HOME_BASES_STORAGE_KEY] || changes[HOME_BASE_DUPLICATE_ACTION_STORAGE_KEY]) reconcilePersistentHomeBases({ createIfMissing: true }).catch(() => {});
  }
});

async function initializeForSession() {
  if (sessionInitializationRequest) return sessionInitializationRequest;
  sessionInitializationRequest = (async () => {
    await settingsMigrationReady;
    await restoreTemporaryActivationBadge().catch(() => {});
    await seedActiveTabHistory().catch(() => {});
    const stored = await chrome.storage.session.get([
      SESSION_RECONCILED_STORAGE_KEY,
      PERSISTENT_HOME_BASES_RECONCILED_STORAGE_KEY,
    ]).catch(() => ({}));
    if (stored[PERSISTENT_HOME_BASES_RECONCILED_STORAGE_KEY] !== true) {
      await reconcilePersistentHomeBases({ createIfMissing: true }).catch(() => {});
      await chrome.storage.session.set({ [PERSISTENT_HOME_BASES_RECONCILED_STORAGE_KEY]: true }).catch(() => {});
    }
    if (stored[SESSION_RECONCILED_STORAGE_KEY] === true) return { initialized: false };
    await retireLegacyFocusGroups().catch(() => {});
    await reconcileFocusHeldTabs().catch(() => {});
    await syncExistingStoryTabs();
    await chrome.storage.session.set({ [SESSION_RECONCILED_STORAGE_KEY]: true }).catch(() => {});
    return { initialized: true };
  })().finally(() => {
    sessionInitializationRequest = null;
  });
  return sessionInitializationRequest;
}

initializeForSession().catch(() => {});

export const TabBundlrBackground = Object.freeze({
  activatePreviousTab,
  fixCurrentWindow,
  handlePersistentHomeBaseTabRemoved,
  inheritFocusFromOpener,
  handlePersistentHomeBaseTabUpdate,
  initializeForSession,
  organizeCurrentWindow,
  organizeWindow,
  processCreatedTab,
  processCreatedGroup,
  processBrowserPageTab,
  processWorkspaceSourceTab,
  processUpdatedTab,
  reconcileManagedGroupTypeSettings,
  statusForPopup,
  syncExistingStoryTabs,
});
