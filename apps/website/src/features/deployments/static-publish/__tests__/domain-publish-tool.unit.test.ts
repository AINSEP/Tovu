import '../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createToolRegistry, type ToolExecutionContext, type SurfaceEmission } from '@jini-ai/core';
import { createToolExecutor } from '@jini-ai/daemon';
import express from 'express';
import { applyToolApprovalPolicy } from '#src/assistant/tool-approval-policy';
import { registerMcpUiToolCallsRoute, MCP_UI_TOOL_CALLS_PATH } from '#src/assistant/mcp-ui-tool-calls-route';
import { RUN_PRINCIPAL_HEADER } from '#src/assistant/daemon-access';
import { startTestServer } from '#src/server/__tests__/helpers/http-test-server';
import { buildStaticPublishRegistrations } from '../../publish-agent-tools.js';
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from '@jini-ai/daemon/surface-exchanges';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { createRouteDeps } from '#src/server/runtime/composition/app';
import { deploymentRefusal } from '#src/features/consent/service';
import { bindSiteConsentService } from '#src/server/runtime/composition/site-consent';
import { buildGatewayDeps } from '#src/contracts/core/gated-mutations/composition';
import { InMemoryTokenStore, type TokenStorePort } from '#src/contracts/core/gated-mutations/token';
import { domainPublishTool } from '../domain-publish-tool.js';
import { InMemoryPublishHistoryStore } from '../publish-history.js';
import { getPublishJobSnapshot, getPublishRunSnapshot, startPublishRun } from '../publish-run.js';
import type { PublishCredentialSource } from '../types.js';
import type { StaticPublishInput } from '../adapter.js';
import type { StaticPublishToolDeps } from '../../publish-agent-tools.js';
import type { DeployTargetInspection, DeployTargetRegistry, LoadedDeployTarget } from '../../deploy-targets/types.js';

/** Real approval exchange + gateway, with typed registry/export/provider ports; no live account. */
async function setup(options: { tokenState?: 'expired' | 'redeemed' | 'foreign' | 'fault'; publish?: 'ready' | 'link-delayed' | 'throws'; inventory?: 'unknown' | 'silent';
  headers?: Readonly<Record<string, string>>; anonymous?: boolean; exportGate?: Promise<void>; onSettled?: () => void; noPreview?: boolean } = {}) {
  const base = createRouteDeps();
  const root = await mkdtemp(path.join(tmpdir(), 'domain-publish-test-'));
  const historyStore = new InMemoryPublishHistoryStore();
  let changed = false;
  let exports = 0;
  let publishes = 0;
  let publishedHeaders: unknown;
  let allowed = true;
  const authorize = async () => ({ allowed, reason: allowed ? 'test' : 'insufficient_permission' });
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
        publishedHeaders = input.responseHeaders;
        const approval = input.metadata?.domainApproval as StaticPublishInput['domainApproval'];
        if (options.noPreview) assert.equal(approval, undefined);
        else {
          assert.ok(approval);
          assert.equal(await approval.authorize({ fingerprint: 'reviewed', accountId: 'acct' }), true);
        }
        if (options.publish === 'throws') throw new Error('provider refused the upload');
        return { targetId: 'fixture', url: 'https://hosting.test', status: options.publish ?? 'link-delayed', statusMessage: 'www.example.com certificate pending',
          providerMetadata: { hostnames: [{ hostname: 'example.com', status: 'ready' }, { hostname: 'www.example.com', status: 'pending' }] } };
      } }),
    },
  };
  if (options.noPreview) delete target.module.preview;
  const registry: DeployTargetRegistry = { list: () => [target], get: id => id === 'fixture' ? target : undefined, refusals: [] };
  const deps: StaticPublishToolDeps = { ...base, authorize, siteConsent: bindSiteConsentService({ deps: { ...base, authorize } }), credentialSource, loadDeployTargets: async () => registry,
    publishOutputRootDir: root, publishHistoryStore: historyStore,
    ...(options.headers ? { publicPageSecurityHeaders: () => options.headers! } : {}),
    gatedMutations: { gatewayDeps: buildGatewayDeps({ clock: base.clock, idGen: base.idGen, authorize, tokens }) },
    exportSiteBound: async ({ outputDir }) => { await options.exportGate; exports++; return { outputDir, routes: { succeeded: [{ path: '/', kind: 'home', outputFile: 'index.html', data: 'site' }], failed: [] }, assets: { succeeded: [], failed: [] }, skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [] }; },
  };
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: base.clock, idGenerator: base.idGen, defaultChannel: 'mcp-ui' });
  const handler = domainPublishTool({ deps, surfaces: { surfaceExchanges }, credentialSource, historyStore, config: { target: 'fixture', customDomain: 'example.com' }, projectName: 'demo', ...(options.onSettled ? { onSettled: options.onSettled } : {}), ...(options.anonymous ? {} : { credentialId: 'chosen' }) });
  const ctx: ToolExecutionContext = { executionId: 'execution', principal: { id: 'human' }, run: { id: 'run' }, input: { confirmed: true }, signal: new AbortController().signal };
  const followJob = async (...args: Parameters<typeof handler>) => {
    const accepted = await handler(...args) as { accepted?: boolean; jobId?: string };
    if (!accepted.accepted) return accepted;
    const result = await finalJob(deps.workspaceId, accepted.jobId!);
    if (!result.ok) return { published: false, ...result };
    return { published: true, reachable: result.ok === true, target: result.targetId, url: result.url, status: result.status,
      ...(result.ok === 'partial' ? { message: result.message } : {}), providerMetadata: result.providerMetadata };
  };
  return { deny: () => { allowed = false; }, publishedHeaders: () => publishedHeaders, start: handler, handler: followJob, ctx, surfaceExchanges, deps, credentialSource, historyStore, counts: () => ({ exports, publishes }), change: () => { changed = true; }, cleanup: () => rm(root, { recursive: true, force: true }) };
}

