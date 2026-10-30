import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, utimes, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createNoopObservabilityPort, isNoopObservabilityPort, type ErrorReport, type MetricInput, type MetricOptions } from '@jini-ai/diagnostics/observability';
import { isNoopProductAnalytics, type ProductEvent } from '@jini-ai/analytics/product';
import { bootProductTelemetry, bootProductTelemetryFromEnv, createProductConsentReader, loadProductProviders, type ProductConsent, type ProductProviderInput, type ProductTelemetry } from '../product-telemetry.js';
import { PRODUCT_EVENTS, projectProductEvent } from '../product-events.js';

const INSTALL = '00000000-0000-4000-8000-000000000001';
const CONFIG = { observability: { plugin: 'fake-errors', input: { key: 'FAKE_ERROR_KEY', environment: 'test' } },
  productAnalytics: { plugin: 'fake-usage', input: { apiKey: 'FAKE_USAGE_KEY', personProfiles: 'never' } } };
const granted: ProductConsent = { crashes: true, usage: true, installationId: INSTALL };

test('memory gauges follow usage consent with fixed labels; warnings retain crash consent and severity', async () => {
  const f = await fixture();
  let consent = granted;
  try {
    const product = await bootProductTelemetry(f.required, { ...f.options, readConsent: () => consent });
    assert.equal(product.observability.supportsMetric, true);
    const input = { name: 'process.memory.rss', value: 1_300_000_000 };
    const options = { kind: 'gauge' as const, unit: 'By', attributes: { process: 'renderer', siteId: 'private-site', path: '/private/site' } };
    await product.observability.metric(input, options);
    assert.deepEqual(f.metrics, [{ input, options: { kind: 'gauge', unit: 'By', attributes: { process: 'renderer' } } }]);
    for (const value of [NaN, Infinity, -1]) await product.observability.metric({ ...input, value }, options);
    await product.observability.metric({ ...input, name: 'private-metric' }, options);
    await product.observability.metric(input, { attributes: { process: 'private-site' } });
    await product.observability.metric(input);
    assert.equal(f.metrics.length, 1);
    assert.deepEqual(f.events, []);
    const report = () => ({ error: new Error('process memory growth'), context: { operation: 'desktop.memory_growth', level: 'warning' as const,
      attributes: { process: 'renderer', code: 'sustained-growth', rss_0_mb: 1000, rss_1_mb: 1300, elapsed_0_min: 0, elapsed_1_min: 60,
        rss_64_mb: 9000, rss_2_mb: 'private text', elapsed_2_min: -1, siteId: 'private-site', series: '/private/site' } } });
    product.observability.reportError(report());
    assert.deepEqual(f.errors[0]!.context, { operation: 'desktop.memory_growth', level: 'warning', attributes: {
      process: 'renderer', code: 'sustained-growth',
    } });
    consent = { crashes: false, usage: true, installationId: INSTALL };
    await product.observability.metric(input, options);
    assert.equal(product.observability.reportError(report()), false);
    assert.deepEqual([f.metrics.length, f.errors.length], [2, 1]);
    consent = { crashes: true, usage: false, installationId: INSTALL };
    await product.observability.metric(input, options);
    product.observability.reportError(report());
    assert.deepEqual([f.metrics.length, f.errors.length], [2, 2]);
    consent = { crashes: false, usage: false, installationId: null };
    await product.observability.metric(input, options);
    product.observability.reportError(report());
    assert.deepEqual([f.metrics.length, f.errors.length], [2, 2]);
    assert.equal(JSON.stringify(f.metrics).includes('private'), false);
    assert.equal(JSON.stringify(f.errors).includes('private'), false);
    consent = granted;
    Object.assign(f.raw.observability, { supportsMetric: false });
    assert.equal(product.observability.supportsMetric, false);
    f.raw.observability.reportError = () => false;
    assert.equal(product.observability.reportError(report()), false);
    const pendingAdmission = Promise.resolve(false);
    f.raw.observability.reportError = () => pendingAdmission;
    assert.equal(product.observability.reportError(report()), pendingAdmission);
  } finally { await f.close(); }
});

