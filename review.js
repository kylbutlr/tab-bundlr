import {
  DEFAULT_STALE_TAB_DAYS,
  STALE_TAB_DAY_OPTIONS,
  STALE_TAB_DAYS_STORAGE_KEY,
  duplicateKeyForUrl,
} from './core.js';

const refreshButton = document.getElementById('refresh-review');
const summaryTitle = document.getElementById('review-summary-title');
const summaryDetail = document.getElementById('review-summary-detail');
const unassignedCount = document.getElementById('unassigned-count');
const unassignedList = document.getElementById('unassigned-list');
const duplicateCount = document.getElementById('duplicate-count');
const duplicateList = document.getElementById('duplicate-list');
const staleDays = document.getElementById('stale-days');
const staleCount = document.getElementById('stale-count');
const staleList = document.getElementById('stale-list');
const closeSelectedStale = document.getElementById('close-selected-stale');
const activityCount = document.getElementById('activity-count');
const activityList = document.getElementById('activity-list');
const reviewStatus = document.getElementById('review-status');
const assignDialog = document.getElementById('assign-dialog');
const assignForm = document.getElementById('assign-form');
const assignTabTitle = document.getElementById('assign-tab-title');
const assignDestination = document.getElementById('assign-destination');
const assignPatternFields = document.getElementById('assign-pattern-fields');
const assignPattern = document.getElementById('assign-pattern');
const assignOverlap = document.getElementById('assign-overlap');
const assignStatus = document.getElementById('assign-status');
const assignCancel = document.getElementById('assign-cancel');

let currentTabs = [];
let currentGroups = new Map();
let currentReviewData = null;

function groupLabel(tab) {
  if (Number(tab.groupId ?? -1) < 0) return 'Ungrouped';
  return currentGroups.get(`${tab.windowId}:${tab.groupId}`)?.title || 'Chrome group';
}

function formatAge(lastAccessed) {
  const timestamp = Number(lastAccessed);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Last accessed unknown';
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
  if (!days) return 'Last accessed today';
  return `Last accessed ${days} day${days === 1 ? '' : 's'} ago`;
}

function formatActivityTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Earlier';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function isProtected(tab) {
  return Boolean(tab.pinned || tab.active);
}

function tabState(tab) {
  if (tab.pinned) return 'Pinned';
  if (tab.active) return 'Active';
  return '';
}

function tabRow(tab, { checkbox = false, keep = false, radioName = '' } = {}) {
  const row = document.createElement('div');
  row.className = `review-tab${checkbox ? ' stale-row' : ''}`;
  if (checkbox) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.tabId = String(tab.id);
    input.disabled = isProtected(tab);
    input.setAttribute('aria-label', `Select ${tab.title || tab.url || 'tab'}`);
    row.append(input);
  } else {
    const keepLabel = document.createElement('label');
    keepLabel.className = 'keep-control';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = radioName;
    input.value = String(tab.id);
    input.checked = keep;
    keepLabel.append(input, document.createTextNode('Keep'));
    row.append(keepLabel);
  }
  const copy = document.createElement('div');
  copy.className = 'review-tab-copy';
  const title = document.createElement('strong');
  title.textContent = tab.title || tab.url || 'Untitled tab';
  title.title = tab.title || tab.url || 'Untitled tab';
  const detail = document.createElement('small');
  detail.textContent = `${groupLabel(tab)} · Window ${tab.windowId} · ${formatAge(tab.lastAccessed)}`;
  copy.append(title, detail);
  row.append(copy);
  const state = document.createElement(checkbox ? 'button' : 'span');
  state.className = `review-tab-state${isProtected(tab) ? ' protected' : ''}${checkbox ? ' review-tab-action' : ''}`;
  state.textContent = tabState(tab) || (checkbox ? 'Review' : 'Duplicate');
  if (checkbox) {
    state.type = 'button';
    state.title = 'Open this tab to review it';
    state.setAttribute('aria-label', `Open ${tab.title || tab.url || 'tab'} to review it`);
    state.addEventListener('click', async () => {
      const result = await chrome.runtime.sendMessage({ type: 'OPEN_WORKSPACE_TAB', tabId: tab.id });
      reviewStatus.textContent = result?.ok
        ? `Opened ${tab.title || tab.url || 'tab'} for review.`
        : result?.message || 'Could not open this tab.';
    });
  }
  row.append(state);
  return row;
}

function closeableTabIds(tabs) {
  return tabs.filter((tab) => !tab.pinned && !tab.active).map((tab) => Number(tab.id));
}