function exchangeId(surface: SurfaceEmission): string {
  const resource = surface.payload.resource as { resource: { text: string } };
  const match = resource.resource.text.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match);
  assert.match(resource.resource.text, /old-record/);
  // The card is a readable change list, not a JSON dump of the inspection.
  assert.match(resource.resource.text, /Now on www\.example\.com/);
  assert.doesNotMatch(resource.resource.text, /Exact changes|&quot;hostname&quot;/);
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

/** Read the job's result without a wall-clock sleep; provider/export ports settle under test control. */
async function finalJob(workspaceId: string, jobId: string) {
  for (let turn = 0; turn < 1000; turn++) {
    const job = getPublishJobSnapshot({ workspaceId, jobId });
    if (job?.status !== 'running') { assert.ok(job?.result); return job.result; }
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  assert.fail('Domain publish did not settle after 1000 event-loop turns');
}

test('approved domain publish returns a job before export; call cancellation cannot revoke that job', async () => {
  let release!: () => void;
  const exportGate = new Promise<void>(resolve => { release = resolve; });
  const f = await setup({ exportGate });
  const controller = new AbortController();
  try {
    const result = await f.start({ ...f.ctx, signal: controller.signal }, confirmAs(f)) as { accepted: boolean; published: boolean; jobId: string };
    assert.equal(result.accepted, true);
    assert.equal(result.published, false);
    assert.ok(result.jobId);
    assert.equal(getPublishJobSnapshot({ workspaceId: f.deps.workspaceId, jobId: result.jobId })?.status, 'running');
    controller.abort();
    release();
    assert.equal((await finalJob(f.deps.workspaceId, result.jobId)).ok, 'partial');
    assert.deepEqual(f.counts(), { exports: 1, publishes: 1 });
  } finally { release(); await f.cleanup(); }
});

test('an approved domain publish reports settlement once without depending on status polling', async () => {
  let count = 0;
  let finish!: () => void;
  const settled = new Promise<void>(resolve => { finish = resolve; });
  const f = await setup({ onSettled: () => { count++; finish(); } });
  try {
    const accepted = await f.start(f.ctx, confirmAs(f)) as { accepted: boolean; jobId: string };
    assert.equal(accepted.accepted, true);
    await settled;
    assert.equal(count, 1);
    assert.equal(getPublishJobSnapshot({ workspaceId: f.deps.workspaceId, jobId: accepted.jobId })?.status, 'completed');
  } finally { await f.cleanup(); }
});


test('approved domain publish carries the site security headers to hosting', async () => {
  const headers = { 'Content-Security-Policy-Report-Only': "frame-src 'self' https://docs.google.com" };
  const f = await setup({ headers });
  try {
    const result = await f.handler(f.ctx, confirmAs(f)) as { published: boolean };
    assert.equal(result.published, true);
    assert.deepEqual(f.publishedHeaders(), headers);
  } finally { await f.cleanup(); }
});


for (const noPreview of [false, true]) test(`assembled custom-domain publish (provider preview ${!noPreview}) asks once over HTTP and starts the approved provider job`, async t => {
  const f = await setup({ noPreview });
  t.after(() => f.cleanup());
  const registry = createToolRegistry({});
  for (const registration of buildStaticPublishRegistrations(f.deps, { surfaceExchanges: f.surfaceExchanges })) {
    registry.register(applyToolApprovalPolicy({ registration, surfaces: { surfaceExchanges: f.surfaceExchanges } }));
  }
  const executor = createToolExecutor({ registry });
  let routeExecutions = 0;
  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { surfaceExchanges: f.surfaceExchanges, toolExecutor: {
    ...executor, execute: (...args) => { routeExecutions++; return executor.execute(...args); },
  } });
  const baseUrl = await startTestServer(app, t);
  let approvalCards = 0;
  const executed = await executor.execute({ principal: f.ctx.principal, run: f.ctx.run,
    toolId: 'deployment_execute_static_publish', input: { target: 'fixture', projectName: 'demo', customDomain: 'example.com', credentialId: 'chosen' },
  }, { emitSurface: async surface => {
    const html = (surface.payload.resource as { resource: { text: string } }).resource.text;
    const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
    if (!match) return;
    approvalCards++;
    assert.deepEqual(f.counts(), { exports: 0, publishes: 0 });
    const response = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
      method: 'POST', headers: { 'content-type': 'application/json', [RUN_PRINCIPAL_HEADER]: f.ctx.principal.id },
      body: JSON.stringify({ toolName: 'deployment_execute_static_publish', params: { [SURFACE_EXCHANGE_ID_PARAM]: match[1], decision: 'confirm' } }),
    });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { delivered: true });
  } });
  assert.equal(executed.status, 'completed', JSON.stringify(executed));
  const accepted = executed.output as { accepted: boolean; jobId: string };
  assert.equal(accepted.accepted, true);
  assert.equal((await finalJob(f.deps.workspaceId, accepted.jobId)).ok, 'partial');
  assert.deepEqual(f.counts(), { exports: 1, publishes: 1 });
  assert.equal(routeExecutions, 0, 'the answer resumes the parked call');
  assert.equal(approvalCards, 1, 'one card approves the publish and its exact domain changes');
});


