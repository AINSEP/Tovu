/**
 * @file Test harness for the Sheets admin tools: boots the plugin's REAL `tovu-agent-tools.json` and
 * modules through Jini's tool contribution definition (parse + contained module load) and Tovu's
 * real registrar, approval owner and host capabilities, over the local fake Google. Also builds the
 * per-call capabilities a module receives, for pins that call one module directly.
 *
 * The only transport is the fake's `fetch` (127.0.0.1, throws for every non-Google host). The token
 * is minted at runtime and is not secret-shaped.
 */
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { createToolRegistry } from '@jini-ai/core';
import { createRandomUuidGenerator, createSystemClock } from '@jini-ai/core/primitives';
import { createToolExecutor } from '@jini-ai/daemon';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createIssuedTokenMemories, defineAgentPluginToolContribution } from '@jini-ai/agent-plugins/lifecycle/tools';

import { applyToolApprovalPolicy } from '../../../../apps/website/src/assistant/tool-approval-policy.ts';
import { withExtensionApprovalPolicy } from '../../../../apps/website/src/assistant/assistant-tool-approval-policy.ts';
import { registerAgentPluginExecutableTools } from '../../../../apps/website/src/features/agent-plugins/executable-tools/register.ts';

export const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PLUGIN = 'google-workspace';
export const WORKSPACE = 'ws-1';
export const CONNECTION = 'conn-google-1';
export const SPREADSHEET = 'sheet1234567890abcdef';
export const TOKEN = `fake-access-${randomBytes(12).toString('hex')}`;
/** Plugin settings with the Sheets product on (products are off until the panel turns them on). */
export const SHEETS_ON = Object.freeze({ get: async ({ key }) => (key === 'products' ? { sheets: true } : null) });

/** The plugin's declared tools, loaded the way the host loader loads them. */
export async function loadPluginTools() {
  const definition = defineAgentPluginToolContribution({ filename: 'tovu-agent-tools.json' });
  const parsed = definition.parse({ raw: await readFile(path.join(PLUGIN_ROOT, 'tovu-agent-tools.json'), 'utf8') });
  if (!parsed.ok) throw new Error(parsed.reason);
  const plugin = { pluginId: PLUGIN, packageRoot: PLUGIN_ROOT };
  const importModule = async ({ modulePath }) => ({ exported: (await import(pathToFileURL(path.join(PLUGIN_ROOT, modulePath)).href)).default });
  return Promise.all(parsed.descriptors.map((descriptor) => definition.load({ plugin, descriptor, importModule })));
}

/** The host's `apiOrigins` port, answered from the plugin's own `tovu-connections.json` (what the real host reads). */
async function declaredApiOrigins() {
  const declared = JSON.parse(await readFile(new URL('../tovu-connections.json', import.meta.url), 'utf8'));
  return declared.connections.flatMap((connection) => connection.apiOrigins ?? []);
}

/** Tovu's HttpClientPort over the fake's fetch (which refuses every non-Google host). */
function httpPortOver(fake) {
  return {
    async send({ request }) {
      const response = await fake.fetch({ url: request.url }, { method: request.method, headers: request.headers, ...(request.body === undefined ? {} : { body: request.body }) });
      return { status: response.status, headers: Object.fromEntries(response.headers), bodyText: await response.text() };
    },
  };
}

/** A connection accessor owning one ref, signed in as alice. */
function connectionsFor(tokenRequests) {
  const owns = (target) => target.workspaceId === WORKSPACE && target.pluginId === PLUGIN && target.connectionRef === CONNECTION;
  return {
    async readAccount(target) { return owns(target) ? { accountId: 'perm-alice', displayName: 'alice@example.test' } : null; },
    async getAccessToken(target, optional = {}) {
      tokenRequests.push({ target, ...optional });
      if (!owns(target)) throw Object.assign(new Error('connection not found'), { code: 'connection-not-found' });
      return TOKEN;
    },
  };
}

/** Registers every plugin tool on a fresh registry through the real registrar and approval owner. */
export async function bootPluginTools({ fake }) {
  const tokenRequests = [];
  const surfaces = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' }) };
  const registry = createToolRegistry({});
  const items = await loadPluginTools();
  const registered = await registerAgentPluginExecutableTools({
    withExtensionApprovalPolicy,
    registry, workspaceId: WORKSPACE, authorize: async () => ({ allowed: true, reason: 'test' }),
    host: { loadContributions: async () => ({ items, refusals: [] }), connections: connectionsFor(tokenRequests), http: httpPortOver(fake), limiter: { check: async () => ({ allowed: true }) }, state: () => SHEETS_ON, apiOrigins: declaredApiOrigins, issuedTokens: createIssuedTokenMemories() },
    isActive: async () => true,
    applyApproval: ({ registration }, { disclose }) => applyToolApprovalPolicy({ registration, surfaces }, { disclose }),
  });
  return { registry, executor: createToolExecutor({ registry }), surfaces, registered, tokenRequests };
}

/** Starts a call and returns its confirmation card rows plus a way to answer it. */
export async function startConfirmingCall(booted, toolId, input) {
  let html = '';
  const pending = booted.executor.execute({ toolId, principal: { id: 'owner' }, run: { id: 'run' }, input }, {
    emitSurface: async (emission) => { html = emission.payload.resource.resource.text; },
  });
  const settled = pending.then(() => true);
  while (html === '' && !(await Promise.race([settled, new Promise((resolve) => setImmediate(() => resolve(false)))]))) { /* wait for the card */ }
  const exchangeId = html.match(/__exchangeId"\s*:\s*"([^"]+)"/)?.[1] ?? '';
  const rows = [...html.matchAll(/<dt>([^<]+)<\/dt><dd>([^<]*)<\/dd>/g)].map((match) => [match[1], match[2]]);
  const answer = (decision) => booted.surfaces.surfaceExchanges.deliver({ exchangeId, principalId: 'owner', params: { decision } }, { toolId });
  return { pending, rows, answer };
}

/**
 * The capabilities one module call receives, straight over the fake (for module-level pins).
 * `withoutArtifacts: true` leaves `artifacts` out, as a host with no artifact store does.
 */
export function directCapabilities({ fake }, optional = {}) {
  const capabilities = {
    connections: { getAccessToken: async () => TOKEN },
    http: { fetch: (target, init) => fake.fetch(target, init) },
    limiter: { check: async () => ({ allowed: true }) },
    artifacts: { write: optional.writeArtifact ?? (async () => { throw new Error('no artifact store in this test'); }) },
    state: optional.state ?? SHEETS_ON,
  };
  if (optional.withoutArtifacts) delete capabilities.artifacts;
  return capabilities;
}
