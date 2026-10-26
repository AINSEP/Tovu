import { combineObservabilityPorts, createNoopObservabilityPort, type ObservabilityPort } from "@jini-ai/diagnostics/observability";
import { createAiGenerationSink, createNoopProductAnalytics, withProductAnalyticsGuards, type ProductAnalyticsConsent, type ProductAnalyticsConsentRevision, type ProductAnalyticsPort } from "@jini-ai/analytics/product";
import { createFanOutAiTraceSink, type AiTraceSink } from "@jini-ai/agent-runtime/ai-trace";
import { createPluginProviderHost, type PluginContributionRegistry, type PluginProviderContract, type PluginProviderDeclaration, type PluginProviderLease } from "@jini-ai/plugins/host";

import type { ProviderConfigSource, ProviderPluginConfig } from "./provider-config-source.js";

/**
 * @file Provider plugins at boot (provider wave 2, 2026-10-25): observability, product analytics and
 * AI tracing come from Jini's first-party provider plugins (`@jini-ai/provider-plugins`), never from
 * vendor SDKs in Tovu core. Replaces the env-driven `require()` of an OTel adapter that lived in
 * `platform/observability`: an install pays for an SDK only when the provider plugin is INSTALLED +
 * ENABLED + CONFIGURED, and every other contract keeps its existing noop.
 *
 * Configuration: each provider plugin DECLARES its settings in its manifest (public + secret fields;
 * `PluginProviderDeclaration.settings`), the owner fills them on the plugin's settings card in the
 * admin (Plugins → the plugin → Settings), and they are saved sealed through `ProviderConfigSource`
 * (`provider-config-source.ts`: the project store when one is configured, else the site vault). A
 * provider is "configured" when every required declared field has a value; its saved values are its
 * factory's required args, plus host identity (`serviceName`) and site attribution (`attributionFor`). Never env, files, logs or chat. Tovu
 * holds no per-vendor mapping: everything it needs to know comes from the manifest.
 *
 * Order: initialized (awaited, each bounded by the provider host's timeout) before the composition
 * root decorates kernels and HTTP clients, so application work never starts on a half-built port.
 * Disposed with the site store. Disabling or quarantining a provider plugin retires its contribution
 * generation, which disposes its resources; its port then goes inert (`gatedPort`) until the next boot.
 */

export type ProviderContract = "observability" | "product_analytics" | "ai_trace";

/** Which site sends every signal (owner 2026-10-25): sites of one project can share one backend. */
export interface SiteIdentity {
  readonly siteId: string;
  readonly siteSlug: string;
  readonly environment: "local" | "desktop" | "fly";
  readonly projectId: string;
}

/**
 * The neutral `attribution` factory input (`@jini-ai/provider-plugins`) for one contract: Tovu names
 * the keys per contract, never per vendor — observability uses OpenTelemetry's resource conventions
 * (`deployment.environment` + `tovu.*`), product analytics event properties plus a `site` group, AI
 * traces metadata plus a `site:<slug>` tag.
 * @complexity O(1).
 */
export function attributionFor({ contract, site }: { contract: ProviderContract; site: SiteIdentity }): Readonly<Record<string, unknown>> {
  if (contract === "observability") {
    return { attributes: { "tovu.site.id": site.siteId, "tovu.site.slug": site.siteSlug, "deployment.environment": site.environment, "tovu.project.id": site.projectId } };
  }
  const attributes = { site_id: site.siteId, site_slug: site.siteSlug, environment: site.environment, project_id: site.projectId };
  return contract === "product_analytics" ? { attributes, groups: { site: site.siteId } } : { attributes, tags: [`site:${site.siteSlug}`] };
}

/** One installed + enabled plugin's provider declarations, read from its manifest (no code runs). */
export interface ProviderPluginDeclarations {
  readonly pluginId: string;
  readonly providers: readonly PluginProviderDeclaration[];
}

/**
 * Whether a provider key was saved the retired way: wave 2 stored it as an API credential labelled
 * `plugin:<plugin id>`, which boot no longer reads. Matched by label on the non-decrypting listing,
 * so no secret is ever opened; the admin settings card turns a match into a re-entry notice.
 * @complexity O(n) in the workspace's (small) credential count.
 */
