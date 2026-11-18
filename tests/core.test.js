import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collisionGroupTitle,
  CHROME_GROUP_COLORS,
  contextRuleActionAvailability,
  DEFAULT_STALE_TAB_DAYS,
  DEFAULT_PREVIOUS_TAB_MODE,
  duplicateKeyForUrl,
  activateOpenedTabsFromStorage,
  effectiveActivateOpenedTabs,
  externalTabDestinationWindowId,
  autoOrganizeGroupsFromStorage,
  bestTrainedRuleForUrl,
  bestSmartGroupRuleForUrl,
  bestUrlAssignmentForUrl,
  browserPageSmartGroup,
  canInheritOpenerForTab,
  epicColorForId,
  enabledFromStorage,
  focusSmartGroup,
  groupRecordKey,
  isTabEligibleForManualFix,
  isRelevantTabUpdate,
  isBrowserPageUrl,
  managedGroupTitle,
  managedWorkspaceType,
  managedColorForWorkspace,
  normalizeEpicName,
  normalizeManagedGroupTypeEnabled,
  normalizePersistentHomeBases,
  normalizeTabActivationHistory,
  orderedManagedGroupTypes,
  orderedSmartGroupIds,
  sortManagedGroupRecords,
  shouldPauseWindowAfterDetachedTab,
  smartGroupMatchesUrl,
  smartGroupPatterns,
  smartGroupWorkspaceId,
  STALE_TAB_DAY_OPTIONS,
  TEMPORARY_ACTIVATION_OVERRIDE_DURATION_MS,
  temporaryActivationSecondsRemaining,
  analyzeUrlRules,
  appendActivityHistory,
  diagnoseTabAssignment,
  normalizeActivityHistory,
  overlappingUrlRules,
  persistentHomeBaseForUrl,
  previousTabModeFromStorage,
  previousTabTarget,
  recordTabActivation,
  removeTabFromActivationHistory,
  removeWindowFromActivationHistory,
  setTabActivationHistoryCursor,
  trainingPatternForUrl,
  trainedRuleMatchesUrl,
  tabRoleForUrl,
  tabRoleLabel,
  UNIQUE_AUTO_COLOR,
  normalizeWindowAutomationPolicy,
  normalizeWindowAutomationPreference,
  restoredWindowAutomationPolicy,
  windowAllowedByPolicy,
} from '../core.js';

test('routes only Chrome-owned pages to a standard Smart Group destination', () => {
  const groups = [
    { id: 'browser', name: 'Browser', patterns: ['https://example.com/browser'] },
    { id: 'focus', name: 'Focus', patterns: ['https://example.com/focus'], focusMode: true },
  ];

  assert.equal(isBrowserPageUrl('chrome://extensions/'), true);
  assert.equal(isBrowserPageUrl('chrome://settings/'), true);
  assert.equal(isBrowserPageUrl('https://example.com/'), false);
  assert.equal(isBrowserPageUrl('file:///tmp/example.html'), false);
  assert.equal(browserPageSmartGroup(groups, 'browser')?.name, 'Browser');
  assert.equal(browserPageSmartGroup(groups, 'focus'), null);
  assert.equal(browserPageSmartGroup(groups, 'missing'), null);
});

test('normalizes persistent home bases as unique exact URLs', () => {
  assert.deepEqual(normalizePersistentHomeBases([
    'https://work.example.com/dashboard/?team=platform#capacity',
    { url: 'https://work.example.com/dashboard?team=platform' },
    'chrome://extensions/',
    '',
  ]), ['https://work.example.com/dashboard?team=platform']);
  assert.equal(
    persistentHomeBaseForUrl(
      'https://work.example.com/dashboard/?team=platform#other-view',
      ['https://work.example.com/dashboard?team=platform'],
    ),
    'https://work.example.com/dashboard?team=platform',
  );
  assert.equal(
    persistentHomeBaseForUrl(
      'https://work.example.com/dashboard?team=design',
      ['https://work.example.com/dashboard?team=platform'],
    ),
    null,
  );
});

