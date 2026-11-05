import assert from 'node:assert/strict';
import test from 'node:test';
import { createToolRegistry } from '@jini-ai/core';
import { createToolExecutor } from '@jini-ai/daemon';
import type { ResolvedFederatedConnection } from '@jini-ai/mcp/federation';
import { createFederationRuntime } from '../external-mcp-federation-runtime.js';

test('approved plugin grants hot-reload through the real host policy; writes run and permanent deletes still ask', async () => {
  const registry = createToolRegistry({});
  let connection: ResolvedFederatedConnection = { config: {
    connectionId: 'media', label: 'Media', allowedToolNames: ['read'], writeAllowedToolNames: [],
    connectTimeoutMs: 1000, callTimeoutMs: 1000, maxResultBytes: 4096, maxTools: 10,
    origin: { kind: 'roster', admissionRevision: 'same-source' },
  }, launch: { url: 'https://media.example.test/mcp', headers: {} } };
  let roster = [connection];
  let listings = 0;
  const calls: string[] = [];
  const approvals: string[] = [];
  const runtime = createFederationRuntime({ registry, log: '[plugin-enable-test]', resolveConnections: async () => roster,
    deps: { workspaceId: 'ws', authorize: async () => ({ allowed: true, reason: 'matched' }),
      confirmCall: async (_ctx, request) => { approvals.push(request.remoteName); return { confirmed: false, result: { cancelled: true } }; },
    },
    connect: async () => ({
      listTools: async () => {
        listings++;
        return [
          { name: 'read', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
          { name: 'generate', description: 'Creates an image.', inputSchema: { type: 'object' }, annotations: { readOnlyHint: false } },
          { name: 'delete_image', description: 'Permanently deletes an image.', inputSchema: { type: 'object' }, annotations: { readOnlyHint: false, destructiveHint: true } },
        ];
      },
      callTool: async request => { calls.push(request.name); return { content: [] }; }, close: async () => {},
    }),
  });
  await runtime.start();
  connection = { ...connection, config: { ...connection.config, allowedToolNames: ['read', 'generate', 'delete_image'], writeAllowedToolNames: ['generate', 'delete_image'] } };
  roster = [connection];
  await runtime.reload();
  const executor = createToolExecutor({ registry });
  const call = (toolId: string) => executor.execute({ toolId, principal: { id: 'owner' }, run: { id: 'run' }, input: {} });
  assert.equal((await call('mcp__media__generate')).status, 'completed');
  assert.equal((await call('mcp__media__delete_image')).status, 'completed');
  assert.deepEqual(calls, ['generate']);
  assert.deepEqual(approvals, ['delete_image']);
  roster = [];
  await runtime.reload();
  assert.deepEqual(registry.list({}), []);
  roster = [connection];
  await runtime.reload();
  assert.equal(registry.has({ toolId: 'mcp__media__generate' }), true);
  assert.equal(listings, 1, 'grant changes and OFF/ON reuse frozen tool definitions');
});