/** Only disposable fixture files and fake ports; never the user's preferences or provider keys. */
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'tovu-product-telemetry-'));
  const configPath = path.join(root, 'config.json'), preferencePath = path.join(root, 'desktop-preferences.json');
  await writeFile(configPath, JSON.stringify(CONFIG));
  const events: ProductEvent[] = [], errors: ErrorReport[] = [], inputs: ProductProviderInput[] = [];
  const metrics: { input: MetricInput; options?: MetricOptions }[] = [];
  let disposed = 0, tick = 0;
  const raw: ProductTelemetry = {
    observability: { ...createNoopObservabilityPort({}), supportsMetric: true,
      metric: (input, options) => { metrics.push({ input, options }); }, reportError: report => { errors.push(report); },
      trackRequest() { assert.fail('no product request tracking'); },
      trackDbQuery() { assert.fail('no product DB tracking'); },
      trackOutboundCall() { assert.fail('no product outbound tracking'); },
      trackAgentRun() { assert.fail('no product agent tracking'); },
      trackOperation() { assert.fail('no product spans'); },
      crashUpload: input => ({ submitURL: 'https://crash.example.test/upload', globalExtra: { release: input.release } }) },
    productAnalytics: { capture: event => { events.push(event); }, identify() { assert.fail('product identify must be inert'); },
      captureAiGeneration() { assert.fail('product AI content must be absent'); } },
    dispose: async () => { disposed++; },
  };
  const required = { configPath, preferencePath, processRole: 'server' as const, release: 'tovu-desktop@0.0.0-test' };
  const options = { loadProviders: async (input: ProductProviderInput) => { inputs.push(input); return raw; } };
  const prefs = async (record: unknown) => {
    await writeFile(preferencePath, JSON.stringify({ automaticUpdates: true, productTelemetry: record }));
    const next = new Date(1_800_000_000_000 + ++tick * 10_000);
    await utimes(preferencePath, next, next);
  };
  return { root, events, errors, metrics, inputs, raw, required, options, prefs, disposed: () => disposed,
    close: () => rm(root, { recursive: true, force: true }) };
}

test('unset or incomplete child env never loads providers or reads config, and returns no product branch', async () => {
  let loads = 0, warnings = 0;
  const options = { loadProviders: async (): Promise<ProductTelemetry> => { loads++; throw new Error('must not load'); }, warn: () => { warnings++; } };
  for (const env of [{}, { TOVU_PRODUCT_TELEMETRY_CONFIG: '/missing/fake-config.json' }, { TOVU_PRODUCT_TELEMETRY_PREFS: 'C:\\missing\\fake-prefs.json' }]) {
    assert.equal(await bootProductTelemetryFromEnv({ env, processRole: 'server' }, options), undefined);
  }
  assert.deepEqual({ loads, warnings }, { loads: 0, warnings: 0 });
});

test('catalog event uses installation identity; unknown and visitor events are dropped, free-text enum properties are omitted', async () => {
  const f = await fixture();
  try {
    await f.prefs(granted);
    const product = await bootProductTelemetry(f.required, f.options);
    await product.productAnalytics.capture({ name: 'site_created', userId: 'site-principal', properties: { templateKind: 'default', source: 'admin', targetSiteId: 'private-site', siteSlug: 'about-us', duration: 42 } });
    for (const name of ['invented_event', 'form_submitted', 'member_registered', 'site_search_performed', 'provider_initialized', 'content_saved', 'post_created', 'page_created']) {
      await product.productAnalytics.capture({ name, userId: 'site-principal' });
    }
    await product.productAnalytics.capture({ name: 'site_created', userId: 'site-principal', properties: { templateKind: 'private free-text template' } });
    await product.productAnalytics.capture({ name: 'app_started', userId: 'site-principal', properties: { launchMode: 'a free-text mode' } });
    product.productAnalytics.identify({ userId: 'site-principal', traits: { plan: 'private' } });
    assert.equal(product.productAnalytics.captureAiGeneration, undefined);
    assert.equal(product.productAnalytics.browserAnalytics, undefined);
    assert.deepEqual(f.events, [
      { name: 'site_created', userId: INSTALL, properties: { templateKind: 'default', source: 'admin' } },
      { name: 'site_created', userId: INSTALL, properties: {} },
      { name: 'app_started', userId: INSTALL, properties: {} },
    ]);
    assert.deepEqual(f.inputs, [{ config: CONFIG, release: f.required.release, attribution: { attributes: {
      source: 'desktop', release: f.required.release, environment: 'desktop', 'service.version': f.required.release, 'deployment.environment': 'desktop', os: process.platform, arch: process.arch, process: 'server',
    }, groups: {} } }]);
    assert.deepEqual(product.crashUpload, { submitURL: 'https://crash.example.test/upload', globalExtra: { release: f.required.release } });
    await product.dispose();
    assert.equal(f.disposed(), 1);
  } finally { await f.close(); }
});

