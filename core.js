export const CHROME_GROUP_COLORS = ['blue', 'cyan', 'green', 'grey', 'orange', 'pink', 'purple', 'red', 'yellow'];
export const UNIQUE_AUTO_COLOR = 'unique-auto';
const TAB_ROLE_LABELS = Object.freeze({
  browser: 'Browser',
  figma: 'Figma',
  github: 'GitHub',
  shopify: 'Shopify',
  slack: 'Slack',
  notion: 'Notion',
  web: 'Web',
});

export const TOKEN_STORAGE_KEY = 'shortcutReadToken';
export const ENABLED_STORAGE_KEY = 'tabBundlrEnabled';
export const GROUP_RECORDS_STORAGE_KEY = 'groupRecords';
export const TAB_CONTEXTS_STORAGE_KEY = 'tabContexts';
export const LAST_ACTION_STORAGE_KEY = 'lastAction';
export const ACTIVITY_HISTORY_STORAGE_KEY = 'activityHistory';
export const MAX_ACTIVITY_HISTORY = 20;
export const TRAINED_RULES_STORAGE_KEY = 'trainedRules';
export const SAVED_CLIENT_GROUPS_STORAGE_KEY = 'savedClientGroups';
// Kept only to migrate installations created before savedClientGroups existed.
export const CLIENT_CATALOG_STORAGE_KEY = 'clientCatalog';
export const SMART_GROUPS_STORAGE_KEY = 'smartGroups';
export const BROWSER_PAGE_SMART_GROUP_STORAGE_KEY = 'browserPageSmartGroupId';
export const PERSISTENT_HOME_BASES_STORAGE_KEY = 'persistentHomeBases';
export const PERSISTENT_HOME_BASE_ANCHORS_STORAGE_KEY = 'persistentHomeBaseAnchors';
export const SMART_GROUP_ORDER_STORAGE_KEY = 'smartGroupOrder';
export const FOCUS_GROUPS_STORAGE_KEY = 'focusGroups';
export const FOCUS_HELD_TABS_STORAGE_KEY = 'focusHeldTabs';
export const PAUSED_WINDOW_IDS_STORAGE_KEY = 'pausedWindowIds';
export const WINDOW_AUTOMATION_MODE_STORAGE_KEY = 'windowAutomationMode';
export const SELECTED_WINDOW_IDS_STORAGE_KEY = 'selectedWindowIds';
export const WINDOW_AUTOMATION_PREFERENCE_STORAGE_KEY = 'windowAutomationPreference';
export const MANAGED_GROUP_TYPE_ORDER_STORAGE_KEY = 'managedGroupTypeOrder';
export const MANAGED_GROUP_COLORS_STORAGE_KEY = 'managedGroupColors';
export const MANAGED_GROUP_TYPE_ENABLED_STORAGE_KEY = 'managedGroupTypeEnabled';
export const STALE_TAB_DAYS_STORAGE_KEY = 'staleTabDays';
export const STALE_TAB_DAY_OPTIONS = [1, 3, 5, 7, 14, 30, 60];
export const AUTO_ORGANIZE_GROUPS_STORAGE_KEY = 'autoOrganizeGroups';
// Undefined is retained as enabled for legacy installs. Fresh installs persist false during v2 initialization.
export const DEFAULT_ENABLED = true;
export const ACTIVATE_OPENED_TABS_STORAGE_KEY = 'activateOpenedTabs';
export const TEMPORARY_ACTIVATION_COMMAND = 'temporarily-invert-link-activation';
export const TEMPORARY_ACTIVATION_OVERRIDE_UNTIL_STORAGE_KEY = 'temporaryActivationOverrideUntil';
export const TEMPORARY_ACTIVATION_OVERRIDE_DURATION_MS = 10_000;
export const PREVIOUS_TAB_COMMAND = 'activate-previous-tab';
export const PREVIOUS_TAB_MODE_STORAGE_KEY = 'previousTabMode';
export const TAB_ACTIVATION_HISTORY_STORAGE_KEY = 'tabActivationHistory';
export const DEFAULT_PREVIOUS_TAB_MODE = 'toggle';
export const MAX_TAB_ACTIVATION_HISTORY = 100;
export const DEFAULT_ACTIVATE_OPENED_TABS = false;
export const DEFAULT_AUTO_ORGANIZE_GROUPS = false;
export const DEFAULT_STALE_TAB_DAYS = 14;
export const DEFAULT_MANAGED_GROUP_TYPE_ENABLED = Object.freeze({
  client: true,
  iteration: true,
  smart: true,
  'focus-smart': true,
});