export function legacyProviderCredentialCheck(
  required: { listLabels: () => Promise<readonly { label: string }[]> },
  _optional: Record<string, never> = {},
): (input: { pluginId: string }) => Promise<boolean> {
  return async ({ pluginId }) => (await required.listLabels()).some((row) => row.label === `plugin:${pluginId}`);
}

/**
 * The factory input a provider's saved settings make, or undefined when it is not configured: no row
 * saved, no declared settings, or a required declared field without a value. Only declared names pass.
 * A blank public field takes the plugin's declared `default` (e.g. its vendor's cloud host).
 * @complexity O(f) declared fields.
 */
export function providerInputOf({ declaration, saved }: { declaration: PluginProviderDeclaration; saved: ProviderPluginConfig | null }): Readonly<Record<string, string>> | undefined {
  const fields = declaration.settings ?? [];
  if (!saved || fields.length === 0) return undefined;
  const defaults = Object.fromEntries(fields.filter((field) => !field.secret && field.default).map((field) => [field.name, field.default!]));
  const values: Record<string, string | undefined> = { ...defaults, ...Object.fromEntries(Object.entries(saved.settings).filter(([, value]) => value.trim() !== "")), ...saved.secrets };
  const present = (name: string) => (values[name] ?? "").trim() !== "";
  if (fields.some((field) => field.required && !present(field.name))) return undefined;
  return Object.fromEntries(fields.filter((field) => present(field.name)).map((field) => [field.name, values[field.name]!]));
}

const hasMethods = ({ value, names }: { value: unknown; names: readonly string[] }): boolean =>
  typeof value === "object" && value !== null && names.every((name) => typeof (value as Record<string, unknown>)[name] === "function");

/** Domain-owned port checks; a plugin never supplies or replaces these validators. */
export const PROVIDER_CONTRACTS: readonly PluginProviderContract[] = [
  { contract: "observability", validate: ({ provider }) => hasMethods({ value: provider, names: ["trackRequest", "trackDbQuery", "trackOutboundCall", "trackAgentRun", "trackOperation", "reportError"] }) ? undefined : "not an ObservabilityPort" },
  { contract: "product_analytics", validate: ({ provider }) => hasMethods({ value: provider, names: ["capture", "identify"] }) && validAiCapability({ provider }) ? undefined : "not a ProductAnalyticsPort" },
  { contract: "ai_trace", validate: ({ provider }) => hasMethods({ value: provider, names: ["record"] }) ? undefined : "not an AiTraceSink" },
];

/** Optional capabilities remain optional; malformed declarations are refused before composition.
 * @complexity O(1). */
function validAiCapability({ provider }: { provider: unknown }): boolean {
  const port = provider as ProductAnalyticsPort;
  return (port.captureAiGeneration === undefined || typeof port.captureAiGeneration === "function")
    && (port.includeAiContent === undefined || typeof port.includeAiContent === "boolean");
}

export interface ProviderPluginRuntime {
  readonly providerContributions: PluginContributionRegistry;
  /** Installed + enabled plugins that declare providers, from their manifests; no plugin code runs. */
  listProviderPlugins(required: Record<string, never>, optional?: Record<string, never>): Promise<readonly ProviderPluginDeclarations[]>;
  /** `timeoutMs` bounds each plugin's import + setup; a plugin past it is revoked and left on the noop. */
  loadProviderPlugins(required: { pluginIds: readonly string[] }, optional?: { timeoutMs?: number }): Promise<readonly string[]>;
}

export interface ProviderPluginPorts {
  readonly observability: ObservabilityPort;
  /** Already behind `withProductAnalyticsGuards` (consent first); the shared noop when unconfigured. */
  readonly productAnalytics: ProductAnalyticsPort;
  /** Undefined without a trace provider or analytics AI capability: hosts then skip recording. */
  readonly aiTraceSink: AiTraceSink | undefined;
  /** Idempotent; bounded per resource by the provider host. */
  dispose(required: Record<string, never>, optional?: Record<string, never>): Promise<void>;
}

