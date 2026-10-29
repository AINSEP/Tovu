/** Install-level telemetry for Tovu's desktop processes, independent of every site's providers. */
import { readFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { redactSecrets } from '@jini-ai/core';
import { maskLocalPaths } from '@jini-ai/diagnostics';
import { createNoopObservabilityPort, type ErrorReport, type ObservabilityPort } from '@jini-ai/diagnostics/observability';
import { createNoopProductAnalytics, withProductAnalyticsGuards, type ProductAnalyticsPort } from '@jini-ai/analytics/product';
import type { PluginDiscoveryRecord } from '@jini-ai/plugins/host/node';
import { redactLocalText } from '#src/platform/server-logs/redact-local-text';
import { productAdminScreen, projectProductEvent } from '#src/server/runtime/composition/product-events';
import { processBuildRelease } from './build-release.js';

import type { ProductConsent, ProductTelemetry } from '@tovu/contracts/product-telemetry';
export type { ProductConsent, ProductTelemetry } from '@tovu/contracts/product-telemetry';
interface ConfigEntry { plugin: string; input: Readonly<Record<string, unknown>>; }
export interface ProductTelemetryConfig { observability?: ConfigEntry; productAnalytics?: ConfigEntry; }
export interface ProductTelemetryRequired { configPath: string; preferencePath: string; processRole: 'server' | 'daemon' | 'desktop-main'; release: string; }
export interface ProductProviderInput { config: ProductTelemetryConfig; attribution: { attributes: Record<string, string>; groups: Record<string, string> }; release: string; }
export interface ProductTelemetryOptions {
  loadProviders?: (required: ProductProviderInput) => Promise<ProductTelemetry>;
  readConsent?: () => ProductConsent;
  warn?: (message: string) => void;
}
const OFF: ProductConsent = Object.freeze({ crashes: false, usage: false, installationId: null });
const WARNING = '[product-telemetry] unavailable; product reporting is disabled';
// Five levels above composition/: Resources in the staged desktop bundle (stage-website-shared keeps
// website/src/server/runtime/composition below it), the payload root in a packaged child, apps/ in a
// checkout. Stack frames below it stay readable as app:///…; every other local path is masked.
const INSTALL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
// Frames are home-redacted before masking, so the root is retained in its redacted spelling too.
const KEEP_ROOTS = [INSTALL_ROOT, redactLocalText({ text: INSTALL_ROOT })];

/** Parse the existing desktop preference key; malformed values never grant consent. O(1). */
function consentOf({ value }: { value: unknown }, _options = {}): ProductConsent {
  const record = (value as { productTelemetry?: Partial<ProductConsent> } | null)?.productTelemetry;
  return { crashes: record?.crashes === true, usage: record?.usage === true,
    installationId: typeof record?.installationId === 'string' ? record.installationId : null };
}

/** One cache per process consumer. Stat every event, parse only after mtime changes; any I/O or
 * parse failure is off, including deletion after a previously successful read.
 * @param required Preference path supplied by desktop main, never a site setting.
 * @param options File effects are injectable for exact read-count tests.
 * @returns The synchronous per-event consent reader for analytics and error gates.
 * @complexity O(1) stat per event; O(n) preference bytes only on a changed mtime.
 */
export function createProductConsentReader({ preferencePath }: { preferencePath: string }, { stat = statSync, read = readFileSync }: {
  stat?: (file: string) => { mtimeMs: number }; read?: (file: string, encoding: 'utf8') => string;
} = {}): () => ProductConsent {
  let mtime: number | undefined;
  let cached = OFF;
  return () => {
    let next: number;
    try { next = stat(preferencePath).mtimeMs; }
    catch { mtime = undefined; cached = OFF; return OFF; }
    if (next === mtime) return cached;
    mtime = next;
    cached = OFF;
    try { cached = consentOf({ value: JSON.parse(read(preferencePath, 'utf8')) }); }
    catch { /* An unchanged unreadable/malformed record stays cached as off. */ }
    return cached;
  };
}

/** Validate one optional config entry before any provider code runs. O(n) plugin id length. */
function validEntry({ entry }: { entry: ConfigEntry | undefined }, _options = {}): boolean {
  if (entry === undefined) return true;
  if (!entry || typeof entry.plugin !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.plugin)) return false;
  return Boolean(entry.input) && typeof entry.input === 'object' && !Array.isArray(entry.input);
}

