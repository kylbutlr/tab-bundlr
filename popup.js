import { contextRuleActionAvailability, trainingPatternForUrl } from './core.js';
import {
  FIRST_USE_GUIDANCE_DISMISSED_STORAGE_KEY,
  shouldShowFirstUseGuidance,
} from './guidance.js';

const statePill = document.getElementById('state-pill');
const status = document.getElementById('status');
const currentWorkspace = document.getElementById('current-workspace');
const reviewTabs = document.getElementById('review-tabs');
const groups = document.getElementById('groups');
const reviewTabsPage = document.getElementById('review-tabs-page');
const undo = document.getElementById('undo');
const settings = document.getElementById('settings');
const help = document.getElementById('help');
const fixWindow = document.getElementById('fix-window');
const organizeWindow = document.getElementById('organize-window');
const firstUseGuide = document.getElementById('first-use-guide');
const dismissFirstUseGuide = document.getElementById('dismiss-first-use-guide');
const openFirstUseSettings = document.getElementById('open-first-use-settings');
const openFirstUseHelp = document.getElementById('open-first-use-help');
const smartGroupDialog = document.getElementById('smart-group-dialog');
const smartGroupDialogForm = document.getElementById('smart-group-dialog-form');
const smartGroupDialogTitle = document.getElementById('smart-group-dialog-title');
const smartGroupDialogSelect = document.getElementById('smart-group-dialog-select');
const smartGroupDialogNewFields = document.getElementById('smart-group-dialog-new-fields');
const smartGroupDialogName = document.getElementById('smart-group-dialog-name');
const smartGroupDialogPattern = document.getElementById('smart-group-dialog-pattern');
const smartGroupDialogOverlap = document.getElementById('smart-group-dialog-overlap');
const smartGroupDialogStatus = document.getElementById('smart-group-dialog-status');
const smartGroupDialogCancel = document.getElementById('smart-group-dialog-cancel');
const clientRuleDialog = document.getElementById('client-rule-dialog');
const clientRuleDialogForm = document.getElementById('client-rule-dialog-form');
const clientRuleDialogTitle = document.getElementById('client-rule-dialog-title');
const clientRuleDialogSelect = document.getElementById('client-rule-dialog-select');
const clientRuleDialogNewFields = document.getElementById('client-rule-dialog-new-fields');
const clientRuleDialogName = document.getElementById('client-rule-dialog-name');
const clientRuleDialogEpicId = document.getElementById('client-rule-dialog-epic-id');
const clientRuleDialogPattern = document.getElementById('client-rule-dialog-pattern');
const clientRuleDialogOverlap = document.getElementById('client-rule-dialog-overlap');
const clientRuleDialogStatus = document.getElementById('client-rule-dialog-status');
const clientRuleDialogCancel = document.getElementById('client-rule-dialog-cancel');

function button(label, className, onClick) {
  const control = document.createElement('button');
  control.type = 'button';
  control.className = className;
  control.textContent = label;
  control.addEventListener('click', onClick);
  return control;
}

function showStatus(message, tone = 'info') {
  status.textContent = message;
  status.dataset.tone = tone;
}

async function openHelpPage(anchor = '') {
  await chrome.tabs.create({ url: chrome.runtime.getURL(`help.html${anchor}`) });
  window.close();
}

function overlapWarning(overlaps) {
  if (!overlaps?.length) return '';
  const first = overlaps[0];
  const relation = first.relation === 'equal'
    ? 'matches the same prefix as'
    : first.relation === 'existing-broader'
      ? 'is more specific than'
      : 'is broader than';
  return `Overlap: this prefix ${relation} ${first.type === 'smart' ? 'Smart Group' : 'workspace rule'} ${first.name}. Longest-prefix priority decides the winner.`;
}

async function updateDialogOverlap(patternInput, output, exclude = {}) {
  const response = await chrome.runtime.sendMessage({
    type: 'ANALYZE_RULE_PATTERN',
    pattern: patternInput.value,
    exclude,
  });
  output.textContent = response?.ok ? overlapWarning(response.overlaps) : '';
}

