import assert from 'node:assert/strict';
import test from 'node:test';
import { createToolRegistry } from '@jini-ai/core';
import { createToolExecutor, createRunLifecycle, createInMemoryEventLog } from '@jini-ai/daemon';
import { buildToolGapsRegistrations } from '../tool-gaps-tool.js';

test('tool_gaps_list is read-only and the real executor refuses other admins before a read', async () => {
  let reads = 0;
  const registry = createToolRegistry({});
  for (const registration of buildToolGapsRegistrations({ workspaceId: 'w', ownerPrincipalId: Promise.resolve('owner'),
    toolGaps: { list: async () => { reads++; return []; } } }, {})) registry.register(registration);
  assert.equal(registry.list({})[0]?.readOnly, true);
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: 'test' });
  const executor = createToolExecutor({ registry });
  const denied = await executor.execute({ principal: { id: 'admin' }, run, toolId: 'tool_gaps_list', input: {} });
  assert.equal(denied.status, 'denied'); assert.equal(reads, 0);
  const allowed = await executor.execute({ principal: { id: 'owner' }, run, toolId: 'tool_gaps_list', input: {} });
  assert.equal(allowed.status, 'completed'); assert.equal(reads, 1);
});