/** Validate a vendor-neutral config before any provider code runs. O(1) entries, no effects. */
function configOf({ value }: { value: unknown }, _options = {}): ProductTelemetryConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('InvalidProductConfig');
  const config = value as ProductTelemetryConfig;
  // An empty document would mark telemetry active (and prompt for consent) with nothing to send.
  if (!config.observability && !config.productAnalytics) throw new Error('InvalidProductConfig');
  for (const key of ['observability', 'productAnalytics'] as const) {
    const entry = config[key];
    if (!validEntry({ entry })) throw new Error('InvalidProductConfig');
  }
  return config;
}

/** No config and failed boot use the existing noop owners. O(1), no effects. */
function noopTelemetry(_required: Record<string, never>, _options = {}): ProductTelemetry {
  return { observability: createNoopObservabilityPort({}), productAnalytics: createNoopProductAnalytics({}), async dispose() {} };
}

/** Select the configured contract from discovery's validated manifest, never from config data.
 * @throws To boot on missing/invalid artifacts or a missing contract. @complexity O(p + c) catalog.
 */
function productProviderOf({ records, pluginId, contract }: { records: readonly PluginDiscoveryRecord[]; pluginId: string; contract: string }, _options = {}) {
  const record = records.find(item => item.id === pluginId);
  const manifest = record?.manifest;
  if (!record || !manifest) throw new Error('ProductProviderUnavailable');
  const provider = manifest.contributes?.providers?.find(item => item.contract === contract);
  if (!provider) throw new Error('ProductProviderUnavailable');
  return { record, manifest, provider };
}

/** Bind artifact discovery and the existing product SDK once; Jini owns integrity, import ordering,
 * provider validation and lifecycle. This is composition glue, never a second plugin runtime.
 * @throws To the boot boundary, which releases earlier resources and stays on both noops.
 * @complexity O(a) discovery/integrity in bundled artifact bytes; at most two provider loads.
 */
async function loadProductProviders(required: ProductProviderInput, _options = {}): Promise<ProductTelemetry> {
  const [{ discoverPlugins, loadProviderPluginArtifact, siteEntryPath }, { pluginHostBinding, createPluginModuleImporter }, { PROVIDER_CONTRACTS }] = await Promise.all([
    import('@jini-ai/plugins/host/node'), import('../../../features/plugin-runtime/host-binding.js'), import('./provider-contracts.js'),
  ]);
  // The staged desktop bundle has no node_modules ancestor: resolve from the payload/shell roots too.
  const catalogPath = createRequire(import.meta.url).resolve('@jini-ai/provider-plugins/catalog', {
    paths: [path.dirname(fileURLToPath(import.meta.url)), path.join(INSTALL_ROOT, 'tovu'), path.join(INSTALL_ROOT, 'app.asar')],
  });
  const installDir = path.join(path.dirname(catalogPath), 'plugins');
  const records = await discoverPlugins({ ...pluginHostBinding, builtIns: [], installDir });
  const resources: Awaited<ReturnType<typeof loadProviderPluginArtifact>>[] = [];
  const result = noopTelemetry({});
  result.dispose = async () => { await Promise.all(resources.map(resource => resource.dispose({}))); };
  try {
    for (const [key, contract] of [['observability', 'observability'], ['productAnalytics', 'product_analytics']] as const) {
      const entry = required.config[key];
      if (!entry) continue;
      const { record, manifest, provider } = productProviderOf({ records, pluginId: entry.plugin, contract });
      const unavailable = (): never => { throw new Error('ProductProviderHasNoSiteContext'); };
      const resource = await loadProviderPluginArtifact({ load: { ...pluginHostBinding, record, manifest,
        entryPath: siteEntryPath({ installDir, id: record.id, version: record.version }),
        importModule: createPluginModuleImporter({ manifest, source: 'built-in' }),
        coreDeps: { getCurrentEntry: unavailable, writeExtField: unavailable, attachFilter: unavailable } },
        contracts: PROVIDER_CONTRACTS, contract, id: provider.id,
        input: { ...entry.input, release: required.release, environment: required.attribution.attributes.environment, attribution: required.attribution } }, { factoryOptions: { info() {} } });
      resources.push(resource);
      // The provider host validated the selected contract before returning its opaque port.
      Object.assign(result, { [key]: resource.port });
    }
    return result;
  } catch (error) { await result.dispose(); throw error; }
}