function openSmartGroupDialog(response) {
  smartGroupDialogSelect.replaceChildren();
  response.smartGroups.forEach((group) => {
    const option = document.createElement('option');
    option.value = group.id;
    option.textContent = group.name;
    smartGroupDialogSelect.append(option);
  });
  const createOption = document.createElement('option');
  createOption.value = '__new__';
  createOption.textContent = '+ Create new Smart Group';
  smartGroupDialogSelect.append(createOption);
  const isReassignment = response.activeAssignment?.type === 'smart';
  smartGroupDialogTitle.textContent = isReassignment ? 'Change Smart Group' : 'Add URL to a Smart Group';
  smartGroupDialogSelect.dataset.sourceGroupId = isReassignment ? response.activeAssignment.smartGroupId : '';
  if (isReassignment) smartGroupDialogSelect.value = response.activeAssignment.smartGroupId;
  else smartGroupDialogSelect.value = response.smartGroups[0]?.id || '__new__';
  smartGroupDialogName.value = '';
  smartGroupDialogPattern.value = isReassignment
    ? response.activeAssignment.pattern
    : trainingPatternForUrl(response.activeTab?.url) || '';
  smartGroupDialogStatus.textContent = '';
  smartGroupDialogOverlap.textContent = '';
  smartGroupDialogPattern.dataset.excludeType = isReassignment ? 'smart' : '';
  smartGroupDialogPattern.dataset.excludeId = isReassignment ? response.activeAssignment.smartGroupId : '';
  smartGroupDialogPattern.dataset.excludePattern = isReassignment ? response.activeAssignment.pattern : '';
  updateSmartGroupDialogFields();
  smartGroupDialog.showModal();
  updateDialogOverlap(smartGroupDialogPattern, smartGroupDialogOverlap, isReassignment ? {
    type: 'smart', id: response.activeAssignment.smartGroupId, pattern: response.activeAssignment.pattern,
  } : {}).catch(() => {});
}

function updateSmartGroupDialogFields() {
  const isNewGroup = smartGroupDialogSelect.value === '__new__';
  smartGroupDialogNewFields.hidden = !isNewGroup;
  smartGroupDialogName.required = isNewGroup;
  smartGroupDialogTitle.textContent = isNewGroup
    ? 'Create Smart Group'
    : smartGroupDialogSelect.dataset.sourceGroupId ? 'Change Smart Group' : 'Add URL to a Smart Group';
}

async function openClientRuleDialog(response) {
  clientRuleDialogSelect.replaceChildren();
  clientRuleDialogSelect.dataset.windowId = String(response.windowId);
  response.clientGroups.forEach((group) => {
    const option = document.createElement('option');
    option.value = group.id;
    option.textContent = `${group.name}${group.archived ? ' · Archived' : ''}`;
    option.dataset.epicId = group.epicId;
    option.dataset.name = group.name;
    clientRuleDialogSelect.append(option);
  });
  const createOption = document.createElement('option');
  createOption.value = '__new__';
  createOption.textContent = '+ Create new workspace';
  clientRuleDialogSelect.append(createOption);
  const isReassignment = response.activeAssignment?.type === 'learned';
  clientRuleDialogTitle.textContent = isReassignment ? 'Change workspace rule' : 'Add workspace rule';
  const currentEpicId = response.activeAssignment?.epicId;
  const matchingOption = [...clientRuleDialogSelect.options].find((option) => option.dataset.epicId === currentEpicId);
  clientRuleDialogSelect.value = matchingOption?.value || response.clientGroups[0]?.id || '__new__';
  clientRuleDialogNewFields.hidden = clientRuleDialogSelect.value !== '__new__';
  clientRuleDialogName.value = '';
  clientRuleDialogEpicId.value = '';
  clientRuleDialogPattern.value = isReassignment
    ? response.activeAssignment.pattern
    : trainingPatternForUrl(response.activeTab?.url) || '';
  clientRuleDialogStatus.textContent = '';
  clientRuleDialogOverlap.textContent = '';
  clientRuleDialogPattern.dataset.excludeType = isReassignment ? 'learned' : '';
  clientRuleDialogPattern.dataset.excludeId = isReassignment ? response.activeAssignment.epicId : '';
  clientRuleDialogPattern.dataset.excludePattern = isReassignment ? response.activeAssignment.pattern : '';
  clientRuleDialog.showModal();
  updateDialogOverlap(clientRuleDialogPattern, clientRuleDialogOverlap, isReassignment ? {
    type: 'learned', id: response.activeAssignment.epicId, pattern: response.activeAssignment.pattern,
  } : {}).catch(() => {});
}