async function closeTabs(tabs, prompt) {
  const ids = closeableTabIds(tabs);
  if (!ids.length) {
    reviewStatus.textContent = 'Nothing selected can be closed. Active and pinned tabs are protected.';
    return;
  }
  if (!globalThis.confirm(prompt)) return;
  await chrome.tabs.remove(ids);
  reviewStatus.textContent = `Closed ${ids.length} tab${ids.length === 1 ? '' : 's'}.`;
  await loadReview();
}

function chooseDefaultKeep(tabs) {
  return [...tabs].sort((left, right) => (
    Number(right.active) - Number(left.active)
    || Number(right.pinned) - Number(left.pinned)
    || Number(right.lastAccessed || 0) - Number(left.lastAccessed || 0)
  ))[0];
}

function renderDuplicates(duplicates) {
  duplicateList.replaceChildren();
  duplicateCount.textContent = String(duplicates.length);
  if (!duplicates.length) {
    const empty = document.createElement('p');
    empty.className = 'review-empty';
    empty.textContent = 'No duplicate URL clusters found.';
    duplicateList.append(empty);
    return;
  }
  duplicates.forEach((cluster, clusterIndex) => {
    const card = document.createElement('article');
    card.className = 'duplicate-cluster';
    const heading = document.createElement('div');
    heading.className = 'duplicate-heading';
    const url = document.createElement('strong');
    url.className = 'duplicate-url';
    url.textContent = cluster.key;
    url.title = cluster.key;
    const count = document.createElement('small');
    count.textContent = `${cluster.tabs.length} tabs`;
    heading.append(url, count);
    card.append(heading);
    const tabs = document.createElement('div');
    tabs.className = 'duplicate-tabs';
    const defaultKeep = chooseDefaultKeep(cluster.tabs);
    const radioName = `keep-duplicate-${clusterIndex}`;
    cluster.tabs.forEach((tab) => tabs.append(tabRow(tab, { keep: tab.id === defaultKeep.id, radioName })));
    card.append(tabs);
    const actions = document.createElement('div');
    actions.className = 'cluster-actions';
    const closeExtras = document.createElement('button');
    closeExtras.className = 'secondary';
    closeExtras.type = 'button';
    closeExtras.textContent = 'Close extras';
    closeExtras.addEventListener('click', async () => {
      const selected = card.querySelector(`input[name="${radioName}"]:checked`);
      const keepId = Number(selected?.value || defaultKeep.id);
      await closeTabs(cluster.tabs.filter((tab) => Number(tab.id) !== keepId), `Close duplicate tabs in this cluster, keeping the selected tab?`);
    });
    actions.append(closeExtras);
    card.append(actions);
    duplicateList.append(card);
  });
}

async function openTab(tabId, title) {
  const result = await chrome.runtime.sendMessage({ type: 'OPEN_WORKSPACE_TAB', tabId });
  reviewStatus.textContent = result?.ok ? `Opened ${title || 'tab'} for review.` : result?.message || 'Could not open this tab.';
}

function addDestinationGroup(label, entries, valueForEntry) {
  if (!entries.length) return;
  const group = document.createElement('optgroup');
  group.label = label;
  entries.forEach((entry) => {
    const option = document.createElement('option');
    const value = valueForEntry(entry);
    option.value = value.value;
    option.textContent = value.label;
    if (value.name) option.dataset.name = value.name;
    group.append(option);
  });
  assignDestination.append(group);
}

function updateAssignPatternVisibility() {
  const moveOnce = assignDestination.value.startsWith('move-once:');
  assignPatternFields.hidden = moveOnce;
  assignPattern.required = !moveOnce;
  if (moveOnce) assignOverlap.textContent = '';
}

async function updateAssignOverlap() {
  if (assignPatternFields.hidden) return;
  const result = await chrome.runtime.sendMessage({ type: 'ANALYZE_RULE_PATTERN', pattern: assignPattern.value });
  const first = result?.overlaps?.[0];
  if (!first) {
    assignOverlap.textContent = '';
    return;
  }
  const relation = first.relation === 'equal'
    ? 'matches the same prefix as'
    : first.relation === 'existing-broader'
      ? 'is more specific than'
      : 'is broader than';
  assignOverlap.textContent = `Overlap: this prefix ${relation} ${first.type === 'smart' ? 'Smart Group' : 'workspace rule'} ${first.name}. Longest-prefix priority decides the winner.`;
}