/** Credential + PII redaction precedes truncation so a cut cannot hide a secret's shape. O(n). */
function scrub({ text }: { text: string }, _options = {}): string {
  return maskLocalPaths({ text: redactSecrets({ input: redactLocalText({ text }) }) }, { keepRoots: KEEP_ROOTS });
}

/** Project diagnostic context without carrying site IDs, URLs, user identities or raw route slugs.
 * @returns Only the permitted context keys, with local text scrubbed. @complexity O(n) selected text.
 */
function errorContext({ context }: Pick<ErrorReport, 'context'>, _options = {}): ErrorReport['context'] {
  const attributes: Record<string, string | number> = {};
  for (const key of ['process', 'code', 'signal'] as const) {
    const value = context.attributes?.[key];
    if (typeof value === 'string') attributes[key] = scrub({ text: value }).slice(0, 100);
    else {
      if (typeof value === 'number' && Number.isFinite(value)) attributes[key] = value;
    }
  }
  const route = productAdminScreen({ route: context.attributes?.route });
  if (route) attributes.route = route;
  return { operation: scrub({ text: context.operation }).slice(0, 100), attributes,
    ...(context.level === 'warning' ? { level: 'warning' as const } : {}) };
}

const PRODUCT_METRIC_UNITS: Readonly<Record<string, string>> = Object.freeze({
  'process.memory.rss': 'By', 'process.memory.heap_used': 'By', 'process.count': '{process}', 'process.uptime': 's',
});
const PRODUCT_METRIC_PROCESSES = new Set(['main', 'renderer', 'server', 'daemon', 'other']);

/** Product errors follow crash consent; numeric gauges follow usage consent with fixed labels.
 * Causes/custom Error fields and caller-named metric attributes never cross.
 * All lifecycle signals retain the singleton noop implementations (no product traces).
 * @returns A port retaining local error admission and metric capability.
 * @complexity O(n) error and permitted context text per report; O(1) per metric.
 */
function productObservability({ inner, readConsent }: { inner: ObservabilityPort; readConsent: () => ProductConsent }, _options = {}): ObservabilityPort {
  return { ...createNoopObservabilityPort({}),
    get supportsMetric() { return inner.supportsMetric === true; },
    metric(input, options = {}) {
      if (readConsent().usage !== true || !Object.hasOwn(PRODUCT_METRIC_UNITS, input.name)) return undefined;
      const process = options.attributes?.process;
      if (typeof process !== 'string' || !PRODUCT_METRIC_PROCESSES.has(process) || !Number.isFinite(input.value) || input.value < 0) return undefined;
      return inner.metric({ name: input.name, value: input.value }, { kind: 'gauge', unit: PRODUCT_METRIC_UNITS[input.name], attributes: { process } });
    }, reportError({ error, context }) {
      if (readConsent().crashes !== true) return false;
      const original = error instanceof Error ? error : new Error(String(error));
      const safe = new Error(scrub({ text: original.message }).slice(0, 300));
      safe.name = scrub({ text: original.name }).slice(0, 100);
      safe.stack = scrub({ text: original.stack ?? '' });
      return inner.reportError({ error: safe, context: errorContext({ context }) });
    } };
}