function updateClientRuleDialogFields() {
  clientRuleDialogNewFields.hidden = clientRuleDialogSelect.value !== '__new__';
  if (!clientRuleDialogNewFields.hidden) clientRuleDialogName.focus();
}

function sourceLabel(source) {
  if (source === 'focus' || source === 'focus-opener') return 'Focus Group';
  if (source === 'opener') return 'Inherited';
  if (source === 'manual') return 'Added by you';
  if (source === 'story') return 'Work item';
  if (source === 'epic') return 'Workspace';
  if (source === 'iteration') return 'Collection';
  if (String(source || '').startsWith('workspace-source:')) return 'Connection';
  if (source === 'learned') return 'Saved rule';
  if (source === 'smart') return 'Smart Group';
  return 'Unknown';
}

function tabRow(tab) {
  const row = document.createElement('div');
  row.className = 'tab-row';
  const copy = document.createElement('div');
  copy.className = 'tab-copy';
  const title = document.createElement('strong');
  title.textContent = tab.title;
  title.title = tab.title;
  const meta = document.createElement('small');
  meta.className = 'tab-meta';
  const role = document.createElement('span');
  role.textContent = tab.roleLabel;
  const source = document.createElement('span');
  source.textContent = sourceLabel(tab.source);
  meta.append(role, source);
  if (tab.coverageLabel) {
    const coverage = document.createElement('span');
    coverage.className = `coverage-inline coverage-${tab.coverageState}`;
    coverage.textContent = tab.coverageLabel;
    meta.append(coverage);
  }
  copy.append(title, meta);
  row.append(copy, button('Open', 'tab-open', async () => {
    await chrome.runtime.sendMessage({ type: 'OPEN_WORKSPACE_TAB', tabId: tab.id });
    window.close();
  }));
  return row;
}

