import { ExternalMcpValidationError, ExternalMcpSecretStoreUnconfiguredError } from "#src/features/external-mcp/external-mcp-store";
import { composeAgentPluginMcp, composePluginProviderFaces } from "../agent-plugin-service-ports.js";
import { InMemoryExternalMcpServerRepo } from "#src/features/external-mcp/external-mcp-store.memory";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { withExtensionApprovalPolicy } from "../../../../assistant/assistant-tool-approval-policy.js";
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readPluginIdentity } from '@jini-ai/core/plugin-directory';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { PluginDiscoveryRecord } from '@jini-ai/plugins/host/node';
import type { InstalledAgentPlugin } from '@jini-ai/agent-plugins/lifecycle';
import { createSystemClock, createRandomUuidGenerator } from '@jini-ai/core/primitives';
import { InMemoryPluginActivationRepo } from '@jini-ai/plugins/host';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { createToolRegistry, type ToolExecutionContext } from '@jini-ai/core';
import { agentPluginActivations } from '#src/features/agent-plugins/activation-effects';
import { createTovuPluginHost, type TovuPluginHostDeps } from '../plugin-host.js';
import { composePluginRuntime } from '../plugin-runtime.js';
import { definePlugin, type PluginSdk } from '@tovu/sdk';
import { resolveAgentPluginLayout } from '#src/features/agent-plugins/layout';
import { WORD_COUNT_MANIFEST } from '#src/features/plugin-runtime/built-ins/word-count/index';
import { CONTENT_ANALYZER_MANIFEST } from '#src/features/plugin-runtime/built-ins/content-analyzer/index';
import { BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED, recordBundledAgentPluginDigests } from '#src/features/agent-plugins/lifecycle';
import { bundledContributionSources } from '#src/features/agent-plugins/bundled-contribution-sources';
import { buildPluginsRegistrations, type PluginsToolDeps } from '#src/features/plugin-runtime/tool-registrations';
import { loadEnabledPluginCapabilityToolSources, buildPluginCapabilityToolRegistrations } from '#src/features/plugin-runtime/capability-tool-registrations';
import { requiredPostReader } from '#src/features/plugin-runtime/__tests__/fixtures/plugin-post-read';
import { buildToolCatalogQuery } from '#src/assistant/tool-catalog-query';
import { InMemoryChangeSetRepo } from '#src/contracts/core/commands/index';

const plugin: InstalledAgentPlugin = { pluginId: 'github', version: '1.2.3', archiveDigest: 'a'.repeat(64), packageRoot: '/never-read', files: [], skills: [{ name: 'github', skillPath: 'skills/github/SKILL.md' }] };
const manifest = { name: 'github', keywords: ['repository'], extensions: { tovu: { id: 'tovu/github', provides: ['source-control'] } } };

