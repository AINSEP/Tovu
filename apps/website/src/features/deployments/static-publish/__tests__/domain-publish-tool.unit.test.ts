import '../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { ToolExecutionContext, SurfaceEmission } from '@jini-ai/core';
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from '@jini-ai/daemon/surface-exchanges';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { createRouteDeps } from '#src/server/runtime/composition/app';
import { buildGatewayDeps } from '#src/contracts/core/gated-mutations/composition';
import { InMemoryTokenStore, type TokenStorePort } from '#src/contracts/core/gated-mutations/token';
import { domainPublishTool } from '../domain-publish-tool.js';
import { InMemoryPublishHistoryStore } from '../publish-history.js';
import { getPublishRunSnapshot, startPublishRun } from '../publish-run.js';
import type { PublishCredentialSource } from '../types.js';
import type { StaticPublishInput } from '../adapter.js';
import type { StaticPublishToolDeps } from '../../publish-agent-tools.js';
import type { DeployTargetInspection, DeployTargetRegistry, LoadedDeployTarget } from '../../deploy-targets/types.js';

/** Real approval exchange + gateway, with typed registry/export/provider ports; no live account. */
async function setup(options: { tokenState?: 'expired' | 'redeemed' | 'foreign' | 'fault'; publish?: 'ready' | 'link-delayed' | 'throws'; inventory?: 'unknown' | 'silent';
  anonymous?: boolean } = {}) {
  const base = createRouteDeps();
  const root = await mkdtemp(path.join(tmpdir(), 'domain-publish-test-'));
  const historyStore = new InMemoryPublishHistoryStore();
  let changed = false;
  let exports = 0;
  let publishes = 0;
  const authorize = async () => ({ allowed: true, reason: 'test' });
  const tokenOwner = new InMemoryTokenStore();
  const tokens: TokenStorePort = {
    save: record => tokenOwner.save(record),
    findByToken: async token => {
      const record = await tokenOwner.findByToken(token);
      if (options.tokenState === 'fault') throw new Error('typed-store-test-failure');
      if (!record) return null;
      if (options.tokenState === 'foreign') return { ...record, confirmerPrincipalId: 'someone-else' };
      if (options.tokenState === 'expired' || options.tokenState === 'redeemed') return { ...record, status: options.tokenState };
      return record;
    },
    tryRedeem: input => tokenOwner.tryRedeem(input), count: () => tokenOwner.count(), expire: input => tokenOwner.expire(input),
  };
  const credentialSource: PublishCredentialSource = { isConfigured: async () => ({ configured: true }), resolve: async () => ({ ok: true, token: 'never-disclose', accountId: 'acct', ...(options.anonymous ? {} : { credentialId: 'chosen' }) }) };
  const target: LoadedDeployTarget = {
    pluginId: 'fixture', descriptor: { id: 'fixture', label: 'Fixture', module: 'target.mjs', configFields: [{ name: 'customDomain', label: 'Domain', required: false }] },
    module: {
      preview: async () => ({ targetId: 'fixture', resourceName: 'remote', hostingChanges: [], domains: {
        inventoryStatus: options.inventory ? 'unknown' : 'complete', fingerprint: changed ? 'changed' : 'reviewed', ...(options.inventory === 'silent' ? {} : { message: 'Review domain changes.' }),
        hostnames: [{ hostname: 'example.com', status: 'planned', records: [{ id: 'old-record' }] }, { hostname: 'www.example.com', status: 'planned' }],
        changes: [{ method: 'DELETE', path: '/records/old-record', hostname: 'example.com' }],
        // `silent` deliberately breaks the required-message contract to pin the fallback text.
      } as NonNullable<DeployTargetInspection['domains']> }),
      create: () => ({ id: 'fixture', checkReachability: async () => ({ reachable: true }), publish: async input => {
        publishes++;
        const approval = input.metadata?.domainApproval as StaticPublishInput['domainApproval'];
        assert.ok(approval);
        assert.equal(await approval.authorize({ fingerprint: 'reviewed', accountId: 'acct' }), true);
        if (options.publish === 'throws') throw new Error('provider refused the upload');
        return { targetId: 'fixture', url: 'https://hosting.test', status: options.publish ?? 'link-delayed', statusMessage: 'www.example.com certificate pending',
          providerMetadata: { hostnames: [{ hostname: 'example.com', status: 'ready' }, { hostname: 'www.example.com', status: 'pending' }] } };
      } }),
    },
  };
  const registry: DeployTargetRegistry = { list: () => [target], get: id => id === 'fixture' ? target : undefined, refusals: [] };
  const deps: StaticPublishToolDeps = { ...base, authorize, credentialSource, loadDeployTargets: async () => registry,
    publishOutputRootDir: root, publishHistoryStore: historyStore,
    gatedMutations: { gatewayDeps: buildGatewayDeps({ clock: base.clock, idGen: base.idGen, authorize, tokens }) },
    exportSiteBound: async ({ outputDir }) => { exports++; return { outputDir, routes: { succeeded: [{ path: '/', kind: 'home', outputFile: 'index.html', data: 'site' }], failed: [] }, assets: { succeeded: [], failed: [] }, skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [] }; },
  };
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: base.clock, idGenerator: base.idGen, defaultChannel: 'mcp-ui' });
  const handler = domainPublishTool({ deps, surfaces: { surfaceExchanges }, credentialSource, historyStore, config: { target: 'fixture', customDomain: 'example.com' }, projectName: 'demo', ...(options.anonymous ? {} : { credentialId: 'chosen' }) });
  const ctx: ToolExecutionContext = { executionId: 'execution', principal: { id: 'human' }, run: { id: 'run' }, input: { confirmed: true }, signal: new AbortController().signal };
  return { handler, ctx, surfaceExchanges, deps, credentialSource, historyStore, counts: () => ({ exports, publishes }), change: () => { changed = true; }, cleanup: () => rm(root, { recursive: true, force: true }) };
}

