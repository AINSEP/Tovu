/**
 * @file Unit tests for `approval.ts`: the effect → approval-family map and the disclosure step that
 * builds the card's extra rows and freezes the call's account. Typed fakes for the projection's
 * disclosure source, the connection accessor and the frozen-account map; vendor-neutral ids.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { ToolExecutionContext } from '@jini-ai/core';
import type { AgentPluginToolDisclosure } from '@jini-ai/agent-plugins/lifecycle/tools';

import { APPROVAL_FAMILY_BY_EFFECT, NOT_CONNECTED_MESSAGE, TOOL_WITHDRAWN_MESSAGE, createAgentPluginDisclosure, type AgentPluginDisclosureSource } from '../../approval.js';
import type { AgentPluginConnectionAccess, AgentPluginConnectionTarget, FrozenConnectionAccounts } from '../../host-capabilities.js';

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
