/**
 * @file EXTRACT-S4 Main F1: the executable registrar authorizes plugin tools with the permission the
 * host supplies (`toolPermission`), not a hard-coded Tovu RBAC name. Runs the real Jini registrar
 * with the real plugin contribution builder; Tovu's binder still supplies exactly `admin.assistant.use`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createToolRegistry, type LegacyToolAuthorizeFn, type ToolRegistration } from '@jini-ai/core';
import { buildPluginContributionToolRegistrations, createPluginContributionRegistry, pluginToolIdFor } from '@jini-ai/plugins/host';
import { createIssuedTokenMemories, defineAgentPluginToolContribution } from '@jini-ai/agent-plugins/lifecycle/tools';
import { registerAgentPluginExecutableTools } from '@jini-ai/agent-plugins/connect/executable';
import { bindExecutableToolRegistration } from '../../host-bindings.js';
import { acmeTools, PLUGIN } from '../fixtures.js';

/** An evaluator that grants exactly one permission name and records every name it was asked for. */
function grantOnly(permission: string) {
  const asked: string[] = [];
  const authorize: LegacyToolAuthorizeFn = async (request) => {
    asked.push(request.permission);
    return request.permission === permission ? { allowed: true, reason: 'granted' } : { allowed: false, reason: 'no_grant' };
  };
  return { authorize, asked };
}

/** Registers the fixture plugin through the public registrar with the given host permission and evaluator. */
async function registerWith({ toolPermission, authorize }: { toolPermission: string; authorize: LegacyToolAuthorizeFn }) {
  const definition = defineAgentPluginToolContribution({ filename: 'other-host-tools.json' });
  const registry = createToolRegistry({});
  let built: ToolRegistration[] = [];
  const registered = await registerAgentPluginExecutableTools({
    registry, workspaceId: 'other-workspace', toolPermission, authorize,
    host: {
      loadContributions: async () => ({ items: acmeTools([]), refusals: [] }),
      connections: { readAccount: async () => null, getAccessToken: async () => 'unused' },
      http: { send: async () => { throw new Error('no HTTP expected'); } }, limiter: { check: async () => ({ allowed: true }) },
      state: () => ({ get: async () => null }), apiOrigins: async () => [], issuedTokens: createIssuedTokenMemories(),
    },
    isActive: async () => true,
    applyApproval: ({ registration }) => registration, withExtensionApprovalPolicy: ({ registration }) => registration,
    contributions: { definition, createRegistry: createPluginContributionRegistry, toolIdFor: pluginToolIdFor, buildRegistrations: (input) => { built = buildPluginContributionToolRegistrations(input); return built; } },
    connectionKey: () => 'host-key', readApproval: { class: 'read', confirmation: 'direct' },
    disclosureMessages: { withdrawn: 'gone', notConnected: 'sign in', accountLabel: 'Identity', affectsLabel: 'Changes' },
  });
  const tool = built.find(registration => registration.descriptor.id === pluginToolIdFor({ pluginId: PLUGIN, name: 'read_rows' }));
  assert.ok(tool, 'the read tool is built by the real contribution builder');
  assert.ok(registry.has({ toolId: tool.descriptor.id }), 'and registered');
  return { authorizeRead: () => tool.policy.authorize({ principal: { id: 'operator' }, run: { id: 'r' }, tool: tool.descriptor, input: {} }), registered };
}

test('another host authorizes plugin tools with its own RBAC permission name', async () => {
  const { authorize, asked } = grantOnly('reports.tools.run');
  const { authorizeRead, registered } = await registerWith({ toolPermission: 'reports.tools.run', authorize });
  assert.equal(await authorizeRead(), 'allow');
  assert.ok(asked.includes('reports.tools.run'));
  assert.ok(!asked.includes('admin.assistant.use'), 'no Tovu permission name is consulted');
  registered.dispose();
});

test('the host permission still denies a principal who lacks it', async () => {
  const { authorize } = grantOnly('admin.assistant.use');
  const { authorizeRead, registered } = await registerWith({ toolPermission: 'reports.tools.run', authorize });
  // Same refusal shape as before: the core permission check rejects, naming the permission it needed.
  await assert.rejects(authorizeRead(), { permission: 'reports.tools.run', reason: 'no_grant' });
  registered.dispose();
});

test('Tovu binds exactly admin.assistant.use as the tool permission', () => {
  const bound = bindExecutableToolRegistration({
    registry: createToolRegistry({}), workspaceId: 'ws', authorize: async () => ({ allowed: true, reason: 'test' }),
    host: { loadContributions: async () => ({ items: [], refusals: [] }), connections: { readAccount: async () => null, getAccessToken: async () => 'unused' },
      http: { send: async () => { throw new Error('no HTTP expected'); } }, limiter: { check: async () => ({ allowed: true }) },
      state: () => ({ get: async () => null }), apiOrigins: async () => [], issuedTokens: createIssuedTokenMemories() },
    isActive: async () => true, applyApproval: ({ registration }) => registration, withExtensionApprovalPolicy: ({ registration }) => registration,
  });
  assert.equal(bound.toolPermission, 'admin.assistant.use');
});