test('unknown enum drops only its property and still sends the event; known enum is kept', async () => {
  const f = await fixture();
  try {
    const product = await bootProductTelemetry(f.required, { ...f.options, readConsent: () => granted });
    await product.productAnalytics.capture({ name: 'assistant_run_finished', userId: 'principal', properties: { outcome: 'new-outcome', chatSurface: 'admin' } });
    await product.productAnalytics.capture({ name: 'assistant_run_finished', userId: 'principal', properties: { outcome: 'succeeded', chatSurface: 'admin' } });
    assert.deepEqual(f.events, [
      { name: 'assistant_run_finished', userId: INSTALL, properties: { chatSurface: 'admin' } },
      { name: 'assistant_run_finished', userId: INSTALL, properties: { chatSurface: 'admin', outcome: 'succeeded' } },
    ]);
  } finally { await f.close(); }
});

test('admin route is renamed and projected to two segments; queries and later slugs do not escape', async () => {
  const f = await fixture();
  try {
    const product = await bootProductTelemetry(f.required, { ...f.options, readConsent: () => granted });
    for (const route of ['/admin/pages/about-us', '/admin/posts/private-slug?secret=private#private', '/admin/database/private-site-slug']) {
      await product.productAnalytics.capture({ name: 'admin_pageview', userId: 'principal', properties: { route } });
    }
    assert.deepEqual(f.events, [
      { name: 'admin_screen_viewed', userId: INSTALL, properties: { screen: '/admin/pages' } },
      { name: 'admin_screen_viewed', userId: INSTALL, properties: { screen: '/admin/posts' } },
      { name: 'admin_screen_viewed', userId: INSTALL, properties: { screen: '/admin/database' } },
    ]);
  } finally { await f.close(); }
});

test('each next event sees mtime consent changes; usage and crashes are independent; no identity drops usage', async () => {
  const f = await fixture();
  const event = { name: 'app_started', userId: 'principal', properties: { launchMode: 'fresh' } };
  const report = () => ({ error: new Error('fake failure'), context: { operation: 'fake.operation' } });
  try {
    await f.prefs({ ...granted, usage: false });
    const product = await bootProductTelemetry(f.required, f.options);
    await product.productAnalytics.capture(event); product.observability.reportError(report());
    assert.deepEqual([f.events.length, f.errors.length], [0, 1]);
    await f.prefs({ ...granted, crashes: false });
    await product.productAnalytics.capture(event); product.observability.reportError(report());
    assert.deepEqual([f.events.length, f.errors.length], [1, 1]);
    await f.prefs({ crashes: false, usage: false, installationId: null });
    await product.productAnalytics.capture(event); product.observability.reportError(report());
    assert.deepEqual([f.events.length, f.errors.length], [1, 1]);
    await f.prefs({ ...granted, installationId: null });
    await product.productAnalytics.capture(event);
    assert.equal(f.events.length, 1);
  } finally { await f.close(); }
});

