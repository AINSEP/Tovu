import '../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { FixedRootKeyKeyring } from '@jini-ai/platform/secrets';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { AesGcmSecretSealer } from '../../../webhooks/secret-sealer.aesgcm.js';
import type { KeyringPort, SecretSealerPort } from '../../../webhooks/ports.js';
import { HKDF_EXTRACTION_SALT } from '../../../webhooks/keyring.env.js';
import { InMemoryCustomCredentialSetRepo } from '../../../custom-credentials/repo.memory.js';
import { createCustomCredential } from '../../../custom-credentials/store.js';
import { InMemoryCredentialedRequestAuditLog } from '../../../custom-credentials/credentialed-request.js';
import { InMemoryPublishHistoryStore, type PublishHistoryEntry } from '../../static-publish/publish-history.js';
import { loadDeployOpsRegistryFromSource } from '../registry.js';
import { buildDeployOpsRegistrations } from '../tool-registrations.js';
import { runDeploy, type DeployOpsToolDeps } from '../run-ops.js';
import type { HttpRequest } from '../../../../platform/http/index.js';
import type { SurfaceEmission } from '@jini-ai/core';

export const S9_SITE_KEY = 'ab'.repeat(32);
export const S9_PLAIN = ' synthetic plain value\nwith whitespace ';
const API_TOKEN = 's9-private-api-token';
const OLD_VALUE = 's9-old-provider-secret';
const AT = '2026-10-01T12:00:00.000Z';
const ROOT_KEY = '11'.repeat(32);
const fixtureRoot = fileURLToPath(new URL('./fixtures/example-host/', import.meta.url));
type Scenario = 'list' | 'create' | 'same' | 'overwrite' | 'declined' | 'unset-absent' | 'unset' | 'unset-changed' | 'plain' | 'permission';
type Cell = { value: string; digest: string };

function initialCells(scenario: Scenario): Map<string, Cell> {
  if (scenario === 'plain') return new Map([['SOURCE', { value: S9_PLAIN, digest: 'd-source' }]]);
  if (['list', 'overwrite', 'declined', 'unset', 'unset-changed'].includes(scenario)) return new Map([['DATA', { value: OLD_VALUE, digest: 'd-one' }]]);
  if (scenario === 'same') return new Map([['DATA', { value: S9_SITE_KEY, digest: 'd-one' }]]);
  return new Map();
}

async function harness(scenario: Scenario, ledgerFails = false) {
  const counts = { http: 0, decrypt: 0, seals: 0, writes: 0, siteKey: 0, loads: 0, history: 0 };
  const cells = initialCells(scenario);
  const calls: string[] = [];
  const permissions: string[] = [];
  const cards: SurfaceEmission[] = [];
  const history: { workspaceId: string; entry: PublishHistoryEntry }[] = [];
  const ledger = new InMemoryPublishHistoryStore();
  const originalRecord = ledger.recordSuccess.bind(ledger);
  ledger.recordSuccess = async input => {
    counts.history++;
    history.push(input);
    if (ledgerFails) throw new Error(`private ledger parameter ${API_TOKEN}`);
    await originalRecord(input);
  };
  const keys = new FixedRootKeyKeyring({ hex: ROOT_KEY, hkdfSalt: HKDF_EXTRACTION_SALT }, { keyId: 's9-fixed-key' });
  const keyring: KeyringPort = { activeKey: () => keys.activeKey({}), derive: input => keys.derive(input), deriveSigningSecret: input => keys.deriveSigningSecret(input) };
  const realSealer = new AesGcmSecretSealer(keyring);
  const sealer: SecretSealerPort = {
    seal: (...args) => { counts.seals++; return realSealer.seal(...args); },
    open: (...args) => { counts.decrypt++; return realSealer.open(...args); },
  };
  const repo = new InMemoryCustomCredentialSetRepo();
  const clock = { nowMs: () => Date.parse(AT) };
  await createCustomCredential({ repo, keyring, sealer, clock, idGen: { newId: () => 's9-credential' } }, { workspaceId: 'ws-s9', label: 'ops', category: 'ops', baseUrl: 'https://api.example-host.dev', connection: { token: API_TOKEN } });
  counts.seals = 0;
  const registry = await loadDeployOpsRegistryFromSource({ pluginId: 'example-host', packageRoot: fixtureRoot });
  assert.deepEqual(registry.refusals, []);
  const response = (body: unknown) => ({ status: 200, headers: {}, bodyText: JSON.stringify(body) });
  const send = async (request: HttpRequest) => {
    counts.http++;
    const url = new URL(request.url);
    calls.push(`${request.method} ${url.pathname}${url.search}`);
    if (request.method === 'GET' && url.pathname.endsWith('/secrets')) return response({ secrets: [...cells].map(([name, cell]) => ({ name, digest: cell.digest, updated_at: AT })) });
    if (request.method === 'GET') {
      const name = url.pathname.split('/').at(-1)!;
      const cell = cells.get(name);
      assert.ok(cell, `unexpected read ${name}`);
      return response({ value: cell.value });
    }
    counts.writes++;
    if (request.method === 'POST' && url.pathname.endsWith('/deploys')) {
      assert.equal(request.body, JSON.stringify({ ref: 'fixed-rev' }));
      return response({ accepted: true });
    }
    if (request.method === 'POST') assert.equal(request.body, JSON.stringify({ value: scenario === 'plain' ? S9_PLAIN : S9_SITE_KEY }));
    else assert.equal(request.method, 'DELETE');
    return response({ version: 3 });
  };
  let exchange = 0;
  const store = createSurfaceExchangeStore({ clock, idGenerator: { newId: () => { exchange++; return `s9-card-${exchange}`; } }, scheduler: { schedule: () => () => undefined }, defaultChannel: 'mcp-ui' });
  const deps: DeployOpsToolDeps = {
    workspaceId: 'ws-s9', clock, customCredentialSetRepo: repo, siteAssistantSecretSealer: sealer, deployOpsHttpClient: { send },
    customCredentialsAudit: new InMemoryCredentialedRequestAuditLog(), loadAuthSchemes: async () => [], deployOpsRegistry: registry,
    loadDeployOps: async () => { counts.loads++; return registry; },
    readSiteKey: () => { counts.siteKey++; return S9_SITE_KEY; },
    authorize: async ({ permission }) => { permissions.push(permission); return { allowed: !(scenario === 'permission' && permission === 'admin.security.site-key.manage'), reason: 's9 fixed grant' }; },
    publishHistoryStore: ledger,
  };
  const surfaces = { surfaceExchanges: store, assertChatDeleteAllowed: async () => undefined };
  const registrations = buildDeployOpsRegistrations(deps, surfaces);
  const emitSurface = async (emission: SurfaceEmission) => {
    cards.push(emission);
    const toolId = scenario.startsWith('unset') ? 'deployment_ops_unset_secret' : 'deployment_ops_set_secret';
    const exchangeId = store.findTypedAnswerTarget({ principalId: 's9-actor', toolId });
    assert.ok(exchangeId);
    if (scenario === 'unset-changed') cells.get('DATA')!.digest = 'd-two';
    assert.deepEqual(store.deliver({ exchangeId, principalId: 's9-actor', params: { decision: scenario === 'declined' ? 'cancel' : 'confirm' } }, { toolId, channel: 'mcp-ui' }), { ok: true });
  };
  return { counts, calls, permissions, cards, history, ledger, deps, registrations, emitSurface, store };
}