for (const noPreview of [false, true]) test(`assembled publish (provider preview ${!noPreview}) cannot publish after cancel or without a human channel`, async t => {
  const f = await setup({ noPreview });
  t.after(() => f.cleanup());
  const registry = createToolRegistry({});
  for (const registration of buildStaticPublishRegistrations(f.deps, { surfaceExchanges: f.surfaceExchanges })) {
    registry.register(applyToolApprovalPolicy({ registration, surfaces: { surfaceExchanges: f.surfaceExchanges } }));
  }
  const executor = createToolExecutor({ registry });
  const request = { principal: f.ctx.principal, run: f.ctx.run, toolId: 'deployment_execute_static_publish',
    input: { target: 'fixture', projectName: 'demo', customDomain: 'example.com', credentialId: 'chosen' } };
  const headless = await executor.execute(request);
  assert.equal(headless.status, 'failed');
  assert.match(headless.status === 'failed' ? headless.error ?? '' : '', /NO_CONFIRMATION_CHANNEL/);
  let approvalCards = 0;
  const cancelled = await executor.execute(request, { emitSurface: async surface => {
    approvalCards++;
    const html = (surface.payload.resource as { resource: { text: string } }).resource.text;
    const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
    assert.ok(match);
    assert.equal(f.surfaceExchanges.deliver({ exchangeId: match[1]!, principalId: f.ctx.principal.id, params: { decision: 'cancel' } }, { toolId: request.toolId }).ok, true);
  } });
  assert.equal(cancelled.status, 'completed');
  assert.deepEqual(cancelled.output, { published: false, cancelled: true, note: 'The user cancelled. Nothing was changed.' });
  assert.equal(approvalCards, 1);
  assert.deepEqual(f.counts(), { exports: 0, publishes: 0 });
});