test('offers rule actions based on explicit automatic coverage state', () => {
  assert.deepEqual(contextRuleActionAvailability({
    activeTab: {
      roleLabel: 'Web',
      url: 'https://work.example.com/collections/sprint-34',
    },
    activeCoverage: { state: 'not-covered' },
    activeAssignment: null,
  }), {
    canAddSmartGroup: true,
    canAddClientRule: true,
  });

  assert.deepEqual(contextRuleActionAvailability({
    activeTab: {
      roleLabel: 'Web',
      url: 'https://work.example.com/collections/sprint-34',
    },
    activeCoverage: { state: 'automatic' },
    activeAssignment: null,
  }), {
    canAddSmartGroup: false,
    canAddClientRule: false,
  });

  assert.deepEqual(contextRuleActionAvailability({
    activeTab: {
      roleLabel: 'Browser',
      url: 'chrome://extensions/',
    },
    activeCoverage: { state: 'ignored', type: 'browser' },
    activeAssignment: null,
  }), {
    canAddSmartGroup: false,
    canAddClientRule: false,
  });
  assert.equal(tabRoleLabel(tabRoleForUrl('chrome://extensions/')), 'Browser');
});

test('enables every workspace category by default and filters disabled routing categories', () => {
  assert.deepEqual(normalizeManagedGroupTypeEnabled(), {
    client: true,
    iteration: true,
    smart: true,
    'focus-smart': true,
  });
  const smartGroups = [
    { id: 'collections', name: 'Collections', patterns: ['https://work.example.com/collections/'] },
    { id: 'focus', name: 'Focus', patterns: ['https://example.com/focus'], focusMode: true },
  ];
  const enabled = { iteration: false, 'focus-smart': false };
  assert.equal(
    bestUrlAssignmentForUrl(smartGroups, [], 'https://work.example.com/collections/sprint-33', enabled)?.rule.id,
    'collections',
  );
  assert.equal(bestUrlAssignmentForUrl(smartGroups, [], 'https://example.com/focus', enabled), null);
  assert.equal(
    diagnoseTabAssignment(
      { id: 7, windowId: 2, groupId: -1, url: 'https://work.example.com/collections/sprint-33', pinned: false },
      smartGroups,
      [],
      null,
      new Set(),
      new Set(),
      enabled,
    ).state,
    'smart',
  );
});

test('defaults window automation to all and supports one, many, or zero selected windows', () => {
  const defaultPolicy = normalizeWindowAutomationPolicy(undefined, undefined);
  assert.deepEqual(defaultPolicy, { mode: 'all', selectedWindowIds: [] });
  assert.equal(windowAllowedByPolicy(12, defaultPolicy), true);

  const selectedPolicy = normalizeWindowAutomationPolicy('selected', [12, '18', 12, 'invalid']);
  assert.deepEqual(selectedPolicy, { mode: 'selected', selectedWindowIds: [12, 18] });
  assert.equal(windowAllowedByPolicy(12, selectedPolicy), true);
  assert.equal(windowAllowedByPolicy(18, selectedPolicy), true);
  assert.equal(windowAllowedByPolicy(24, selectedPolicy), false);

  const noWindowsPolicy = normalizeWindowAutomationPolicy('selected', []);
  assert.equal(windowAllowedByPolicy(12, noWindowsPolicy), false);
  assert.deepEqual(normalizeWindowAutomationPreference({ mode: 'selected', restoreSoleWindow: true }), {
    mode: 'selected',
    restoreSoleWindow: true,
  });
  assert.deepEqual(
    restoredWindowAutomationPolicy(undefined, undefined, { mode: 'selected', restoreSoleWindow: true }, [12]),
    { mode: 'selected', selectedWindowIds: [12] },
  );
  assert.deepEqual(
    restoredWindowAutomationPolicy(undefined, undefined, { mode: 'selected', restoreSoleWindow: true }, [12, 18]),
    { mode: 'selected', selectedWindowIds: [] },
  );
  assert.equal(externalTabDestinationWindowId({
    windowId: 20,
    pendingUrl: 'https://example.com/external',
    pinned: false,
  }, 2, selectedPolicy), null);
  assert.equal(externalTabDestinationWindowId({
    windowId: 20,
    pendingUrl: 'https://example.com/external',
    pinned: false,
  }, 2, normalizeWindowAutomationPolicy('selected', [12])), 12);
  assert.equal(externalTabDestinationWindowId({
    windowId: 20,
    pendingUrl: 'https://example.com/new-window',
    pinned: false,
  }, 1, normalizeWindowAutomationPolicy('selected', [12])), null);
});

