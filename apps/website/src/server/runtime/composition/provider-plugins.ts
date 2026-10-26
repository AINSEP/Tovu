import { createTracker, createTrackerWarning, createTelemetryTestProbe } from "@jini-ai/diagnostics/observability/node";
import { createHash } from 'node:crypto';
import { createTelemetryDeliveryMonitor, describeTelemetryFailure, type Tracker, type ProviderTelemetryReport, type TelemetryTestResult } from "@jini-ai/diagnostics/observability";
import { combineObservabilityPorts, createNoopObservabilityPort, type ObservabilityPort } from "@jini-ai/diagnostics/observability";
import { createAiGenerationSink, createNoopProductAnalytics, fanOutProductAnalytics, withProductAnalyticsGuards, type ProductAnalyticsConsent, type ProductAnalyticsConsentRevision, type ProductAnalyticsPort, type BrowserAnalyticsContribution } from "@jini-ai/analytics/product";
import { createFanOutAiTraceSink, type AiTraceSink } from "@jini-ai/agent-runtime/ai-trace";
import { createPluginProviderHost, PluginProviderStartupError, isProviderSettingRequired, type PluginContributionRegistry, type PluginProviderContract, type PluginProviderDeclaration, type PluginProviderLease } from "@jini-ai/plugins/host";

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
 * boot holds no per-vendor mapping: everything it needs to know comes from the manifest; the
 * settings adapter alone normalizes retired persisted choices before they reach this boundary.
 *
 * Order: initialized (awaited, each bounded by the provider host's timeout) before the composition
 * root decorates kernels and HTTP clients, so application work never starts on a half-built port.
 * Disposed with the site store. Disabling or quarantining a provider plugin retires its contribution
 * generation, which disposes its resources; its port then goes inert (`gatedPort`) until it is reapplied.
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
export function providerInputOf({ declaration, saved }: { declaration: PluginProviderDeclaration; saved: ProviderPluginConfig | null }, _optional = {}): Readonly<Record<string, string>> | undefined {
  const fields = declaration.settings ?? [];
  if (!saved || fields.length === 0) return undefined;
  const defaults = Object.fromEntries(fields.filter((field) => !field.secret && field.default).map((field) => [field.name, field.default!]));
  const values: Record<string, string | undefined> = { ...defaults, ...Object.fromEntries(Object.entries(saved.settings).filter(([, value]) => value.trim() !== "")), ...saved.secrets };
  const present = (name: string) => (values[name] ?? "").trim() !== "";
  if (fields.some((field) => isProviderSettingRequired({ field, values }) && !present(field.name))) return undefined;
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
    && (port.browserAnalytics === undefined || typeof port.browserAnalytics === 'function')
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
  readonly browserAnalytics?: (required: { surface: 'site' | 'admin' }) => readonly BrowserAnalyticsContribution[];
  readonly observability: ObservabilityPort;
  readonly tracker: Tracker;
  /** Used only after the public boundary has validated the visitor's consent proof. */
  readonly visitorTracker?: Tracker;
  observabilityEnabled?: () => boolean;
  telemetryStatus: ReturnType<typeof createTelemetryDeliveryMonitor>["read"];
  sendTelemetryTest(required: { error: Error }, optional?: Record<string, never>): Promise<TelemetryTestResult>;
  /** Undefined when neither a trace nor analytics provider is declared; slots can activate live. */
  readonly aiTraceSink: AiTraceSink | undefined;
  appliesAt(required: { pluginId: string }, optional?: Record<string, never>): "now" | "restart" | "failed";
  reapply(required: { pluginId: string }, optional?: Record<string, never>): Promise<import("@jini-ai/plugins/host").PluginProviderApplyResult>;
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
  readonly info?: (message: string) => void;
}

type ProviderSlot = { pluginId: string; contract: ProviderContract; id: string;
  declaration: PluginProviderDeclaration; lease?: PluginProviderLease; input?: string; initializationObserved?: boolean };
/** An absent input is already inert; a configured input must also retain a current generation. */
function unchangedSlot({ slot, signature }: { slot: ProviderSlot; signature: string | undefined }, _optional = {}): boolean {
  if (signature !== slot.input) return false;
  return signature === undefined || slot.lease?.isCurrent({}) === true;
}

/** Legacy browser contributors cannot promise retirement of downloaded SDKs on a live change. */
function browserNeedsRestart({ slot, saved }: { slot: ProviderSlot; saved: ProviderPluginConfig | null }, _optional = {}): boolean {
  if (slot.contract !== 'product_analytics' || !slot.lease) return false;
  const input = providerInputOf({ declaration: slot.declaration, saved });
  if (unchangedSlot({ slot, signature: input === undefined ? undefined : JSON.stringify(input) })) return false;
  const port = slot.lease.port as ProductAnalyticsPort;
  try {
    return (['site', 'admin'] as const).some(surface => {
      const browser = port.browserAnalytics?.({ surface });
      return browser !== undefined && browser.supportsLiveConsent !== true;
    });
  } catch { return true; }
}
const KNOWN_CONTRACTS = new Set<string>(["observability", "product_analytics", "ai_trace"]);

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
function gatedPort({ slot, contract, testProbe }: { slot: ProviderSlot; contract: ProviderContract; testProbe: ReturnType<typeof createTelemetryTestProbe> }): unknown {
  const noop = NOOP_PORTS[contract]() as Record<string, (...args: unknown[]) => unknown>;
  const names = Object.keys(noop);
  // Keep the optional hook available before attachment; every call follows the current slot.
  if (contract === "product_analytics") names.push("captureAiGeneration", "browserAnalytics");
  const browserCache = new Map<string, { lease: unknown; contribution: unknown }>();
  const gated = Object.fromEntries(names.map((name) => [name, (...args: unknown[]) => {
    const lease = slot.lease;
    const port = lease?.port as Record<string, unknown> | undefined;
    const live = port?.[name];
    if (!lease?.isCurrent({}) || typeof live !== "function") return noop[name]?.(...args);
    if (name === 'browserAnalytics') {
      const surface = (args[0] as { surface: string }).surface;
      const cached = browserCache.get(surface);
      if (cached?.lease === lease) return cached.contribution;
      const contribution = live.apply(port, args);
      browserCache.set(surface, { lease, contribution });
      return contribution;
    }
    const result = live.apply(port, args);
    testProbe.accepted({ providerId: `${slot.pluginId}/${slot.id}`, method: name, input: args[0] });
    return result;
  }]));
  if (contract === "product_analytics") Object.defineProperty(gated, "includeAiContent", {
    get: () => slot.lease?.isCurrent({}) === true && (slot.lease.port as ProductAnalyticsPort).includeAiContent === true,
  });
  if (contract === "ai_trace") Object.defineProperty(gated, "capture", {
    get: () => slot.lease?.isCurrent({}) ? (slot.lease.port as AiTraceSink).capture : "metadata",
  });
  return gated;
}

/** Composes guarded analytics, trace destinations and independent observability without vendor knowledge.
 * @complexity O(p + s) at boot for p analytics providers and s trace sinks; no external I/O. */
function composePorts({ leases, consent, consentRevision, site, warn }: { warn: (message: string) => void; leases: ReadonlyMap<ProviderContract, unknown[]>; consent: ProductAnalyticsConsent; consentRevision: ProductAnalyticsConsentRevision; site: SiteIdentity }) {
  const analytics = (leases.get("product_analytics") ?? []) as ProductAnalyticsPort[];
  const sinks = [...(leases.get("ai_trace") ?? [])] as AiTraceSink[];
  const failed = createTrackerWarning({}, { warn });
  const inner = fanOutProductAnalytics({ ports: analytics }, { onFailure: failed });
  // Jini snapshots capability flags at construction; the site wrappers must follow live opt-ins.
  const productAnalytics = analytics.length === 0 ? createNoopProductAnalytics({}) : {
    ...withProductAnalyticsGuards({ inner, consent }, { consentRevision }),
    get includeAiContent() { return inner.includeAiContent === true; },
  };
  // Site-scoped operator activity: consent is the site's telemetry setting; no synthetic person
  // identity or prompt-derived id is needed. The plugin attaches the same site group as other events.
  const generations = createAiGenerationSink({ analytics: productAnalytics, userId: `site:${site.siteId}` });
  if (generations) sinks.push({ ...generations, get capture() { return productAnalytics.includeAiContent === true ? "full" : "metadata"; } });
  const observability = combineObservabilityPorts({ ports: (leases.get("observability") ?? []) as ObservabilityPort[] }, { onFailure: failed });
  const browserCache = new Map<string, { inputs: readonly BrowserAnalyticsContribution[]; output: readonly BrowserAnalyticsContribution[] }>();
  return {
    observability,
    browserAnalytics: (required: { surface: 'site' | 'admin' }): readonly BrowserAnalyticsContribution[] => {
      const contributions = analytics.flatMap(port => {
        try { const contribution = port.browserAnalytics?.(required); return contribution ? [contribution] : []; }
        catch { failed(); return []; }
      });
      const cached = browserCache.get(required.surface);
      if (cached && cached.inputs.length === contributions.length && contributions.every((item, index) => item === cached.inputs[index])) return cached.output;
      // One revision for the complete inventory: retiring any provider invalidates every old SDK.
      // Cache by live lease contributions; polls never rebuild source or rehash unchanged providers.
      const revision = createHash('sha256').update(JSON.stringify(contributions)).digest('hex');
      const output = contributions.map(contribution => ({ ...contribution, configuration: {
        url: `/_jini/browser-analytics?surface=${required.surface}`, revision,
      } }));
      browserCache.set(required.surface, { inputs: contributions, output });
      return output;
    },
    tracker: createTracker({ observability, productAnalytics }, { warn }),
    // Public callers own visitor proof checks; the owner's admin preference cannot veto them.
    visitorTracker: createTracker({ observability, productAnalytics: withProductAnalyticsGuards({ inner, consent: () => true }) }, { warn }),
    shutdownGenerations: () => generations?.shutdown?.(),
    aiTraceSink: sinks.length === 0 ? undefined : {
      ...createFanOutAiTraceSink({ sinks }),
      get capture() { return sinks.some((sink) => sink.capture === "full") ? "full" as const : "metadata" as const; },
    },
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
  const delivery = createTelemetryDeliveryMonitor({ warn });
  const testProbe = createTelemetryTestProbe({});
  const timeoutMs = optional.initializeTimeoutMs ?? 10_000;
  const slots: ProviderSlot[] = (await required.runtime.listProviderPlugins({})).flatMap(({ pluginId, providers }) =>
    providers.filter(declaration => KNOWN_CONTRACTS.has(declaration.contract)).map(declaration => ({ pluginId,
      contract: declaration.contract as ProviderContract, id: declaration.id, declaration })));
  const loaded = new Set<string>();
  const host = createPluginProviderHost({ contributions: required.runtime.providerContributions, contracts: PROVIDER_CONTRACTS }, {
    initializeTimeoutMs: timeoutMs,
    onError: ({ pluginId, phase }) => warn(`provider plugin '${pluginId}' ${phase} failed`),
  });
  const queues = new Map<string, Promise<import("@jini-ai/plugins/host").PluginProviderApplyResult>>();
  const applied = new Map<string, "now" | "restart" | "failed">();
  let tracker: Tracker | undefined;
  const initializations: import('@jini-ai/analytics/product').ProductEvent[] = [];
  function initialization({ slot, outcome, reasonClass }: { slot: ProviderSlot; outcome: 'success' | 'failure' | 'noop'; reasonClass: 'ready' | 'not_configured' | 'initialization_failed' }): void {
    slot.initializationObserved = true;
    const event = { name: 'provider_initialized', userId: `site:${required.site.siteId}`,
      properties: { contract: slot.contract, providerId: slot.id, outcome, reasonClass } };
    if (tracker) tracker.capture(event);
    else initializations.push(event);
  }
  let closed = false;
  async function replaceSlot(slot: ProviderSlot, saved: ProviderPluginConfig | null): Promise<void> {
    const input = providerInputOf({ declaration: slot.declaration, saved });
    const signature = input === undefined ? undefined : JSON.stringify(input);
    if (unchangedSlot({ slot, signature })) {
      if (!slot.initializationObserved) initialization({ slot, outcome: 'noop', reasonClass: 'not_configured' });
      return;
    }
    const old = slot.lease;
    try {
      const lease = input ? await host.initialize({ contract: slot.contract, id: slot.id,
        input: { ...input, serviceName: required.serviceName, attribution: attributionFor({ contract: slot.contract, site: required.site }) } }, {
        factoryOptions: {
          reportTelemetry: (report: ProviderTelemetryReport) => delivery.report({ providerId: `${slot.pluginId}/${slot.id}`, report }),
          info: optional.info ?? ((message: string) => console.info(message)),
        },
      }) : undefined;
      if (input && !lease) throw new Error("ProviderUnavailable");
      slot.lease = lease;
      slot.input = signature;
    } catch (error) {
      // A removed or changed key must never keep sending through the previous lease.
      slot.lease = undefined;
      slot.input = undefined;
      throw error;
    } finally { await old?.dispose({}); }
  }
  /** Success reflects the complete plugin, since a later failure retires every earlier lease.
   * @complexity O(s * f) for s slots with f declared settings; O(s) pending observations. */
  async function applySlots({ selected, saved }: { selected: ProviderSlot[]; saved: ProviderPluginConfig | null }): Promise<void> {
    const changed: ProviderSlot[] = [];
    for (const slot of selected) {
      const input = providerInputOf({ declaration: slot.declaration, saved });
      if (!unchangedSlot({ slot, signature: input === undefined ? undefined : JSON.stringify(input) })) changed.push(slot);
      await replaceSlot(slot, saved);
    }
    for (const slot of changed) initialization({ slot, outcome: slot.lease ? 'success' : 'noop', reasonClass: slot.lease ? 'ready' : 'not_configured' });
  }
  /** Reuse a current registration, otherwise admit the configured plugin through the runtime owner.
   * @throws Error when admission fails; apply owns retiring all of the plugin's leases.
   * @complexity O(s * f + r) for selected slots, fields and registered contributions; one bounded load.
   */
  async function ensureLoaded({ pluginId, selected, saved }: { pluginId: string; selected: readonly ProviderSlot[]; saved: ProviderPluginConfig | null }, _optional = {}): Promise<void> {
    if (!selected.some(slot => providerInputOf({ declaration: slot.declaration, saved }))) return;
    if (loaded.has(pluginId) && required.runtime.providerContributions.list({}).some(snapshot => snapshot.pluginId === pluginId)) return;
    const admitted = await required.runtime.loadProviderPlugins({ pluginIds: [pluginId] }, { timeoutMs });
    if (!admitted.includes(pluginId)) throw new Error("ProviderUnavailable");
    loaded.add(pluginId);
  }
  /** Apply one saved snapshot, retiring every selected lease on failure and logging only its class.
   * @returns Live-apply timing; missing slots and closed hosts require restart; initialization/admission failures carry safe guidance.
   * @complexity O(s * f + r) slot settings/registrations plus bounded provider load and initialization.
   */
  async function apply({ pluginId }: { pluginId: string }, _optional = {}): Promise<import("@jini-ai/plugins/host").PluginProviderApplyResult> {
    if (closed) return "restart";
    const selected = slots.filter(slot => slot.pluginId === pluginId);
    if (selected.length === 0) return "restart";
    try {
      const saved = await required.config.read({ pluginId });
      const restartBrowser = selected.some(slot => browserNeedsRestart({ slot, saved }));
      await ensureLoaded({ pluginId, selected, saved });
      await applySlots({ selected, saved });
      return restartBrowser ? 'restart' : 'now';
    } catch (error) {
      for (const slot of selected) initialization({ slot, outcome: 'failure', reasonClass: 'initialization_failed' });
      const retired = selected.map(slot => { const lease = slot.lease; slot.lease = undefined; slot.input = undefined; return lease; });
      await Promise.all(retired.map(lease => lease?.dispose({})));
      // Class only: an SDK's construction error can quote the endpoint or DSN it was given.
      // Names are allowlisted too: custom Error.name values can themselves contain credentials.
      warn(`provider plugin '${pluginId}' did not initialize: ${error instanceof Error ? describeTelemetryFailure({ error }).errorClass : typeof error}`);
      return error instanceof PluginProviderStartupError
        ? { appliesAt: "failed", reason: error.reason, action: error.action }
        : { appliesAt: "failed", reason: "The provider could not initialize.", action: "Check the plugin settings and installation, then save again." };
    }
  }
  function reapply(input: { pluginId: string }): Promise<import("@jini-ai/plugins/host").PluginProviderApplyResult> {
    const next = (queues.get(input.pluginId) ?? Promise.resolve("now" as const)).then(() => apply(input));
    const recorded = next.then(result => { applied.set(input.pluginId, typeof result === "string" ? result : result.appliesAt); return result; });
    queues.set(input.pluginId, recorded);
    return recorded;
  }
  const leases = new Map<ProviderContract, unknown[]>();
  for (const slot of slots) {
    if (slot.contract === "observability" || slot.contract === "product_analytics") delivery.register({ providerId: `${slot.pluginId}/${slot.id}` });
    leases.set(slot.contract, [...(leases.get(slot.contract) ?? []), gatedPort({ slot, contract: slot.contract, testProbe })]);
  }
  await Promise.all([...new Set(slots.map(slot => slot.pluginId))].map(pluginId => reapply({ pluginId })));
  const { shutdownGenerations, ...ports } = composePorts({ leases, consent: required.consent, consentRevision: required.consentRevision, site: required.site, warn });
  tracker = ports.tracker;
  // Boot settles before a tracker exists. Flush only through the healthy, consenting facade;
  // local diagnostics remain authoritative when analytics itself failed to initialize.
  for (const event of initializations) tracker.capture(event);
  initializations.length = 0;
  return { ...ports, telemetryStatus: delivery.read,
    observabilityEnabled: () => slots.some(slot => slot.contract === "observability" && slot.lease?.isCurrent({}) === true),
    sendTelemetryTest: ({ error }) => testProbe.send({ tracker: ports.tracker, error, userId: `site:${required.site.siteId}` }),
    reapply, appliesAt: ({ pluginId }) => applied.get(pluginId) ?? "now",
    async dispose() { closed = true; await Promise.all(queues.values()); await shutdownGenerations(); await host.dispose({}); } };
}