test('ordinary publish rechecks permission when it resumes after the human card', async t => {
  const f = await setup({ noPreview: true });
  t.after(() => f.cleanup());
  const registry = createToolRegistry({});
  for (const registration of buildStaticPublishRegistrations(f.deps, { surfaceExchanges: f.surfaceExchanges })) {
    registry.register(applyToolApprovalPolicy({ registration, surfaces: { surfaceExchanges: f.surfaceExchanges } }));
  }
  const executor = createToolExecutor({ registry });
  const executed = await executor.execute({ principal: f.ctx.principal, run: f.ctx.run, toolId: 'deployment_execute_static_publish',
    input: { target: 'fixture', projectName: 'demo', credentialId: 'chosen' },
  }, { emitSurface: async surface => {
    const html = (surface.payload.resource as { resource: { text: string } }).resource.text;
    const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
    assert.ok(match);
    f.deny();
    assert.equal(f.surfaceExchanges.deliver({ exchangeId: match[1]!, principalId: f.ctx.principal.id, params: { decision: 'confirm' } }, { toolId: 'deployment_execute_static_publish' }).ok, true);
  } });
  assert.equal(executed.status, 'failed', JSON.stringify(executed));
  assert.match(executed.error ?? '', /not authorized.*deployments\.publish/);
  assert.deepEqual(f.counts(), { exports: 0, publishes: 0 });
});


test('ordinary publish rechecks consent readiness when it resumes after the human card', async t => {
  const f = await setup({ noPreview: true });
  t.after(() => f.cleanup());
  let blocked = false;
  const refusal = deploymentRefusal({ problems: [{ code: 'CONSENT_UNAVAILABLE', message: 'Consent changed while the card was open.' }] });
  const deps: StaticPublishToolDeps = { ...f.deps, siteConsent: { deploymentCheck: async input => blocked ? refusal : f.deps.siteConsent!.deploymentCheck(input) } };
  const registry = createToolRegistry({});
  for (const registration of buildStaticPublishRegistrations(deps, { surfaceExchanges: f.surfaceExchanges })) {
    registry.register(applyToolApprovalPolicy({ registration, surfaces: { surfaceExchanges: f.surfaceExchanges } }));
  }
  const executor = createToolExecutor({ registry });
  const executed = await executor.execute({ principal: f.ctx.principal, run: f.ctx.run, toolId: 'deployment_execute_static_publish',
    input: { target: 'fixture', projectName: 'demo', credentialId: 'chosen' },
  }, { emitSurface: async surface => {
    const html = (surface.payload.resource as { resource: { text: string } }).resource.text;
    const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
    assert.ok(match);
    blocked = true;
    assert.equal(f.surfaceExchanges.deliver({ exchangeId: match[1]!, principalId: f.ctx.principal.id, params: { decision: 'confirm' } }, { toolId: 'deployment_execute_static_publish' }).ok, true);
  } });
  assert.equal(executed.status, 'completed', JSON.stringify(executed));
  assert.deepEqual(executed.output, { published: false, cancelled: false, ...refusal });
  assert.deepEqual(f.counts(), { exports: 0, publishes: 0 });
});

test('domain publish rechecks consent before minting approval or starting a job', async t => {
  const f = await setup();
  t.after(() => f.cleanup());
  let blocked = false;
  const refusal = deploymentRefusal({ problems: [{ code: 'CONSENT_UNAVAILABLE', message: 'Consent changed while the domain card was open.' }] });
  const deps: StaticPublishToolDeps = { ...f.deps, siteConsent: { deploymentCheck: async input => blocked ? refusal : f.deps.siteConsent!.deploymentCheck(input) } };
  const registration = buildStaticPublishRegistrations(deps, { surfaceExchanges: f.surfaceExchanges })
    .find(item => item.descriptor.id === 'deployment_execute_static_publish');
  assert.ok(registration);
  const result = await registration.handler({ ...f.ctx, input: { target: 'fixture', projectName: 'demo', credentialId: 'chosen', customDomain: 'example.com' } }, {
    emitSurface: async surface => {
      blocked = true;
      await confirmAs(f).emitSurface(surface);
    },
  });
  assert.deepEqual(result, { published: false, cancelled: false, ...refusal });
  assert.equal(await deps.gatedMutations!.gatewayDeps.tokens.count(), 0, 'stale readiness must refuse before confirm creates a token');
  assert.deepEqual(f.counts(), { exports: 0, publishes: 0 });
});