function groupRow(group, response) {
  const row = document.createElement('article');
  row.className = `group-card${group.managed ? ' managed' : ''}${group.workspaceType ? ` workspace-${group.workspaceType}` : ''}`;
  const heading = document.createElement('div');
  heading.className = 'group-heading';
  const name = document.createElement('div');
  name.className = 'group-name';
  const swatch = document.createElement('span');
  swatch.className = `swatch swatch-${group.color}`;
  swatch.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('div');
  copy.className = 'group-copy';
  const title = document.createElement('strong');
  title.textContent = group.epicName || group.title;
  title.title = group.epicName || group.title;
  const meta = document.createElement('small');
  const roles = Object.entries(group.roleCounts || {}).map(([role, count]) => `${count} ${role}`).join(' · ');
  const workspaceLabel = group.isFocusGroup
    ? ' · Focus Group'
    : group.workspaceType === 'smart'
      ? ' · Smart Group'
    : group.workspaceType === 'iteration'
      ? ' · Iteration'
      : group.managed ? '' : ' · manual';
  meta.textContent = `${group.count} tab${group.count === 1 ? '' : 's'}${roles ? ` · ${roles}` : ''}${workspaceLabel}`;
  copy.append(title, meta);
  name.append(swatch, copy);
  heading.append(name);
  if (group.managed) {
    const actions = document.createElement('div');
    actions.className = 'group-actions';
    const activeIsAutomaticSource = response.activeCoverage?.state === 'automatic';
    const isCoveredByThisGroup = response.activeAssignment?.epicId === group.epicId;
    const activeSmartAssignment = response.activeAssignment?.type === 'smart';
    const teachButton = group.workspaceType === 'smart' || group.workspaceType === 'iteration'
      || activeSmartAssignment
      ? null
      : isCoveredByThisGroup
        ? button('Matched', 'small-button covered-button', () => {})
        : button(activeIsAutomaticSource ? 'Automatic' : (response.activeAssignment ? 'Move saved rule' : 'Save URL rule'), 'small-button secondary', async () => {
          const result = await chrome.runtime.sendMessage({ type: 'TEACH_ACTIVE_TAB', groupId: group.id });
          showStatus(result?.message || 'Saved URL rule updated.', result?.ok === false ? 'error' : 'success');
          await refresh({ preserveStatus: true });
        });
    if (teachButton) {
      teachButton.disabled = response.windowPaused || isCoveredByThisGroup || activeIsAutomaticSource || !response.activeTab;
      teachButton.title = response.windowPaused
        ? 'Select or resume this window before remembering a link.'
        : isCoveredByThisGroup
        ? `The active tab is already covered by ${group.epicName}.`
        : activeIsAutomaticSource
          ? 'This page is assigned automatically by an optional connection.'
          : response.activeAssignment
            ? 'Move the existing saved URL rule to this workspace.'
            : 'Save this URL prefix for the selected workspace and move the current tab.';
    }
    const focusButton = button('Focus', 'small-button', async () => {
        const result = await chrome.runtime.sendMessage({ type: 'FOCUS_WORKSPACE', groupId: group.id });
        showStatus(result?.message || 'Workspace focused.', result?.ok === false ? 'error' : 'success');
        await refresh({ preserveStatus: true });
      });
    focusButton.title = 'Expand this workspace, collapse other managed groups, and activate one tab.';
    const moveHere = button('Move here', 'small-button secondary', async () => {
        const result = await chrome.runtime.sendMessage({ type: 'ADD_ACTIVE_TAB', groupId: group.id });
        showStatus(result?.message || 'Active tab updated.', result?.ok === false ? 'error' : 'success');
        await refresh({ preserveStatus: true });
      });
    moveHere.disabled = response.windowPaused;
    moveHere.title = response.windowPaused
      ? 'Select or resume this window before moving tabs with Tab Bundlr.'
      : group.isFocusGroup
      ? 'Move the current tab here temporarily. Its saved URL assignment will not change.'
      : 'Move the current tab here once. This does not create a URL rule.';
    actions.append(focusButton, moveHere);
    if (teachButton) {
      actions.append(teachButton);
    }
    heading.append(actions);
  }
  row.append(heading);
  if (group.managed && group.tabs.length) {
    const tabList = document.createElement('div');
    tabList.className = 'tab-list';
    group.tabs.slice(0, 8).forEach((tab) => tabList.append(tabRow(tab)));
    if (group.tabs.length > 8) {
      const more = document.createElement('small');
      more.className = 'more-tabs';
      more.textContent = `+ ${group.tabs.length - 8} more tab${group.tabs.length - 8 === 1 ? '' : 's'}`;
      tabList.append(more);
    }
    row.append(tabList);
  }
  return row;
}