test('error payload masks POSIX/Windows/UNC/file paths, credentials and email; context and lifecycle signals are restricted', async () => {
  const f = await fixture();
  try {
    const product = await bootProductTelemetry(f.required, { ...f.options, readConsent: () => granted });
    const key = ['sk', 'FAKE'.repeat(12)].join('-');
    const privateValues = ['/Users/x/Sites/a.txt', 'C:\\Users\\x\\a.txt', 'C:/Users/x/a.txt', '\\\\fake-host\\private\\a.txt', 'file:///private/fake.txt', key, 'fake.person@example.test'];
    const message = privateValues.join(' ');
    const original = new Error(message, { cause: new Error('private cause') });
    original.stack = `Error: ${message}\n at fake (${privateValues[0]}:3:2)`;
    product.observability.reportError({ error: original, context: { operation: 'admin.browser.error', attributes: {
      process: 'server', route: '/admin/pages/about-us', code: 123, signal: 'SIGTERM', siteId: 'private-site', principalId: 'private-person', componentStack: 'private components',
    } } });
    assert.equal(f.errors.length, 1);
    const sent = f.errors[0]!;
    for (const value of privateValues) assert.equal(JSON.stringify({ error: { message: (sent.error as Error).message, stack: (sent.error as Error).stack }, context: sent.context }).includes(value), false, value);
    assert.deepEqual(sent.context, { operation: 'admin.browser.error', attributes: { process: 'server', route: '/admin/pages', code: 123, signal: 'SIGTERM' } });
    assert.equal((sent.error as Error).cause, undefined);
    assert.equal(original.message, message, 'site branch error is not mutated');
    product.observability.reportError({ error: new Error('x'.repeat(500)), context: { operation: 'fake.operation' } });
    assert.equal((f.errors[1]!.error as Error).message.length, 300);
    // A frame inside the shipped tree (this checkout's apps/) stays readable; others are masked.
    const shipped = new Error('fake');
    shipped.stack = `Error: fake\n at shipped (${fileURLToPath(import.meta.url)}:3:2)\n at other (/opt/elsewhere/a.ts:1:1)`;
    product.observability.reportError({ error: shipped, context: { operation: 'fake.operation' } });
    assert.match((f.errors[2]!.error as Error).stack ?? '', /^Error: fake\n at shipped \(app:\/\/\/[^\s<>()]*\/__tests__\/product-telemetry\.unit\.test\.ts:3:2\)\n at other \(<path>:1:1\)$/);
    product.observability.trackRequest({ method: 'GET', path: '/private' }).end({ statusCode: 500, routePattern: '/private' });
    product.observability.trackDbQuery({ system: 'sqlite' }).end({ operation: 'select' });
    product.observability.trackOutboundCall({ method: 'GET', url: 'https://private.example.test' }).end({ statusCode: 500 });
    product.observability.trackAgentRun({ runId: 'private' }).end({ status: 'failed' });
    product.observability.trackOperation({ name: 'private' }).end({ outcome: 'failed', failed: true });
    assert.equal(f.errors.length, 3);
  } finally { await f.close(); }
});

test('preference reader parses only on mtime change, and stat/read/JSON/malformed booleans fail closed', () => {
  for (const preferencePath of ['/fake/preferences.json', 'C:\\fake\\preferences.json']) {
    let mtimeMs = 1, reads = 0, statFails = false, readFails = false;
    let text = JSON.stringify({ productTelemetry: granted });
    const read = createProductConsentReader({ preferencePath }, {
      stat: file => { assert.equal(file, preferencePath); if (statFails) throw new Error('fake stat error'); return { mtimeMs }; },
      read: file => { assert.equal(file, preferencePath); reads++; if (readFails) throw new Error('fake read error'); return text; },
    });
    assert.deepEqual(read(), granted); assert.deepEqual(read(), granted); assert.equal(reads, 1);
    text = JSON.stringify({ productTelemetry: { ...granted, usage: false } });
    assert.deepEqual(read(), granted); assert.equal(reads, 1);
    mtimeMs++;
    assert.equal(read().usage, false); assert.equal(reads, 2);
    statFails = true;
    assert.deepEqual(read(), { crashes: false, usage: false, installationId: null });
    statFails = false; mtimeMs++; readFails = true;
    assert.deepEqual(read(), { crashes: false, usage: false, installationId: null });
    readFails = false; mtimeMs++; text = '{broken';
    assert.deepEqual(read(), { crashes: false, usage: false, installationId: null });
    const readsAfterCorrupt = reads;
    assert.deepEqual(read(), { crashes: false, usage: false, installationId: null });
    assert.equal(reads, readsAfterCorrupt, 'unchanged malformed bytes are cached as off too');
    for (const productTelemetry of [null, {}, { crashes: 'true', usage: 1, installationId: 123 }]) {
      mtimeMs++; text = JSON.stringify({ productTelemetry });
      assert.deepEqual(read(), { crashes: false, usage: false, installationId: null });
    }
  }
});

