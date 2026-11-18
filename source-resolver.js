import { resolveWorkspaceSourceMatch } from './sources.js';

// Shares in-flight reads, bounds memory, and briefly caches failures without polling.
export function createSourceResolver(fetchForReason, { clock = Date.now, maxEntries = 256 } = {}) {
  const entries = new Map();
  return {
    clear() { entries.clear(); },
    resolve(match, secrets, reason) {
      const key = JSON.stringify([match.source, match.route, match.captures]);
      const credentials = JSON.stringify(secrets?.[match.source.id] || {});
      const existing = entries.get(key);
      if (existing && existing.credentials === credentials
        && (existing.pending || existing.expiresAt > clock())) return existing.request;
      const entry = { pending: true, expiresAt: 0, credentials };
      const request = resolveWorkspaceSourceMatch(match, secrets?.[match.source.id] || {}, fetchForReason(reason))
        .then((result) => { entry.expiresAt = clock() + 300000; return result; }, (error) => {
          entry.expiresAt = clock() + 30000;
          throw error;
        }).finally(() => { entry.pending = false; });
      entry.request = request;
      entries.delete(key);
      entries.set(key, entry);
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
      return request;
    },
  };
}