function renderCurrentWorkspace(response) {
  currentWorkspace.replaceChildren();
  const heading = document.createElement('p');
  heading.className = 'section-label';
  heading.textContent = 'Current context';
  currentWorkspace.append(heading);
  if (response.windowPaused) {
    const copy = document.createElement('div');
    copy.className = 'context-copy';
    const title = document.createElement('strong');
    const excludedBySelection = response.windowPauseReason === 'not-selected';
    title.textContent = excludedBySelection ? 'Window excluded' : 'Window paused';
    const badge = document.createElement('span');
    badge.className = 'coverage-badge coverage-window-paused';
    badge.textContent = 'Not sorting';
    const detail = document.createElement('small');
    detail.textContent = excludedBySelection
      ? 'Tabs in this window stay where you put them. Add this window in Settings when you want Tab Bundlr to organize it.'
      : 'Tabs in this window stay where you put them. Resume when you want Tab Bundlr to organize this window again.';
    copy.append(title, badge, detail);
    currentWorkspace.append(copy);
    const actions = document.createElement('div');
    actions.className = 'context-actions';
    actions.append(excludedBySelection
      ? button('Manage windows', 'context-action', () => chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }))
      : button('Resume this window', 'context-action', async () => {
        const result = await chrome.runtime.sendMessage({
          type: 'SET_WINDOW_PAUSED',
          windowId: response.windowId,
          paused: false,
        });
        showStatus(result?.message || 'Window resumed.', result?.ok === false ? 'error' : 'success');
        await refresh({ preserveStatus: true });
      }));
    currentWorkspace.append(actions);
    return;
  }
  const copy = document.createElement('div');
  copy.className = 'context-copy';
  const title = document.createElement('strong');
  title.textContent = response.currentWorkspace?.epicName
    || (response.activeAssignment
      ? `Covered by ${response.activeAssignment.epicName}`
      : response.activeCoverage?.state === 'not-covered'
        ? 'No matching rule'
        : response.activeCoverage?.state === 'ignored'
          ? response.activeTab?.title || 'Browser page'
          : 'Unassigned tab');
  const coverageBadge = document.createElement('span');
  const coverageType = response.activeCoverage?.state === 'not-covered'
    ? 'not-set'
    : response.activeCoverage?.state === 'ignored'
      ? 'ignored'
    : response.activeCoverage?.type === 'focus'
      ? 'focus'
    : response.activeCoverage?.type === 'smart'
      ? 'smart'
      : response.activeCoverage?.type === 'learned'
        ? 'saved'
        : response.activeCoverage?.state === 'automatic' ? 'automatic' : 'unknown';
  coverageBadge.className = `coverage-badge coverage-${coverageType}`;
  coverageBadge.textContent = coverageType === 'not-set'
    ? 'Not set'
    : coverageType === 'ignored'
      ? 'Browser page'
    : coverageType === 'focus'
      ? 'Focus Group'
    : coverageType === 'smart'
      ? 'Smart Group'
      : coverageType === 'saved'
        ? 'Saved rule'
        : coverageType === 'automatic' ? 'Automatic' : 'Review';
  const homeBaseBadge = document.createElement('span');
  homeBaseBadge.className = 'coverage-badge coverage-home-base';
  homeBaseBadge.textContent = 'Home base';
  const detail = document.createElement('small');
  const assignmentMatchesWorkspace = response.currentWorkspace
    && response.activeAssignment?.epicId === response.currentWorkspace.epicId;
  const assignmentSource = response.activeAssignment?.type === 'smart' ? 'Smart Group' : 'saved URL rule';
  const coverageLabel = response.activeAssignment?.type === 'smart' ? 'covered by Smart Group' : 'covered by saved URL rule';
  detail.textContent = response.currentWorkspace
    ? response.currentWorkspace.isFocusGroup
      ? `${response.activeTab?.roleLabel || 'Tab'} · ${response.activeTab?.title || 'Active tab'} · held here until you drag it out`
      : `${response.activeTab?.roleLabel || 'Tab'} · ${response.activeTab?.title || 'Active tab'}${assignmentMatchesWorkspace ? ` · ${coverageLabel}` : response.activeAssignment ? ` · saved for ${response.activeAssignment.epicName}` : ''}`
      : response.activeAssignment
      ? `${response.activeAssignment.roleLabel} · ${response.activeTab?.title || 'Active tab'} · ${assignmentSource}`
      : response.activeCoverage?.state === 'ignored'
        ? `${response.activeTab?.roleLabel || 'Browser'} · ignored by Tab Bundlr`
      : response.activeCoverage?.state === 'automatic'
        ? `${response.activeTab?.roleLabel} · ${response.activeTab.title} · grouped automatically`
        : response.activeTab ? `${response.activeTab.roleLabel} · ${response.activeTab.title} · add a URL rule to assign it` : 'Select a workspace below to focus it.';
  copy.append(title, coverageBadge);
  if (response.activeHomeBaseUrl) copy.append(homeBaseBadge);
  copy.append(detail);
  currentWorkspace.append(copy);
  const { canAddSmartGroup, canAddClientRule } = contextRuleActionAvailability(response);
  const actions = document.createElement('div');
  actions.className = 'context-actions';
  if (canAddSmartGroup) {
    const actionLabel = response.activeAssignment?.type === 'smart' ? 'Change Smart Group' : 'Add to Smart Group';
    actions.append(button(actionLabel, 'context-action secondary', () => openSmartGroupDialog(response)));
  }
  if (canAddClientRule) {
    const clientActionLabel = response.activeAssignment?.type === 'learned' ? 'Change workspace rule' : 'Add workspace rule';
    actions.append(button(clientActionLabel, 'context-action secondary', () => openClientRuleDialog(response)));
  }
  if (response.homeBaseEligible) {
    actions.append(button(
      response.activeHomeBaseUrl ? 'Stop keeping home base' : 'Keep as home base',
      'context-action secondary',
      async () => {
        const result = await chrome.runtime.sendMessage({
          type: 'SET_PERSISTENT_HOME_BASE',
          windowId: response.windowId,
          enabled: !response.activeHomeBaseUrl,
        });
        showStatus(result?.message || 'Home-base preference updated.', result?.ok === false ? 'error' : 'success');
        await refresh({ preserveStatus: true });
      },
    ));
  }
  actions.append(button('Pause this window', 'context-action secondary', async () => {
    const result = await chrome.runtime.sendMessage({
      type: 'SET_WINDOW_PAUSED',
      windowId: response.windowId,
      paused: true,
    });
    showStatus(result?.message || 'Window paused.', result?.ok === false ? 'error' : 'success');
    await refresh({ preserveStatus: true });
  }));
  currentWorkspace.append(actions);
}

