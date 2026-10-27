/**
 * @file Unit tests for `approval.ts`: the effect → approval-family map and the disclosure step that
 * builds the card's extra rows and freezes the call's accounts. Typed fakes for the projection's
 * disclosure source, the connection accessor and the frozen-account map; the T13 cases run the real
 * frozen map and capability port so a replay against another connection is refused end to end.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { ToolExecutionContext } from '@jini-ai/core';
import type { AgentPluginToolDisclosure } from '@jini-ai/agent-plugins/lifecycle/tools';

import { APPROVAL_FAMILY_BY_EFFECT, NOT_CONNECTED_MESSAGE, TOOL_WITHDRAWN_MESSAGE, createAgentPluginDisclosure, type AgentPluginDisclosureSource } from '../../approval.js';
import {
  UNAPPROVED_CONNECTION_MESSAGE, createAgentPluginToolCapabilities, createFrozenConnectionAccounts,
  type AgentPluginConnectionAccess, type AgentPluginConnectionTarget, type FrozenConnectionAccounts,
} from '../../host-capabilities.js';

const TARGET = { toolId: 'p_acme_office__append_rows', pluginId: 'acme-office', workspaceId: 'ws-1' } as const;

function contextFor(input: unknown, signal: AbortSignal = new AbortController().signal): ToolExecutionContext {
  return { executionId: 'exec-1', principal: { id: 'owner' }, run: { id: 'run-1' }, input, signal };
}

function harness(options: { readonly disclosure?: AgentPluginToolDisclosure | null; readonly account?: { accountId: string; displayName: string } | null } = {}) {
  const asked: Array<{ toolId: string; input: unknown }> = [];
  const accountReads: AgentPluginConnectionTarget[] = [];
  const binds: Array<{ signal: AbortSignal; accounts: ReadonlyMap<string, string> }> = [];
  const source: AgentPluginDisclosureSource = {
    async describeAffectedResources(required) { asked.push(required); return options.disclosure === undefined ? { effect: 'write', resources: ['table Orders', 'table Invoices'] } : options.disclosure; },
  };
  const connections: AgentPluginConnectionAccess = {
    async readAccount(target) { accountReads.push(target); return options.account === undefined ? { accountId: 'acct-7', displayName: 'Alice (alice@acme.test)' } : options.account; },
    async getAccessToken() { throw new Error('the disclosure step must never request a token'); },
  };
  const frozen: FrozenConnectionAccounts = { bind: (required) => { binds.push(required); }, lookup: () => undefined };
  return { disclose: createAgentPluginDisclosure({ source, connections, frozen }), asked, accountReads, binds };
}

test('each declared effect maps to its own reviewed approval family', () => {
  assert.deepEqual(APPROVAL_FAMILY_BY_EFFECT, { read: 'agent-plugin-read', write: 'agent-plugin-write', destructive: 'agent-plugin-destructive' });
});

test('a call with a connectionRef gets an Account row first, then one Affects row per resource', async () => {
  const { disclose, asked } = harness();
  const input = { connectionRef: 'conn-1', table: 'Orders' };
  const rows = await disclose({ ctx: contextFor(input), ...TARGET });
  assert.deepEqual(rows, [
    { label: 'Account', value: 'Alice (alice@acme.test)' },
    { label: 'Affects', value: 'table Orders' },
    { label: 'Affects', value: 'table Invoices' },
  ]);
  assert.deepEqual(asked, [{ toolId: TARGET.toolId, input }]);
});

test('the account is read for the calling plugin and workspace with the call\'s own connectionRef', async () => {
  const { disclose, accountReads } = harness();
  await disclose({ ctx: contextFor({ connectionRef: 'conn-1' }), ...TARGET });
  assert.deepEqual(accountReads, [{ workspaceId: 'ws-1', pluginId: 'acme-office', connectionRef: 'conn-1' }]);
});

test('the shown account is frozen against the call\'s own abort signal', async () => {
  const { disclose, binds } = harness();
  const signal = new AbortController().signal;
  await disclose({ ctx: contextFor({ connectionRef: 'conn-1' }, signal), ...TARGET });
  assert.equal(binds.length, 1);
  assert.equal(binds[0]!.signal, signal);
  assert.deepEqual([...binds[0]!.accounts], [['conn-1', 'acct-7']]);
});

test('a withdrawn tool (no disclosure) is refused with the withdrawn message before any account read', async () => {
  const { disclose, accountReads } = harness({ disclosure: null });
  await assert.rejects(disclose({ ctx: contextFor({ connectionRef: 'conn-1' }), ...TARGET }), { message: TOOL_WITHDRAWN_MESSAGE });
  assert.deepEqual(accountReads, []);
});

test('a connection that is not connected is refused with the reconnect message and nothing is frozen', async () => {
  const { disclose, binds } = harness({ account: null });
  await assert.rejects(disclose({ ctx: contextFor({ connectionRef: 'conn-1' }), ...TARGET }), { message: NOT_CONNECTED_MESSAGE });
  assert.deepEqual(binds, []);
});

test('an input without a connectionRef shows only the affected resources and reads no account', async () => {
  const { disclose, accountReads, binds } = harness();
  const rows = await disclose({ ctx: contextFor({ table: 'Orders' }), ...TARGET });
  assert.deepEqual(rows, [{ label: 'Affects', value: 'table Orders' }, { label: 'Affects', value: 'table Invoices' }]);
  assert.deepEqual(accountReads, []);
  assert.deepEqual(binds, []);
});

test('a non-string connectionRef is not treated as a connection (no account read, no freeze)', async () => {
  const { disclose, accountReads, binds } = harness();
  await disclose({ ctx: contextFor({ connectionRef: 42 }), ...TARGET });
  assert.deepEqual(accountReads, []);
  assert.deepEqual(binds, []);
});

test('a null or non-object input carries no connectionRef', async () => {
  const { disclose, accountReads } = harness();
  for (const input of [null, 'conn-1', undefined]) await disclose({ ctx: contextFor(input), ...TARGET });
  assert.deepEqual(accountReads, []);
});

/** The real frozen map and capability port behind a fake connection accessor that records token asks. */
function enforcingHarness() {
  const tokenCalls: Array<{ target: AgentPluginConnectionTarget; optional: { expectedAccountId?: string } | undefined }> = [];
  const connections: AgentPluginConnectionAccess = {
    async readAccount({ connectionRef }) { return { accountId: `acct-${connectionRef}`, displayName: `Account ${connectionRef}` }; },
    async getAccessToken(target, optional) { tokenCalls.push({ target, optional }); return 'token-value'; },
  };
  const frozen = createFrozenConnectionAccounts();
  const source: AgentPluginDisclosureSource = { async describeAffectedResources() { return { effect: 'write', resources: [] }; } };
  const port = createAgentPluginToolCapabilities({
    connections, http: { async send() { throw new Error('no HTTP in these cases'); } }, limiter: { check: async () => ({ allowed: true }) }, frozen,
    state: () => ({ get: async () => null }), apiOrigins: async () => [],
  });
  const capabilitiesFor = (signal: AbortSignal) => port({ pluginId: TARGET.pluginId, workspaceId: TARGET.workspaceId, signal });
  return { disclose: createAgentPluginDisclosure({ source, connections, frozen }), capabilitiesFor, tokenCalls };
}

