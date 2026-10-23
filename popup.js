import { workspaceChoices } from './workspace-ui.js';
import { trainingPatternForUrl } from './core.js';
import { readPopupState, reportPopupTiming } from './popup-request.js';
import {
  FIRST_USE_GUIDANCE_DISMISSED_STORAGE_KEY,
  shouldShowFirstUseGuidance,
} from './guidance.js';

const statePill = document.getElementById('state-pill');
const status = document.getElementById('status');
const currentWorkspace = document.getElementById('current-workspace');
const reviewTabs = document.getElementById('review-tabs');
const groups = document.getElementById('groups');
const workspaceSearch = document.getElementById('workspace-search');
let lastStatus = null;
function renderWorkspaceList(response) {
  groups.replaceChildren();
  const query = workspaceSearch.value?.trim().toLocaleLowerCase() || '';
  const visible = response.groups.filter((group) => [group.title, ...(group.tabs || []).flatMap((tab) => [tab.title, tab.url])]
    .some((value) => String(value || '').toLocaleLowerCase().includes(query)));
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = query ? 'No matching workspaces.' : 'No workspaces are open. Create a workspace in Settings, open a matching page, then use Apply rules.';
    groups.append(empty);
  } else {
    for (const [managed, label] of [[true, 'Managed workspaces'], [false, 'Manual Chrome groups']]) {
      const matching = visible.filter((group) => Boolean(group.managed) === managed);
      if (!matching.length) continue;
      const heading = document.createElement('p');
      heading.className = 'section-label';
      heading.textContent = label;
      groups.append(heading);
      matching.forEach((group) => groups.append(groupRow(group, response)));
    }
  }
}
workspaceSearch.addEventListener('input', () => { if (lastStatus) renderWorkspaceList(lastStatus); });
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
  return `Overlap: this prefix ${relation} ${first.type === 'smart' ? 'Workspace' : 'workspace rule'} ${first.name}. Longest-prefix priority decides the winner.`;
}

async function updateDialogOverlap(patternInput, output, exclude = {}) {
  const response = await chrome.runtime.sendMessage({
    type: 'ANALYZE_RULE_PATTERN',
    pattern: patternInput.value,
    exclude,
  });
  output.textContent = response?.ok ? overlapWarning(response.overlaps) : '';
}

function openWorkspaceDialog(response) {
  smartGroupDialogSelect.replaceChildren();
  const choices = workspaceChoices(response);
  for (const choice of choices) {
    const option = document.createElement('option');
    option.value = choice.key;
    option.textContent = choice.name;
    option.dataset.kind = choice.kind;
    option.dataset.targetId = choice.id;
    option.dataset.workspaceId = choice.workspaceId || '';
    smartGroupDialogSelect.append(option);
  }
  const create = document.createElement('option');
  create.value = '__new__';
  create.textContent = '+ Create workspace';
  create.dataset.kind = 'smart';
  create.dataset.targetId = '__new__';
  smartGroupDialogSelect.append(create);
  const assignment = response.activeAssignment;
  const current = assignment?.type === 'smart' ? `local:${assignment.smartGroupId}` : `saved:${assignment?.epicId}`;
  smartGroupDialogSelect.value = choices.some((choice) => choice.key === current) ? current : choices[0]?.key || '__new__';
  smartGroupDialogSelect.dataset.windowId = response.windowId;
  smartGroupDialogSelect.dataset.source = JSON.stringify(assignment ? {
    type: assignment.type, id: assignment.type === 'smart' ? assignment.smartGroupId : assignment.epicId, pattern: assignment.pattern,
  } : null);
  smartGroupDialogName.value = '';
  smartGroupDialogPattern.value = assignment?.pattern || trainingPatternForUrl(response.activeTab?.url) || '';
  smartGroupDialogStatus.textContent = '';
  smartGroupDialogOverlap.textContent = '';
  smartGroupDialogPattern.dataset.excludeType = assignment?.type || '';
  smartGroupDialogPattern.dataset.excludeId = assignment?.smartGroupId || assignment?.epicId || '';
  smartGroupDialogPattern.dataset.excludePattern = assignment?.pattern || '';
  updateSmartGroupDialogFields();
  smartGroupDialog.showModal();
}

