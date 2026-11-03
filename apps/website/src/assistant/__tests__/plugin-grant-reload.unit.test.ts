import assert from 'node:assert/strict';
import test from 'node:test';
import { createToolRegistry } from '@jini-ai/core';
import { FEDERATED_CONNECTION_DEFAULTS, type ResolvedFederatedConnection } from '@jini-ai/mcp/federation';
import { InMemoryMcpSession } from '@jini-ai/mcp/federation/testing';
import { createFederationRuntime } from '../external-mcp-federation-runtime.js';

test('granting tools to an already-on plugin refreshes search and admissions without a restart', async () => {
  const registry = createToolRegistry({});
  let connection: ResolvedFederatedConnection = { config: { ...FEDERATED_CONNECTION_DEFAULTS,
    connectionId: 'media', label: 'Media', allowedToolNames: [], writeAllowedToolNames: [],
    origin: { kind: 'roster', admissionRevision: 'endpoint-1' } }, launch: { url: 'https://example.test/mcp', headers: {} } };
  let refreshes = 0;
  const runtime = createFederationRuntime({ registry, deps: { workspaceId: 'ws', authorize: async () => ({ allowed: true, reason: 'matched' }) },
    log: '[test]', resolveConnections: async () => [connection], onAdmitted: () => { refreshes += 1; },
    connect: async () => new InMemoryMcpSession({ tools: [{ name: 'list_media', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } }] }),
  });
  await runtime.start();
  assert.equal(registry.list({}).length, 0);
  connection = { ...connection, config: { ...connection.config, allowedToolNames: ['list_media'] } };
  await runtime.reload();
  assert.ok(registry.has({ toolId: 'mcp__media__list_media' }));
  assert.equal(refreshes, 1);
  assert.equal(runtime.reports().length, 1, 'the refreshed report replaces the empty boot report');
  assert.equal(runtime.reports()[0]?.report.admitted.length, 1);
  await runtime.reload();
  assert.equal(refreshes, 1, 'the first nonempty admission freezes subsequent reloads');
});
