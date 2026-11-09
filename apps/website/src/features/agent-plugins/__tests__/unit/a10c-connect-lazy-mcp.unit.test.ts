/**
 * A10c regression: the `agent_plugin_connect` T shim must not read `routeDeps.mcp` before the
 * permission check (pre-A10b order: permission first, MCP store only on first use). A denied call
 * therefore never touches the MCP getter.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolExecutionContext } from '@jini-ai/core';
import { runAgentPluginConnect, type AgentPluginConnectToolDeps } from '../../connect-tool.js';

const WORKSPACE_ID = '77777777-7777-4777-8777-777777777777';

test('permission-denied connect never reads routeDeps.mcp (lazy, after the check)', async () => {
  const reads: string[] = [];
  const permissions: string[] = [];
  const routeDeps = {
    workspaceId: WORKSPACE_ID,
    authorize: async ({ permission }: { permission: string }) => { permissions.push(permission); return { allowed: false, reason: 'denied in test' }; },
    get mcp(): never { reads.push('mcp'); throw new Error('routeDeps.mcp read before the permission check'); },
  } as unknown as AgentPluginConnectToolDeps;
  const ctx = { principal: { id: 'p-1' }, run: {}, input: { pluginId: 'demo' } } as unknown as ToolExecutionContext;
  await assert.rejects(runAgentPluginConnect({ routeDeps, surfaces: {} as never, ctx, pluginId: 'demo' }), (err: Error) => !/routeDeps\.mcp read/.test(err.message));
  assert.deepEqual(permissions, ['admin.integrations.manage']);
  assert.deepEqual(reads, []);
});
