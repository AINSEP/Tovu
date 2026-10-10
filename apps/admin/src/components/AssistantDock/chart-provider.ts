import { registerChartProvider } from "@jini-ai/charts-recharts";
import { DEFAULT_INTERACTIVE_UI_REGISTRY, type InteractiveUiRegistry, type InteractiveComponentEntry } from "@jini-ai/ui/interactive-ui";

type SurfaceRegistry = Pick<InteractiveUiRegistry, "list" | "resolveById">;

/**
 * Wire the copied chart provider into the admin's existing catalog without changing tool IDs.
 * @param input The host registry; ui owns the capability preference contract.
 * @param options Vite boot configuration: explicit 1 enables, otherwise unset defaults on in dev.
 * @returns The original registry when disabled, or a view routing the catalog's legacy chart IDs
 * to the plugin. Listing retains the built-in entries and all distinct plugin IDs.
 * @complexity O(n²) setup time and O(n) space for n host entries and a fixed three-chart provider;
 * setup resolves capabilities against the registered entries; each lookup scans that snapshot. No I/O or input mutation.
 * @example createAssistantInteractiveUiRegistry({ registry }, { flag: "1" });
 */
export function createAssistantInteractiveUiRegistry(
  { registry }: { readonly registry: InteractiveUiRegistry },
  { development = false, flag, registerProvider = registerChartProvider }: { readonly development?: boolean; readonly flag?: string | undefined; readonly registerProvider?: typeof registerChartProvider } = {},
): SurfaceRegistry {
  const enabled = flag === undefined ? development : flag === "1";
  if (!enabled) return registry;
  const registered = registerProvider({ registry });
  // The backend's search_components catalog still advertises the built-in wire IDs. Preserve
  // those IDs while using the preferred capability entry for BOTH validation and rendering.
  const resolveEntry = (entry: InteractiveComponentEntry): InteractiveComponentEntry => {
    if (!entry.capabilities.includes('chart')) return entry;
    const capability = entry.capabilities.find(value => value !== 'chart');
    if (!capability) return entry;
    const preferred = registered.resolveByCapability({ capability })[0];
    return preferred ? { ...preferred, id: entry.id } : entry;
  };
  const entries = registered.list().map(resolveEntry);
  return {
    list: () => entries,
    resolveById: ({ id }) => entries.find(entry => entry.id === id) ?? null,
  };
}

// One stable boot snapshot for the interpreter's lifetime, shared by transcript and portal paths.
export const ASSISTANT_INTERACTIVE_UI_REGISTRY = createAssistantInteractiveUiRegistry(
  { registry: DEFAULT_INTERACTIVE_UI_REGISTRY },
  { development: import.meta.env.DEV, flag: import.meta.env.VITE_CHART_PLUGIN },
);
