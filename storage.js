// Serializes read-modify-write batches and recovers after a rejected write.
export function batchedStorageUpdater(load, store) {
  const pending = [];
  let flushRequest = null;

  function scheduleFlush() {
    if (flushRequest) return;
    flushRequest = Promise.resolve()
      .then(async () => {
        while (pending.length) {
          const batch = pending.splice(0);
          try {
            const loaded = await load();
            let current = Array.isArray(loaded) ? [...loaded] : { ...loaded };
            batch.forEach(({ update }) => {
              current = update(current) || current;
            });
            await store(current);
            batch.forEach(({ resolve }) => resolve(current));
          } catch (error) {
            batch.forEach(({ reject }) => reject(error));
          }
        }
      })
      .finally(() => {
        flushRequest = null;
        if (pending.length) scheduleFlush();
      });
  }

  return (update) => new Promise((resolve, reject) => {
    pending.push({ update, resolve, reject });
    scheduleFlush();
  });
}
