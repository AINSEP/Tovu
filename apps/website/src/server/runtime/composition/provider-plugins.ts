import { combineObservabilityPorts, createNoopObservabilityPort, type ObservabilityPort } from "@jini-ai/diagnostics/observability";
import { createNoopProductAnalytics, withProductAnalyticsGuards, type ProductAnalyticsConsent, type ProductAnalyticsConsentRevision, type ProductAnalyticsPort } from "@jini-ai/analytics/product";
import { createFanOutAiTraceSink, type AiTraceSink } from "@jini-ai/agent-runtime/ai-trace";
import { createPluginProviderHost, type PluginContributionRegistry, type PluginProviderContract, type PluginProviderLease } from "@jini-ai/plugins/host";

/**
 * @file Provider plugins at boot (provider wave 2, 2026-10-25): observability, product analytics and
 * AI tracing come from Jini's first-party provider plugins (`@jini-ai/provider-plugins`), never from
 * vendor SDKs in Tovu core. Replaces the env-driven `require()` of an OTel adapter that lived in
 * `platform/observability`: an install pays for an SDK only when the provider plugin is INSTALLED +
 * ENABLED + CONFIGURED, and every other contract keeps its existing noop.
 *
 * Configuration lives only in the plugin's secure key card: a saved API credential labelled
 * `plugin:<plugin id>` (custom credentials store, sealed with the site key). Never env, never chat.
 * The mapping below turns that one generic card row (`baseUrl`, `token`, optional `username`) into the
 * plugin's factory input; it names the plugins Tovu knows how to configure, not any vendor SDK.
 *
 * Order: initialized (awaited, each bounded by the provider host's timeout) before the composition
 * root decorates kernels and HTTP clients, so application work never starts on a half-built port.
 * Disposed with the site store. Disabling or quarantining a provider plugin retires its contribution
 * generation, which disposes its resources; its port then goes inert (`gatedPort`) until the next boot.
 */

/** One saved secure-card credential, as the custom credentials store resolves it. */
export interface ProviderPluginCredential {
  readonly baseUrl: string;
  readonly token: string;
  readonly username?: string;
}

export type ProviderContract = "observability" | "product_analytics" | "ai_trace";

/** How Tovu configures one provider plugin from its card. */
export interface ProviderPluginBinding {
  readonly pluginId: string;
  readonly contract: ProviderContract;
  readonly id: string;
  readonly input: (required: { credential: ProviderPluginCredential; serviceName: string }) => Readonly<Record<string, unknown>>;
}

/** The secure card row a provider plugin reads: one label per plugin id. */
export function providerPluginCredentialLabel({ pluginId }: { pluginId: string }): string {
  return `plugin:${pluginId}`;
}

/** Maps a resolved saved credential (the custom credentials store's shape) to a card, or null. */
export function providerPluginCredentialOf({ resolved }: { resolved: { baseUrl: string; connection: { token: string; username?: string } } | null }): ProviderPluginCredential | null {
  if (!resolved) return null;
  const { token, username } = resolved.connection;
  return { baseUrl: resolved.baseUrl, token, ...(username ? { username } : {}) };
}

/** Generic OTLP auth: a username makes HTTP Basic (`user:token`), otherwise a bearer token. */
export function otlpAuthorization({ credential }: { credential: ProviderPluginCredential }): Record<string, string> {
  if (credential.username) return { authorization: `Basic ${Buffer.from(`${credential.username}:${credential.token}`).toString("base64")}` };
  return { authorization: `Bearer ${credential.token}` };
}

