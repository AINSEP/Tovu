/**
 * @file The desktop's chat surfaces, mounted the way `main.tsx` mounts them: chat states the port,
 * and this binding is where Tovu picks the MCP-UI iframe host, the interactive component registry,
 * the registry-to-catalog builder and the page's model-context probe.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createElement } from 'react';
import { ChatSurfacesProvider, McpUiHost } from '@jini-ai/chat/react';
import { mount } from './app/component-harness.js';
import { closeHost } from './app-render-harness.js';
import { chatSurfaces } from './jini-surfaces.js';

after(closeHost);

test("chat's MCP-UI card renders through ui's sandboxed host, named by the card's title", (t) => {
  const card = createElement(McpUiHost, { title: 'Weather card', html: '<p>Sunny</p>', sandboxProxyUrl: new URL('http://localhost/sandbox.html') });
  const view = mount({ t, element: createElement(ChatSurfacesProvider, { surfaces: chatSurfaces, children: card }) });
  const host = view.container.querySelector('[data-mcpui-host]');
  assert.ok(host, "ui's MCP-UI host is on screen");
  assert.equal(host.getAttribute('aria-label'), 'Weather card');
});

test('the A2UI catalog offers exactly the components the interactive registry can render', () => {
  const registry = chatSurfaces.interactiveUi.defaultRegistry;
  const ids = registry.list().map((entry) => entry.id);
  assert.ok(ids.length > 0, 'the default registry ships components');
  for (const id of ids) assert.equal(registry.resolveById({ id })?.id, id);
  assert.equal(registry.resolveById({ id: 'not-a-registered-component' }), null);

  const catalog = chatSurfaces.a2ui.catalogFromRegistry({ registry, catalogId: 'desktop-chat' });
  assert.equal(catalog.catalogId, 'desktop-chat');
  assert.deepEqual([...catalog.components.keys()].sort(), [...ids].sort());
});

test('the page probe adapts the first installed model context and reports none when the page has none', async () => {
  const registered: unknown[] = [];
  const native = { registerTool: async (tool: unknown, options: unknown) => { registered.push({ tool, options }); } };
  assert.equal(chatSurfaces.page.getModelContext({ host: { candidates: () => [] } }), undefined);
  assert.equal(chatSurfaces.page.getModelContext({ host: { candidates: () => [undefined, { unrelated: true }] } }), undefined);

  const context = chatSurfaces.page.getModelContext({ host: { candidates: () => [undefined, native] } });
  assert.ok(context, 'a candidate with registerTool is the page model context');
  const tool = { name: 'open_page', description: 'Opens a page.', inputSchema: {}, execute: async () => null };
  const signal = new AbortController().signal;
  await context.registerTool({ tool }, { signal });
  assert.deepEqual(registered, [{ tool, options: { signal } }], 'the tool reaches the native surface in its own positional shape');
});
