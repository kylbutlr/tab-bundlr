// External IDs are opaque and only unique within their connection and workspace kind.
export function sourceWorkspaceId(sourceId, workspaceId, workspaceType = 'workspace') {
  return `source:${encodeURIComponent(sourceId)}:${workspaceType === 'collection' ? 'collection' : 'workspace'}:${encodeURIComponent(workspaceId)}`;
}

// Retain existing Chrome groups and saved rules when persisted contexts prove ownership.
// Ambiguous legacy destinations remain unchanged instead of guessing their provider.
export function sourceIdentityMigration(stored, result) {
  const rawId = String(result.workspaceId);
  const workspaceType = result.workspaceType === 'collection' ? 'iteration' : 'epic';
  const id = sourceWorkspaceId(result.sourceId, rawId, result.workspaceType);
  const contexts = stored.tabContexts || {};
  const relevant = Object.values(contexts).filter((context) => String(context?.epicId) === rawId
    && (context.workspaceType || 'epic') === workspaceType);
  const prefix = `workspace-source:${result.sourceId}:`;
  if (!relevant.length || relevant.some((context) => !String(context.source || '').startsWith(prefix))) return {};
  const groupKeys = new Set(relevant.map((context) => `${context.windowId}:${context.groupId}`));
  const records = Object.entries(stored.groupRecords || {});
  const owned = records.filter(([, record]) => String(record?.epicId) === rawId
    && (record.workspaceType || 'epic') === workspaceType
    && groupKeys.has(`${record.windowId}:${record.groupId}`));
  if (!owned.length) return {};
  const nextRecords = { ...stored.groupRecords };
  for (const [key, record] of owned) {
    const nextKey = workspaceType === 'iteration' ? `${record.windowId}:iteration:${id}` : `${record.windowId}:${id}`;
    if (nextRecords[nextKey] && nextRecords[nextKey].groupId !== record.groupId) return {};
    delete nextRecords[key];
    nextRecords[nextKey] = { ...record, epicId: id };
  }
  const changes = {
    groupRecords: nextRecords,
    tabContexts: Object.fromEntries(Object.entries(contexts).map(([tabId, context]) => [tabId,
      relevant.includes(context) ? { ...context, epicId: id } : context])),
  };
  if (workspaceType === 'epic') {
    for (const key of ['trainedRules', 'savedClientGroups', 'clientCatalog']) {
      if (Array.isArray(stored[key])) changes[key] = stored[key].map((entry) => String(entry.epicId) === rawId
        ? { ...entry, epicId: id } : entry);
    }
  }
  return changes;
}
