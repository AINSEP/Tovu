import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createToolRegistry, type SurfaceEmission } from '@jini-ai/core';
import { createToolExecutor } from '@jini-ai/daemon';
import { withSurfaceExchangeLifetime } from '@jini-ai/daemon/tool-recovery';
import { createSurfaceExchangeStore, askOnce } from '@jini-ai/daemon/surface-exchanges';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { createSystemClock, createRandomUuidGenerator } from '@jini-ai/core/primitives';
import { startTestServer } from '../../server/__tests__/helpers/http-test-server.js';
import { RUN_PRINCIPAL_HEADER } from '../daemon-access.js';
import { registerMcpUiToolCallsRoute, MCP_UI_TOOL_CALLS_PATH } from '../mcp-ui-tool-calls-route.js';

async function fixture(t: import("node:test").TestContext) {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(),
    idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' });
  const registry = createToolRegistry({});
  const calls: unknown[] = [];
  const saved: unknown[] = [];
  registry.register({ descriptor: { id: 'external_mcp_save' }, policy: { authorize: () => 'allow' },
    handler: async (ctx, options) => {
      calls.push(ctx.input);
      const exchange = store.open({ binding: { toolId: 'external_mcp_save', principalId: ctx.principal.id }, emit: options!.emitSurface! });
      const answer = await askOnce({ exchange, emission: { channel: 'mcp-ui', payload: { resource: {
        type: 'resource', resource: { uri: `ui://credential/${exchange.id}`, mimeType: 'text/html', text: '<form></form>' },
      } } } });
      if (answer.status === 'received') saved.push(answer.params['token']);
      return { status: answer.status };
    } });
  const executor = withSurfaceExchangeLifetime({ inner: createToolExecutor({ registry }) });
  const emissions: SurfaceEmission[] = [];
  let ready!: () => void;
  const emitted = new Promise<void>(resolve => { ready = resolve; });
  const controller = new AbortController();
  const first = executor.execute({ principal: { id: 'owner' }, run: { id: 'run' }, toolId: 'external_mcp_save', input: { id: 'same-server' } },
    { signal: controller.signal, emitSurface: async emission => { emissions.push(emission); ready(); } });
  await emitted;
  const exchangeId = (emissions[0]!.payload['surfaceExchange'] as { exchangeId: string }).exchangeId;
  controller.abort(); await first;
  const app = express(); app.use(express.json());
  registerMcpUiToolCallsRoute(app, { surfaceExchanges: store, toolExecutor: executor });
  const baseUrl = await startTestServer(app, t);
  return { baseUrl, store, calls, saved, exchangeId };
}

test('a late credential answer restores the same request and saves once without asking the owner to re-ask', async t => {
  const f = await fixture(t);
  const response = await fetch(`${f.baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, { method: 'POST',
    headers: { 'content-type': 'application/json', [RUN_PRINCIPAL_HEADER]: 'owner' },
    body: JSON.stringify({ toolName: 'external_mcp_save', params: { __exchangeId: f.exchangeId, token: 'human-only' } }),
  });
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /application\/x-ndjson/);
  assert.match(body, /"type":"surface"/);
  assert.match(body, /"type":"restored","ok":true/);
  assert.doesNotMatch(body, /human-only/);
  assert.deepEqual(f.calls, [{ id: 'same-server' }, { id: 'same-server' }]);
  assert.deepEqual(f.saved, ['human-only']);
});

test('a different owner cannot restore someone else\'s expired credential card', async t => {
  const f = await fixture(t);
  const response = await fetch(`${f.baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, { method: 'POST',
    headers: { 'content-type': 'application/json', [RUN_PRINCIPAL_HEADER]: 'intruder' },
    body: JSON.stringify({ toolName: 'external_mcp_save', exchangeId: f.exchangeId, restore: true }),
  });
  assert.equal(response.status, 409);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.saved, []);
});