test('missing/corrupt config, invalid shape and load/init failure yield both noops and exactly one fixed warning', async () => {
  const f = await fixture();
  try {
    const messages: string[] = [];
    for (const text of [undefined, '{broken', 'null', '[]', '{}', '{"observability":{"plugin":"../private","input":{}}}', '{"productAnalytics":{"plugin":"fake","input":null}}', JSON.stringify(CONFIG)]) {
      if (text === undefined) await rm(f.required.configPath);
      else await writeFile(f.required.configPath, text);
      const warnings: string[] = [];
      const product = await bootProductTelemetry(f.required, { warn: message => warnings.push(message),
        loadProviders: async () => { throw new Error('fake init failed with PRIVATE_CONFIG_VALUE'); } });
      assert.equal(isNoopObservabilityPort(product.observability), true);
      assert.equal(isNoopProductAnalytics(product.productAnalytics), true);
      assert.deepEqual(warnings, ['[product-telemetry] unavailable; product reporting is disabled']);
      assert.equal(product.crashUpload, undefined);
      await product.dispose(); messages.push(...warnings);
    }
    assert.equal(messages.length, 8);
  } finally { await f.close(); }
});

test('post-load failure disposes resources and a throwing warning sink cannot fail boot', async () => {
  const f = await fixture();
  try {
    f.raw.observability.crashUpload = () => { throw new Error('fake capability failure'); };
    const product = await bootProductTelemetry(f.required, { ...f.options, warn() { throw new Error('fake warning failure'); } });
    assert.equal(isNoopProductAnalytics(product.productAnalytics), true);
    assert.equal(f.disposed(), 1);
  } finally { await f.close(); }
});

test('catalog is frozen; declared free-text enum values and unknown identity fields are omitted', () => {
  assert.equal(Object.isFrozen(PRODUCT_EVENTS), true);
  for (const rules of Object.values(PRODUCT_EVENTS)) {
    assert.equal(Object.isFrozen(rules), true);
    for (const rule of Object.values(rules)) if (Array.isArray(rule)) assert.equal(Object.isFrozen(rule), true);
  }
  assert.deepEqual(projectProductEvent({ installationId: INSTALL, event: { name: 'plugin_toggled', userId: 'private', properties: { enabled: true, pluginKind: 'cms', pluginId: 'custom-private-name' } } }),
    { name: 'plugin_toggled', userId: INSTALL, properties: { enabled: true, pluginKind: 'cms' } });
  assert.deepEqual(projectProductEvent({ installationId: INSTALL, event: { name: 'desktop_action', userId: 'private', properties: { action: 'private action' } } }),
    { name: 'desktop_action', userId: INSTALL, properties: {} });
  assert.equal(projectProductEvent({ installationId: INSTALL, event: { name: 'toString', userId: 'private' } }), undefined);
});

test('maker errors discard site trace IDs and arbitrary attributes while preserving permitted context', async () => {
  const f = await fixture();
  try {
    const product = await bootProductTelemetry(f.required, { ...f.options, readConsent: () => granted });
    const trace = { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) };
    const report: ErrorReport = { error: new Error('safe failure'), context: {
      operation: 'admin.browser.error', level: 'warning', trace,
      attributes: { process: 'server', code: 503, signal: 'SIGTERM', route: '/admin/posts/private-slug?private=query',
        traceId: trace.traceId, spanId: trace.spanId, siteId: 'private-site', projectId: 'private-project',
        principalId: 'private-principal', arbitrary: 'private-value' },
    } };
    product.observability.reportError(report);
    assert.equal(f.errors.length, 1);
    assert.deepEqual(f.errors[0]!.context, { operation: 'admin.browser.error', level: 'warning',
      attributes: { process: 'server', code: 503, signal: 'SIGTERM', route: '/admin/posts' } });
    assert.equal(JSON.stringify(f.errors[0]!.context).includes('private'), false);
    assert.deepEqual(report.context.trace, trace, 'site error context remains untouched for its own providers');
    await product.dispose();
  } finally { await f.close(); }
});

