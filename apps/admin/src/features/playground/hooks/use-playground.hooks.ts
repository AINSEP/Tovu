import { useMemo, useRef, useState } from "react";
import { DEFAULT_INTERACTIVE_UI_REGISTRY, type InteractiveComponentEntry } from "@jini-ai/ui/interactive-ui";
import {
  buildA2uiCatalogFromRegistry,
  createA2uiInterpreter,
  createLabCatalog,
  type A2uiInterpreter,
} from "@jini-ai/ui/a2ui";

/**
 * @file `Playground`'s registry search, surface lifecycle, and A2UI interpreter wiring, split out
 * of the component per the `use-<thing>.hooks.ts` convention. No `-port.hooks.ts`/
 * `-dependencies.hooks.ts` pair: as the component's own file header says, this tab is client-side
 * only, deliberately — `DEFAULT_INTERACTIVE_UI_REGISTRY` is static data already bundled into the
 * app, so there is nothing to fetch and no host boundary to inject a fake for.
 */

/** The tab's one surface id — exported since `Playground.tsx` displays it directly (the "Surface"
 *  rail's `<code>` label) as well as passing it to `A2uiSurfaceRenderer`. */
export const SURFACE_ID = "tovu-admin-playground";
const CATALOG_ID = "tovu-admin-playground-catalog";

/** One id counter per mounted tab instance — components added via the picker below need unique
 *  ids, and this tab has no server round trip to derive one from. */
export function useIdGenerator(prefix: string): () => string {
  const counter = useRef(0);
  return () => {
    counter.current += 1;
    return `${prefix}-${counter.current}`;
  };
}

const SAMPLE_ROWS = [
  { name: "Homepage relaunch", spend: "$2,400", status: "Live" },
  { name: "Autumn promo", spend: "$980", status: "Draft" },
  { name: "Referral push", spend: "$5,120", status: "Live" },
];
const SAMPLE_COLUMNS = [
  { key: "name", label: "Campaign" },
  { key: "spend", label: "Spend" },
  { key: "status", label: "Status" },
];

export interface PlaygroundController {
  registry: typeof DEFAULT_INTERACTIVE_UI_REGISTRY;
  /** `registry.list()` filtered by `query` — every term must match somewhere across the entry's
   *  id, provider, and capabilities (see the component's own search-help copy). */
  matches: readonly InteractiveComponentEntry[];
  query: string;
  setQuery: (value: string) => void;
  /** `registry.list().length` — the unfiltered total, for the panel's "N of M" counter. */
  total: number;
  surfaceOpen: boolean;
  interpreter: A2uiInterpreter;
  /** Opens the surface (if not already open) and appends the given registry entry to its root. */
  addToSurface: (entry: InteractiveComponentEntry) => void;
  /** Deletes the surface and resets `surfaceOpen` — a no-op when nothing is open. */
  reset: () => void;
}

/**
 * Owns the Playground tab's component-library search and its one live A2UI surface.
 *
 * @returns The registry and its current search results/total, the surface's open state and A2UI
 *   `interpreter`, and the `addToSurface`/`reset` actions.
 * @complexity Time/space: O(n) per keystroke in the registry's entry count — `matches` re-filters
 *   the whole (small, compile-time-bundled) registry on every `query` change; not a scale risk for
 *   a static component catalog.
 */
export function usePlayground(): PlaygroundController {
  const registry = DEFAULT_INTERACTIVE_UI_REGISTRY;
  const catalog = useMemo(
    () => buildA2uiCatalogFromRegistry(registry, CATALOG_ID, { base: createLabCatalog() }),
    [registry],
  );
  const interpreterRef = useRef<A2uiInterpreter | null>(null);
  if (!interpreterRef.current) interpreterRef.current = createA2uiInterpreter(catalog);
  const interpreter = interpreterRef.current;
  const nextId = useIdGenerator("pg");

  const [surfaceOpen, setSurfaceOpen] = useState(false);
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    if (!query.trim()) return registry.list();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return registry.list().filter((entry) =>
      terms.every((term) => `${entry.id} ${entry.provider} ${entry.capabilities.join(" ")}`.toLowerCase().includes(term)),
    );
  }, [query, registry]);

  function ensureSurfaceOpen(): void {
    if (surfaceOpen) return;
    interpreter.applyAgentMessage({
      version: "v1.0",
      createSurface: { surfaceId: SURFACE_ID, catalogId: CATALOG_ID, components: [{ id: "root", component: "Column", children: [] }] },
    });
    setSurfaceOpen(true);
  }

  function addToSurface(entry: InteractiveComponentEntry): void {
    ensureSurfaceOpen();
    const rootId = "root";
    const root = interpreter.getSurface(SURFACE_ID)?.components.get(rootId);
    const existingChildren = Array.isArray(root?.props.children) ? (root.props.children as string[]) : [];
    const newId = nextId();
    interpreter.applyAgentMessage({
      version: "v1.0",
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [
          { id: newId, component: entry.id, columns: SAMPLE_COLUMNS, rows: SAMPLE_ROWS },
          { id: rootId, component: "Column", children: [...existingChildren, newId] },
        ],
      },
    });
  }

  function reset(): void {
    if (surfaceOpen) interpreter.applyAgentMessage({ version: "v1.0", deleteSurface: { surfaceId: SURFACE_ID } });
    setSurfaceOpen(false);
  }

  return { registry, matches, query, setQuery, total: registry.list().length, surfaceOpen, interpreter, addToSurface, reset };
}
