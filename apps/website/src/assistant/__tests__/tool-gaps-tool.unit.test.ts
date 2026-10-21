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

test('tool_gaps_list without audit storage fails with a clear error for the owner', async () => {
  const registry = createToolRegistry({});
  for (const registration of buildToolGapsRegistrations({ workspaceId: 'w', ownerPrincipalId: Promise.resolve('owner') })) registry.register(registration);
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: 'test' });
  const result = await createToolExecutor({ registry }).execute({ principal: { id: 'owner' }, run, toolId: 'tool_gaps_list', input: {} });
  assert.equal(result.status, 'failed');
  assert.match(String(result.error), /Tool gap audit storage is unavailable\./);
});

test('the handler re-checks ownership even when reached without the registry policy', async () => {
  let reads = 0;
  const [registration] = buildToolGapsRegistrations({ workspaceId: 'w', ownerPrincipalId: Promise.resolve('owner'),
    toolGaps: { list: async () => { reads++; return []; } } });
  await assert.rejects(registration!.handler({ executionId: 'e', principal: { id: 'admin' }, run: { id: 'r' }, input: {}, signal: new AbortController().signal }),
    { name: 'ToolInputError', message: 'Only the owner can read tool gaps.' });
  assert.equal(reads, 0);
});