/** Separate installed packages exercise the real discovery, integrity and provider lifecycle owners.
 * The resolver port isolates npm lookup; no vendor SDK, aggregate package or sibling checkout is used. */
async function standaloneFixture() {
  const f = await fixture();
  const logPath = path.join(f.root, 'signals.jsonl');
  const catalogPath = path.join(f.root, 'catalog.json');
  await writeFile(logPath, '');
  const catalog = [
    { kind: 'provider', id: 'fake-errors', packageName: '@jini-ai/plugin-fixture-errors', contract: { id: 'observability' } },
    { kind: 'provider', id: 'fake-usage', packageName: '@jini-ai/plugin-fixture-usage', contract: { id: 'product_analytics' } },
    { kind: 'provider', id: 'unselected', packageName: '@jini-ai/plugin-not-installed', contract: { id: 'observability' } },
  ];
  await writeFile(catalogPath, JSON.stringify(catalog));
  const packages = new Map<string, string>([['@jini-ai/plugin-catalog/catalog', catalogPath]]);
  const entries = new Map<string, string>();
  for (const entry of catalog.slice(0, 2)) {
    const packageRoot = path.join(f.root, entry.id);
    const artifactRoot = path.join(packageRoot, 'plugins', entry.id, '0.7.0');
    await mkdir(path.join(artifactRoot, 'server'), { recursive: true });
    const source = `import { appendFileSync } from 'node:fs';
      const write = value => appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(value) + '\\n');
      export default { definition: { setup(sdk) {
        write({ type: 'import', id: ${JSON.stringify(entry.id)} });
        sdk.providers.register({ contract: ${JSON.stringify(entry.contract.id)}, id: 'fixture', contractVersion: 1,
          factory(input, options = {}) {
            if (input.fail) throw new Error('PRIVATE_INIT_FAILURE');
            write({ type: 'init', id: ${JSON.stringify(entry.id)}, input });
            return { port: ${entry.contract.id === 'observability' ? `{
              trackRequest() {}, trackDbQuery() {}, trackOutboundCall() {}, trackAgentRun() {}, trackOperation() {},
              reportError(report) { write({ type: 'error', message: report.error.message }); return true; }
            }` : `{
              capture(event) { write({ type: 'event', event }); }, identify() {}
            }`}, dispose() { write({ type: 'dispose', id: ${JSON.stringify(entry.id)} }); } };
          }
        });
      } } };
    `;
    const entryPath = path.join(artifactRoot, 'server/index.mjs');
    await writeFile(entryPath, source);
    await writeFile(path.join(artifactRoot, 'jini.plugin.json'), JSON.stringify({
      id: entry.id, name: entry.id, version: '0.7.0', sdkRange: '^0.1.0 || ^1.0.0', engine: 1, tier: 'tier-3',
      extensions: { tovu: { id: `fixture/${entry.id}` } }, capabilities: ['providers.register'], hooks: [], fields: [],
      contributes: { providers: [{ contract: entry.contract.id, id: 'fixture', contractVersion: 1 }] },
      integrity: { 'server/index.mjs': `sha256-${createHash('sha256').update(source).digest('hex')}` },
    }));
    const packagePath = path.join(packageRoot, 'package.json');
    await writeFile(packagePath, JSON.stringify({ name: entry.packageName, version: '0.7.0' }));
    packages.set(`${entry.packageName}/package.json`, packagePath);
    entries.set(entry.id, entryPath);
  }
  const resolved: string[] = [];
  const resolvePackage: NodeJS.RequireResolve = Object.assign((specifier: string, options?: Parameters<NodeJS.RequireResolve>[1]) => {
    resolved.push(specifier);
    assert.ok(options?.paths?.some(root => root.endsWith('app.asar')), 'desktop shell root remains available');
    assert.ok(options?.paths?.some(root => root.endsWith('tovu')), 'desktop payload root remains available');
    const target = packages.get(specifier);
    if (!target) throw new Error('PRIVATE_MISSING_PACKAGE');
    return target;
  }, { paths: () => null });
  const signals = async () => (await readFile(logPath, 'utf8')).trim().split('\n').filter(Boolean)
    .map(line => JSON.parse(line) as { type: string; id?: string; input?: Record<string, unknown>; event?: ProductEvent });
  return { ...f, catalog, catalogPath, packages, entries, resolved, signals,
    loadProviders: (input: ProductProviderInput) => loadProductProviders(input, { resolvePackage }) };
}