export interface BootProviderPluginsRequired {
  readonly runtime: ProviderPluginRuntime;
  /** Saved settings per plugin. Read failures are treated as "not configured". */
  readonly config: ProviderConfigSource;
  readonly serviceName: string;
  /** Carried by every signal as the factory's `attribution` input. */
  readonly site: SiteIdentity;
  readonly consent: ProductAnalyticsConsent;
  readonly consentRevision: ProductAnalyticsConsentRevision;
}

export interface BootProviderPluginsOptional {
  readonly initializeTimeoutMs?: number;
  readonly warn?: (message: string) => void;
}

type Configured = { pluginId: string; contract: ProviderContract; id: string; input: Readonly<Record<string, string>> };

const KNOWN_CONTRACTS = new Set<string>(["observability", "product_analytics", "ai_trace"]);

async function configuredProviders({ runtime, config, warn }: { runtime: ProviderPluginRuntime; config: ProviderConfigSource; warn: (message: string) => void }): Promise<Configured[]> {
  const configured: Configured[] = [];
  for (const { pluginId, providers } of await runtime.listProviderPlugins({})) {
    const saved = await config.read({ pluginId }).catch(() => {
      warn(`provider plugin '${pluginId}': its settings could not be read; left on the noop`);
      return null;
    });
    for (const declaration of providers.filter((candidate) => KNOWN_CONTRACTS.has(candidate.contract))) {
      const input = providerInputOf({ declaration, saved });
      if (input) configured.push({ pluginId, contract: declaration.contract as ProviderContract, id: declaration.id, input });
    }
  }
  return configured;
}

/** Fans product events out to every configured analytics port (normally one), isolating failures
 * and each provider's content opt-in. @complexity O(p) per event for p configured providers. */
function fanOutProductAnalytics({ ports }: { ports: readonly ProductAnalyticsPort[] }): ProductAnalyticsPort {
  const [only, ...rest] = ports;
  if (only && rest.length === 0) return only;
  const each = (send: (port: ProductAnalyticsPort) => void) => { for (const port of ports) { try { send(port); } catch { /* one vendor never blocks another */ } } };
  return {
    capture: (event) => each((port) => port.capture(event)), identify: (identity) => each((port) => port.identify(identity)),
    ...(ports.some((port) => port.captureAiGeneration) ? {
      includeAiContent: ports.some((port) => port.captureAiGeneration && port.includeAiContent === true),
      captureAiGeneration: (event: Parameters<NonNullable<ProductAnalyticsPort["captureAiGeneration"]>>[0]) => each((port) => {
        // Each provider owns its opt-in, even when another provider requests content.
        const { input: _input, output: _output, ...metadata } = event;
        port.captureAiGeneration?.(port.includeAiContent === true ? event : metadata);
      }),
    } : {}),
  };
}

/** Each contract's inert behavior, used once a lease is retired. */
const NOOP_PORTS: Readonly<Record<ProviderContract, () => object>> = {
  observability: () => createNoopObservabilityPort({}),
  product_analytics: () => createNoopProductAnalytics({}),
  ai_trace: (): AiTraceSink => ({ record() {}, flush: async () => {}, shutdown: async () => {} }),
};

/**
 * Disable/quarantine retires a lease and disposes its resources, but composed ports were built at
 * boot: every call re-checks `isCurrent()` first so a retired lease admits no new work (Jini's lease
 * contract) and the call takes the contract's noop path instead. Methods the port lacks (e.g. an AI
 * trace sink without `flush`) take the noop path too.
 * @complexity O(m) at boot for m contract methods; O(1) per gated call.
 */
function gatedPort({ lease, contract }: { lease: PluginProviderLease; contract: ProviderContract }): unknown {
  const noop = NOOP_PORTS[contract]() as Record<string, (...args: unknown[]) => unknown>;
  const port = lease.port as Record<string, unknown>;
  const names = Object.keys(noop);
  if (contract === "product_analytics" && typeof port.captureAiGeneration === "function") names.push("captureAiGeneration");
  const gated = Object.fromEntries(names.map((name) => [name, (...args: unknown[]) => {
    const live = port[name];
    return lease.isCurrent({}) && typeof live === "function" ? live.apply(port, args) : noop[name]?.(...args);
  }]));
  if (contract === "product_analytics") Object.defineProperty(gated, "includeAiContent", { get: () => lease.isCurrent({}) && port.includeAiContent === true });
  return gated;
}

