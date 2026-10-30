import type { ProductAnalyticsPort } from "@jini-ai/analytics/product";
import type { PluginProviderContract } from "@jini-ai/plugins/host";

const hasMethods = ({ value, names }: { value: unknown; names: readonly string[] }): boolean =>
  typeof value === "object" && value !== null && names.every((name) => typeof (value as Record<string, unknown>)[name] === "function");

/** Domain-owned port checks; a plugin never supplies or replaces these validators. */
export const PROVIDER_CONTRACTS: readonly PluginProviderContract[] = [
  // `metric` is not required: contract v1 providers predate it, and gatedPort routes a missing method to the noop.
  { contract: "observability", validate: ({ provider }) => hasMethods({ value: provider, names: ["trackRequest", "trackDbQuery", "trackOutboundCall", "trackAgentRun", "trackOperation", "reportError"] }) ? undefined : "not an ObservabilityPort" },
  { contract: "product_analytics", validate: ({ provider }) => hasMethods({ value: provider, names: ["capture", "identify"] }) && validAiCapability({ provider }) ? undefined : "not a ProductAnalyticsPort" },
  { contract: "ai_trace", validate: ({ provider }) => hasMethods({ value: provider, names: ["record"] }) ? undefined : "not an AiTraceSink" },
];

/** Optional capabilities remain optional; malformed declarations are refused before composition.
 * @complexity O(1). */
function validAiCapability({ provider }: { provider: unknown }): boolean {
  const port = provider as ProductAnalyticsPort;
  if (port.captureAiGeneration !== undefined && typeof port.captureAiGeneration !== "function") return false;
  if (port.browserAnalytics !== undefined && typeof port.browserAnalytics !== 'function') return false;
  return port.includeAiContent === undefined || typeof port.includeAiContent === "boolean";
}

