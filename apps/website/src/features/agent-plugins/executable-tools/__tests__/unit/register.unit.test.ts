import { withExtensionApprovalPolicy } from "../../../../../assistant/assistant-tool-approval-policy.js";
/**
 * @file Unit tests for `register.ts`: how each admitted plugin tool is projected onto the registry
 * (approval family by declared effect, a missing effect treated as destructive, no parked executor
 * confirmation, no deadline while a human reads the card), refusal pass-through, the optional
 * artifact writer, and `dispose`. A recording approval owner stands in for `applyToolApprovalPolicy`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createToolRegistry, type ToolDescriptor, type ToolRegistration } from '@jini-ai/core';
import { createToolExecutor } from '@jini-ai/daemon';
import { createIssuedTokenMemories, type AgentPluginToolModule, type LoadedAgentPluginTool } from '@jini-ai/agent-plugins/lifecycle/tools';

import { AGENT_PLUGIN_TOOLS_FILENAME, registerAgentPluginExecutableTools, type AgentPluginExecutableToolHost, type ApplyAgentPluginApproval } from '../../register.js';
import type { AgentPluginArtifactWriter } from '../../host-capabilities.js';
import { allowAll, fakeConnections, fakeHttp, PLUGIN, WORKSPACE } from '../fixtures.js';

const schema = { type: 'object', additionalProperties: true, properties: { connectionRef: { type: 'string' } } };
const confirmingModule: AgentPluginToolModule = { async invoke() { return { done: true }; }, describeAffectedResources: () => ['row 1'] };

function tool(name: string, effect: LoadedAgentPluginTool['descriptor']['effect'], module: AgentPluginToolModule = confirmingModule): LoadedAgentPluginTool {
  return { pluginId: PLUGIN, module, descriptor: { name, description: `The ${name} tool.`, effect, module: `tools/${name}.mjs`, inputSchema: schema } };
}

async function register(items: readonly LoadedAgentPluginTool[], options: { readonly refusals?: readonly string[]; readonly artifacts?: AgentPluginArtifactWriter; readonly loadContributions?: AgentPluginExecutableToolHost['loadContributions'] } = {}) {
  const registry = createToolRegistry({});
  const wrapped: Array<{ registration: ToolRegistration; hasDisclose: boolean }> = [];
  const loads: Array<{ workspaceId: string; filename: string; orderByPluginId: boolean | undefined }> = [];
  const applyApproval: ApplyAgentPluginApproval = ({ registration }, { disclose }) => { wrapped.push({ registration, hasDisclose: typeof disclose === 'function' }); return registration; };
  const host: AgentPluginExecutableToolHost = {
    loadContributions: async (required, optional) => {
      loads.push({ workspaceId: required.workspaceId, filename: required.definition.filename, orderByPluginId: optional.orderByPluginId });
      return options.loadContributions ? options.loadContributions(required, optional) : { items, refusals: options.refusals ?? [] };
    },
    connections: fakeConnections({ accountId: 'alice' }).connections, http: fakeHttp().http,
    limiter: { check: async () => ({ allowed: true }) }, state: () => ({ get: async () => null }),
    apiOrigins: async () => ['https://api.acme.test'], issuedTokens: createIssuedTokenMemories(),
    ...(options.artifacts ? { artifacts: options.artifacts } : {}),
  };
  const registered = await registerAgentPluginExecutableTools({ withExtensionApprovalPolicy, registry, workspaceId: WORKSPACE, host, isActive: async () => true, authorize: allowAll, applyApproval });
  const descriptor = (id: string): ToolDescriptor | undefined => registry.list({}).find((entry) => entry.id === id);
  return { registry, registered, wrapped, loads, descriptor };
}

test('the contributions are loaded once for the workspace, from the tools file, ordered by plugin id', async () => {
  const { loads } = await register([tool('read_rows', 'read')]);
  assert.equal(AGENT_PLUGIN_TOOLS_FILENAME, 'tovu-agent-tools.json');
  assert.deepEqual(loads, [{ workspaceId: WORKSPACE, filename: 'tovu-agent-tools.json', orderByPluginId: true }]);
});

test('a read tool runs directly: classified agent-plugin-read, never wrapped in the approval card, deadline kept', async () => {
  const { wrapped, descriptor } = await register([tool('read_rows', 'read')]);
  const read = descriptor('p_acme_office__read_rows');
  assert.deepEqual(read?.metadata?.approval, { class: 'read', confirmation: 'direct' });
  assert.equal(read?.timeoutMs, 30_000);
  assert.equal(read?.requiresConfirmation, undefined);
  assert.deepEqual(wrapped, []);
});

test('a write tool asks through the approval owner with a disclosure, as agent-plugin-write, with no executor deadline', async () => {
  const { wrapped, descriptor } = await register([tool('append_rows', 'write')]);
  assert.equal(wrapped.length, 1);
  assert.equal(wrapped[0]!.hasDisclose, true);
  const write = descriptor('p_acme_office__append_rows');
  assert.deepEqual(write?.metadata?.approval, { class: 'publish', confirmation: 'policy' });
  assert.equal(write?.timeoutMs, undefined);
  assert.equal(write?.requiresConfirmation, undefined);
});

test('a destructive tool asks as agent-plugin-destructive (a delete, danger styling)', async () => {
  const { wrapped, descriptor } = await register([tool('clear_table', 'destructive')]);
  assert.equal(wrapped.length, 1);
  assert.deepEqual(descriptor('p_acme_office__clear_table')?.metadata?.approval, { class: 'delete', confirmation: 'policy' });
});

test('a tool whose loader reports no effect is treated as destructive (the most friction)', async () => {
  // Malformed-input fixture: the manifest parser always sets an effect, but the loader is a host
  // port, so this pins the fail-safe default instead of trusting it.
  const withoutEffect = { ...tool('mystery', 'write'), descriptor: { ...tool('mystery', 'write').descriptor, effect: undefined } } as unknown as LoadedAgentPluginTool;
  const { wrapped, descriptor } = await register([withoutEffect]);
  assert.equal(wrapped.length, 1);
  assert.deepEqual(descriptor('p_acme_office__mystery')?.metadata?.approval, { class: 'delete', confirmation: 'policy' });
});

test('loader refusals and projection refusals are both returned, and a refused tool is not registered', async () => {
  // A write tool without describeAffectedResources is refused by the projection.
  const undisclosed: AgentPluginToolModule = { async invoke() { return {}; } };
  const { registered, descriptor } = await register([tool('append_rows', 'write', undisclosed)], { refusals: ['loader: tools/bad.mjs is outside the package'] });
  assert.equal(registered.refusals[0], 'loader: tools/bad.mjs is outside the package');
  assert.equal(registered.refusals.length, 2);
  assert.match(registered.refusals[1]!, /must export describeAffectedResources/);
  assert.equal(descriptor('p_acme_office__append_rows'), undefined);
});

test('a bound artifact writer reaches the tool, scoped to the calling plugin and workspace', async () => {
  const writes: Array<Parameters<AgentPluginArtifactWriter['write']>[0]> = [];
  const artifacts: AgentPluginArtifactWriter = { async write(input) { writes.push(input); return { artifactRef: 'artifact-1' }; } };
  const exporter: AgentPluginToolModule = {
    async invoke({ capabilities }) { return capabilities.artifacts ? capabilities.artifacts.write({ name: 'rows.csv', mediaType: 'text/csv', content: 'a,b' }) : { missing: true }; },
  };
  const { registry } = await register([tool('export_rows', 'read', exporter)], { artifacts });
  const result = await createToolExecutor({ registry }).execute({ toolId: 'p_acme_office__export_rows', principal: { id: 'owner' }, run: { id: 'run' }, input: {} });
  assert.equal(result.status, 'completed');
  assert.deepEqual(writes, [{ name: 'rows.csv', mediaType: 'text/csv', content: 'a,b', workspaceId: WORKSPACE, pluginId: PLUGIN }]);
});

test('dispose removes every plugin tool from the registry', async () => {
  const { registry, registered } = await register([tool('read_rows', 'read'), tool('append_rows', 'write')]);
  assert.equal(registry.has({ toolId: 'p_acme_office__read_rows' }), true);
  registered.dispose();
  assert.equal(registry.has({ toolId: 'p_acme_office__read_rows' }), false);
  assert.equal(registry.has({ toolId: 'p_acme_office__append_rows' }), false);
});

test('T14: an older refresh cannot restore tools withdrawn by a newer refresh', async () => {
  type Load = Awaited<ReturnType<AgentPluginExecutableToolHost['loadContributions']>>;
  const stale = Promise.withResolvers<Load>();
  const original: Load = { items: [tool('read_rows', 'read')], refusals: [] };
  let loads = 0;
  const { registry, registered } = await register([], { loadContributions: async () => {
    loads += 1;
    if (loads === 1) return original;
    // Refresh 1 captured the enabled plugin before it was disabled, then stalled.
    if (loads === 2) return stale.promise;
    // Refresh 2 sees the disabled plugin and withdraws its contributions.
    return { items: [], refusals: [] };
  } });
  assert.equal(registry.has({ toolId: 'p_acme_office__read_rows' }), true);
  const pending = Promise.all([registered.refresh(), registered.refresh()]);
  try {
    // Drain the ready refresh before releasing the old snapshot. A serialized implementation
    // can also proceed: this turn boundary never waits for refresh 2 to finish behind refresh 1.
    await new Promise<void>(resolve => setImmediate(resolve));
    stale.resolve(original);
    await pending;

    assert.equal(registry.has({ toolId: 'p_acme_office__read_rows' }), false);
  } finally {
    stale.resolve(original);
    await pending;
    registered.dispose();
  }
});
