import assert from 'node:assert/strict';
import test from 'node:test';
import { provisionAgentPluginMcpServers } from '../../federate-mcp.js';
import { InMemoryExternalMcpServerRepo } from '../../../external-mcp/external-mcp-store.memory.js';

test('enabling a guidance-only plugin announces a reload even when it has no MCP servers to provision', async () => {
  let reloads = 0;
  await provisionAgentPluginMcpServers({ repo: new InMemoryExternalMcpServerRepo(),
    saveServer: async () => { throw new Error('A guidance-only plugin must not save a connection.'); },
    notifyRosterChanged: async () => { reloads += 1; },
  }, { workspaceId: 'ws', pluginId: 'guidance', servers: {}, principalId: 'owner' });
  assert.equal(reloads, 1);
});