test('standalone catalog resolves only configured packages; real provider ports retain live consent and attribution', async () => {
  const f = await standaloneFixture();
  let consent: ProductConsent = { crashes: false, usage: false, installationId: INSTALL };
  try {
    const product = await bootProductTelemetry(f.required, { loadProviders: f.loadProviders, readConsent: () => consent });
    assert.equal(product.active, true);
    assert.deepEqual(f.resolved, ['@jini-ai/plugin-catalog/catalog', '@jini-ai/plugin-fixture-errors/package.json', '@jini-ai/plugin-fixture-usage/package.json']);
    const event = { name: 'app_started', userId: 'site-principal', properties: { launchMode: 'fresh' } };
    const report = { error: new Error('safe fixture'), context: { operation: 'fixture' } };
    await product.productAnalytics.capture(event);
    assert.equal(product.observability.reportError(report), false);
    consent = granted;
    await product.productAnalytics.capture(event);
    assert.equal(product.observability.reportError(report), true);
    consent = { ...granted, crashes: false, usage: false };
    await product.productAnalytics.capture(event);
    assert.equal(product.observability.reportError(report), false);
    const signals = await f.signals();
    assert.equal(signals.filter(signal => signal.type === 'error').length, 1);
    assert.deepEqual(signals.filter(signal => signal.type === 'event').map(signal => signal.event), [{ ...event, userId: INSTALL }]);
    const inputs = signals.filter(signal => signal.type === 'init').map(signal => signal.input!);
    assert.equal(inputs.length, 2);
    for (const input of inputs) {
      assert.equal(input.release, f.required.release);
      assert.equal(input.environment, 'desktop');
      assert.deepEqual(input.attribution, { attributes: { source: 'desktop', release: f.required.release, environment: 'desktop',
        'service.version': f.required.release, 'deployment.environment': 'desktop', os: process.platform, arch: process.arch, process: 'server' }, groups: {} });
    }
    await product.dispose();
    assert.deepEqual((await f.signals()).filter(signal => signal.type === 'dispose').map(signal => signal.id).sort(), ['fake-errors', 'fake-usage']);
  } finally { await f.close(); }
});

test('one configured standalone provider leaves the other noop without resolving its package', async () => {
  for (const [key, packageName] of [['observability', 'fixture-errors'], ['productAnalytics', 'fixture-usage']] as const) {
    const f = await standaloneFixture();
    try {
      await writeFile(f.required.configPath, JSON.stringify({ [key]: CONFIG[key] }));
      const product = await bootProductTelemetry(f.required, { loadProviders: f.loadProviders });
      assert.equal(product.active, true);
      assert.deepEqual(f.resolved, ['@jini-ai/plugin-catalog/catalog', `@jini-ai/plugin-${packageName}/package.json`]);
      assert.equal(product.observability.reportError({ error: new Error('denied'), context: { operation: 'fixture' } }), false);
      await product.productAnalytics.capture({ name: 'app_started', userId: 'site-principal' });
      assert.equal((await f.signals()).some(signal => signal.type === 'event'), false);
      await product.dispose();
    } finally { await f.close(); }
  }
});