test('ignores noisy tab updates before background processing starts', () => {
  assert.equal(isRelevantTabUpdate({ title: 'Updated title' }), false);
  assert.equal(isRelevantTabUpdate({ favIconUrl: 'https://example.com/favicon.ico' }), false);
  assert.equal(isRelevantTabUpdate({ audible: true }), false);
  assert.equal(isRelevantTabUpdate({ status: 'loading' }), false);
  assert.equal(isRelevantTabUpdate({ status: 'complete' }), true);
  assert.equal(isRelevantTabUpdate({ url: 'https://example.com/next' }), true);
  assert.equal(isRelevantTabUpdate({ groupId: -1 }), true);
});

test('maps one workspace ID deterministically to one Chrome group color', () => {
  assert.equal(epicColorForId('12345'), epicColorForId('12345'));
  assert.notEqual(epicColorForId('12345'), epicColorForId('12346'));
});

test('supports configured colors per managed group type with deterministic fallback', () => {
  assert.equal(managedColorForWorkspace({ workspaceType: 'epic', epicId: '420001' }, { client: 'purple' }), 'purple');
  assert.equal(managedColorForWorkspace({ workspaceType: 'iteration', epicId: '420002' }, { iteration: 'orange' }), 'orange');
  assert.equal(managedColorForWorkspace({ workspaceType: 'smart', smartGroupId: 'personal', epicId: 'personal' }, { smart: 'not-a-chrome-color' }), epicColorForId('personal'));
  assert.equal(managedColorForWorkspace({ workspaceType: 'smart', smartGroupId: 'in-progress' }, { smart: 'cyan' }), 'cyan');
  assert.equal(managedColorForWorkspace({ workspaceType: 'smart', smartGroupId: 'in-progress', isFocusGroup: true }, { smart: 'cyan', 'focus-smart': 'blue' }), 'blue');
  assert.deepEqual(CHROME_GROUP_COLORS.includes('cyan'), true);
});

test('unique automatic colors avoid manually assigned category colors', () => {
  const configured = { client: 'blue', iteration: 'red', smart: UNIQUE_AUTO_COLOR };
  const first = managedColorForWorkspace({ workspaceType: 'smart', smartGroupId: 'personal' }, configured);
  assert.equal(first, managedColorForWorkspace({ workspaceType: 'smart', smartGroupId: 'personal' }, configured));
  assert.equal(configured.client === first, false);
  assert.equal(configured.iteration === first, false);
});

test('uses practical stale-tab review thresholds with a two-week default', () => {
  assert.deepEqual(STALE_TAB_DAY_OPTIONS, [1, 3, 5, 7, 14, 30, 60]);
  assert.equal(DEFAULT_STALE_TAB_DAYS, 14);
});

test('temporarily inverts link tab activation until the override expires', () => {
  const now = 1_000;
  const activeOverride = now + TEMPORARY_ACTIVATION_OVERRIDE_DURATION_MS;

  assert.equal(TEMPORARY_ACTIVATION_OVERRIDE_DURATION_MS, 10_000);
  assert.equal(effectiveActivateOpenedTabs(true, activeOverride, now), false);
  assert.equal(effectiveActivateOpenedTabs(false, activeOverride, now), true);
  assert.equal(effectiveActivateOpenedTabs(true, activeOverride, activeOverride), true);
  assert.equal(effectiveActivateOpenedTabs(false, undefined, now), false);
  assert.equal(temporaryActivationSecondsRemaining(activeOverride, now), 10);
  assert.equal(temporaryActivationSecondsRemaining(activeOverride, now + 9_001), 1);
  assert.equal(temporaryActivationSecondsRemaining(activeOverride, activeOverride), 0);
});