/** Composes guarded analytics, trace destinations and independent observability without vendor knowledge.
 * @complexity O(p + s) at boot for p analytics providers and s trace sinks; no external I/O. */
function composePorts({ leases, consent, consentRevision, site }: { leases: ReadonlyMap<ProviderContract, unknown[]>; consent: ProductAnalyticsConsent; consentRevision: ProductAnalyticsConsentRevision; site: SiteIdentity }) {
  const analytics = (leases.get("product_analytics") ?? []) as ProductAnalyticsPort[];
  const sinks = [...(leases.get("ai_trace") ?? [])] as AiTraceSink[];
  const productAnalytics = analytics.length === 0 ? createNoopProductAnalytics({})
    : withProductAnalyticsGuards({ inner: fanOutProductAnalytics({ ports: analytics }), consent }, { consentRevision });
  // Site-scoped operator activity: consent is the site's telemetry setting; no synthetic person
  // identity or prompt-derived id is needed. The plugin attaches the same site group as other events.
  const generations = createAiGenerationSink({ analytics: productAnalytics, userId: `site:${site.siteId}` });
  if (generations) sinks.push(generations);
  return {
    observability: combineObservabilityPorts({ ports: (leases.get("observability") ?? []) as ObservabilityPort[] }),
    productAnalytics,
    shutdownGenerations: () => generations?.shutdown?.(),
    aiTraceSink: sinks.length === 0 ? undefined : createFanOutAiTraceSink({ sinks }),
  };
}

/**
 * Selects, loads and initializes provider plugins, then composes one port per contract.
 * @param required Plugin runtime, saved-settings source, service identity and the operator's telemetry consent.
 * @param optional Initialization bound (also bounds each plugin's import + setup), warning sink.
 * @returns Ports (noop where nothing is configured) and the shared teardown. Never throws for a
 *   provider failure: that contract stays on its noop and the reason is logged.
 * @complexity O(p) settings reads plus one load and one bounded initialization per configured provider.
 */
export async function bootProviderPlugins(required: BootProviderPluginsRequired, optional: BootProviderPluginsOptional = {}): Promise<ProviderPluginPorts> {
  const warn = optional.warn ?? ((message: string) => console.warn(`[provider-plugins] ${message}`));
  const configured = await configuredProviders({ runtime: required.runtime, config: required.config, warn });
  const timeoutMs = optional.initializeTimeoutMs ?? 10_000;
  const loaded = new Set(await required.runtime.loadProviderPlugins({ pluginIds: [...new Set(configured.map(({ pluginId }) => pluginId))] }, { timeoutMs }));
  const host = createPluginProviderHost({ contributions: required.runtime.providerContributions, contracts: PROVIDER_CONTRACTS }, {
    initializeTimeoutMs: timeoutMs,
    onError: ({ pluginId, phase }) => warn(`provider plugin '${pluginId}' ${phase} failed`),
  });
  const leases = new Map<ProviderContract, unknown[]>();
  for (const provider of configured.filter(({ pluginId }) => loaded.has(pluginId))) {
    const lease: PluginProviderLease | undefined = await host.initialize({ contract: provider.contract, id: provider.id, input: { ...provider.input, serviceName: required.serviceName, attribution: attributionFor({ contract: provider.contract, site: required.site }) } })
      // Class only: an SDK's construction error can quote the endpoint or DSN it was given.
      .catch((error: unknown) => { warn(`provider plugin '${provider.pluginId}' did not initialize: ${error instanceof Error ? error.name : typeof error}`); return undefined; });
    if (lease) leases.set(provider.contract, [...(leases.get(provider.contract) ?? []), gatedPort({ lease, contract: provider.contract })]);
  }
  const { shutdownGenerations, ...ports } = composePorts({ leases, consent: required.consent, consentRevision: required.consentRevision, site: required.site });
  return { ...ports, dispose: async () => { await shutdownGenerations(); await host.dispose({}); } };
}