function openAssignDialog(tab) {
  assignDialog.dataset.tabId = String(tab.id);
  assignDialog.dataset.windowId = String(tab.windowId);
  assignTabTitle.textContent = tab.title;
  assignPattern.value = tab.proposedPattern || tab.url;
  assignStatus.textContent = '';
  assignOverlap.textContent = '';
  assignDestination.replaceChildren();
  addDestinationGroup('Smart Groups', currentReviewData.smartGroups || [], (group) => ({
    value: `smart:${group.id}`,
    label: group.name,
  }));
  addDestinationGroup('Saved workspaces', currentReviewData.clientGroups || [], (group) => ({
    value: `client:${group.epicId}`,
    label: group.epicName,
    name: group.epicName,
  }));
  addDestinationGroup('Move once in this window', (currentReviewData.openDestinations || [])
    .filter((destination) => Number(destination.windowId) === Number(tab.windowId)
      && Number(destination.groupId) !== Number(tab.groupId)), (destination) => ({
      value: `move-once:${destination.groupId}`,
      label: destination.name,
    }));
  if (!assignDestination.options.length) {
    assignStatus.textContent = 'Create a Smart Group or save a workspace before assigning this tab.';
  }
  updateAssignPatternVisibility();
  assignDialog.showModal();
  updateAssignOverlap().catch(() => {});
}

function renderUnassignedTabs(tabs) {
  unassignedList.replaceChildren();
  unassignedCount.textContent = String(tabs.length);
  if (!tabs.length) {
    const empty = document.createElement('p');
    empty.className = 'review-empty';
    empty.textContent = 'Every reviewable tab has a known assignment.';
    unassignedList.append(empty);
    return;
  }
  tabs.forEach((tab) => {
    const row = document.createElement('article');
    row.className = 'unassigned-tab';
    const copy = document.createElement('div');
    copy.className = 'review-tab-copy';
    const title = document.createElement('strong');
    title.textContent = tab.title;
    title.title = tab.title;
    const detail = document.createElement('small');
    detail.textContent = `${tab.roleLabel} · ${tab.groupLabel} · Window ${tab.windowId}`;
    const reason = document.createElement('p');
    reason.className = 'unassigned-reason';
    reason.textContent = tab.reason;
    copy.append(title, detail, reason);
    const actions = document.createElement('div');
    actions.className = 'unassigned-actions';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'secondary';
    open.textContent = 'Open';
    open.addEventListener('click', () => openTab(tab.id, tab.title));
    const assign = document.createElement('button');
    assign.type = 'button';
    assign.textContent = 'Assign';
    assign.addEventListener('click', () => openAssignDialog(tab));
    actions.append(open, assign);
    row.append(copy, actions);
    unassignedList.append(row);
  });
}

function renderActivity(history) {
  activityList.replaceChildren();
  activityCount.textContent = String(history.length);
  if (!history.length) {
    const empty = document.createElement('p');
    empty.className = 'review-empty';
    empty.textContent = 'No recent Tab Bundlr moves.';
    activityList.append(empty);
    return;
  }
  history.forEach((activity) => {
    const row = document.createElement('article');
    row.className = 'activity-row';
    const copy = document.createElement('div');
    copy.className = 'review-tab-copy';
    const label = document.createElement('strong');
    label.textContent = activity.label;
    const detail = document.createElement('small');
    detail.textContent = `${formatActivityTime(activity.createdAt)} · ${activity.moveCount} move${activity.moveCount === 1 ? '' : 's'}`;
    copy.append(label, detail);
    const undo = document.createElement('button');
    undo.type = 'button';
    undo.className = 'secondary';
    undo.textContent = 'Undo';
    undo.addEventListener('click', async () => {
      undo.disabled = true;
      const result = await chrome.runtime.sendMessage({ type: 'UNDO_ACTIVITY', activityId: activity.id });
      reviewStatus.textContent = result?.message || 'Undo finished.';
      await loadReview();
    });
    row.append(copy, undo);
    activityList.append(row);
  });
}

function selectedStaleTabs() {
  const selectedIds = new Set([...staleList.querySelectorAll('input[type="checkbox"]:checked')].map((input) => Number(input.dataset.tabId)));
  return currentTabs.filter((tab) => selectedIds.has(Number(tab.id)));
}

function renderStaleTabs(tabs) {
  staleList.replaceChildren();
  staleCount.textContent = String(tabs.length);
  if (!tabs.length) {
    const empty = document.createElement('p');
    empty.className = 'review-empty';
    empty.textContent = 'No probably stale tabs match this threshold.';
    staleList.append(empty);
    closeSelectedStale.disabled = true;
    return;
  }
  tabs.forEach((tab) => staleList.append(tabRow(tab, { checkbox: true })));
  closeSelectedStale.disabled = true;
}