async function fixture(t: { after(callback: () => unknown): void }) {
  const root = await mkdtemp(path.join(tmpdir(), 'tovu-plugin-host-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let enabled = false;
  let installed: readonly InstalledAgentPlugin[] = [plugin];
  const warnings: string[] = [];
  const listedRoots: string[] = [];
  let extraSitePlugins: readonly PluginDiscoveryRecord[] = [];
  const keyring = new InMemoryKeyring();
  const clock = createSystemClock();
  const deps: TovuPluginHostDeps & Pick<PluginsToolDeps, "providerFaces"> = {
    agentPluginLayout: resolveAgentPluginLayout({ siteDir: process.cwd() }, { env: { TOVU_AGENT_PLUGINS_DIR: root } }), workspaceId: 'site',
    authorize: async () => ({ allowed: true, reason: 'matched' }), clock,
    pluginActivationRepo: new InMemoryPluginActivationRepo(),
    discoverPlugins: async () => [{ id: 'word-count', name: 'Word Count', version: '1.0.0', source: 'built-in', status: 'valid', errors: [], manifest: WORD_COUNT_MANIFEST }, ...extraSitePlugins],
    listInstalledAgentPlugins: async workspaceRoot => { listedRoots.push(workspaceRoot); return installed; },
    mcp: composeAgentPluginMcp({ repo: new InMemoryExternalMcpServerRepo(), sealer: new AesGcmSecretSealer(keyring), keyring, clock }),
    preferences: { locale: async () => "en" },
    providerFaces: composePluginProviderFaces({ workspaceRoot: () => deps.agentPluginLayout.forWorkspace(deps.workspaceId).root }),
  };
  const host = createTovuPluginHost({ deps }, { readAgentManifest: async () => manifest, resolveEnabled: async () => enabled, warn: message => warnings.push(message) });
  return { root, deps, host, warnings, listedRoots, enable: () => { enabled = true; }, remove: () => { installed = []; }, addSite: (rows: readonly PluginDiscoveryRecord[]) => { extraSitePlugins = rows; } };
}

test('owner 2026-10-09: both families share one live metadata lookup with workspace isolation', async t => {
  const ctx = await fixture(t);
  assert.deepEqual(await ctx.host.getPlugin({ id: 'tovu/github' }), { id: 'tovu/github', version: '1.2.3', enabled: false, family: 'agent-plugin', localId: 'github', keywords: ['repository'], provides: ['source-control'] });
  assert.deepEqual((await ctx.host.findProviders({ capability: 'content-metrics' })).map(row => row.id), ['tovu/word-count']);
  assert.deepEqual(await ctx.host.findProviders({ capability: 'source-control' }, { enabledOnly: true }), []);
  ctx.enable();
  assert.deepEqual((await ctx.host.findProviders({ capability: 'source-control' }, { enabledOnly: true })).map(row => row.id), ['tovu/github']);
  ctx.remove();
  assert.equal(await ctx.host.getPlugin({ id: 'tovu/github' }), null);
  assert.deepEqual(ctx.warnings, []);
  assert.ok(ctx.listedRoots.every(root => root === path.join(ctx.root, 'ws', 'site')));
});

test('the executable site SDK receives only live metadata methods through the existing loader', async t => {
  const ctx = await fixture(t);
  let sdk: PluginSdk | undefined;
  const runtime = composePluginRuntime({ workspaceId: 'site', clock: ctx.deps.clock, activationRepo: ctx.deps.pluginActivationRepo, getPluginHost: () => ctx.host,
    sources: [{ source: 'built-in', entryPath: '/unused/server/index.mjs',
      manifest: { ...WORD_COUNT_MANIFEST, id: 'lookup-probe', name: 'Lookup probe', tier: 'tier-3', hooks: [], capabilities: [], fields: [], extensions: { tovu: { id: 'tovu/lookup-probe', provides: [] } } },
      importModule: async () => ({ default: definePlugin({ setup(value) { sdk = value; } }) }),
    }],
  });
  await runtime.onPluginEnabled('lookup-probe');
  assert.ok(sdk?.plugins);
  assert.deepEqual(Object.keys(sdk.plugins).sort(), ['findProviders', 'getPlugin']);
  assert.equal((await sdk.plugins.getPlugin({ id: 'tovu/github' }))?.enabled, false);
  ctx.enable();
  assert.equal((await sdk.plugins.getPlugin({ id: 'tovu/github' }))?.enabled, true);
});

test('the manifest adapter never includes malformed package bytes in its error', async t => {
  const ctx = await fixture(t);
  const packageRoot = path.join(ctx.root, 'invalid-manifest');
  await mkdir(packageRoot);
  await writeFile(path.join(packageRoot, 'plugin.json'), '{"private":"fixture-value');
  const warnings: string[] = [];
  const host = createTovuPluginHost({ deps: { ...ctx.deps, listInstalledAgentPlugins: async () => [{ ...plugin, packageRoot }] } }, { resolveEnabled: async () => false, warn: message => warnings.push(message) });
  assert.equal(await host.getPlugin({ id: 'tovu/github' }), null);
  assert.deepEqual((await host.findProviders({ capability: 'content-metrics' })).map(row => row.id), ['tovu/word-count']);
  assert.deepEqual(warnings, Array(2).fill("Plugin 'github': installed identity manifest is unreadable or invalid; omitted from metadata lookup."));
});

test('legacy metadata warns, preserves the install and never infers provides from permissions', async t => {
  const ctx = await fixture(t);
  const warnings: string[] = [];
  const host = createTovuPluginHost({ deps: ctx.deps }, { readAgentManifest: async () => ({ name: 'github', capabilities: ['content.read'] }), resolveEnabled: async () => false, warn: message => warnings.push(message) });
  assert.equal((await host.getPlugin({ id: 'unknown/github' }))?.enabled, false);
  assert.deepEqual(await host.findProviders({ capability: 'content.read' }), []);
  assert.deepEqual(warnings, ["Plugin 'github' has no publisher-qualified id; using 'unknown/github'.", "Plugin 'github' has no publisher-qualified id; using 'unknown/github'."]);
});

test('cross-family identity admission refuses duplicates before publication and releases its lock', async t => {
  const ctx = await fixture(t);
  let published = 0;
  await assert.rejects(ctx.host.withInstallIdentity({ candidate: { id: 'tovu/github', localId: 'bridge', family: 'site-runtime' }, run: async () => { published++; } }), { message: "Duplicate plugin id 'tovu/github'." });
  assert.equal(published, 0);
  const result = await ctx.host.withInstallIdentity({ candidate: { id: 'vendor/bridge', localId: 'bridge', family: 'site-runtime' }, run: async () => { published++; return 'published'; } });
  assert.equal(result, 'published');
  assert.equal(published, 1);
});

test('the composed installer reserves built-in publisher ids even without a cross-family host', async t => {
  const ctx = await fixture(t);
  const sourceDir = path.join(ctx.root, 'alias'); await mkdir(sourceDir);
  await writeFile(path.join(sourceDir, 'tovu.plugin.json'), JSON.stringify({
    ...WORD_COUNT_MANIFEST, id: 'alias', tier: 'tier-1', integrity: {}, capabilities: [], hooks: [], fields: [],
  }));
  const runtime = composePluginRuntime({ workspaceId: 'site', clock: ctx.deps.clock, activationRepo: ctx.deps.pluginActivationRepo,
    installDir: path.join(ctx.root, 'site-plugins'), sources: [{ source: 'built-in', entryPath: '/unused/server/index.mjs', manifest: WORD_COUNT_MANIFEST, importModule: async () => { throw new Error('identity admission must not load executable code'); } }],
  });
  assert.ok(runtime.pluginInstaller);
  await assert.rejects(runtime.pluginInstaller.preview({ sourceDir }), { code: 'PLUGIN_ID_CONFLICT', message: 'The publisher-qualified plugin id conflicts with an installed package.' });
});

test('plugin list/toggle/uninstall dispatch to injected host capabilities and retain authorization', async t => {
  const ctx = await fixture(t);
  const calls: string[] = [];
  const host = { ...ctx.host, getHostCapability: () => ({
    listInstalled: async () => { calls.push('list'); return [plugin]; },
    assertWritable: async () => { calls.push('writable'); },
    setEnabled: async () => { calls.push('disable'); return { pluginId: 'github', enabled: false }; },
    provisionMcp: async () => { calls.push('provision'); },
    uninstall: async () => { calls.push('trash'); return { pluginId: 'github', trashed: true }; },
  }) };
  const deps: PluginsToolDeps = { ...ctx.deps, pluginHost: host, idGen: { newId: () => 'change' }, changeSets: new InMemoryChangeSetRepo(), outbox: {} as never, onPluginEnabled: async () => {}, onPluginDisabled: () => {}, removePlugin: async () => ({ ok: true, version: null }) };
  // Let the host capability own the read, rather than the compatibility fake on the fixture.
  delete (deps as { listInstalledAgentPlugins?: unknown }).listInstalledAgentPlugins;
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' });
  const registrations = buildPluginsRegistrations(deps, { surfaceExchanges });
  async function call(id: string, input: unknown) {
    const registration = registrations.find(row => row.descriptor.id === id); assert.ok(registration);
    return registration.handler({ executionId: 'call', principal: { id: 'operator' }, run: { id: 'run' }, signal: new AbortController().signal, input } as ToolExecutionContext);
  }
  const listed = await call('plugins_list', undefined) as { agentPlugins: unknown[] };
  assert.deepEqual(listed.agentPlugins, [{ pluginId: 'github', version: '1.2.3', archiveDigest: 'a'.repeat(64), skills: ['github'], exports: [] }]);
  const disabled = await call('plugins_set_enabled', { family: 'agent-plugin', pluginId: 'github', enabled: false }) as { changed: boolean };
  assert.equal(disabled.changed, true);
  assert.deepEqual(await call('plugins_uninstall', { family: 'agent-plugin', pluginId: 'github' }), { pluginId: 'github', trashed: true });
  assert.deepEqual(calls, ['list', 'disable', 'trash']);
  deps.authorize = async () => ({ allowed: false, reason: 'no-grant' });
  await assert.rejects(call('plugins_set_enabled', { family: 'agent-plugin', pluginId: 'github', enabled: false }));
  assert.deepEqual(calls, ['list', 'disable', 'trash']);
});

test('search_tools indexes a site plugin keyword and provides capability', async t => {
  const ctx = await fixture(t);
  await ctx.deps.pluginActivationRepo.save({ workspaceId: 'site', pluginId: 'word-count', version: "1.0.0", enabled: true, updatedAt: '2026-10-09T00:00:00.000Z' });
  const sources = await loadEnabledPluginCapabilityToolSources({ workspaceId: 'site', discoverPlugins: ctx.deps.discoverPlugins, pluginActivationRepo: ctx.deps.pluginActivationRepo });
  const registry = createToolRegistry({});
  for (const row of buildPluginCapabilityToolRegistrations({ sources: sources, deps: { ...ctx.deps, postRead: requiredPostReader({ repo: { findById: async () => assert.fail('catalog search must not read posts') } }) }, withExtensionApprovalPolicy })) registry.register(row);
  const catalog = buildToolCatalogQuery(registry);
  assert.deepEqual(catalog.search({ query: 'content-metrics' }, { limit: 10 }).map(row => row.id), ['plugin_capability_word_count']);
  assert.deepEqual(catalog.search({ query: 'reading-time' }, { limit: 10 }).map(row => row.id), ['plugin_capability_word_count']);
});


test('every bundled agent and site package declares a distinct publisher identity and discovery terms', async () => {
  const base = new URL('../../../../../../../content/agent-plugins/', import.meta.url);
  const ids: string[] = [];
  const packages = bundledContributionSources({ sourceRoot: fileURLToPath(base), filename: 'plugin.json' });
  assert.ok(packages.length > 0);
  for (const pluginId of BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED) {
    assert.ok(packages.some(entry => entry.pluginId === pluginId), `${pluginId}: bundled manifest must exist`);
  }
  for (const entry of packages) {
    const value = JSON.parse(await readFile(path.join(entry.packageRoot, 'plugin.json'), 'utf8'));
    const identity = readPluginIdentity({ manifest: value, namespace: 'tovu' });
    assert.equal(identity.id, entry.pluginId === 'ui-ux-design' ? 'jini/ui-ux-design' : 'tovu/' + value.name);
    assert.ok(identity.keywords.length > 0);
    assert.ok(identity.provides.length > 0);
    assert.deepEqual(identity.warnings, []);
    ids.push(identity.id);
  }
  const siteManifest = JSON.parse(await readFile(new URL('../../../../features/plugin-runtime/samples/testimonials-faq/tovu.plugin.json', import.meta.url), 'utf8'));
  for (const value of [WORD_COUNT_MANIFEST, CONTENT_ANALYZER_MANIFEST, siteManifest]) {
    const identity = readPluginIdentity({ manifest: value, name: value.id, namespace: 'tovu' });
    assert.ok(identity.provides.length > 0);
    assert.ok(identity.keywords.length > 0);
    assert.deepEqual(identity.warnings, []);
    ids.push(identity.id);
  }
  assert.equal(new Set(ids).size, ids.length);
});

test('parallel host adapters serialize duplicate identity admission across plugin kinds', async t => {
  const ctx = await fixture(t);
  const second = createTovuPluginHost({ deps: ctx.deps }, { readAgentManifest: async () => manifest, resolveEnabled: async () => false, warn: () => {} });
  let publications = 0;
  const install = (host: typeof ctx.host, family: string, localId: string) => host.withInstallIdentity({
    candidate: { id: 'vendor/shared', family, localId },
    run: async () => {
      ctx.addSite([{ id: localId, name: localId, version: '1.0.0', source: 'site', status: 'valid', errors: [],
        manifest: { ...WORD_COUNT_MANIFEST, id: localId, extensions: { tovu: { id: 'vendor/shared', provides: [] } } } }]);
      publications++;
      return localId;
    },
  });
  const results = await Promise.allSettled([install(ctx.host, 'site-runtime', 'first'), install(second, 'agent-plugin', 'second')]);
  assert.equal(publications, 1);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected');
  assert.equal(rejected?.status === 'rejected' ? rejected.reason.message : undefined, "Duplicate plugin id 'vendor/shared'.");
});

test('unrecorded revisions are omitted without hiding healthy providers or blocking unrelated installs', async t => {
  const ctx = await fixture(t);
  const legacy = { ...plugin, version: '1.0.0', archiveDigest: 'b'.repeat(64) };
  for (const revisions of [[legacy, plugin], [plugin, legacy]]) {
    const warnings: string[] = [];
    const host = createTovuPluginHost({ deps: { ...ctx.deps, listInstalledAgentPlugins: async () => revisions } }, {
      readAgentManifest: async ({ plugin: revision }) => revision.archiveDigest === legacy.archiveDigest ? { name: 'github' } : manifest,
      resolveEnabled: async () => false, warn: message => warnings.push(message),
    });
    assert.equal(await host.getPlugin({ id: 'tovu/github' }), null);
    assert.deepEqual((await host.findProviders({ capability: 'content-metrics' })).map(row => row.id), ['tovu/word-count']);
    assert.equal(await host.withInstallIdentity({ candidate: { id: 'vendor/new', localId: 'new', family: 'agent-plugin' }, run: async () => 'installed' }), 'installed');
    await assert.rejects(host.withInstallIdentity({ candidate: { id: 'tovu/github', localId: 'alias', family: 'site-runtime' }, run: async () => 'must not publish' }), { message: "Duplicate plugin id 'tovu/github'." });
    assert.deepEqual(warnings.filter(message => message.includes('ambiguous installed revisions')), Array(2).fill("Plugin 'github': ambiguous installed revisions; omitted from metadata lookup."));
  }
});

test('conflicting revisions retain every publisher reservation even when a bundled ledger selects one', async t => {
  const ctx = await fixture(t);
  const legacy = { ...plugin, version: '1.0.0', archiveDigest: 'b'.repeat(64) };
  const warnings: string[] = [];
  const host = createTovuPluginHost({ deps: { ...ctx.deps, listInstalledAgentPlugins: async () => [legacy, plugin] } }, {
    readAgentManifest: async ({ plugin: revision }) => ({ ...manifest, extensions: { tovu: { id: revision.archiveDigest === legacy.archiveDigest ? 'vendor/github' : 'tovu/github' } } }),
    resolveEnabled: async () => false, warn: message => warnings.push(message),
  });
  assert.equal(await host.getPlugin({ id: 'tovu/github' }), null);
  assert.deepEqual(warnings, ["Plugin 'github': conflicting publisher identities; omitted from metadata lookup."]);
  for (const id of ['vendor/github', 'tovu/github']) {
    await assert.rejects(host.withInstallIdentity({ candidate: { id, localId: 'alias', family: 'site-runtime' }, run: async () => 'must not publish' }), { message: `Duplicate plugin id '${id}'.` });
  }
  assert.equal(await host.withInstallIdentity({ candidate: { id: 'vendor/new', localId: 'new', family: 'agent-plugin' }, run: async () => 'installed' }), 'installed');
  await mkdir(ctx.deps.agentPluginLayout.forWorkspace('site').root, { recursive: true });
  await recordBundledAgentPluginDigests({ workspaceRoot: ctx.deps.agentPluginLayout.forWorkspace('site').root, seeded: [{ pluginId: 'github', archiveDigest: plugin.archiveDigest }] });
  assert.equal((await host.getPlugin({ id: 'tovu/github' }))?.version, '1.2.3');
  await assert.rejects(host.withInstallIdentity({ candidate: { id: 'vendor/github', localId: 'alias', family: 'site-runtime' }, run: async () => 'must not publish' }), { message: "Duplicate plugin id 'vendor/github'." });
});

test('a broken revision cannot hide the only valid operator revision', async t => {
  const ctx = await fixture(t);
  const broken = { ...plugin, archiveDigest: 'b'.repeat(64) };
  const host = createTovuPluginHost({ deps: { ...ctx.deps, listInstalledAgentPlugins: async () => [broken, plugin] } }, {
    readAgentManifest: async ({ plugin: revision }) => revision.archiveDigest === broken.archiveDigest ? { extensions: { tovu: { id: 'invalid' } } } : manifest,
    resolveEnabled: async () => false, warn: () => {},
  });
  assert.equal((await host.getPlugin({ id: 'tovu/github' }))?.version, '1.2.3');
});

// fxpid: metadata failure isolation and retained provisioning diagnostics.
test('one malformed identity never hides healthy providers or blocks admission', async t => {
  const ctx = await fixture(t);
  const warnings: string[] = [];
  const broken = { ...plugin, pluginId: 'broken' };
  const host = createTovuPluginHost({ deps: { ...ctx.deps, listInstalledAgentPlugins: async () => [broken, plugin] } }, {
    readAgentManifest: async ({ plugin: installed }) => installed.pluginId === 'broken' ? { extensions: { tovu: { id: 'invalid' } } } : manifest,
    resolveEnabled: async () => false, warn: message => warnings.push(message),
  });
  assert.equal((await host.getPlugin({ id: 'tovu/github' }))?.localId, 'github');
  assert.equal(await host.withInstallIdentity({ candidate: { id: 'vendor/new', localId: 'new', family: 'agent-plugin' }, run: async () => 'published' }), 'published');
  assert.deepEqual(warnings, Array(2).fill("Plugin 'broken': installed identity manifest is unreadable or invalid; omitted from metadata lookup."));
});

test('rejected duplicate site records do not reappear in the host directory', async t => {
  const ctx = await fixture(t);
  ctx.addSite([{ id: 'claimant', name: 'Claimant', version: '1.0.0', source: 'site', status: 'invalid', errors: [],
    manifest: { ...WORD_COUNT_MANIFEST, id: 'claimant' } }]);
  assert.deepEqual((await ctx.host.findProviders({ capability: 'content-metrics' })).map(row => row.localId), ['word-count']);
  assert.deepEqual(ctx.warnings, ["Plugin 'claimant': invalid installed manifest omitted from metadata lookup."]);
});

test('same-name legacy plugins in different families are independently addressable', async t => {
  const ctx = await fixture(t);
  ctx.addSite([{ id: 'github', name: 'GitHub', version: '1.0.0', source: 'site', status: 'valid', errors: [],
    manifest: { ...WORD_COUNT_MANIFEST, id: 'github', extensions: {} } }]);
  const host = createTovuPluginHost({ deps: ctx.deps }, { readAgentManifest: async () => ({ name: 'github' }), resolveEnabled: async () => false, warn: () => {} });
  assert.equal((await host.getPlugin({ id: 'unknown/github', family: 'site-runtime' }))?.localId, 'github');
  assert.equal((await host.getPlugin({ id: 'unknown/github', family: 'agent-plugin' }))?.localId, 'github');
  assert.equal(await host.getPlugin({ id: 'unknown/github' }), null);
});

test('MCP provisioning logs each server and reason while preserving activation success', async t => {
  const ctx = await fixture(t);
  const warnings: string[] = [];
  const host = createTovuPluginHost({ deps: ctx.deps }, {
    warn: message => warnings.push(message), resolveMcpServers: async () => ({}),
    provisionMcpServers: async () => ({ provisioned: [], alreadyProvisioned: [], adopted: [], skipped: [],
      failed: [{ serverKey: 'repository', reason: 'connection id is owned by another plugin' }] }),
  });
  await host.getHostCapability({ capability: 'agent-plugin-lifecycle' })!.provisionMcp({ pluginId: 'github', principalId: 'operator' });
  assert.deepEqual(warnings, ["Plugin 'github': MCP provisioning for server 'repository' failed — connection id is owned by another plugin"]);
  const unavailable = createTovuPluginHost({ deps: ctx.deps }, { warn: message => warnings.push(message), resolveMcpServers: async () => { throw new Error('manifest unavailable'); } });
  await unavailable.getHostCapability({ capability: 'agent-plugin-lifecycle' })!.provisionMcp({ pluginId: 'github', principalId: 'operator' });
  assert.equal(warnings[1], "Plugin 'github': MCP provisioning could not run — manifest unavailable");
});

test('L058b site discovery omits invalid identities and propagates activation read failures', async t => {
  const ctx = await fixture(t);
  const base: PluginDiscoveryRecord = { id: 'missing', name: 'Missing', version: '1', source: 'site', status: 'valid', errors: [] };
  ctx.addSite([
    base,
    { ...base, id: 'invalid', status: 'invalid', manifest: WORD_COUNT_MANIFEST },
    { ...base, id: 'bad-identity', manifest: { ...WORD_COUNT_MANIFEST, extensions: { tovu: { id: 'invalid' } } } },
    { ...base, id: 'legacy', manifest: { ...WORD_COUNT_MANIFEST, id: 'legacy', extensions: {} } },
  ]);
  assert.equal((await ctx.host.getPlugin({ id: 'unknown/legacy' }))?.enabled, false);
  assert.deepEqual(ctx.warnings, [
    "Plugin 'missing': invalid installed manifest omitted from metadata lookup.",
    "Plugin 'invalid': invalid installed manifest omitted from metadata lookup.",
    "Plugin 'bad-identity': installed identity manifest is unreadable or invalid; omitted from metadata lookup.",
    "Plugin 'legacy' has no publisher-qualified id; using 'unknown/legacy'.",
  ]);
  await ctx.deps.pluginActivationRepo.save({ workspaceId: 'site', pluginId: 'legacy', version: '1', enabled: true, updatedAt: '2026-10-20T00:00:00Z' });
  assert.equal((await ctx.host.getPlugin({ id: 'unknown/legacy' }))?.enabled, true);
  const failure = new Error('activation unavailable');
  const pluginActivationRepo = new InMemoryPluginActivationRepo();
  t.mock.method(pluginActivationRepo, 'getActivation', async () => { throw failure; });
  const host = createTovuPluginHost({ deps: { ...ctx.deps, pluginActivationRepo } }, { readAgentManifest: async () => manifest, warn: () => {} });
  await assert.rejects(host.getPlugin({ id: 'tovu/word-count' }), error => error === failure);
  assert.equal(await host.withInstallIdentity({ candidate: { id: 'vendor/new', family: 'agent-plugin', localId: 'new' }, run: async () => 'published' }), 'published');
});

test('L058b default agent activation is resolved through the lifecycle owner', async t => {
  const ctx = await fixture(t);
  const host = createTovuPluginHost({ deps: ctx.deps }, { readAgentManifest: async () => manifest, warn: () => {} });
  assert.equal((await host.getPlugin({ id: 'tovu/github' }))?.enabled, true);
  await agentPluginActivations.setAgentPluginActivation({ workspaceRoot: ctx.deps.agentPluginLayout.forWorkspace('site').root, pluginId: 'github', enabled: false, actor: 'pin' });
  assert.equal((await host.getPlugin({ id: 'tovu/github' }))?.enabled, false);
  await agentPluginActivations.setAgentPluginActivation({ workspaceRoot: ctx.deps.agentPluginLayout.forWorkspace('site').root, pluginId: 'github', enabled: true, actor: 'pin' });
  assert.equal((await host.getPlugin({ id: 'tovu/github' }))?.enabled, true);
});

test('L058b agent revision lookup and admission retain distinct selection contracts', async t => {
  const ctx = await fixture(t);
  const old = { ...plugin, archiveDigest: 'b'.repeat(64), version: undefined };
  const broken = { ...plugin, pluginId: 'broken', archiveDigest: 'c'.repeat(64) };
  const warnings: string[] = [];
  let conflicting = false;
  const host = createTovuPluginHost({ deps: { ...ctx.deps, listInstalledAgentPlugins: async () => [old, broken, plugin] } }, {
    readAgentManifest: async ({ plugin: revision }) => {
      if (revision.pluginId === 'broken') throw new Error('unreadable');
      if (revision.archiveDigest === old.archiveDigest) return conflicting
        ? { ...manifest, extensions: { tovu: { id: 'vendor/github' } } }
        : { name: 'github' };
      return manifest;
    },
    resolveEnabled: async () => true, warn: message => warnings.push(message),
  });
  assert.equal(await host.getPlugin({ id: 'tovu/github' }), null);
  assert.ok(warnings.includes("Plugin 'github': ambiguous installed revisions; omitted from metadata lookup."));
  conflicting = true;
  assert.equal(await host.getPlugin({ id: 'tovu/github' }), null);
  assert.ok(warnings.includes("Plugin 'github': conflicting publisher identities; omitted from metadata lookup."));
  await mkdir(ctx.deps.agentPluginLayout.forWorkspace('site').root, { recursive: true });
  await recordBundledAgentPluginDigests({ workspaceRoot: ctx.deps.agentPluginLayout.forWorkspace('site').root, seeded: [{ pluginId: 'github', archiveDigest: old.archiveDigest }] });
  assert.deepEqual(await host.getPlugin({ id: 'vendor/github' }), {
    id: 'vendor/github', localId: 'github', family: 'agent-plugin', version: null, enabled: true, keywords: ['repository'], provides: [],
  });
  for (const id of ['vendor/github', 'tovu/github']) {
    await assert.rejects(host.withInstallIdentity({ candidate: { id, localId: 'alias', family: 'site-runtime' }, run: async () => 'unexpected' }), { message: `Duplicate plugin id '${id}'.` });
  }
  assert.equal(await host.withInstallIdentity({ candidate: { id: 'vendor/new', localId: 'new', family: 'site-runtime' }, run: async () => 'published' }), 'published');
  assert.ok(warnings.includes("Plugin 'broken': installed identity manifest is unreadable or invalid; omitted from metadata lookup."));
});

test('the composed MCP port preserves store errors by identity and persists through the bound store', async t => {
  const { deps } = await fixture(t);
  assert.equal(deps.mcp.classifyError({ error: new ExternalMcpValidationError('invalid input', 'url') }), 'validation');
  assert.equal(deps.mcp.classifyError({ error: new ExternalMcpSecretStoreUnconfiguredError('missing key') }), 'unconfigured');
  assert.equal(deps.mcp.classifyError({ error: Object.assign(new Error('lookalike'), { name: 'ExternalMcpValidationError' }) }), 'other');
  await deps.mcp.saveServer({ workspaceId: deps.workspaceId, serverId: 'bound-store', transport: 'streamable_http', authMode: 'none',
    enabled: false, command: '', url: 'https://mcp.example.test/mcp', args: '', allowedToolNames: '', writeAllowedToolNames: '', principalId: 'operator' });
  const row = await deps.mcp.repo.findByServerId({ workspaceId: deps.workspaceId, serverId: 'bound-store' });
  assert.equal(row?.url, 'https://mcp.example.test/mcp');
  assert.equal(row?.enabled, false);
  assert.equal(row?.allowedToolNames, "[]");
});