export function normalizeManagedGroupTypeEnabled(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.keys(DEFAULT_MANAGED_GROUP_TYPE_ENABLED)
    .map((type) => [type, source[type] !== false]));
}

export function managedGroupTypeIsEnabled(value, type) {
  return normalizeManagedGroupTypeEnabled(value)[type] !== false;
}

export function enabledSmartGroups(groups, enabledTypes) {
  const enabled = normalizeManagedGroupTypeEnabled(enabledTypes);
  return (Array.isArray(groups) ? groups : []).filter((group) => (
    group?.focusMode === true ? enabled['focus-smart'] : enabled.smart
  ));
}

export function normalizeWindowAutomationPolicy(mode, selectedWindowIds) {
  return {
    mode: mode === 'selected' ? 'selected' : 'all',
    selectedWindowIds: [...new Set((Array.isArray(selectedWindowIds) ? selectedWindowIds : [])
      .map(Number)
      .filter((windowId) => Number.isInteger(windowId) && windowId >= 0))].sort((left, right) => left - right),
  };
}

export function normalizeWindowAutomationPreference(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const mode = value === 'selected' || source.mode === 'selected' ? 'selected' : 'all';
  return {
    mode,
    restoreSoleWindow: mode === 'selected'
      && (value === 'selected' || source.restoreSoleWindow === true),
  };
}

export function restoredWindowAutomationPolicy(sessionMode, selectedWindowIds, preference, openWindowIds) {
  if (sessionMode === 'all' || sessionMode === 'selected') {
    return normalizeWindowAutomationPolicy(sessionMode, selectedWindowIds);
  }
  const normalizedPreference = normalizeWindowAutomationPreference(preference);
  const normalizedOpenWindowIds = [...new Set((Array.isArray(openWindowIds) ? openWindowIds : [])
    .map(Number)
    .filter((windowId) => Number.isInteger(windowId) && windowId >= 0))];
  return normalizeWindowAutomationPolicy(
    normalizedPreference.mode,
    normalizedPreference.mode === 'selected'
      && normalizedPreference.restoreSoleWindow
      && normalizedOpenWindowIds.length === 1
      ? normalizedOpenWindowIds
      : [],
  );
}

export function externalTabDestinationWindowId(tab, sourceTabCount, policy) {
  const normalized = normalizeWindowAutomationPolicy(policy?.mode, policy?.selectedWindowIds);
  if (!tab || tab.pinned || normalized.mode !== 'selected' || normalized.selectedWindowIds.length !== 1) return null;
  const sourceWindowAlreadyExisted = Number(tab.index) > 0 || Number(sourceTabCount) > 1;
  if (normalized.selectedWindowIds.includes(Number(tab.windowId)) || !sourceWindowAlreadyExisted) return null;
  if (tab.openerTabId !== undefined && Number(tab.openerTabId) !== -1) return null;
  try {
    const url = new URL(tab.pendingUrl || tab.url || '');
    return ['http:', 'https:'].includes(url.protocol) ? normalized.selectedWindowIds[0] : null;
  } catch {
    return null;
  }
}

export function windowAllowedByPolicy(windowId, policy) {
  const normalized = normalizeWindowAutomationPolicy(policy?.mode, policy?.selectedWindowIds);
  return normalized.mode === 'all' || normalized.selectedWindowIds.includes(Number(windowId));
}