function renderReviewTabs(response) {
  reviewTabs.replaceChildren();
  if (!response.reviewTabs?.length) {
    reviewTabs.hidden = true;
    return;
  }
  reviewTabs.hidden = false;
  const disclosure = document.createElement('details');
  disclosure.className = 'review-section';
  const summary = document.createElement('summary');
  const label = document.createElement('strong');
  label.textContent = 'Unassigned tabs';
  const count = document.createElement('small');
  count.textContent = `${response.reviewTabs.length} ungrouped tab${response.reviewTabs.length === 1 ? '' : 's'}`;
  summary.append(label, count);
  disclosure.append(summary);
  const help = document.createElement('p');
  help.className = 'review-help';
  help.textContent = 'These web tabs do not match a saved rule yet. Open Review tabs to assign one. Pinned tabs and manual groups stay out of this list.';
  disclosure.append(help);
  const list = document.createElement('div');
  list.className = 'review-list';
  response.reviewTabs.forEach((tab) => list.append(tabRow(tab)));
  disclosure.append(list);
  reviewTabs.append(disclosure);
}

async function refresh({ preserveStatus = false } = {}) {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS', windowId: activeTab?.windowId });
  if (!response?.ok) throw new Error(response?.error || 'Could not read Tab Bundlr status.');
  const automaticActive = response.enabled && !response.windowPaused;
  statePill.textContent = response.windowPauseReason === 'not-selected'
    ? 'Window excluded'
    : response.windowPaused ? 'Window paused' : response.enabled ? 'Automatic' : 'Manual';
  statePill.className = `pill ${automaticActive ? 'pill-on' : 'pill-off'}`;
  if (!preserveStatus) {
    if (response.windowPauseReason === 'not-selected') showStatus('This window is not selected for Tab Bundlr automation.');
    else if (response.windowPaused) showStatus('This window is excluded from automatic grouping for the current Chrome session.');
    else showStatus(response.enabled
      ? `${response.focusGroupCount || 0} Focus Group${response.focusGroupCount === 1 ? '' : 's'} · ${response.smartGroupCount || 0} Smart Group${response.smartGroupCount === 1 ? '' : 's'} · ${response.trainedRuleCount || 0} saved link${response.trainedRuleCount === 1 ? '' : 's'}.`
      : 'Manual mode is on. Fix and Organize remain available.');
  }
  const storedGuidance = await chrome.storage.local.get(FIRST_USE_GUIDANCE_DISMISSED_STORAGE_KEY);
  const showGuide = shouldShowFirstUseGuidance(
    storedGuidance[FIRST_USE_GUIDANCE_DISMISSED_STORAGE_KEY],
    response,
  );
  firstUseGuide.hidden = !showGuide;
  if (showGuide) {
    fixWindow.setAttribute('aria-describedby', 'first-use-guide-copy');
    organizeWindow.setAttribute('aria-describedby', 'first-use-guide-copy');
  } else {
    fixWindow.removeAttribute('aria-describedby');
    organizeWindow.removeAttribute('aria-describedby');
  }
  renderCurrentWorkspace(response);
  renderReviewTabs(response);
  groups.replaceChildren();
  if (!response.groups.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No workspaces are open. Create a Smart Group in Settings, open a matching page, then use Fix.';
    groups.append(empty);
  } else {
    const managed = response.groups.filter((group) => group.managed);
    const manual = response.groups.filter((group) => !group.managed);
    if (managed.length) {
      const label = document.createElement('p');
      label.className = 'section-label';
      label.textContent = 'Managed workspaces';
      groups.append(label);
      managed.forEach((group) => groups.append(groupRow(group, response)));
    }
    if (manual.length) {
      const label = document.createElement('p');
      label.className = 'section-label manual-label';
      label.textContent = 'Manual groups';
      groups.append(label);
      manual.forEach((group) => groups.append(groupRow(group, response)));
    }
  }
  undo.disabled = !response.canUndo;
  undo.title = response.recentActivity?.[0]
    ? `Undo latest: ${response.recentActivity[0].label}`
    : 'There is no recent Tab Bundlr move to undo.';
  fixWindow.disabled = response.windowPaused;
  organizeWindow.disabled = response.windowPaused;
}

