import assert from 'node:assert/strict';
import test from 'node:test';
import { previewWorkspaceImport } from '../workspace-import.js';

// Minimal DOM adapter. Executes the real UI module without a browser or installed extension.
class Element {
  constructor() { this.children = []; this.events = {}; this.value = ''; this.dataset = {}; this.disabled = false; }
  addEventListener(name, listener) { this.events[name] = listener; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  querySelectorAll() {
    return this.children.flatMap((child) => [
      ...(child.type === 'checkbox' && child.checked ? [child] : []), ...child.querySelectorAll(),
    ]);
  }
  querySelector() { return this.querySelectorAll()[0] || null; }
  click() { return this.events.click?.({}); }
}

test('workspace import UI previews, invalidates edits, applies selected rows and reports guarded Undo', async () => {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const file = { format: 'tab-bundlr-workspaces', version: 1, workspaces: [
    { id: 'docs', name: '<img src=x onerror=alert(1)>', urls: ['https://docs.example'] },
  ] };
  const requests = [];
  let canUndo = false;
  globalThis.document = { getElementById: element, createElement: () => new Element() };
  globalThis.chrome = { runtime: { async sendMessage(message) {
    requests.push(message);
    if (message.type === 'WORKSPACE_IMPORT_PREVIEW') return { ok: true, preview: previewWorkspaceImport({}, message.file) };
    if (message.type === 'WORKSPACE_IMPORT_STATUS') return { ok: true, canUndo };
    if (message.type === 'WORKSPACE_IMPORT_APPLY') { canUndo = true; return { ok: true, imported: 1 }; }
    if (message.type === 'WORKSPACE_IMPORT_UNDO') { canUndo = false; return { ok: true }; }
    assert.fail('Unexpected UI request');
  } }, storage: { onChanged: { addListener() {} } } };
  try {
    await import('../workspace-import-options.js?offline-ui');
    await new Promise(setImmediate);
    const submit = () => element('workspace-import-form').events.submit({ preventDefault() {} });
    const input = element('workspace-import-json');
    input.value = JSON.stringify(file);
    await submit();
    assert.equal(element('workspace-import-preview').hidden, false);
    assert.equal(element('workspace-import-apply').disabled, false);
    const title = element('workspace-import-rows').children[0].children[0].children[1];
    assert.match(title.textContent, /<img src=x/);
    assert.equal(title.innerHTML, undefined, 'Labels must be text, never executable HTML');
    input.value = '{';
    input.events.input();
    assert.equal(element('workspace-import-preview').hidden, true);
    assert.equal(element('workspace-import-apply').disabled, true);
    await submit();
    assert.match(element('workspace-import-status').textContent, /valid JSON/);
    assert.equal(requests.filter((message) => message.type === 'WORKSPACE_IMPORT_APPLY').length, 0);
    input.value = JSON.stringify(file);
    await submit();
    await element('workspace-import-apply').click();
    assert.deepEqual(requests.find((message) => message.type === 'WORKSPACE_IMPORT_APPLY').selectedIds, ['docs']);
    assert.equal(requests.some((message) => message.type === 'SYNC_NOW'), false);
    assert.match(element('workspace-import-status').textContent, /Existing tabs stayed in place/);
    assert.equal(element('workspace-import-undo').disabled, false);
    await element('workspace-import-undo').click();
    assert.match(element('workspace-import-status').textContent, /Undid/);
    assert.equal(element('workspace-import-undo').disabled, true);
  } finally { delete globalThis.document; delete globalThis.chrome; }
});