export const PROVIDER_PLUGIN_BINDINGS: readonly ProviderPluginBinding[] = [
  { pluginId: "observability-opentelemetry", contract: "observability", id: "opentelemetry",
    input: ({ credential, serviceName }) => ({ serviceName, tracerName: "tovu.observability", endpoint: credential.baseUrl, headers: otlpAuthorization({ credential }) }) },
  { pluginId: "observability-sentry", contract: "observability", id: "sentry", input: ({ credential }) => ({ dsn: credential.token }) },
  { pluginId: "analytics-posthog", contract: "product_analytics", id: "posthog", input: ({ credential }) => ({ apiKey: credential.token, host: credential.baseUrl }) },
  { pluginId: "ai-trace-langfuse", contract: "ai_trace", id: "langfuse",
    input: ({ credential }) => ({ publicKey: credential.username, secretKey: credential.token, baseUrl: credential.baseUrl }) },
];

const hasMethods = ({ value, names }: { value: unknown; names: readonly string[] }): boolean =>
  typeof value === "object" && value !== null && names.every((name) => typeof (value as Record<string, unknown>)[name] === "function");

/** Domain-owned port checks; a plugin never supplies or replaces these validators. */
export const PROVIDER_CONTRACTS: readonly PluginProviderContract[] = [
  { contract: "observability", validate: ({ provider }) => hasMethods({ value: provider, names: ["trackRequest", "trackDbQuery", "trackOutboundCall", "trackAgentRun", "trackOperation", "reportError"] }) ? undefined : "not an ObservabilityPort" },
  { contract: "product_analytics", validate: ({ provider }) => hasMethods({ value: provider, names: ["capture", "identify"] }) ? undefined : "not a ProductAnalyticsPort" },
  { contract: "ai_trace", validate: ({ provider }) => hasMethods({ value: provider, names: ["record"] }) ? undefined : "not an AiTraceSink" },
];

export interface ProviderPluginRuntime {
  readonly providerContributions: PluginContributionRegistry;
  /** `timeoutMs` bounds each plugin's import + setup; a plugin past it is revoked and left on the noop. */
  loadProviderPlugins(required: { pluginIds: readonly string[] }, optional?: { timeoutMs?: number }): Promise<readonly string[]>;
}

export interface ProviderPluginPorts {
  readonly observability: ObservabilityPort;
  /** Already behind `withProductAnalyticsGuards` (consent first); the shared noop when unconfigured. */
  readonly productAnalytics: ProductAnalyticsPort;
  /** Undefined when no AI-trace provider is configured: hosts then skip `withAiTracing` entirely. */
  readonly aiTraceSink: AiTraceSink | undefined;
  /** Idempotent; bounded per resource by the provider host. */
  dispose(required: Record<string, never>, optional?: Record<string, never>): Promise<void>;
}

export interface BootProviderPluginsRequired {
  readonly runtime: ProviderPluginRuntime;
  /** Resolves a saved card by label; null when absent. Read failures are treated as "not configured". */
  readonly readCredential: (required: { label: string }) => Promise<ProviderPluginCredential | null>;
  readonly serviceName: string;
  readonly consent: ProductAnalyticsConsent;
  readonly consentRevision: ProductAnalyticsConsentRevision;
}

export interface BootProviderPluginsOptional {
  readonly bindings?: readonly ProviderPluginBinding[];
  readonly initializeTimeoutMs?: number;
  readonly warn?: (message: string) => void;
}

type Configured = { binding: ProviderPluginBinding; credential: ProviderPluginCredential };

async function configuredBindings({ bindings, readCredential, warn }: { bindings: readonly ProviderPluginBinding[]; readCredential: BootProviderPluginsRequired["readCredential"]; warn: (message: string) => void }): Promise<Configured[]> {
  const configured: Configured[] = [];
  for (const binding of bindings) {
    const credential = await readCredential({ label: providerPluginCredentialLabel(binding) }).catch(() => {
      warn(`provider plugin '${binding.pluginId}': its key card could not be read; left on the noop`);
      return null;
    });
    if (credential) configured.push({ binding, credential });
  }
  return configured;
}