undo.addEventListener('click', async () => {
  undo.disabled = true;
  const response = await chrome.runtime.sendMessage({ type: 'UNDO_LAST_ACTION' });
  showStatus(response?.message || 'Undo finished.', response?.ok === false ? 'error' : 'success');
  await refresh({ preserveStatus: true });
});

settings.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }));
help.addEventListener('click', () => openHelpPage());
openFirstUseSettings.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }));
openFirstUseHelp.addEventListener('click', () => openHelpPage('#first-use'));
dismissFirstUseGuide.addEventListener('click', async () => {
  await chrome.storage.local.set({ [FIRST_USE_GUIDANCE_DISMISSED_STORAGE_KEY]: true });
  firstUseGuide.hidden = true;
  fixWindow.removeAttribute('aria-describedby');
  organizeWindow.removeAttribute('aria-describedby');
  showStatus('First-use guidance dismissed. Open Help whenever you want to see it again.');
});

reviewTabsPage.addEventListener('click', async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('review.html') });
  window.close();
});

fixWindow.addEventListener('click', async () => {
  fixWindow.disabled = true;
  try {
    showStatus('Applying your URL rules…');
    const response = await chrome.runtime.sendMessage({ type: 'FIX_WINDOW' });
    showStatus(response?.message || 'Fix finished.', response?.ok === false ? 'error' : 'success');
    await refresh({ preserveStatus: true });
  } catch (error) {
    showStatus(error?.message || 'Fix could not be completed. Review your open workspaces before trying again.', 'error');
  } finally {
    fixWindow.disabled = false;
  }
});

