import assert from 'node:assert/strict';
import test from 'node:test';
import { createToolRegistry, type ToolExecutionContext } from '@jini-ai/core';
import { createPluginContributionRegistry, buildPluginContributionToolRegistrations, pluginToolIdFor } from '@jini-ai/plugins/host';
import { createIssuedTokenMemories, defineAgentPluginToolContribution } from '@jini-ai/agent-plugins/lifecycle/tools';
import { registerAgentPluginExecutableToolsWithPorts } from '../register.js';
import { createAgentPluginDisclosureWithPorts } from '../approval.js';
import { createFrozenConnectionAccounts } from '../host-capabilities.js';

test('the registrar consumes the host definition and contribution builders without replacing their owner', async () => {
  const definition = defineAgentPluginToolContribution({ filename: 'other-host-tools.json' });
  const registry = createToolRegistry({});
  const owned = createPluginContributionRegistry({});
  let registryCalls = 0;
  let buildCalls = 0;
  const registered = await registerAgentPluginExecutableToolsWithPorts({
    registry, workspaceId: 'other-workspace',
    host: {
      loadContributions: async (input, options) => { assert.equal(input.definition, definition); assert.equal(options.orderByPluginId, true); return { items: [], refusals: ['host refusal'] }; },
      connections: { readAccount: async () => null, getAccessToken: async () => 'unused' },
      http: { send: async () => { throw new Error('no HTTP expected'); } }, limiter: { check: async () => ({ allowed: true }) },
      state: () => ({ get: async () => null }), apiOrigins: async () => [], issuedTokens: createIssuedTokenMemories(),
    },
    isActive: async () => true, authorize: async () => ({ allowed: true, reason: 'allowed' }),
    applyApproval: ({ registration }) => registration, withExtensionApprovalPolicy: ({ registration }) => registration,
    contributions: { definition, createRegistry: () => { registryCalls += 1; return owned; }, toolIdFor: pluginToolIdFor,
      buildRegistrations: input => { assert.equal(input.contributions, owned); buildCalls += 1; return buildPluginContributionToolRegistrations(input); } },
    connectionKey: () => 'host-key', readApproval: { class: 'read', confirmation: 'direct' },
    disclosureMessages: { withdrawn: 'gone', notConnected: 'sign in', accountLabel: 'Identity', affectsLabel: 'Changes' },
  });
  assert.deepEqual(registered.refusals, ['host refusal']);
  assert.equal(registryCalls, 1);
  assert.equal(buildCalls, 1);
  assert.deepEqual(registry.list({}), []);
  registered.dispose();
});

test('host disclosure labels and refusals pass through while the original frozen map is bound', async () => {
  const frozen = createFrozenConnectionAccounts();
  const signal = new AbortController().signal;
  const ctx: ToolExecutionContext = { executionId: 'e', principal: { id: 'p' }, run: { id: 'r' }, input: {}, signal };
  const messages = { withdrawn: 'Host withdrew this tool.', notConnected: 'Host needs a sign-in.', accountLabel: 'Identity', affectsLabel: 'Changes' };
  const target = { ctx, toolId: 'tool', pluginId: 'plugin', workspaceId: 'workspace' };
  const required = { frozen, messages,
    source: { describeAffectedResources: async () => ({ effect: 'write' as const, resources: ['record'], connections: ['ref'] }) },
    connections: { readAccount: async () => ({ accountId: 'account', displayName: 'Person' }), getAccessToken: async () => 'unused' },
  };
  assert.deepEqual(await createAgentPluginDisclosureWithPorts(required)(target), [{ label: 'Identity', value: 'Person' }, { label: 'Changes', value: 'record' }]);
  assert.equal(frozen.lookup({ signal, connectionRef: 'ref' }), 'account');
  assert.equal(frozen.lookup({ signal, connectionRef: 'other' }), null);
  await assert.rejects(createAgentPluginDisclosureWithPorts({ ...required, source: { describeAffectedResources: async () => null } })(target), { message: messages.withdrawn });
  await assert.rejects(createAgentPluginDisclosureWithPorts({ ...required, connections: { ...required.connections, readAccount: async () => null } })(target), { message: messages.notConnected });
});
