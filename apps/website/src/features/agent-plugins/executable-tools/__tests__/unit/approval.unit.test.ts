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

/** A schema whose connection sits one level down, the shape the T13 finding names. */
const NESTED_SCHEMA = {
  type: 'object',
  properties: { target: { type: 'object', properties: { connectionRef: { type: 'string' }, table: { type: 'string' } } }, values: { type: 'object' } },
} as const;

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
  const rows = await disclose({ ctx: contextFor({ target: { connectionRef: 'conn-A', table: 'Orders' } }, signal), ...TARGET }, { inputSchema: NESTED_SCHEMA });
  assert.deepEqual(rows, [{ label: 'Account', value: 'Account conn-A' }]);
  const capabilities = capabilitiesFor(signal);
  await assert.rejects(capabilities.connections.getAccessToken({ connectionRef: 'conn-B' }), { message: UNAPPROVED_CONNECTION_MESSAGE });
  await capabilities.connections.getAccessToken({ connectionRef: 'conn-A' });
  assert.deepEqual(tokenCalls, [{ target: { workspaceId: 'ws-1', pluginId: 'acme-office', connectionRef: 'conn-A' }, optional: { expectedAccountId: 'acct-conn-A' } }]);
});

test('T13: a write tool whose input names no connection binds nothing and still runs', async () => {
  const { disclose, capabilitiesFor, tokenCalls } = enforcingHarness();
  const signal = new AbortController().signal;
  const rows = await disclose({ ctx: contextFor({ target: { table: 'Orders' } }, signal), ...TARGET }, { inputSchema: NESTED_SCHEMA });
  assert.deepEqual(rows, []);
  await capabilitiesFor(signal).connections.getAccessToken({ connectionRef: 'conn-default' });
  assert.deepEqual(tokenCalls, [{ target: { workspaceId: 'ws-1', pluginId: 'acme-office', connectionRef: 'conn-default' }, optional: {} }]);
});

test('T13: every connection the schema declares is bound, through arrays and anyOf branches', async () => {
  const { disclose, binds } = harness({ disclosure: { effect: 'write', resources: [] } });
  const inputSchema = {
    type: 'object',
    properties: {
      copies: { type: 'array', items: { anyOf: [{ type: 'object', properties: { connectionRef: { type: 'string' } } }, { type: 'string' }] } },
      source: { type: 'object', properties: { connectionRef: { type: 'string' } } },
    },
  };
  await disclose({ ctx: contextFor({ source: { connectionRef: 'conn-1' }, copies: [{ connectionRef: 'conn-2' }, 'plain', { connectionRef: 'conn-1' }] }), ...TARGET }, { inputSchema });
  assert.deepEqual([...binds[0]!.accounts.keys()], ['conn-1', 'conn-2']);
});

test('T13: a connectionRef key inside data the schema does not declare as one is the user\'s data, not a connection', async () => {
  const { disclose, accountReads, binds } = harness();
  await disclose({ ctx: contextFor({ target: { table: 'Orders' }, values: { connectionRef: 'typed-by-the-user' } }), ...TARGET }, { inputSchema: NESTED_SCHEMA });
  assert.deepEqual(accountReads, []);
  assert.deepEqual(binds, []);
});

test('T13: without a schema every nested connectionRef is bound, so none is left unpinned', async () => {
  const { disclose, binds } = harness();
  await disclose({ ctx: contextFor({ target: { connectionRef: 'conn-1' }, rows: [{ connectionRef: 'conn-2' }] }), ...TARGET });
  assert.deepEqual([...binds[0]!.accounts.keys()], ['conn-1', 'conn-2']);
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

test('T13: a connection declared through a local $ref is bound, so its approval cannot be used on another connection', async () => {
  const { disclose, capabilitiesFor, tokenCalls } = enforcingHarness();
  const signal = new AbortController().signal;
  const inputSchema = {
    type: 'object', properties: { target: { $ref: '#/definitions/Target' } },
    definitions: { Target: { type: 'object', properties: { connectionRef: { type: 'string' }, table: { type: 'string' } } } },
  };
  await disclose({ ctx: contextFor({ target: { connectionRef: 'conn-A', table: 'Orders' } }, signal), ...TARGET }, { inputSchema });
  await assert.rejects(capabilitiesFor(signal).connections.getAccessToken({ connectionRef: 'conn-B' }), { message: UNAPPROVED_CONNECTION_MESSAGE });
  assert.deepEqual(tokenCalls, []);
});

test('T13: patternProperties declare connections; additionalProperties covers only keys no pattern matches', async () => {
  const { disclose, binds } = harness({ disclosure: { effect: 'write', resources: [] } });
  const inputSchema = {
    type: 'object',
    patternProperties: { '^sheet_': { type: 'object', properties: { connectionRef: { type: 'string' } } } },
    additionalProperties: { type: 'object' },
  };
  await disclose({ ctx: contextFor({ sheet_1: { connectionRef: 'conn-1' }, notes: { connectionRef: 'typed-by-the-user' } }), ...TARGET }, { inputSchema });
  assert.deepEqual([...binds[0]!.accounts.keys()], ['conn-1']);
});

test('T13: recursive and cyclic $refs end; a $ref the walk cannot resolve is scanned, so no connection is left unbound', async () => {
  const { disclose, binds } = harness({ disclosure: { effect: 'write', resources: [] } });
  const inputSchema = {
    type: 'object',
    properties: { tree: { $ref: '#/$defs/Node' }, loop: { $ref: '#/$defs/Loop' }, remote: { $ref: 'https://example.test/remote.json' } },
    $defs: {
      Node: { type: 'object', properties: { connectionRef: { type: 'string' }, children: { type: 'array', items: { $ref: '#/$defs/Node' } } } },
      Loop: { anyOf: [{ $ref: '#/$defs/Loop' }] },
    },
  };
  const input = { tree: { connectionRef: 'conn-1', children: [{ connectionRef: 'conn-2' }] }, loop: { connectionRef: 'typed-by-the-user' }, remote: { deep: { connectionRef: 'conn-3' } } };
  await disclose({ ctx: contextFor(input), ...TARGET }, { inputSchema });
  assert.deepEqual([...binds[0]!.accounts.keys()], ['conn-1', 'conn-2', 'conn-3']);
});