test('T13: an approval for nested connection A is refused when the call asks for nested connection B', async () => {
  const { disclose, capabilitiesFor, tokenCalls } = enforcingHarness();
  const signal = new AbortController().signal;
  const rows = await disclose({ ctx: contextFor({ target: { connectionRef: 'conn-A', table: 'Orders' } }, signal), ...TARGET });
  assert.deepEqual(rows, [{ label: 'Account', value: 'Account conn-A' }]);
  const capabilities = capabilitiesFor(signal);
  await assert.rejects(capabilities.connections.getAccessToken({ connectionRef: 'conn-B' }), { message: UNAPPROVED_CONNECTION_MESSAGE });
  await capabilities.connections.getAccessToken({ connectionRef: 'conn-A' });
  assert.deepEqual(tokenCalls, [{ target: { workspaceId: 'ws-1', pluginId: 'acme-office', connectionRef: 'conn-A' }, optional: { expectedAccountId: 'acct-conn-A' } }]);
});

test('T13: a write tool whose input names no connection binds nothing and still runs', async () => {
  const { disclose, capabilitiesFor, tokenCalls } = enforcingHarness();
  const signal = new AbortController().signal;
  const rows = await disclose({ ctx: contextFor({ target: { table: 'Orders' } }, signal), ...TARGET });
  assert.deepEqual(rows, []);
  await capabilitiesFor(signal).connections.getAccessToken({ connectionRef: 'conn-default' });
  assert.deepEqual(tokenCalls, [{ target: { workspaceId: 'ws-1', pluginId: 'acme-office', connectionRef: 'conn-default' }, optional: {} }]);
});

