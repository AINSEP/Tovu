import { withExtensionApprovalPolicy } from "../../../../assistant/assistant-tool-approval-policy.js";
/**
 * @file Shared typed fakes for the executable Agent Plugin tool tests: a vendor-neutral
 * "acme-office" plugin with one read and one write tool, a connection accessor, an HTTP port that
 * never touches the network, and a confirmation driver for the real surface-exchange store.
 */
import { createToolRegistry, type ToolRegistry } from '@jini-ai/core';
import { createToolExecutor } from '@jini-ai/daemon';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createSystemClock, createRandomUuidGenerator, type HttpClientPort, type HttpRequest } from '@jini-ai/core/primitives';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { createIssuedTokenMemories, type LoadedAgentPluginTool, type AgentPluginToolModule } from '@jini-ai/agent-plugins/lifecycle/tools';
import type { AuthorizeFn } from '../../../../contracts/core/commands/index.js';
import { applyToolApprovalPolicy } from '../../../../assistant/tool-approval-policy.js';
import { registerAgentPluginExecutableTools, type AgentPluginExecutableToolHost } from '../register.js';
import type { AgentPluginConnectionAccess, AgentPluginConnectionTarget } from '../host-capabilities.js';

export const WORKSPACE = 'ws-1';
export const PLUGIN = 'acme-office';
// Built at runtime so no secret-shaped literal is committed.
export const TOKEN = 'acme-' + 'tok-' + 'x'.repeat(32);

const schema = { type: 'object', required: ['connectionRef', 'table'], additionalProperties: false,
  properties: { connectionRef: { type: 'string' }, table: { type: 'string' }, values: { type: 'array', items: { type: 'string' } }, note: { type: 'object' } } };

export function acmeTools(calls: { input: unknown; token: string }[]): LoadedAgentPluginTool[] {
  const append: AgentPluginToolModule = {
    async invoke({ input, capabilities }) {
      const token = await capabilities.connections.getAccessToken({ connectionRef: String(input.connectionRef) });
      const response = await capabilities.http.fetch({ url: 'https://api.acme.test/tables/append' }, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input.values) });
      calls.push({ input, token });
      return { appended: (input.values as unknown[]).length, status: response.status };
    },
    describeAffectedResources: ({ input }) => [`table ${String(input.table)}`],
  };
  const read: AgentPluginToolModule = { async invoke({ input }) { calls.push({ input, token: '' }); return { rows: [] }; } };
  return [
    { pluginId: PLUGIN, module: append, descriptor: { name: 'append_rows', description: 'Append rows to a table.', effect: 'write', module: 'tools/append.mjs', inputSchema: schema } },
    { pluginId: PLUGIN, module: read, descriptor: { name: 'read_rows', description: 'Read rows from a table.', effect: 'read', module: 'tools/read.mjs', inputSchema: schema } },
  ];
}

/** A connection accessor that owns exactly one ref for (WORKSPACE, PLUGIN); `account` can be switched. */
export function fakeConnections(state: { accountId: string }) {
  const tokenRequests: { target: AgentPluginConnectionTarget; expectedAccountId?: string }[] = [];
  const owns = (target: AgentPluginConnectionTarget) => target.workspaceId === WORKSPACE && target.pluginId === PLUGIN && target.connectionRef === 'conn-1';
  const connections: AgentPluginConnectionAccess = {
    async readAccount(target) { return owns(target) ? { accountId: state.accountId, displayName: `${state.accountId}@acme.test` } : null; },
    async getAccessToken(target, optional = {}) {
      tokenRequests.push({ target, ...(optional.expectedAccountId === undefined ? {} : { expectedAccountId: optional.expectedAccountId }) });
      if (!owns(target)) throw new Error('connection not found');
      if (optional.expectedAccountId !== undefined && optional.expectedAccountId !== state.accountId) throw new Error('account-changed');
      return TOKEN;
    },
  };
  return { connections, tokenRequests };
}

/** An HTTP port that records requests and answers 200 without any network. */
export function fakeHttp() {
  const requests: HttpRequest[] = [];
  const http: HttpClientPort = { async send({ request }) { requests.push(request); return { status: 200, headers: {}, bodyText: '{}' }; } };
  return { http, requests };
}

export const allowAll: AuthorizeFn = async () => ({ allowed: true, reason: 'test' });

/** Registers the fixture plugin on a fresh registry through the real registrar and approval owner. */
export async function bootFixture(options: { readonly active?: () => boolean; readonly authorize?: AuthorizeFn; readonly accountId?: string; readonly extraTools?: readonly LoadedAgentPluginTool[] } = {}) {
  const calls: { input: unknown; token: string }[] = [];
  const account = { accountId: options.accountId ?? 'alice' };
  const { connections, tokenRequests } = fakeConnections(account);
  const { http, requests } = fakeHttp();
  const surfaces = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' }) };
  const registry: ToolRegistry = createToolRegistry({});
  const loadContributions: AgentPluginExecutableToolHost['loadContributions'] = async () => ({ items: [...acmeTools(calls), ...(options.extraTools ?? [])], refusals: [] });
  const registered = await registerAgentPluginExecutableTools({ withExtensionApprovalPolicy,
    registry, workspaceId: WORKSPACE, authorize: options.authorize ?? allowAll,
    host: { loadContributions, connections, http, limiter: { check: async () => ({ allowed: true }) }, state: () => ({ get: async () => null }), apiOrigins: async () => ['https://api.acme.test'], issuedTokens: createIssuedTokenMemories() },
    isActive: async () => options.active?.() ?? true,
    applyApproval: ({ registration }, { disclose }) => applyToolApprovalPolicy({ registration, surfaces }, { disclose }),
  });
  return { registry, executor: createToolExecutor({ registry }), surfaces, calls, account, tokenRequests, requests, registered };
}

/** Starts a confirming call and returns the card's rows plus a way to answer it. */
export async function startConfirmingCall(fixture: Pick<Awaited<ReturnType<typeof bootFixture>>, 'executor' | 'surfaces'>, toolId: string, input: unknown) {
  let html = '';
  const pending = fixture.executor.execute({ toolId, principal: { id: 'owner' }, run: { id: 'run' }, input }, {
    emitSurface: async (emission) => { html = (emission.payload as { resource: { resource: { text: string } } }).resource.resource.text; },
  });
  const settled = pending.then(() => true);
  while (html === '' && !(await Promise.race([settled, new Promise<false>((resolve) => setImmediate(() => resolve(false)))]))) { /* wait for the card */ }
  const exchangeId = html.match(/__exchangeId"\s*:\s*"([^"]+)"/)?.[1] ?? '';
  const rows = [...html.matchAll(/<dt>([^<]+)<\/dt><dd>([^<]*)<\/dd>/g)].map((match) => [match[1], match[2]] as const);
  const answer = (decision: 'confirm' | 'cancel') => fixture.surfaces.surfaceExchanges.deliver({ exchangeId, principalId: 'owner', params: { decision } }, { toolId });
  return { pending, rows, answer, html };
}