test('supports toggling between two tabs and walking backward through tab history', () => {
  let history = {};
  history = recordTabActivation(history, 7, 101);
  history = recordTabActivation(history, 7, 102);
  history = recordTabActivation(history, 7, 103);

  assert.equal(DEFAULT_PREVIOUS_TAB_MODE, 'toggle');
  assert.equal(previousTabModeFromStorage(undefined), 'toggle');
  assert.equal(previousTabModeFromStorage('history'), 'history');
  assert.equal(previousTabModeFromStorage('unsupported'), 'toggle');

  const toggleTarget = previousTabTarget(history, 7, 103, 'toggle');
  assert.deepEqual(toggleTarget, { tabId: 102, index: 1 });
  history = recordTabActivation(history, 7, toggleTarget.tabId);
  assert.deepEqual(previousTabTarget(history, 7, 102, 'toggle'), { tabId: 103, index: 2 });

  history = normalizeTabActivationHistory({
    7: { tabs: [101, 102, 103], cursor: null },
  });
  const firstHistoryTarget = previousTabTarget(history, 7, 103, 'history');
  assert.deepEqual(firstHistoryTarget, { tabId: 102, index: 1 });
  history = setTabActivationHistoryCursor(history, 7, firstHistoryTarget.index);
  assert.deepEqual(previousTabTarget(history, 7, 102, 'history'), { tabId: 101, index: 0 });

  history = removeTabFromActivationHistory(history, 102);
  assert.deepEqual(history['7'], { tabs: [101, 103], cursor: null });
  history = removeWindowFromActivationHistory(history, 7);
  assert.deepEqual(history, {});
});

test('normalizes group names and keeps storage keys window-specific', () => {
  assert.equal(normalizeEpicName('  Project   /   Replatform  '), 'Project / Replatform');
  assert.equal(collisionGroupTitle('Project / Replatform'), 'Project / Replatform · Tab Bundlr');
  assert.equal(groupRecordKey(7, 123), '7:123');
  assert.equal(groupRecordKey(7, 420002, 'iteration'), '7:iteration:420002');
  assert.equal(enabledFromStorage(undefined), true);
  assert.equal(enabledFromStorage(false), false);
  assert.equal(activateOpenedTabsFromStorage(undefined), false);
  assert.equal(activateOpenedTabsFromStorage(true), true);
  assert.equal(autoOrganizeGroupsFromStorage(undefined), false);
  assert.equal(autoOrganizeGroupsFromStorage(true), true);
});

test('removes a stale collision suffix when the managed group no longer conflicts', () => {
  assert.equal(managedGroupTitle('Project Slate', 42, [
    { id: 42, title: 'Project Slate · Tab Bundlr' },
  ]), 'Project Slate');
  assert.equal(managedGroupTitle('Project Slate', 42, [
    { id: 42, title: 'Project Slate · Tab Bundlr' },
    { id: 99, title: 'Project Slate' },
  ]), 'Project Slate · Tab Bundlr');
});

test('classifies recognizable workspace tabs without guessing generic web tabs', () => {
  assert.equal(tabRoleForUrl('https://work.example.com/items/420007'), 'web');
  assert.equal(tabRoleForUrl('https://www.figma.com/file/example'), 'figma');
  assert.equal(tabRoleForUrl('https://github.com/sample-user/tab-bundlr'), 'github');
  assert.equal(tabRoleForUrl('https://admin.shopify.com/store/example'), 'shopify');
  assert.equal(tabRoleForUrl('https://example.com/search?q=workspace'), 'web');
  assert.equal(tabRoleLabel('github'), 'GitHub');
});

test('matches learned URL prefixes explicitly and prefers the most specific rule', () => {
  const rules = [
    { pattern: 'https://admin.shopify.com/store/project-atlas', epicId: '420001' },
    { pattern: 'https://admin.shopify.com/store/project-atlas/products', epicId: '420001' },
  ];
  assert.equal(trainingPatternForUrl('https://admin.shopify.com/store/project-atlas/products?view=all'), 'https://admin.shopify.com/store/project-atlas/products');
  assert.equal(trainedRuleMatchesUrl(rules[0], 'https://admin.shopify.com/store/project-atlas/orders/1'), true);
  assert.equal(trainedRuleMatchesUrl(rules[0], 'https://admin.shopify.com/store/project-atlas-other'), false);
  assert.equal(trainedRuleMatchesUrl({ pattern: 'https://github.com/ExampleOrg/studio-' }, 'https://github.com/ExampleOrg/studio-checkout'), true);
  assert.equal(trainedRuleMatchesUrl({ pattern: 'https://github.com/ExampleOrg/studio-' }, 'https://github.com/ExampleOrg/other-repo'), false);
  assert.equal(bestTrainedRuleForUrl(rules, 'https://admin.shopify.com/store/project-atlas/products/1'), rules[1]);
});