function updateSmartGroupDialogFields() {
  const isNew = smartGroupDialogSelect.value === '__new__';
  smartGroupDialogNewFields.hidden = !isNew;
  smartGroupDialogName.required = isNew;
  smartGroupDialogTitle.textContent = isNew ? 'Create workspace' : 'Save workspace rule';
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
  if (source === 'smart') return 'Workspace';
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
      ? ' · Workspace'
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
    const tabList = document.createElement('details');
    tabList.className = 'tab-list';
    const summary = document.createElement('summary');
    summary.textContent = `Show ${group.tabs.length} tab${group.tabs.length === 1 ? '' : 's'}`;
    tabList.append(summary);
    group.tabs.forEach((tab) => tabList.append(tabRow(tab)));
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
      ? 'Existing tabs stay here. Add this window in Settings to organize it.'
      : 'Existing tabs stay here. Resume to organize this window again.';
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
    const freezeLabel = document.createElement('label');
    freezeLabel.className = 'window-freeze';
    const freezeToggle = document.createElement('input');
    freezeToggle.type = 'checkbox';
    freezeToggle.checked = response.windowFrozen === false;
    freezeToggle.setAttribute('role', 'switch');
    freezeToggle.setAttribute('aria-describedby', 'window-freeze-help');
    const freezeText = document.createElement('span');
    freezeText.textContent = 'Allow new tabs in this window';
    freezeLabel.append(freezeToggle, freezeText);
    const freezeHelp = document.createElement('p');
    freezeHelp.id = 'window-freeze-help';
    freezeHelp.className = 'window-freeze-help';
    freezeHelp.textContent = freezeToggle.checked
      ? 'On: new tabs can stay here. Tab organization stays off.'
      : 'Off by default: new tabs go to your main managed window when one is available. Tabs you drag here stay here.';
    freezeToggle.addEventListener('change', async () => {
      freezeToggle.disabled = true;
      try {
        const result = await chrome.runtime.sendMessage({
          type: 'SET_WINDOW_FROZEN', windowId: response.windowId, frozen: !freezeToggle.checked,
        });
        if (!result?.ok) throw new Error(result?.message || 'Could not save. Try again.');
        showStatus(result.message, 'success');
        await refresh({ preserveStatus: true });
      } catch (error) {
        freezeToggle.checked = response.windowFrozen === false;
        showStatus(error.message || 'Could not save. Try again.', 'error');
      } finally {
        freezeToggle.disabled = false;
      }
    });
    currentWorkspace.append(freezeLabel, freezeHelp);
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
      ? 'Workspace'
      : coverageType === 'saved'
        ? 'Saved rule'
        : coverageType === 'automatic' ? 'Automatic' : 'Review';
  const homeBaseBadge = document.createElement('span');
  homeBaseBadge.className = 'coverage-badge coverage-home-base';
  homeBaseBadge.textContent = 'Home base';
  const detail = document.createElement('small');
  const assignmentMatchesWorkspace = response.currentWorkspace
    && response.activeAssignment?.epicId === response.currentWorkspace.epicId;
  const assignmentSource = response.activeAssignment?.type === 'smart' ? 'Workspace' : 'saved URL rule';
  const coverageLabel = response.activeAssignment?.type === 'smart' ? 'covered by Workspace' : 'covered by saved URL rule';
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
  const actions = document.createElement('div');
  actions.className = 'context-actions';
  if (trainingPatternForUrl(response.activeTab?.url) && response.activeCoverage?.state !== 'automatic' && !response.activeTab?.pinned) {
    actions.append(button(response.activeAssignment ? 'Change workspace rule' : 'Save workspace rule',
      'context-action secondary', () => openWorkspaceDialog(response)));
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
  let data;
  try {
    data = await readPopupState(chrome, FIRST_USE_GUIDANCE_DISMISSED_STORAGE_KEY);
  } catch (error) {
    statePill.textContent = error.code === 'POPUP_TIMEOUT' ? 'Timed out' : 'Unavailable';
    statePill.className = 'pill pill-off';
    showStatus(error.message || 'Could not read this window. Close and reopen the popup to retry.', 'error');
    return;
  }
  const { response, storedGuidance, timings } = data;
  const renderStarted = performance.now();
  const automaticActive = response.enabled && !response.windowPaused;
  statePill.textContent = response.windowPauseReason === 'not-selected'
    ? 'Window excluded'
    : response.windowPaused ? 'Window paused' : response.enabled ? 'Automatic' : 'Manual';
  statePill.className = `pill ${automaticActive ? 'pill-on' : 'pill-off'}`;
  if (!preserveStatus) {
    if (response.windowPauseReason === 'not-selected') showStatus('This window is not selected for Tab Bundlr automation.');
    else if (response.windowPaused) showStatus('This window is excluded from automatic grouping for the current Chrome session.');
    else showStatus(response.enabled
      ? `${response.focusGroupCount || 0} Focus Group${response.focusGroupCount === 1 ? '' : 's'} · ${response.smartGroupCount || 0} Workspace${response.smartGroupCount === 1 ? '' : 's'} · ${response.trainedRuleCount || 0} saved link${response.trainedRuleCount === 1 ? '' : 's'}.`
      : 'Manual mode is on. Apply rules and Reorder remain available.');
  }
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
  lastStatus = response;
  renderWorkspaceList(response);
  undo.disabled = !response.canUndo;
  undo.title = response.recentActivity?.[0] ? `Undo latest: ${response.recentActivity[0].label}` : 'There is no recent Tab Bundlr move to undo.';
  fixWindow.disabled = response.windowPaused;
  organizeWindow.disabled = response.windowPaused;
  reportPopupTiming(chrome, { ...timings, renderMs: performance.now() - renderStarted });
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
    showStatus(response?.message || 'Rules applied.', response?.ok === false ? 'error' : 'success');
    await refresh({ preserveStatus: true });
  } catch (error) {
    showStatus(error?.message || 'Rules could not be applied. Review your open workspaces before trying again.', 'error');
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

smartGroupDialogForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  smartGroupDialogStatus.textContent = 'Saving…';
  const submit = smartGroupDialogForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const selected = smartGroupDialogSelect.selectedOptions[0];
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_WORKSPACE_RULE', windowId: Number(smartGroupDialogSelect.dataset.windowId),
      kind: selected.dataset.kind, targetId: selected.dataset.targetId,
      workspaceId: selected.dataset.workspaceId, name: selected.textContent,
      newGroupName: smartGroupDialogName.value, pattern: smartGroupDialogPattern.value,
      source: JSON.parse(smartGroupDialogSelect.dataset.source || 'null'),
    });
    if (!response?.ok) throw new Error(response?.message || 'Could not save the workspace rule. Try again.');
    smartGroupDialog.close();
    showStatus(response.message || 'Workspace rule saved.', 'success');
    await refresh({ preserveStatus: true });
  } catch (error) { smartGroupDialogStatus.textContent = error.message; }
  finally { submit.disabled = false; }
});

refresh().catch((error) => {
  statePill.textContent = 'Unavailable';
  statePill.className = 'pill pill-off';
  showStatus(error.message || 'Tab Bundlr could not read this window. Reload the extension and try again.', 'error');
});