export function shouldPauseWindowAfterDetachedTab({
  detachedFromWindowId,
  attachedToWindowId,
  destinationTabCount,
} = {}) {
  const sourceWindowId = Number(detachedFromWindowId);
  const destinationWindowId = Number(attachedToWindowId);
  return detachedFromWindowId !== null
    && detachedFromWindowId !== undefined
    && Number.isInteger(sourceWindowId)
    && Number.isInteger(destinationWindowId)
    && sourceWindowId !== destinationWindowId
    && Number(destinationTabCount) === 1;
}

export function trainingPatternForUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    return pathname === '/' ? url.origin : `${url.origin}${pathname}`;
  } catch {
    return null;
  }
}

export function contextRuleActionAvailability({ activeTab, activeCoverage, activeAssignment } = {}) {
  const eligiblePattern = activeTab ? trainingPatternForUrl(activeTab.url) : null;
  const automaticallyManaged = activeCoverage?.state === 'automatic';
  const canUseRuleActions = Boolean(eligiblePattern && !automaticallyManaged);
  return {
    canAddSmartGroup: canUseRuleActions
      && (activeCoverage?.state !== 'covered' || activeAssignment?.type === 'smart'),
    canAddClientRule: canUseRuleActions,
  };
}

export function canInheritOpenerForTab(tab) {
  if (!tab || tab.pinned) return false;
  try {
    const url = new URL(tab.url);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

export function isRelevantTabUpdate(changeInfo) {
  if (!changeInfo || typeof changeInfo !== 'object') return false;
  return Object.prototype.hasOwnProperty.call(changeInfo, 'groupId')
    || Boolean(changeInfo.url)
    || changeInfo.status === 'complete';
}

export function duplicateKeyForUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizePersistentHomeBases(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((entry) => duplicateKeyForUrl(typeof entry === 'string' ? entry : entry?.url))
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

export function persistentHomeBaseForUrl(value, homeBases) {
  const exactUrl = duplicateKeyForUrl(value);
  return exactUrl && normalizePersistentHomeBases(homeBases).includes(exactUrl) ? exactUrl : null;
}

function rulePatternMatchesUrl(rule, value, caseInsensitive = false) {
  const pattern = trainingPatternForUrl(value);
  if (!pattern || !rule?.pattern) return false;
  const storedPattern = String(rule.pattern).replace(/\/+$/, '') || String(rule.pattern);
  const candidate = caseInsensitive ? pattern.toLocaleLowerCase('en-US') : pattern;
  const rulePattern = caseInsensitive ? storedPattern.toLocaleLowerCase('en-US') : storedPattern;
  return candidate === rulePattern
    || candidate.startsWith(`${rulePattern}/`)
    || (rulePattern.endsWith('-') && candidate.startsWith(rulePattern));
}

export function clientRulePatternKey(value) {
  return trainingPatternForUrl(value)?.toLocaleLowerCase('en-US') || null;
}

export function trainedRuleMatchesUrl(rule, value) {
  return rulePatternMatchesUrl(rule, value, true);
}

export function bestTrainedRuleForUrl(rules, value) {
  return (Array.isArray(rules) ? rules : [])
    .filter((rule) => trainedRuleMatchesUrl(rule, value))
    .sort((left, right) => String(right.pattern).length - String(left.pattern).length)[0] || null;
}

export function smartGroupWorkspaceId(groupId) {
  return `smart:${String(groupId)}`;
}

export function focusGroupWorkspaceId(groupId) {
  return `focus:${String(groupId)}`;
}

export function normalizeFocusGroups(value) {
  const byId = new Map();
  (Array.isArray(value) ? value : []).forEach((group) => {
    const id = String(group?.id || '').trim();
    const name = normalizeEpicName(group?.name);
    if (!id || name === 'Unnamed Workspace') return;
    byId.set(id, {
      id,
      name,
      updatedAt: group?.updatedAt || new Date().toISOString(),
    });
  });
  return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
}

export function autoOrganizeGroupsFromStorage(value) {
  return value === true;
}

export function smartGroupPatterns(group) {
  const patterns = Array.isArray(group?.patterns) ? group.patterns : group?.pattern ? [group.pattern] : [];
  return [...new Set(patterns.filter(Boolean).map(String))];
}

export function isBrowserPageUrl(value) {
  try {
    return new URL(value).protocol === 'chrome:';
  } catch {
    return false;
  }
}

export function browserPageSmartGroup(groups, groupId) {
  const normalizedId = String(groupId || '').trim();
  if (!normalizedId) return null;
  return (Array.isArray(groups) ? groups : []).find((group) => (
    String(group?.id || '') === normalizedId
    && group?.focusMode !== true
  )) || null;
}

export function smartGroupMatchesUrl(group, value) {
  return smartGroupPatterns(group).some((pattern) => rulePatternMatchesUrl({ pattern }, value));
}

export function focusSmartGroup(groups) {
  return (Array.isArray(groups) ? groups : []).find((group) => group?.focusMode === true) || null;
}

export function bestSmartGroupRuleForUrl(groups, value) {
  return (Array.isArray(groups) ? groups : [])
    .flatMap((group) => smartGroupPatterns(group).map((pattern) => ({ ...group, pattern })))
    .filter((group) => rulePatternMatchesUrl(group, value))
    .sort((left, right) => (
      String(right.pattern).length - String(left.pattern).length
      || String(left.id).localeCompare(String(right.id))
    ))[0] || null;
}

export function bestUrlAssignmentForUrl(smartGroups, trainedRules, value, enabledTypes = null) {
  const enabled = normalizeManagedGroupTypeEnabled(enabledTypes);
  const smartRule = bestSmartGroupRuleForUrl(enabledSmartGroups(smartGroups, enabled), value);
  const learnedRule = enabled.client ? bestTrainedRuleForUrl(trainedRules, value) : null;
  if (!smartRule) return learnedRule ? { type: 'learned', rule: learnedRule } : null;
  if (!learnedRule) return { type: 'smart', rule: smartRule };
  return String(learnedRule.pattern).length > String(smartRule.pattern).length
    ? { type: 'learned', rule: learnedRule }
    : { type: 'smart', rule: smartRule };
}

export function urlRuleEntries(smartGroups, trainedRules) {
  return [
    ...(Array.isArray(smartGroups) ? smartGroups : []).flatMap((group) => smartGroupPatterns(group).map((pattern) => ({
      type: 'smart',
      id: String(group.id),
      name: group.name || 'Unnamed Smart Group',
      pattern,
    }))),
    ...(Array.isArray(trainedRules) ? trainedRules : []).map((rule) => ({
      type: 'learned',
      id: String(rule.epicId || ''),
      name: rule.epicName || 'Unnamed Workspace',
      pattern: rule.pattern,
    })),
  ].filter((rule) => rule.id && rule.pattern);
}

export function analyzeUrlRules(smartGroups, trainedRules, value) {
  const normalizedUrl = trainingPatternForUrl(value);
  if (!normalizedUrl) {
    return { state: 'unsupported', normalizedUrl: null, assignment: null, matches: [], reason: 'Use an http or https URL.' };
  }
  const matches = urlRuleEntries(smartGroups, trainedRules)
    .filter((rule) => rule.type === 'learned'
      ? trainedRuleMatchesUrl(rule, normalizedUrl)
      : rulePatternMatchesUrl(rule, normalizedUrl))
    .sort((left, right) => (
      String(right.pattern).length - String(left.pattern).length
      || Number(right.type === 'smart') - Number(left.type === 'smart')
      || left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    ));
  const winner = matches[0] || null;
  return winner
    ? {
      state: 'matched',
      normalizedUrl,
      assignment: winner,
      matches,
      reason: `${winner.type === 'smart' ? 'Smart Group' : 'Workspace rule'} ${winner.name} wins with ${winner.pattern}.`,
    }
    : {
      state: 'unassigned',
      normalizedUrl,
      assignment: null,
      matches: [],
      reason: 'No Smart Group prefix or saved workspace rule matches this URL.',
    };
}

export function overlappingUrlRules(patternValue, smartGroups, trainedRules, exclude = {}) {
  const pattern = trainingPatternForUrl(patternValue);
  if (!pattern) return [];
  const candidateIsLearned = exclude.type === 'learned';
  return urlRuleEntries(smartGroups, trainedRules)
    .filter((rule) => !(
      rule.type === exclude.type
      && String(rule.id) === String(exclude.id)
      && (!exclude.pattern || (
        rule.type === 'learned'
          ? clientRulePatternKey(rule.pattern) === clientRulePatternKey(exclude.pattern)
          : rule.pattern === exclude.pattern
      ))
    ))
    .map((rule) => {
      const equal = rule.type === 'learned' && candidateIsLearned
        ? clientRulePatternKey(rule.pattern) === clientRulePatternKey(pattern)
        : rule.pattern === pattern;
      if (equal) return { ...rule, relation: 'equal' };
      const existingMatches = rule.type === 'learned'
        ? trainedRuleMatchesUrl(rule, pattern)
        : rulePatternMatchesUrl(rule, pattern);
      if (existingMatches) return { ...rule, relation: 'existing-broader' };
      const candidateMatches = candidateIsLearned
        ? trainedRuleMatchesUrl({ pattern }, rule.pattern)
        : rulePatternMatchesUrl({ pattern }, rule.pattern);
      if (candidateMatches) return { ...rule, relation: 'existing-narrower' };
      return null;
    })
    .filter(Boolean)
    .sort((left, right) => String(right.pattern).length - String(left.pattern).length);
}

export function diagnoseTabAssignment(tab, smartGroups, trainedRules, context = null, managedGroupKeys = new Set(), focusGroupKeys = new Set(), enabledTypes = null) {
  const enabled = normalizeManagedGroupTypeEnabled(enabledTypes);
  const normalizedUrl = trainingPatternForUrl(tab?.url);
  if (!normalizedUrl) return { state: 'unsupported', reason: 'This is not an http or https tab.' };
  if (tab?.pinned) return { state: 'pinned', reason: 'Pinned tabs stay outside Tab Bundlr automation.' };
  const groupKey = `${Number(tab.windowId)}:${Number(tab.groupId ?? -1)}`;
  if (focusGroupKeys.has(groupKey)) {
    return { state: 'focus', reason: 'This tab is protected by a Focus Group.' };
  }
  const assignment = bestUrlAssignmentForUrl(smartGroups, trainedRules, tab.url, enabled);
  if (assignment) {
    return {
      state: assignment.type,
      assignment,
      reason: assignment.type === 'smart'
        ? `Smart Group ${assignment.rule.name || 'Unnamed Smart Group'} matches this URL.`
        : `Workspace rule ${assignment.rule.epicName || 'Unnamed Workspace'} matches this URL.`,
    };
  }
  if (context?.source === 'opener') return { state: 'inherited', reason: 'Chrome supplied a known opener relationship for this tab.' };
  if (context?.source === 'manual') return { state: 'manual', reason: 'You explicitly moved this tab once without saving a rule.' };
  if (Number(tab.groupId ?? -1) >= 0 && !managedGroupKeys.has(groupKey)) {
    return { state: 'manual-group', reason: 'This tab is already inside a manually managed Chrome group.' };
  }
  return {
    state: 'unassigned',
    normalizedUrl,
    reason: Number(tab.groupId ?? -1) >= 0
      ? 'This tab is in a managed group, but no saved rule or opener relationship explains it.'
      : 'No Workspace Source, Smart Group prefix, saved workspace rule, or known opener relationship matches this URL.',
  };
}

export function normalizeActivityHistory(value) {
  return (Array.isArray(value) ? value : [])
    .map((activity) => ({
      id: String(activity?.id || ''),
      createdAt: activity?.createdAt || new Date().toISOString(),
      label: String(activity?.label || 'Tab move'),
      reason: String(activity?.reason || 'unknown'),
      moves: Array.isArray(activity?.moves) ? activity.moves.filter((move) => Number.isFinite(Number(move?.tabId))) : [],
    }))
    .filter((activity) => activity.id && activity.moves.length)
    .slice(0, MAX_ACTIVITY_HISTORY);
}

export function appendActivityHistory(history, activity, limit = MAX_ACTIVITY_HISTORY) {
  return normalizeActivityHistory([activity, ...normalizeActivityHistory(history)]).slice(0, Math.max(1, Number(limit) || MAX_ACTIVITY_HISTORY));
}

export function orderedSmartGroupIds(groups, order = []) {
  const candidates = Array.isArray(groups) ? groups : [];
  const available = new Set(candidates.map((group) => String(group.id)));
  const saved = [...new Set(Array.isArray(order) ? order.map(String) : [])]
    .filter((id) => available.has(id));
  const savedSet = new Set(saved);
  return [
    ...saved,
    ...candidates.map((group) => String(group.id)).filter((id) => !savedSet.has(id)),
  ];
}

export function managedWorkspaceType(record) {
  if (record?.workspaceType === 'focus' || record?.isFocusGroup === true) return 'focus-smart';
  if (record?.workspaceType === 'smart') return 'smart';
  if (record?.workspaceType === 'iteration') return 'iteration';
  return 'client';
}

export function orderedManagedGroupTypes(order = []) {
  const defaultOrder = ['client', 'iteration', 'smart', 'focus-smart'];
  const validTypes = new Set(defaultOrder);
  const saved = [...new Set(Array.isArray(order) ? order.map(String) : [])]
    .filter((type) => validTypes.has(type));
  const savedSet = new Set(saved);
  return [
    ...saved,
    ...defaultOrder.filter((type) => !savedSet.has(type)),
  ];
}

function compareWorkspaceNames(left, right, numeric = false) {
  const leftName = String(left?.epicName || left?.title || '');
  const rightName = String(right?.epicName || right?.title || '');
  return leftName.localeCompare(rightName, undefined, numeric
    ? { numeric: true, sensitivity: 'base' }
    : { sensitivity: 'base' });
}

export function sortManagedGroupRecords(records, smartGroupOrder = [], managedGroupTypeOrder = []) {
  const typeRank = new Map(orderedManagedGroupTypes(managedGroupTypeOrder).map((type, index) => [type, index]));
  const smartRank = new Map(orderedSmartGroupIds(
    records.filter((record) => record?.workspaceType === 'smart').map((record) => ({ id: record.smartGroupId })),
    smartGroupOrder,
  ).map((id, index) => [id, index]));
  return [...records].sort((left, right) => {
    const leftType = managedWorkspaceType(left);
    const rightType = managedWorkspaceType(right);
    const typeDifference = (typeRank.get(leftType) ?? Number.MAX_SAFE_INTEGER)
      - (typeRank.get(rightType) ?? Number.MAX_SAFE_INTEGER);
    if (typeDifference) return typeDifference;
    if (leftType === 'smart' || leftType === 'focus-smart') {
      return (smartRank.get(String(left.smartGroupId)) ?? Number.MAX_SAFE_INTEGER)
        - (smartRank.get(String(right.smartGroupId)) ?? Number.MAX_SAFE_INTEGER)
        || compareWorkspaceNames(left, right);
    }
    return compareWorkspaceNames(left, right, leftType === 'iteration');
  });
}

export function isTabEligibleForManualFix(tab, managedGroupIds, protectedGroupIds = new Set()) {
  if (tab?.pinned) return false;
  const groupId = Number(tab?.groupId ?? -1);
  if (protectedGroupIds instanceof Set && protectedGroupIds.has(groupId)) return false;
  if (groupId < 0) return true;
  return managedGroupIds instanceof Set && managedGroupIds.has(groupId);
}

export function normalizeEpicName(value) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  return name || 'Unnamed Workspace';
}

export function epicColorForId(epicId) {
  let hash = 0;
  for (const character of String(epicId)) {
    hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  }
  return CHROME_GROUP_COLORS[Math.abs(hash) % CHROME_GROUP_COLORS.length];
}

export function managedColorForWorkspace(record, configuredColors = {}) {
  const configuredColor = configuredColors?.[managedWorkspaceType(record)];
  if (CHROME_GROUP_COLORS.includes(configuredColor)) return configuredColor;
  const automaticColor = epicColorForId(record?.focusGroupId || record?.smartGroupId || record?.epicId);
  if (configuredColor !== UNIQUE_AUTO_COLOR) return automaticColor;

  const reservedColors = new Set(Object.values(configuredColors)
    .filter((color) => CHROME_GROUP_COLORS.includes(color)));
  const startIndex = CHROME_GROUP_COLORS.indexOf(automaticColor);
  for (let offset = 0; offset < CHROME_GROUP_COLORS.length; offset += 1) {
    const candidate = CHROME_GROUP_COLORS[(startIndex + offset) % CHROME_GROUP_COLORS.length];
    if (!reservedColors.has(candidate)) return candidate;
  }
  return automaticColor;
}

export function groupRecordKey(windowId, workspaceId, workspaceType = 'epic') {
  const focusWorkspaceId = String(workspaceId).startsWith('focus:')
    ? String(workspaceId)
    : focusGroupWorkspaceId(workspaceId);
  return workspaceType === 'iteration'
    ? `${windowId}:iteration:${workspaceId}`
    : workspaceType === 'focus'
      ? `${windowId}:${focusWorkspaceId}`
    : `${windowId}:${workspaceId}`;
}

export function collisionGroupTitle(epicName) {
  return `${normalizeEpicName(epicName)} · Tab Bundlr`;
}

export function managedGroupTitle(epicName, currentGroupId, groups) {
  const normalizedName = normalizeEpicName(epicName);
  const exactNameConflict = (Array.isArray(groups) ? groups : []).some((candidate) => (
    Number(candidate.id) !== Number(currentGroupId) && candidate.title === normalizedName
  ));
  return exactNameConflict ? collisionGroupTitle(normalizedName) : normalizedName;
}

export function tabContextForEpic({ epicId, epicName, groupId, windowId, storyId = null, source = 'story', workspaceType = 'epic', smartGroupId = null, focusGroupId = null }) {
  return {
    epicId: String(epicId),
    epicName: normalizeEpicName(epicName),
    groupId: Number(groupId),
    windowId: Number(windowId),
    storyId: storyId ? String(storyId) : null,
    source: String(source || 'story'),
    workspaceType: String(workspaceType || 'epic'),
    smartGroupId: smartGroupId ? String(smartGroupId) : null,
    focusGroupId: focusGroupId ? String(focusGroupId) : null,
  };
}

export function enabledFromStorage(value) {
  return value === undefined ? DEFAULT_ENABLED : value === true;
}

export function activateOpenedTabsFromStorage(value) {
  return value === true;
}

export function previousTabModeFromStorage(value) {
  return value === 'history' ? 'history' : DEFAULT_PREVIOUS_TAB_MODE;
}

export function normalizeTabActivationHistory(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.entries(source).flatMap(([windowId, entry]) => {
    const normalizedWindowId = Number(windowId);
    if (!Number.isInteger(normalizedWindowId) || normalizedWindowId < 0) return [];
    const tabs = (Array.isArray(entry?.tabs) ? entry.tabs : [])
      .map(Number)
      .filter((tabId) => Number.isInteger(tabId) && tabId >= 0)
      .slice(-MAX_TAB_ACTIVATION_HISTORY);
    const cursor = entry?.cursor === null || entry?.cursor === undefined
      ? Number.NaN
      : Number(entry.cursor);
    return [[String(normalizedWindowId), {
      tabs,
      cursor: Number.isInteger(cursor) && cursor >= 0 && cursor < tabs.length ? cursor : null,
    }]];
  }));
}

export function recordTabActivation(value, windowId, tabId) {
  const normalizedWindowId = Number(windowId);
  const normalizedTabId = Number(tabId);
  const history = normalizeTabActivationHistory(value);
  if (!Number.isInteger(normalizedWindowId) || normalizedWindowId < 0
    || !Number.isInteger(normalizedTabId) || normalizedTabId < 0) return history;
  const key = String(normalizedWindowId);
  const tabs = [...(history[key]?.tabs || [])];
  if (tabs.at(-1) !== normalizedTabId) tabs.push(normalizedTabId);
  history[key] = {
    tabs: tabs.slice(-MAX_TAB_ACTIVATION_HISTORY),
    cursor: null,
  };
  return history;
}

export function previousTabTarget(value, windowId, currentTabId, mode) {
  const history = normalizeTabActivationHistory(value);
  const entry = history[String(Number(windowId))];
  const current = Number(currentTabId);
  if (!entry || !Number.isInteger(current)) return null;
  const normalizedMode = previousTabModeFromStorage(mode);
  let index = normalizedMode === 'history' && Number.isInteger(entry.cursor)
    ? entry.cursor - 1
    : entry.tabs.length - 1;
  if (normalizedMode === 'history' && entry.cursor === null) {
    const currentIndex = entry.tabs.lastIndexOf(current);
    if (currentIndex >= 0) index = currentIndex - 1;
  }
  for (; index >= 0; index -= 1) {
    if (entry.tabs[index] !== current) return { tabId: entry.tabs[index], index };
  }
  return null;
}

export function setTabActivationHistoryCursor(value, windowId, cursor) {
  const history = normalizeTabActivationHistory(value);
  const key = String(Number(windowId));
  const entry = history[key];
  if (!entry) return history;
  const normalizedCursor = Number(cursor);
  history[key] = {
    tabs: entry.tabs,
    cursor: Number.isInteger(normalizedCursor) && normalizedCursor >= 0 && normalizedCursor < entry.tabs.length
      ? normalizedCursor
      : null,
  };
  return history;
}

export function removeTabFromActivationHistory(value, tabId) {
  const normalizedTabId = Number(tabId);
  return Object.fromEntries(Object.entries(normalizeTabActivationHistory(value)).map(([windowId, entry]) => [windowId, {
    tabs: entry.tabs.filter((candidate) => candidate !== normalizedTabId),
    cursor: null,
  }]));
}

export function removeWindowFromActivationHistory(value, windowId) {
  const history = normalizeTabActivationHistory(value);
  delete history[String(Number(windowId))];
  return history;
}

export function effectiveActivateOpenedTabs(value, overrideUntil, now = Date.now()) {
  const configured = activateOpenedTabsFromStorage(value);
  const expiresAt = Number(overrideUntil);
  return Number.isFinite(expiresAt) && expiresAt > Number(now) ? !configured : configured;
}

export function temporaryActivationSecondsRemaining(overrideUntil, now = Date.now()) {
  const remainingMilliseconds = Number(overrideUntil) - Number(now);
  return Number.isFinite(remainingMilliseconds) && remainingMilliseconds > 0
    ? Math.ceil(remainingMilliseconds / 1000)
    : 0;
}

export function summarizeGroups(groups, tabs) {
  const counts = new Map();
  for (const tab of tabs) {
    if (Number(tab.groupId) >= 0) counts.set(Number(tab.groupId), (counts.get(Number(tab.groupId)) || 0) + 1);
  }
  return groups.map((group) => ({
    id: group.id,
    title: group.title || 'Untitled group',
    color: group.color || 'grey',
    count: counts.get(Number(group.id)) || 0,
  }));
}

export function tabRoleForUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return 'browser';
    const host = url.hostname.toLowerCase();
    if (host === 'figma.com' || host.endsWith('.figma.com')) return 'figma';
    if (host === 'github.com' || host.endsWith('.github.com')) return 'github';
    if (host === 'slack.com' || host.endsWith('.slack.com')) return 'slack';
    if (host === 'notion.so' || host.endsWith('.notion.so')) return 'notion';
    if (host === 'myshopify.com' || host.endsWith('.myshopify.com') || host === 'shopify.com' || host.endsWith('.shopify.com')) return 'shopify';
  } catch {
    return 'web';
  }
  return 'web';
}

export function tabRoleLabel(role) {
  return TAB_ROLE_LABELS[role] || TAB_ROLE_LABELS.web;
}

export const TabBundlrCore = Object.freeze({
  CHROME_GROUP_COLORS,
  TAB_ROLE_LABELS,
});