test('standalone lookup, discovery, integrity and init failures release earlier providers and disable both outputs', async () => {
  for (const failure of ['missing-package', 'catalog-contract', 'manifest-contract', 'invalid-manifest', 'integrity', 'init']) {
    const f = await standaloneFixture();
    try {
      if (failure === 'missing-package') f.packages.delete('@jini-ai/plugin-fixture-usage/package.json');
      if (failure === 'catalog-contract') {
        f.catalog[1]!.contract.id = 'observability';
        await writeFile(f.catalogPath, JSON.stringify(f.catalog));
      }
      if (failure === 'manifest-contract' || failure === 'invalid-manifest') {
        const manifestPath = path.join(path.dirname(f.entries.get('fake-usage')!), '../jini.plugin.json');
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
        if (failure === 'manifest-contract') manifest.contributes.providers[0].contract = 'observability';
        else manifest.engine = 999;
        await writeFile(manifestPath, JSON.stringify(manifest));
      }
      if (failure === 'integrity') await writeFile(f.entries.get('fake-usage')!, 'throw new Error("must not import tampered bytes");');
      if (failure === 'init') await writeFile(f.required.configPath, JSON.stringify({ ...CONFIG, productAnalytics: { ...CONFIG.productAnalytics, input: { fail: true } } }));
      const warnings: string[] = [];
      const product = await bootProductTelemetry(f.required, { loadProviders: f.loadProviders, warn: message => warnings.push(message) });
      assert.equal(product.active, undefined, failure);
      assert.equal(isNoopObservabilityPort(product.observability), true, failure);
      assert.equal(isNoopProductAnalytics(product.productAnalytics), true, failure);
      assert.deepEqual(warnings, ['[product-telemetry] unavailable; product reporting is disabled'], failure);
      const signals = await f.signals();
      assert.deepEqual(signals.filter(signal => signal.type === 'dispose').map(signal => signal.id), ['fake-errors'], failure);
      assert.equal(signals.filter(signal => signal.type === 'import' && signal.id === 'fake-usage').length, failure === 'init' ? 1 : 0, failure);
      await product.dispose();
      assert.equal((await f.signals()).filter(signal => signal.type === 'dispose').length, 1, failure);
    } finally { await f.close(); }
  }
});

test('missing or malformed catalog and unknown selections fail closed before importing any provider', async () => {
  for (const failure of ['missing-catalog', 'malformed-catalog', 'unknown-plugin']) {
    const f = await standaloneFixture();
    try {
      if (failure === 'missing-catalog') f.packages.delete('@jini-ai/plugin-catalog/catalog');
      if (failure === 'malformed-catalog') await writeFile(f.catalogPath, '{broken');
      if (failure === 'unknown-plugin') await writeFile(f.required.configPath, JSON.stringify({ observability: { plugin: 'unknown', input: {} } }));
      const warnings: string[] = [];
      const product = await bootProductTelemetry(f.required, { loadProviders: f.loadProviders, warn: message => warnings.push(message) });
      assert.equal(isNoopObservabilityPort(product.observability), true, failure);
      assert.equal(isNoopProductAnalytics(product.productAnalytics), true, failure);
      assert.deepEqual(warnings, ['[product-telemetry] unavailable; product reporting is disabled'], failure);
      assert.deepEqual(f.resolved, ['@jini-ai/plugin-catalog/catalog'], failure);
      assert.deepEqual(await f.signals(), [], failure);
    } finally { await f.close(); }
  }
});

test('Tovu declares no production vendor plugins; OTLP is development-only and lock entries match the selected packages', async () => {
  const manifest = JSON.parse(await readFile(new URL('../../../../../../../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(await readFile(new URL('../../../../../../../package-lock.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(manifest.dependencies).filter(name => name.startsWith('@jini-ai/plugin-')).sort(),
    ['@jini-ai/plugin-catalog', '@jini-ai/plugin-ui-ux-design']);
  assert.equal(manifest.dependencies['@jini-ai/provider-plugins'], undefined);
  assert.equal(manifest.optionalDependencies?.['@jini-ai/plugin-observability-opentelemetry'], undefined);
  for (const name of ['@jini-ai/plugin-catalog', '@jini-ai/plugin-ui-ux-design']) {
    assert.equal(manifest.dependencies[name], '^0.6.15');
    assert.equal(lock.packages[''].dependencies[name], manifest.dependencies[name]);
    assert.equal(lock.packages[`node_modules/${name}`].version, '0.6.15');
    assert.equal(lock.packages[`node_modules/${name}`].dev, undefined);
  }
  const otlp = '@jini-ai/plugin-observability-opentelemetry';
  assert.equal(manifest.devDependencies[otlp], '^0.6.15');
  assert.equal(lock.packages[''].devDependencies[otlp], manifest.devDependencies[otlp]);
  assert.equal(lock.packages[`node_modules/${otlp}`].version, '0.6.15');
  assert.equal(lock.packages[`node_modules/${otlp}`].dev, true);
});
