import { radarProjectSourcePreview, resolveRadarProjectMatch } from './radar-session.js';
import { matchingWorkspaceSources, normalizeWorkspaceSource } from './sources.js';

// Synthetic metadata only. This acceptance check never calls Radar or enables a
// source. Real Chrome grouping/Undo use the same worker placement and move engine.
export function createRadarDisposableTest({ chromeApi, isHeld, apply, undo, cleanup }) {
  let running = false;
  const execute = async (windowId) => {
    const owned = [];
    const moves = [];
    const nonce = crypto.randomUUID();
    const sourceId = `radar-qa-${nonce}`;
    const metadata = { status: 'read', accountId: '44444444-4444-4444-8444-444444444444',
      workspaceId: '11111111-1111-4111-8111-111111111111', ticket: {
        id: '33333333-3333-4333-8333-333333333333', number: 42,
        workspace_id: '11111111-1111-4111-8111-111111111111', project_id: '22222222-2222-4222-8222-222222222222' } };
    const profile = normalizeWorkspaceSource({ ...radarProjectSourcePreview(metadata, sourceId, `Radar disposable ${nonce.slice(0, 8)}`), enabled: true });
    const snapshot = (tabs, ids) => tabs.filter((tab) => !ids || ids.has(tab.id)).sort((a, b) => a.index - b.index)
      .map((tab) => [tab.id, tab.windowId, tab.groupId, Boolean(tab.pinned)]);
    const baselineTabs = await chromeApi.tabs.query({ windowId });
    const baselineIds = new Set(baselineTabs.map((tab) => tab.id));
    const baseline = snapshot(baselineTabs);
    const result = { status: 'failed', grouped: 0, undone: 0, serviceRequests: 0, sourceSaved: false, historyWritten: false };
    try {
      for (let index = 0; index < 2; index += 1) {
        const url = `${chromeApi.runtime.getURL('radar-disposable.html')}#${nonce}-${index}`;
        const tab = await chromeApi.tabs.create({ windowId, url, active: false, index: baselineTabs.length + index });
        owned.push({ id: tab.id, url });
        const record = index ? { ...metadata, ticket: { ...metadata.ticket,
          id: '55555555-5555-4555-8555-555555555555', number: 43 } } : metadata;
        const nativeUrl = `https://radar.sdg.la/tickets/${record.ticket.id}`;
        const [match] = matchingWorkspaceSources([profile], nativeUrl);
        const resolved = await resolveRadarProjectMatch(match, { id: tab.id, url: nativeUrl }, async () => record);
        if (resolved.status !== 'resolved') throw new Error('Project resolution failed');
        await apply(tab, resolved, { recordMove: async (move) => { moves.push(move); }, organize: false, persistCatalog: false });
      }
      const groupedTabs = await Promise.all(owned.map((tab) => chromeApi.tabs.get(tab.id)));
      if (groupedTabs.some((tab, index) => tab.url !== owned[index].url || tab.pinned)
        || groupedTabs[0].groupId < 0 || groupedTabs[0].groupId !== groupedTabs[1].groupId || moves.length !== 2) throw new Error('Grouping failed');
      result.grouped = 2;
      const undone = await undo({ moves });
      result.undone = undone.length;
      const restoredTabs = await Promise.all(owned.map((tab) => chromeApi.tabs.get(tab.id)));
      if (undone.length !== 2 || restoredTabs.some((tab) => tab.groupId !== -1)) throw new Error('Undo failed');
      result.status = 'passed';
    } catch {
      result.status = 'failed';
    } finally {
      let retained = 0;
      for (const tab of owned) {
        const current = await chromeApi.tabs.get(tab.id).catch(() => null);
        if (!current) continue;
        if (current.url !== tab.url || current.pinned) { retained += 1; continue; }
        try { await chromeApi.tabs.remove(tab.id); } catch { retained += 1; }
      }
      await cleanup(owned.map((tab) => tab.id), sourceId, profile.identity, metadata.ticket.project_id);
      result.disposableTabsRetained = retained;
      result.workingTabsUnchanged = JSON.stringify(snapshot(await chromeApi.tabs.query({ windowId }), baselineIds)) === JSON.stringify(baseline);
      if (retained || !result.workingTabsUnchanged) result.status = 'failed';
    }
    return result;
  };
  return async (windowId) => {
    if (running) throw Object.assign(new Error(), { code: 'test-in-progress' });
    if (!isHeld()) throw Object.assign(new Error(), { code: 'read-only-hold-required' });
    running = true;
    try { return await execute(windowId); } finally { running = false; }
  };
}