test('matches saved workspace URL rules case-insensitively and detects case-only duplicates', () => {
  const rule = {
    pattern: 'https://app.notion.com/p/example-team/project-aurora-',
    epicId: '420009',
    epicName: 'Project Aurora',
  };
  const uppercaseUrl = 'https://app.notion.com/p/example-team/PROJECT-AURORA-CMS-Guidelines';

  assert.equal(trainedRuleMatchesUrl(rule, uppercaseUrl), true);
  assert.equal(bestTrainedRuleForUrl([rule], uppercaseUrl), rule);
  assert.deepEqual(
    overlappingUrlRules('https://app.notion.com/p/example-team/PROJECT-AURORA-', [], [rule], { type: 'learned' }),
    [{ type: 'learned', id: '420009', name: 'Project Aurora', pattern: rule.pattern, relation: 'equal' }],
  );
});

test('matches a bare domain rule on the domain homepage and deeper paths', () => {
  const pattern = trainingPatternForUrl('https://mail.google.com/');
  assert.equal(pattern, 'https://mail.google.com');
  assert.equal(trainedRuleMatchesUrl({ pattern }, 'https://mail.google.com/'), true);
  assert.equal(trainedRuleMatchesUrl({ pattern }, 'https://mail.google.com/mail/u/0/'), true);
  assert.equal(trainedRuleMatchesUrl({ pattern: 'https://mail.google.com/' }, 'https://mail.google.com/mail/u/0/'), true);
});

test('only web destinations can inherit an opener workspace', () => {
  assert.equal(canInheritOpenerForTab({ url: 'https://example.com/page', pinned: false }), true);
  assert.equal(canInheritOpenerForTab({ url: 'chrome://newtab/', pinned: false }), false);
  assert.equal(canInheritOpenerForTab({ url: '', pinned: false }), false);
  assert.equal(canInheritOpenerForTab({ url: 'https://example.com/page', pinned: true }), false);
});

test('pauses automation when a manually detached tab becomes a new one-tab window', () => {
  assert.equal(shouldPauseWindowAfterDetachedTab({
    detachedFromWindowId: 4,
    attachedToWindowId: 9,
    destinationTabCount: 1,
  }), true);
  assert.equal(shouldPauseWindowAfterDetachedTab({
    detachedFromWindowId: 4,
    attachedToWindowId: 9,
    destinationTabCount: 2,
  }), false);
  assert.equal(shouldPauseWindowAfterDetachedTab({
    detachedFromWindowId: null,
    attachedToWindowId: 9,
    destinationTabCount: 1,
  }), false);
  assert.equal(shouldPauseWindowAfterDetachedTab({
    detachedFromWindowId: 9,
    attachedToWindowId: 9,
    destinationTabCount: 1,
  }), false);
});

test('normalizes duplicate review URLs conservatively', () => {
  assert.equal(duplicateKeyForUrl('https://example.com/path/#section'), 'https://example.com/path');
  assert.equal(duplicateKeyForUrl('https://example.com/path/?view=all#details'), 'https://example.com/path?view=all');
  assert.notEqual(duplicateKeyForUrl('https://example.com/path?view=all'), duplicateKeyForUrl('https://example.com/path?view=grid'));
  assert.equal(duplicateKeyForUrl('chrome://newtab/'), null);
});

test('manual Fix considers ungrouped and managed tabs except protected Focus Groups', () => {
  const managedGroupIds = new Set([12]);
  const protectedGroupIds = new Set([12]);
  assert.equal(isTabEligibleForManualFix({ groupId: -1 }, managedGroupIds), true);
  assert.equal(isTabEligibleForManualFix({ groupId: 12 }, managedGroupIds), true);
  assert.equal(isTabEligibleForManualFix({ groupId: 12 }, managedGroupIds, protectedGroupIds), false);
  assert.equal(isTabEligibleForManualFix({ groupId: 18 }, managedGroupIds), false);
  assert.equal(isTabEligibleForManualFix({ groupId: -1, pinned: true }, managedGroupIds), false);
  assert.equal(isTabEligibleForManualFix({ groupId: 12, pinned: true }, managedGroupIds), false);
});