test('T13: every connection in the arguments is bound, through arrays and nested objects, the top-level one first', async () => {
  const { disclose, binds } = harness({ disclosure: { effect: 'write', resources: [] } });
  await disclose({ ctx: contextFor({ source: { connectionRef: 'conn-1' }, copies: [{ connectionRef: 'conn-2' }, 'plain', { connectionRef: 'conn-1' }], connectionRef: 'conn-0' }), ...TARGET });
  assert.deepEqual([...binds[0]!.accounts.keys()], ['conn-0', 'conn-1', 'conn-2']);
});

test('T13: a connectionRef key inside free-form data is bound too, so an unconnected one refuses the call', async () => {
  const { disclose, accountReads, binds } = harness({ account: null });
  await assert.rejects(disclose({ ctx: contextFor({ target: { table: 'Orders' }, values: { connectionRef: 'typed-by-the-user' } }), ...TARGET }), { message: NOT_CONNECTED_MESSAGE });
  assert.deepEqual(accountReads.map(target => target.connectionRef), ['typed-by-the-user']);
  assert.deepEqual(binds, []);
});

test('T13: one unconnected connection among several refuses the call and freezes nothing', async () => {
  const binds: Array<ReadonlyMap<string, string>> = [];
  const connections: AgentPluginConnectionAccess = {
    async readAccount({ connectionRef }) { return connectionRef === 'conn-2' ? null : { accountId: 'acct-1', displayName: 'Alice' }; },
    async getAccessToken() { throw new Error('the disclosure step must never request a token'); },
  };
  const disclose = createAgentPluginDisclosure({
    source: { async describeAffectedResources() { return { effect: 'write', resources: [] }; } }, connections,
    frozen: { bind: ({ accounts }) => { binds.push(accounts); }, lookup: () => undefined },
  });
  await assert.rejects(disclose({ ctx: contextFor({ a: { connectionRef: 'conn-1' }, b: { connectionRef: 'conn-2' } }), ...TARGET }), { message: NOT_CONNECTED_MESSAGE });
  assert.deepEqual(binds, []);
});

/** Input shapes each JSON Schema construct allows. Binding reads the argument values, so none can hide a connection. */
const SCHEMA_CONSTRUCT_INPUTS = {
  '$ref (recursive)': { tree: { connectionRef: 'conn-1', children: [{ children: [{ connectionRef: 'conn-2' }] }] } },
  patternProperties: { sheet_1: { connectionRef: 'conn-1' }, notes: { connectionRef: 'conn-2' } },
  'prefixItems / tuple items': { pair: ['label', { connectionRef: 'conn-1' }, [{ connectionRef: 'conn-2' }]] },
  'if / then / else': { mode: 'copy', destination: { connectionRef: 'conn-1' }, backup: { connectionRef: 'conn-2' } },
  'dependentSchemas / not / unevaluatedProperties': { extra: { deep: { deeper: { connectionRef: 'conn-1' } } }, other: [[{ connectionRef: 'conn-2' }]] },
} as const;

test('T13: connections in input shaped by $ref, patternProperties, tuples, if/then/else and other constructs are all bound', async () => {
  for (const [construct, input] of Object.entries(SCHEMA_CONSTRUCT_INPUTS)) {
    const { disclose, binds } = harness({ disclosure: { effect: 'write', resources: [] } });
    await disclose({ ctx: contextFor(input), ...TARGET });
    assert.deepEqual([...binds[0]!.accounts.keys()], ['conn-1', 'conn-2'], construct);
  }
});
