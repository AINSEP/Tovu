import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentPluginMcpRecord, AgentPluginMcpRepo } from '@jini-ai/agent-plugins/connect';
import type { McpServerConfig } from '@jini-ai/agent-plugins/lifecycle';
import { applyAgentPluginToolRenames, renameToolNames } from '../../portable/apply-tool-renames.js';
import { applyAgentPluginToolRenames as tovuApply } from '../../apply-tool-renames.js';

const URL_ = 'https://mcp.example.test/mcp';
function harness() {
  // Only the fields the rename reads; the rest of the saved row is irrelevant to this rule.
  const row = { provisionedByPluginId: 'acme', url: URL_, allowedToolNames: '["old_read"]', writeAllowedToolNames: '["old_write"]' } as unknown as AgentPluginMcpRecord;
  const saved: AgentPluginMcpRecord[] = [];
  const repo = {
    findByServerId: async () => row, upsert: async (next: AgentPluginMcpRecord) => { saved.push(next); return next; },
    deleteByServerId: async () => false, updateAccessIfCurrent: async () => null,
  } as unknown as AgentPluginMcpRepo;
  const servers: Record<string, McpServerConfig> = { main: { type: 'streamable-http', url: URL_, renamedTools: { old_read: 'new_read', old_write: 'new_write' } } };
  return { repo, saved, servers, logs: [] as string[] };
}

test('portable renames: object API, host actor and host plugin listing are used', async () => {
  const h = harness();
  let notified = 0;
  await applyAgentPluginToolRenames({ log: { info: m => h.logs.push(m), warn: m => h.logs.push(m) }, deps: {
    workspaceId: 'w', externalMcpServerRepo: h.repo, clock: { nowMs: () => 0 }, actor: 'acme:renames',
    listPlugins: async () => [{ pluginId: 'acme', servers: h.servers }], notifyRosterChanged: async () => { notified++; },
  } });
  assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0]?.allowedToolNames, '["new_read"]');
  assert.equal(h.saved[0]?.writeAllowedToolNames, '["new_write"]');
  assert.equal(h.saved[0]?.writeGrantsUpdatedByPrincipalId, 'acme:renames');
  assert.equal(notified, 1);
  assert.deepEqual(renameToolNames({ names: ['a', 'b'], renames: { a: 'b' } }), ['b']);
});

test('Tovu shim keeps the positional entry and the saved system:tool-renames actor bytes', async () => {
  const h = harness();
  await tovuApply({ workspaceId: 'w', get agentPluginLayout(): never { throw new Error('layout must stay lazy'); },
    externalMcpServerRepo: h.repo, clock: { nowMs: () => 0 }, listPlugins: async () => [{ pluginId: 'acme', servers: h.servers }],
    notifyRosterChanged: async () => {} }, { info: () => {}, warn: m => h.logs.push(m) });
  assert.equal(h.saved[0]?.writeGrantsUpdatedByPrincipalId, 'system:tool-renames');
  assert.deepEqual(h.logs, []);
});