test('keeps each managed group type internally ordered by its own policy', () => {
  const groups = [
    { id: 'studio', name: 'Studio' },
    { id: 'personal', name: 'sample-user' },
    { id: 'stale', name: 'Removed' },
  ];
  assert.deepEqual(orderedSmartGroupIds(groups.slice(0, 2), ['personal']), ['personal', 'studio']);
  assert.deepEqual(sortManagedGroupRecords([
    { workspaceType: 'smart', smartGroupId: 'in-progress', epicName: '[ In Progress ]', isFocusGroup: true },
    { workspaceType: 'smart', smartGroupId: 'personal', epicName: 'sample-user' },
    { workspaceType: 'epic', epicName: 'Zeta' },
    { workspaceType: 'smart', smartGroupId: 'studio', epicName: 'Studio' },
    { workspaceType: 'iteration', epicName: 'S34 (8/24 - 8/28)' },
    { workspaceType: 'epic', epicName: 'Project Atlas' },
  ], ['in-progress', 'studio', 'personal']).map((record) => record.epicName), ['Project Atlas', 'Zeta', 'S34 (8/24 - 8/28)', 'Studio', 'sample-user', '[ In Progress ]']);
});

test('allows one custom order across saved, collection, Smart, and Focus Smart group sections', () => {
  const records = [
    { workspaceType: 'smart', smartGroupId: 'in-progress', epicName: '[ In Progress ]', isFocusGroup: true },
    { workspaceType: 'epic', epicId: '420001', epicName: 'Project Atlas' },
    { workspaceType: 'iteration', epicId: '420003', epicName: 'S34 (8/24 - 8/28)' },
    { workspaceType: 'iteration', epicId: '420002', epicName: 'S33 (8/17 - 8/21)' },
    { workspaceType: 'smart', smartGroupId: 'personal', epicName: 'sample-user' },
  ];
  assert.deepEqual(orderedManagedGroupTypes(['smart', 'client', 'iteration']), ['smart', 'client', 'iteration', 'focus-smart']);
  assert.deepEqual(
    sortManagedGroupRecords(records, ['in-progress', 'personal'], ['focus-smart', 'smart', 'iteration', 'client']).map(managedWorkspaceType),
    ['focus-smart', 'smart', 'iteration', 'iteration', 'client'],
  );
  assert.deepEqual(
    sortManagedGroupRecords(records, ['in-progress', 'personal'], ['focus-smart', 'smart', 'iteration', 'client']).map((record) => record.epicName),
    ['[ In Progress ]', 'sample-user', 'S33 (8/17 - 8/21)', 'S34 (8/24 - 8/28)', 'Project Atlas'],
  );
});

test('allows only an explicitly designated Smart Group to provide Focus behavior', () => {
  const groups = [
    { id: 'in-progress', name: '[ In Progress ]', focusMode: true },
    { id: 'personal', name: 'sample-user', focusMode: false },
  ];
  assert.equal(focusSmartGroup(groups)?.id, 'in-progress');
  assert.equal(focusSmartGroup(groups.slice(1)), null);
});

test('matches named Smart Groups by explicit URL prefixes', () => {
  const groups = [
    { id: 'personal', name: 'sample-user', patterns: ['https://github.com/sample-user'] },
    { id: 'studio', name: 'Studio', patterns: ['https://github.com/ExampleOrg/studio-'] },
    { id: 'github', name: 'github', patterns: ['https://github.com'] },
  ];
  assert.equal(smartGroupMatchesUrl(groups[0], 'https://github.com/sample-user/projects?tab=repositories'), true);
  assert.deepEqual(smartGroupPatterns(groups[0]), ['https://github.com/sample-user']);
  assert.equal(bestSmartGroupRuleForUrl(groups, 'https://github.com/sample-user/').id, 'personal');
  assert.equal(bestSmartGroupRuleForUrl(groups, 'https://github.com/ExampleOrg/studio-checkout').id, 'studio');
  assert.equal(smartGroupWorkspaceId('personal'), 'smart:personal');
});