organizeWindow.addEventListener('click', async () => {
  organizeWindow.disabled = true;
  try {
    showStatus('Reordering Tab Bundlr workspaces…');
    const response = await chrome.runtime.sendMessage({ type: 'ORGANIZE_WINDOW' });
    showStatus(response?.message || 'Organization finished.', response?.ok === false ? 'error' : 'success');
    await refresh({ preserveStatus: true });
  } catch (error) {
    showStatus(error?.message || 'Organization could not be completed. No tabs were closed.', 'error');
  } finally {
    organizeWindow.disabled = false;
  }
});

smartGroupDialogCancel.addEventListener('click', () => smartGroupDialog.close());

smartGroupDialogSelect.addEventListener('change', updateSmartGroupDialogFields);
smartGroupDialogPattern.addEventListener('change', () => updateDialogOverlap(
  smartGroupDialogPattern,
  smartGroupDialogOverlap,
  smartGroupDialogPattern.dataset.excludeType ? {
    type: smartGroupDialogPattern.dataset.excludeType,
    id: smartGroupDialogPattern.dataset.excludeId,
    pattern: smartGroupDialogPattern.dataset.excludePattern,
  } : {},
).catch(() => {}));

clientRuleDialogCancel.addEventListener('click', () => clientRuleDialog.close());

clientRuleDialogSelect.addEventListener('change', updateClientRuleDialogFields);
clientRuleDialogPattern.addEventListener('change', () => updateDialogOverlap(
  clientRuleDialogPattern,
  clientRuleDialogOverlap,
  clientRuleDialogPattern.dataset.excludeType ? {
    type: clientRuleDialogPattern.dataset.excludeType,
    id: clientRuleDialogPattern.dataset.excludeId,
    pattern: clientRuleDialogPattern.dataset.excludePattern,
  } : {},
).catch(() => {}));

smartGroupDialogForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  smartGroupDialogStatus.textContent = 'Saving…';
  const response = await chrome.runtime.sendMessage({
    type: 'ADD_SMART_GROUP_PATTERN',
    groupId: smartGroupDialogSelect.value,
    pattern: smartGroupDialogPattern.value,
    sourceGroupId: smartGroupDialogSelect.dataset.sourceGroupId || null,
    newGroupName: smartGroupDialogName.value,
  });
  if (!response?.ok) {
    smartGroupDialogStatus.textContent = response?.message || 'Could not save the Smart Group URL.';
    return;
  }
  smartGroupDialog.close();
  showStatus(response.message || 'Smart Group URL saved.', 'success');
  await refresh({ preserveStatus: true });
});

clientRuleDialogForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clientRuleDialogStatus.textContent = 'Saving…';
  const response = await chrome.runtime.sendMessage({
    type: 'ADD_CLIENT_RULE',
    windowId: Number(clientRuleDialogSelect.dataset.windowId),
    groupId: clientRuleDialogSelect.value,
    pattern: clientRuleDialogPattern.value,
    epicName: clientRuleDialogSelect.selectedOptions[0]?.dataset.name || clientRuleDialogName.value,
    epicId: clientRuleDialogSelect.selectedOptions[0]?.dataset.epicId || clientRuleDialogEpicId.value,
  });
  if (!response?.ok) {
    clientRuleDialogStatus.textContent = response?.message || 'Could not save the workspace rule.';
    return;
  }
  clientRuleDialog.close();
  showStatus(response.message || 'Workspace rule saved.', 'success');
  await refresh({ preserveStatus: true });
});

refresh().catch((error) => {
  statePill.textContent = 'Unavailable';
  statePill.className = 'pill pill-off';
  showStatus(error.message || 'Tab Bundlr could not read this window. Reload the extension and try again.', 'error');
});
