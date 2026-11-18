import { duplicateKeyForUrl } from './core.js';

// Refresh after confirmation. Chrome has no conditional remove API, so keep the
// final query adjacent to removal and skip any tab changed since it was reviewed.
export async function closeReviewedTabs(reviewed, tabsApi, { keeperId, duplicateKey, staleCutoff } = {}) {
  const current = new Map((await tabsApi.query({})).map((tab) => [Number(tab.id), tab]));
  if (duplicateKey) {
    const keeper = current.get(Number(keeperId));
    if (!keeper || duplicateKeyForUrl(keeper.url) !== duplicateKey) {
      return { closedIds: [], keeperChanged: true };
    }
  }
  const ids = [...new Set(reviewed.filter((snapshot) => {
    const tab = current.get(Number(snapshot.id));
    if (!tab || tab.pinned || tab.active || snapshot.pinned || snapshot.active) return false;
    if (tab.url !== snapshot.url || tab.pendingUrl || tab.windowId !== snapshot.windowId || tab.groupId !== snapshot.groupId) return false;
    if (Number(tab.lastAccessed || 0) > Number(snapshot.lastAccessed || 0)) return false;
    if (duplicateKey && (Number(tab.id) === Number(keeperId) || duplicateKeyForUrl(tab.url) !== duplicateKey)) return false;
    if (staleCutoff !== undefined && !(Number(tab.lastAccessed) > 0 && Number(tab.lastAccessed) < staleCutoff)) return false;
    return true;
  }).map((tab) => Number(tab.id)))];
  if (ids.length) await tabsApi.remove(ids);
  return { closedIds: ids, keeperChanged: false };
}