function inputFor(scenario: Scenario): { toolId: string; input: Record<string, unknown> } {
  const target = { platform: 'example-host', target: 'shop' };
  if (scenario === 'list') return { toolId: 'deployment_ops_list_secrets', input: target };
  if (scenario.startsWith('unset')) return { toolId: 'deployment_ops_unset_secret', input: { ...target, name: 'DATA' } };
  return { toolId: 'deployment_ops_set_secret', input: { ...target, name: 'DATA', source: scenario === 'plain' ? { kind: 'secret', name: 'SOURCE' } : { kind: 'site-key' } } };
}

function noLeaks(observable: unknown): void {
  const text = JSON.stringify(observable);
  for (const secret of [S9_SITE_KEY, S9_PLAIN, API_TOKEN, OLD_VALUE, ROOT_KEY]) assert.equal(text.includes(secret), false, 'a synthetic secret leaked into observable output');
}

async function recordSecret(scenario: Scenario) {
  const h = await harness(scenario);
  const { toolId, input } = inputFor(scenario);
  const tool = h.registrations.find(item => item.descriptor.id === toolId)!;
  let result: unknown = null;
  let error: string | null = null;
  try { result = await tool.handler({ executionId: 's9-call', run: { id: 's9-run' }, principal: { id: 's9-actor' }, signal: new AbortController().signal, input }, { emitSurface: h.emitSurface }); }
  catch (caught) { assert.ok(caught instanceof Error); error = caught.message; }
  assert.equal(h.store.size(), 0);
  const record = { result, error, counts: h.counts, calls: h.calls, permissions: h.permissions, cards: h.cards, logs: [] };
  noLeaks(record);
  return record;
}

async function recordDeploy(ledgerFails: boolean) {
  const h = await harness('create', ledgerFails);
  const input = { platform: 'example-pipeline', target: 'shop', ref: 'fixed-rev' };
  const logs: string[] = [];
  const previous = console.warn;
  let result: unknown;
  try {
    console.warn = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
    result = ledgerFails
      ? await h.registrations.find(item => item.descriptor.id === 'deployment_ops_deploy')!.handler({ executionId: 's9-call', run: { id: 's9-run' }, principal: { id: 's9-actor' }, signal: new AbortController().signal, input })
      : await runDeploy({ deps: h.deps, input });
  } finally { console.warn = previous; }
  const stored = await h.ledger.getLast({ workspaceId: 'ws-s9', target: 'example-pipeline' });
  const record = { result, counts: h.counts, calls: h.calls, permissions: h.permissions, history: h.history, stored, logs };
  noLeaks(record);
  assert.equal(h.counts.http, 1); assert.equal(h.counts.decrypt, 1); assert.equal(h.counts.writes, 1); assert.equal(h.counts.history, 1);
  return record;
}

/** The recorder is also the replay: it has no filesystem writes or recording mode. */
export async function recordDeployOps() {
  const cases = {} as Record<string, Awaited<ReturnType<typeof recordSecret>>>;
  for (const name of ['list', 'create', 'same', 'overwrite', 'declined', 'unset-absent', 'unset', 'unset-changed', 'plain', 'permission'] as const) cases[name] = await recordSecret(name);
  assert.deepEqual(cases.permission!.counts, { http: 0, decrypt: 0, seals: 0, writes: 0, siteKey: 0, loads: 0, history: 0 });
  assert.ok(cases.permission!.error?.includes('admin.security.site-key.manage'));
  assert.ok(JSON.stringify(cases.overwrite!.cards).includes('Tovu cannot restore it.'));
  assert.ok(JSON.stringify(cases.unset!.cards).includes('Tovu cannot restore its value.'));
  assert.equal(cases['unset-changed']!.counts.writes, 0);
  return { cases, accepted: await recordDeploy(false), ledgerFailure: await recordDeploy(true) };
}