/** Fans product events out to every configured analytics port (normally one). */
function fanOutProductAnalytics({ ports }: { ports: readonly ProductAnalyticsPort[] }): ProductAnalyticsPort {
  const [only, ...rest] = ports;
  if (only && rest.length === 0) return only;
  const each = (send: (port: ProductAnalyticsPort) => void) => { for (const port of ports) { try { send(port); } catch { /* one vendor never blocks another */ } } };
  return { capture: (event) => each((port) => port.capture(event)), identify: (identity) => each((port) => port.identify(identity)) };
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
 */
function gatedPort({ lease, contract }: { lease: PluginProviderLease; contract: ProviderContract }): unknown {
  const noop = NOOP_PORTS[contract]() as Record<string, (...args: unknown[]) => unknown>;
  const port = lease.port as Record<string, unknown>;
  return Object.fromEntries(Object.keys(noop).map((name) => [name, (...args: unknown[]) => {
    const live = port[name];
    return lease.isCurrent({}) && typeof live === "function" ? live.apply(port, args) : noop[name]!(...args);
  }]));
}

function composePorts({ leases, consent, consentRevision }: { leases: ReadonlyMap<ProviderContract, unknown[]>; consent: ProductAnalyticsConsent; consentRevision: ProductAnalyticsConsentRevision }) {
  const analytics = (leases.get("product_analytics") ?? []) as ProductAnalyticsPort[];
  const sinks = (leases.get("ai_trace") ?? []) as AiTraceSink[];
  return {
    observability: combineObservabilityPorts({ ports: (leases.get("observability") ?? []) as ObservabilityPort[] }),
    productAnalytics: analytics.length === 0 ? createNoopProductAnalytics({})
      : withProductAnalyticsGuards({ inner: fanOutProductAnalytics({ ports: analytics }), consent }, { consentRevision }),
    aiTraceSink: sinks.length === 0 ? undefined : createFanOutAiTraceSink({ sinks }),
  };
}

/**
 * Selects, loads and initializes provider plugins, then composes one port per contract.
 * @param required Plugin runtime, card reader, service identity and the operator's telemetry consent.
 * @param optional Binding table (tests), initialization bound, warning sink.
 * @returns Ports (noop where nothing is configured) and the shared teardown. Never throws for a
 *   provider failure: that contract stays on its noop and the reason is logged.
 * @complexity O(b) card reads plus one load and one bounded initialization per configured plugin.
 */
export async function bootProviderPlugins(required: BootProviderPluginsRequired, optional: BootProviderPluginsOptional = {}): Promise<ProviderPluginPorts> {
  const warn = optional.warn ?? ((message: string) => console.warn(`[provider-plugins] ${message}`));
  const configured = await configuredBindings({ bindings: optional.bindings ?? PROVIDER_PLUGIN_BINDINGS, readCredential: required.readCredential, warn });
  const timeoutMs = optional.initializeTimeoutMs ?? 10_000;
  const loaded = new Set(await required.runtime.loadProviderPlugins({ pluginIds: configured.map(({ binding }) => binding.pluginId) }, { timeoutMs }));
  const host = createPluginProviderHost({ contributions: required.runtime.providerContributions, contracts: PROVIDER_CONTRACTS }, {
    initializeTimeoutMs: timeoutMs,
    onError: ({ pluginId, phase }) => warn(`provider plugin '${pluginId}' ${phase} failed`),
  });
  const leases = new Map<ProviderContract, unknown[]>();
  for (const { binding, credential } of configured.filter(({ binding }) => loaded.has(binding.pluginId))) {
    const lease: PluginProviderLease | undefined = await host.initialize({ contract: binding.contract, id: binding.id, input: binding.input({ credential, serviceName: required.serviceName }) })
      // Class only: an SDK's construction error can quote the endpoint or DSN it was given.
      .catch((error: unknown) => { warn(`provider plugin '${binding.pluginId}' did not initialize: ${error instanceof Error ? error.name : typeof error}`); return undefined; });
    if (lease) leases.set(binding.contract, [...(leases.get(binding.contract) ?? []), gatedPort({ lease, contract: binding.contract })]);
  }
  return { ...composePorts({ leases, consent: required.consent, consentRevision: required.consentRevision }), dispose: () => host.dispose({}) };
}