function exchangeId(surface: SurfaceEmission): string {
  const resource = surface.payload.resource as { resource: { text: string } };
  const match = resource.resource.text.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match);
  assert.match(resource.resource.text, /old-record/);
  return match[1]!;
}

test('model confirmed flag and missing human channel cannot start export or publish', async () => {
  const f = await setup();
  try {
    await assert.rejects(f.handler(f.ctx, {}), /NO_CONFIRMATION_CHANNEL/);
    assert.deepEqual(f.counts(), { exports: 0, publishes: 0 });
  } finally { await f.cleanup(); }
});

for (const decision of ['cancel', 'confirm', 'stale'] as const) test(`domain exchange ${decision}: exact review controls gateway execution`, async () => {
  const f = await setup();
  try {
    const pending = f.handler(f.ctx, { emitSurface: async surface => {
      assert.deepEqual(f.counts(), { exports: 0, publishes: 0 });
      if (decision === 'stale') f.change();
      const delivered = f.surfaceExchanges.deliver({ exchangeId: exchangeId(surface), principalId: 'human', params: { decision: decision === 'cancel' ? 'cancel' : 'confirm' } }, { toolId: 'deployment_execute_static_publish' });
      assert.equal(delivered.ok, true);
    } });
    if (decision === 'stale') {
      await assert.rejects(pending, /DOMAIN_PLAN_STALE.*Preview and confirm/);
      assert.deepEqual(f.counts(), { exports: 0, publishes: 0 });
    } else {
      const result = await pending as { published: boolean; reachable?: boolean; providerMetadata?: unknown };
      assert.equal(result.published, decision === 'confirm');
      if (decision === 'confirm') { assert.equal(result.reachable, false); assert.match(JSON.stringify(result.providerMetadata), /www.example.com/); }
      assert.deepEqual(f.counts(), decision === 'confirm' ? { exports: 1, publishes: 1 } : { exports: 0, publishes: 0 });
    }
  } finally { await f.cleanup(); }
});