test('lets a more specific workspace rule override a broader Smart Group rule', () => {
  const smartGroups = [
    { id: 'studio', name: 'Studio', patterns: ['https://app.notion.com/p/example-team'] },
  ];
  const trainedRules = [
    { pattern: 'https://app.notion.com/p/example-team/BEACON-', epicId: 'project-beacon', epicName: 'Project Beacon' },
  ];
  const workspaceAssignment = bestUrlAssignmentForUrl(
    smartGroups,
    trainedRules,
    'https://app.notion.com/p/example-team/BEACON-CMS-Guidelines-New-3a7c4892971b80eab316f8733910fce5',
  );
  assert.equal(workspaceAssignment.type, 'learned');
  assert.equal(workspaceAssignment.rule.epicName, 'Project Beacon');

  const generalAssignment = bestUrlAssignmentForUrl(
    smartGroups,
    trainedRules,
    'https://app.notion.com/p/example-team/STMP-CMS-Guidelines-Rebuild-3aac2971b81d385d0f7266100af0c',
  );
  assert.equal(generalAssignment.type, 'smart');
  assert.equal(generalAssignment.rule.name, 'Studio');
});

test('explains URL rule winners and overlapping prefixes through one rule-analysis interface', () => {
  const smartGroups = [{ id: 'studio', name: 'Studio', patterns: ['https://app.notion.com/p/example-team'] }];
  const trainedRules = [{ pattern: 'https://app.notion.com/p/example-team/BEACON-', epicId: 'project-beacon', epicName: 'Project Beacon' }];
  const analysis = analyzeUrlRules(smartGroups, trainedRules, 'https://app.notion.com/p/example-team/BEACON-CMS');
  assert.equal(analysis.state, 'matched');
  assert.equal(analysis.assignment.type, 'learned');
  assert.equal(analysis.assignment.name, "Project Beacon");
  assert.equal(analysis.matches.length, 2);
  assert.deepEqual(overlappingUrlRules('https://app.notion.com/p/example-team/BEACON-', smartGroups, [], {}), [{
    type: 'smart', id: 'studio', name: 'Studio', pattern: 'https://app.notion.com/p/example-team', relation: 'existing-broader',
  }]);
});

test('diagnoses unassigned, inherited, manual, and manually grouped tabs without guessing', () => {
  const tab = { id: 7, windowId: 2, groupId: -1, url: 'https://example.com/work', pinned: false };
  assert.equal(diagnoseTabAssignment(tab, [], []).state, 'unassigned');
  assert.equal(diagnoseTabAssignment(tab, [], [], { source: 'opener' }).state, 'inherited');
  assert.equal(diagnoseTabAssignment(tab, [], [], { source: 'manual' }).state, 'manual');
  assert.equal(diagnoseTabAssignment({ ...tab, groupId: 4 }, [], [], null, new Set()).state, 'manual-group');
  assert.equal(diagnoseTabAssignment({ ...tab, groupId: 4 }, [], [], null, new Set(['2:4'])).state, 'unassigned');
  assert.equal(diagnoseTabAssignment(
    { ...tab, groupId: 4, url: 'https://work.example.com/items/123/example' },
    [],
    [],
    null,
    new Set(['2:4']),
    new Set(['2:4']),
  ).state, 'focus');
});

test('keeps a bounded newest-first activity history', () => {
  const first = { id: 'first', label: 'Moved first', reason: 'smart', moves: [{ tabId: 1 }] };
  const second = { id: 'second', label: 'Moved second', reason: 'learned', moves: [{ tabId: 2 }] };
  assert.deepEqual(appendActivityHistory([first], second, 2).map((activity) => activity.id), ['second', 'first']);
  assert.deepEqual(appendActivityHistory([first], second, 1).map((activity) => activity.id), ['second']);
  assert.deepEqual(normalizeActivityHistory([{ id: '', moves: [] }, first]).map((activity) => activity.id), ['first']);
});
