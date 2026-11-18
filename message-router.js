// Synchronous diagnostics never wait for storage or browser enumeration.
// Asynchronous operations retain Chrome's response channel until they settle.
export function createMessageHandler(handlers) {
  return (message, _sender, sendResponse) => {
    if (!message || !Object.hasOwn(handlers, message.type)) return false;
    const fail = (error) => {
      const detail = error instanceof Error ? error.message : 'The action could not be completed. Try again.';
      sendResponse({ ok: false, message: detail, error: detail });
    };
    try {
      const result = handlers[message.type](message);
      if (result && typeof result.then === 'function') {
        result.then((value) => sendResponse(value ?? { ok: true })).catch(fail);
        return true;
      }
      sendResponse(result ?? { ok: true });
    } catch (error) { fail(error); }
    return false;
  };
}