for (const [tokenState, message] of [['expired', /DOMAIN_APPROVAL_EXPIRED/], ['redeemed', /DOMAIN_APPROVAL_ALREADY_USED/], ['foreign', /DOMAIN_APPROVAL_FORBIDDEN/], ['fault', /typed-store-test-failure/]] as const) test(`domain gateway ${tokenState} refuses before export with the specific error`, async () => {
  const f = await setup({ tokenState });
  try {
    const pending = f.handler(f.ctx, { emitSurface: async surface => {
      f.surfaceExchanges.deliver({ exchangeId: exchangeId(surface), principalId: 'human', params: { decision: 'confirm' } }, { toolId: 'deployment_execute_static_publish' });
    } });
    await assert.rejects(pending, message);
    assert.deepEqual(f.counts(), { exports: 0, publishes: 0 });
  } finally { await f.cleanup(); }
});

/** Confirms the single pending exchange as the human reviewer. */
function confirmAs(f: Awaited<ReturnType<typeof setup>>) {
  return { emitSurface: async (surface: SurfaceEmission) => {
    f.surfaceExchanges.deliver({ exchangeId: exchangeId(surface), principalId: 'human', params: { decision: 'confirm' } }, { toolId: 'deployment_execute_static_publish' });
  } };
}

test('without the shared mutation gateway the tool refuses to exist rather than inventing an approval path', async () => {
  const f = await setup();
  try {
    const { gatedMutations: _gateway, ...deps } = f.deps;
    assert.throws(() => domainPublishTool({ deps, surfaces: { surfaceExchanges: f.surfaceExchanges }, credentialSource: f.credentialSource, historyStore: f.historyStore,
      config: { target: 'fixture', customDomain: 'example.com' }, projectName: 'demo' }), /DOMAIN_APPROVAL_UNAVAILABLE: The shared mutation gateway is not configured/);
  } finally { await f.cleanup(); }
});

for (const [inventory, message] of [['unknown', /DOMAIN_INVENTORY_UNKNOWN: Review domain changes\./], ['silent', /DOMAIN_INVENTORY_UNKNOWN: Complete authenticated domain inspection is required/]] as const) test(`incomplete ${inventory} domain inventory refuses before any confirmation card`, async () => {
  const f = await setup({ inventory });
  try {
    await assert.rejects(f.handler(f.ctx, { emitSurface: async () => assert.fail('No card for an incomplete inventory') }), message);
    assert.deepEqual(f.counts(), { exports: 0, publishes: 0 });
  } finally { await f.cleanup(); }
});

test('a fully ready publish reports reachable with no partial message; a connection without an id still binds', async () => {
  const f = await setup({ publish: 'ready', anonymous: true });
  try {
    const result = await f.handler(f.ctx, confirmAs(f)) as Record<string, unknown>;
    assert.equal(result.published, true);
    assert.equal(result.reachable, true);
    assert.equal(result.status, 'ready');
    assert.ok(!('message' in result));
  } finally { await f.cleanup(); }
});

test('a provider failure after approval reports published:false with the failure outcome', async () => {
  const f = await setup({ publish: 'throws' });
  try {
    const result = await f.handler(f.ctx, confirmAs(f)) as Record<string, unknown>;
    assert.equal(result.published, false);
    assert.equal(result.ok, false);
    assert.match(String(result.message), /provider refused the upload/);
    assert.deepEqual(f.counts(), { exports: 1, publishes: 1 });
  } finally { await f.cleanup(); }
});

test('an approved domain publish refuses while another publish run is still running', async () => {
  const f = await setup();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const result = f.handler(f.ctx, { emitSurface: async surface => {
      startPublishRun({ credentialSource: f.credentialSource, loadDeployTargets: f.deps.loadDeployTargets }, {
        workspaceId: f.deps.workspaceId, publishOutputRootDir: f.deps.publishOutputRootDir, idGen: f.deps.idGen, config: { target: 'fixture' }, projectName: 'other',
        exportSiteBound: async () => { await gate; throw new Error('other run released'); } }, { nowIso: () => new Date().toISOString() }, f.historyStore);
      await confirmAs(f).emitSurface(surface);
    } });
    await assert.rejects(result, /ALREADY_RUNNING: A publish is running/);
    assert.deepEqual(f.counts(), { exports: 0, publishes: 0 });
  } finally {
    release();
    while (getPublishRunSnapshot().status === 'running') await new Promise(resolve => setImmediate(resolve));
    await f.cleanup();
  }
});