async function loadReview() {
  const [tabs, groups, stored, inboxData] = await Promise.all([
    chrome.tabs.query({}),
    chrome.tabGroups.query({}),
    chrome.storage.local.get(STALE_TAB_DAYS_STORAGE_KEY),
    chrome.runtime.sendMessage({ type: 'GET_REVIEW_DATA' }),
  ]);
  if (!inboxData?.ok) throw new Error(inboxData?.message || 'Could not load the unassigned inbox.');
  currentReviewData = inboxData;
  currentTabs = tabs;
  currentGroups = new Map(groups.map((group) => [`${group.windowId}:${group.id}`, group]));
  const days = Number(stored[STALE_TAB_DAYS_STORAGE_KEY]) || DEFAULT_STALE_TAB_DAYS;
  staleDays.value = String(STALE_TAB_DAY_OPTIONS.includes(days) ? days : DEFAULT_STALE_TAB_DAYS);
  const reviewable = tabs
    .map((tab) => ({ tab, key: duplicateKeyForUrl(tab.url) }))
    .filter((entry) => entry.key);
  const clustersByKey = new Map();
  reviewable.forEach(({ tab, key }) => {
    if (!clustersByKey.has(key)) clustersByKey.set(key, []);
    clustersByKey.get(key).push(tab);
  });
  const duplicates = [...clustersByKey.entries()]
    .filter(([, cluster]) => cluster.length > 1)
    .map(([key, cluster]) => ({ key, tabs: cluster }));
  const cutoff = Date.now() - Number(staleDays.value) * 86400000;
  const stale = reviewable
    .map(({ tab }) => tab)
    .filter((tab) => !tab.active && !tab.pinned && Number(tab.lastAccessed) > 0 && Number(tab.lastAccessed) < cutoff)
    .sort((left, right) => Number(left.lastAccessed) - Number(right.lastAccessed));
  renderDuplicates(duplicates);
  renderStaleTabs(stale);
  renderUnassignedTabs(inboxData.unassignedTabs || []);
  renderActivity(inboxData.activityHistory || []);
  summaryTitle.textContent = `${inboxData.unassignedTabs.length} unassigned · ${duplicates.length} duplicate cluster${duplicates.length === 1 ? '' : 's'} · ${stale.length} probably stale`;
  summaryDetail.textContent = `Reviewing ${reviewable.length} HTTP and HTTPS tabs across ${new Set(tabs.map((tab) => tab.windowId)).size} Chrome window${new Set(tabs.map((tab) => tab.windowId)).size === 1 ? '' : 's'}.`;
}

assignDestination.addEventListener('change', () => {
  updateAssignPatternVisibility();
  updateAssignOverlap().catch(() => {});
});
assignPattern.addEventListener('change', () => updateAssignOverlap().catch(() => {}));

assignCancel.addEventListener('click', () => assignDialog.close());

assignForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const [assignmentType, targetId] = assignDestination.value.split(':');
  if (!assignmentType || !targetId) {
    assignStatus.textContent = 'Choose a destination first.';
    return;
  }
  const selected = assignDestination.selectedOptions[0];
  const result = await chrome.runtime.sendMessage({
    type: 'ASSIGN_REVIEW_TAB',
    tabId: Number(assignDialog.dataset.tabId),
    assignmentType,
    targetId,
    targetName: selected?.dataset.name || selected?.textContent || '',
    pattern: assignPattern.value,
  });
  if (!result?.ok) {
    assignStatus.textContent = result?.message || 'The tab could not be assigned.';
    return;
  }
  assignDialog.close();
  reviewStatus.textContent = result.message;
  await loadReview();
});

staleDays.addEventListener('change', async () => {
  await chrome.storage.local.set({ [STALE_TAB_DAYS_STORAGE_KEY]: Number(staleDays.value) });
  await loadReview();
});

staleList.addEventListener('change', () => {
  closeSelectedStale.disabled = selectedStaleTabs().length === 0;
});

closeSelectedStale.addEventListener('click', async () => {
  await closeTabs(selectedStaleTabs(), 'Close the selected stale tabs?');
});

refreshButton.addEventListener('click', async () => {
  refreshButton.disabled = true;
  try {
    await loadReview();
    reviewStatus.textContent = 'Review refreshed.';
  } finally {
    refreshButton.disabled = false;
  }
});

loadReview().catch((error) => {
  summaryTitle.textContent = 'Review unavailable';
  reviewStatus.textContent = error.message || 'Could not load the current tabs.';
});
