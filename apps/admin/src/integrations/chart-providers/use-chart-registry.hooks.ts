/** Bind admitted chart metadata to Jini's registry and Tovu's existing refresh notifications. */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFetchQuery, useInvalidate } from "@jini-ai/ui/fetch-query";
import { DEFAULT_INTERACTIVE_UI_REGISTRY } from "@jini-ai/ui/interactive-ui";
import { createChartProviderRegistry } from "@jini-ai/ui/charts";
import { loadChartProvider } from "@jini-ai/ui/charts/browser";
import { createChartInteractiveRegistry } from "@jini-ai/ui/charts/react";
import { subscribeToSettingsRefresh } from "@/lib/settings-refresh-bus";
import { useContentRefreshSubscription } from "@/hooks/use-content-refresh-subscription.hooks";
import { CORE_CHART_SNAPSHOT, type AdminChartRegistrySnapshot } from "./chart-registry-context";
import { defaultChartRegistryPort } from "./chart-registry-dependencies.hooks";
import type { ChartRegistryPort } from "./chart-registry-port.hooks";

/** Read once at authenticated boot; plugin writes share the existing ["plugins"] invalidation.
 * Complete generations replace both schemas and renderers. Transient read failures keep the last
 * admitted snapshot; an initial failure leaves core tables. No registry is rebuilt for card renders.
 * @returns The stable generation, registry and boundary stylesheet URLs.
 * @complexity O(p + k) per changed generation, delegated to Jini; one metadata read per invalidation.
 * @example useAdminChartRegistry({ principalId, port });
 */
export function useAdminChartRegistry(
  { principalId, port }: { principalId: string; port: ChartRegistryPort }, _options: Record<string, never> = {},
): AdminChartRegistrySnapshot {
  const portRef = useRef(port);
  portRef.current = port;
  const key = useMemo(() => ["plugins", "chart-providers", principalId] as const, [principalId]);
  const fetchSnapshot = useCallback(() => portRef.current.readSnapshot({}), []);
  const query = useFetchQuery({ key, fetch: fetchSnapshot }, { staleTime: 0, refetchOnWindowFocus: true });
  const invalidate = useInvalidate();
  const refresh = useCallback(() => { invalidate({ key }); }, [invalidate, key]);
  useContentRefreshSubscription("plugins", refresh);
  useEffect(() => subscribeToSettingsRefresh((scope) => {
    if (scope === null || scope.includes("core.charts")) refresh();
  }), [refresh]);
  const generation = query.data?.generation;
  return useMemo(() => {
    const snapshot = query.data;
    if (!snapshot) return CORE_CHART_SNAPSHOT;
    const providers = createChartProviderRegistry({ providers: snapshot.providers.map((provider) => ({
      id: provider.id, kinds: provider.kinds, enabled: true,
      load: () => loadChartProvider({ url: provider.javascript }),
    })) });
    return {
      generation: snapshot.generation,
      registry: createChartInteractiveRegistry({ registry: DEFAULT_INTERACTIVE_UI_REGISTRY, providers }, { siteProvider: snapshot.siteProvider }),
      stylesheets: [...new Set(snapshot.providers.flatMap((provider) => provider.stylesheet ? [provider.stylesheet] : []))],
    };
    // The server generation covers every declaration, asset URL and site preference. Cache refetches
    // returning that same generation must not replace Component closures or remount interpreters.
  }, [generation]);
}

/** Production binding; the un-wired hook remains available to direct port-based tests. */
export function useWiredAdminChartRegistry(
  required: { principalId: string }, _options: Record<string, never> = {},
): AdminChartRegistrySnapshot {
  return useAdminChartRegistry({ ...required, port: defaultChartRegistryPort });
}
