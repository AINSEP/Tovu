import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import { createRouteDeps } from '../../app.js';
import { createByokToolSurface } from '#src/assistant/byok-tool-surface';
import { notifyExternalMcpRosterChanged, resetExternalMcpRosterChangeListenersForTests } from '#src/assistant/external-mcp-roster-change';
import { resetAssistantDaemonSingletonForTests } from '#src/server/runtime/lifecycle/daemon-supervisor';
import { registerAuthRoutes } from '#src/server/inbound/admin-http/dev-auth';
import { bootAuthenticated } from '#src/server/__tests__/helpers/http-test-server';
import { BYOK_TURN_PATH, createAssistantByokModule } from '../assistant-byok.js';

function frame(type: string, data: unknown): string { return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`; }

test('plugin OFF aborts an affected provider stream, awaits cleanup, and preserves labelled partial text', { timeout: 45_000 }, async t => {
  resetExternalMcpRosterChangeListenersForTests(); resetAssistantDaemonSingletonForTests();
  t.after(() => { resetExternalMcpRosterChangeListenersForTests(); resetAssistantDaemonSingletonForTests(); });
  let connected!: () => void;
  const providerStarted = new Promise<void>(resolve => { connected = resolve; });
  let disconnected = false; let closed!: () => void;
  const providerClosed = new Promise<void>(resolve => { closed = resolve; });
  const provider = createServer((_req, res) => {
    res.on('close', () => { disconnected = true; closed(); });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(frame('message_start', { type: 'message_start', message: { id: 'held', type: 'message', role: 'assistant', content: [], model: 'fixture', usage: { input_tokens: 1, output_tokens: 0 } } }));
    res.write(frame('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }));
    res.write(frame('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Partial answer survives. '.repeat(30) } }));
    connected();
  });
  provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
  t.after(() => { provider.closeAllConnections(); provider.close(); });
  const deps = createRouteDeps();
  const surface = createByokToolSurface(deps, { installExtensions: false });
  surface.registry.register({ descriptor: { id: 'mcp__mail__read', description: 'Read mail', inputSchema: { type: 'object' }, metadata: { mcpSource: { id: 'mail', host: 'mail.example', pluginId: 'mail-plugin' } } }, policy: { authorize: async () => "allow" as const }, handler: async () => ({ ok: true }) });
  const module = createAssistantByokModule(deps, surface);
  const app = express(); app.use(express.json()); registerAuthRoutes(app, deps);
  module.registerRoutes?.(app); module.activateServerFederation?.({ router: app });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const response = await fetch(`${baseUrl}${BYOK_TURN_PATH}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Please answer.' }], byok: { protocol: 'anthropic', apiKey: 'fixture-test-key', model: 'fixture', baseUrl: `http://127.0.0.1:${(provider.address() as AddressInfo).port}` } }) });
  assert.equal(response.status, 200);
  const reader = response.body!.getReader(); const decoder = new TextDecoder();
  let output = '';
  while (!output.includes('Partial answer survives.')) {
    const chunk = await reader.read();
    assert.equal(chunk.done, false, 'the provider must stream partial answer text before Stop');
    output += decoder.decode(chunk.value);
  }
  const rest = (async () => {
    let tail = '';
    for (;;) { const chunk = await reader.read(); if (chunk.done) return tail; tail += decoder.decode(chunk.value); }
  })();
  await providerStarted;
  // Existing BYOK discovery can admit a slow server after launch; OFF must cover that live access.
  surface.registry.register({ descriptor: { id: 'mcp__late__read', metadata: { mcpSource: { id: 'late', host: 'late.example', pluginId: 'late-plugin' } } }, policy: { authorize: async () => "allow" as const }, handler: async () => ({ ok: true }) });
  await notifyExternalMcpRosterChanged({ lowered: { serverIds: ['unrelated'] } });
  assert.equal(disconnected, false, 'an unrelated source must not stop this answer');
  await notifyExternalMcpRosterChanged({ lowered: { pluginIds: ['late-plugin'] } });
  let cleanupTimer: NodeJS.Timeout | undefined;
  try {
    output += await Promise.race([rest, new Promise<string>((_resolve, reject) => { cleanupTimer = setTimeout(() => reject(new Error('OFF acknowledged while affected stream stayed active')), 1_000); })]);
  } finally { if (cleanupTimer) clearTimeout(cleanupTimer); }
  assert.match(output, /Partial answer survives\./);
  assert.match(output, /Stopped because tool access changed\./);
  assert.match(output, /event: end\ndata: \{"reason":"stop"\}/);
  assert.doesNotMatch(output, /event: error/);
  await providerClosed;
  assert.equal(disconnected, true);
});