/** Catalog projection precedes the shared privacy guard: caller IDs and discarded fields cannot
 * affect the install-level identity or leak to a provider. Identify is inert; AI content absent.
 * @complexity O(k) bounded catalog projection plus the existing analytics guard.
 */
function productAnalytics({ inner, readConsent }: { inner: ProductAnalyticsPort; readConsent: () => ProductConsent }, _options = {}): ProductAnalyticsPort {
  const guarded = withProductAnalyticsGuards({ inner: { capture: event => inner.capture(event), identify() {} }, consent: () => readConsent().usage === true });
  return { identify() {}, capture(event) {
    const projected = projectProductEvent({ event, installationId: readConsent().installationId });
    if (projected) return guarded.capture(projected);
    return undefined;
  } };
}

/** Release a partially booted output and emit one fixed diagnostic; neither effect may fail boot.
 * @returns Both existing noops. @complexity O(1) plus the provider owner's bounded disposal.
 */
async function failedProductBoot({ providers, warn }: { providers?: ProductTelemetry; warn?: (message: string) => void }, _options = {}): Promise<ProductTelemetry> {
  try { await providers?.dispose(); } catch { /* Boot must remain available even if provider cleanup fails. */ }
  try { (warn ?? console.warn)(WARNING); } catch { /* A diagnostic sink cannot fail boot. */ }
  return noopTelemetry({});
}

/** Boot both install-level outputs atomically. No config/read/load/init failure escapes or prints
 * config/error text; partial provider resources are disposed by their loading owner.
 * @param required Paths, process role and release supplied by the desktop launch boundary.
 * @param options Provider loader, synchronous consent reader and fixed-warning sink.
 * @returns Guarded outputs, optional native-upload configuration and owned teardown.
 * @example bootProductTelemetry({ configPath, preferencePath, processRole: 'server', release });
 * @complexity O(config + bundled artifact bytes) at boot; per-event costs documented above.
 */
export async function bootProductTelemetry(required: ProductTelemetryRequired, options: ProductTelemetryOptions = {}): Promise<ProductTelemetry> {
  let providers: ProductTelemetry | undefined;
  try {
    const config = configOf({ value: JSON.parse(await readFile(required.configPath, 'utf8')) });
    providers = await (options.loadProviders ?? loadProductProviders)({ config, release: required.release,
      attribution: { attributes: { source: 'desktop', release: required.release, environment: 'desktop',
        'service.version': required.release, 'deployment.environment': 'desktop', os: process.platform, arch: process.arch, process: required.processRole }, groups: {} } });
    const readConsent = options.readConsent ?? createProductConsentReader({ preferencePath: required.preferencePath });
    const crashUpload = providers.observability.crashUpload?.({ release: required.release, environment: 'desktop' });
    return { active: true, observability: productObservability({ inner: providers.observability, readConsent }),
      productAnalytics: productAnalytics({ inner: providers.productAnalytics, readConsent }),
      ...(crashUpload ? { crashUpload } : {}), dispose: providers.dispose };
  } catch {
    return failedProductBoot({ providers, warn: options.warn });
  }
}

/** Children opt in only when main supplied both paths. No env means no file reads, warnings or
 * provider loads; ordinary web/dev composition retains its existing ports and tracker behavior.
 * @returns Undefined without an active launch configuration. @complexity O(1) beyond boot.
 */
export async function bootProductTelemetryFromEnv({ env = process.env, processRole = 'server' }: { env?: NodeJS.ProcessEnv; processRole?: 'server' | 'daemon' }, options: ProductTelemetryOptions = {}): Promise<ProductTelemetry | undefined> {
  const configPath = env.TOVU_PRODUCT_TELEMETRY_CONFIG;
  const preferencePath = env.TOVU_PRODUCT_TELEMETRY_PREFS;
  if (!configPath || !preferencePath) return undefined;
  return bootProductTelemetry({ configPath, preferencePath, processRole, release: env.TOVU_PRODUCT_RELEASE || processBuildRelease({}) }, options);
}
