import { api, type AdminWidget, type AdminWidgetArea, type AdminWidgetPlacement, type AdminWidgetRegionBinding } from "@/lib/api";
import type { WidgetRegionsPort } from "./widget-regions-port.hooks";

/**
 * @file The only place under `features/widgets` that reaches `lib/api` for the four
 * `WidgetRegionsPort` routes — see `widget-regions-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies
 *  .hooks.ts`'s `defaultRedirectsPort`. */
export const defaultWidgetRegionsPort: WidgetRegionsPort = {
  listWidgetRegions: () => api.listWidgetRegions(),
  bindWidgetRegion: (regionKey) => api.bindWidgetRegion(regionKey),
  getWidgetRegion: (regionKey) => api.getWidgetRegion(regionKey),
  mutateWidgetRegionPlacements: (target) => api.mutateWidgetRegionPlacements(target),
  getWidget: (id) => api.getWidget(id),
};

/** Seed state for {@link createFakeWidgetRegionsPort}. */
export interface FakeWidgetRegionsPortOptions {
  regions?: AdminWidgetRegionBinding[];
  /** Keyed by `regionKey` — an area + its placements, as `getWidgetRegion` would return them. */
  areas?: Record<string, { area: AdminWidgetArea; placements: AdminWidgetPlacement[] }>;
  /** Keyed by widget id — what `getWidget` returns for a just-added placement. */
  widgets?: Record<string, Pick<AdminWidget, "title" | "widgetType">>;
}

/**
 * An in-memory {@link WidgetRegionsPort} for tests — lets a test describe "this region has these
 * placements" directly, instead of hand-building `Response` objects and stubbing global `fetch`.
 * Shipped alongside the real binding per the pattern's "every port gets a fake" rule.
 */
export function createFakeWidgetRegionsPort(options: FakeWidgetRegionsPortOptions = {}): WidgetRegionsPort & {
  /** Every region binding currently in the fake's store, in list order. */
  readonly regions: AdminWidgetRegionBinding[];
} {
  const regions = [...(options.regions ?? [])];
  const areas = new Map(Object.entries(options.areas ?? {}));

  return {
    regions,

    async listWidgetRegions() {
      return { regions: [...regions] };
    },

    async bindWidgetRegion(regionKey) {
      const area: AdminWidgetArea = {
        id: `fake-area-${regions.length + 1}`,
        workspaceId: "fake-ws",
        regionKey,
        updatedAt: new Date(0).toISOString(),
        version: 1,
      };
      regions.push({ workspaceId: "fake-ws", regionKey, areaEntryId: area.id, updatedAt: area.updatedAt, placementCount: 0 });
      areas.set(regionKey, { area, placements: [] });
      return { area };
    },

    async getWidgetRegion(regionKey) {
      const entry = areas.get(regionKey);
      if (!entry) throw new Error(`fake widget region not found: ${regionKey}`);
      return { area: entry.area, placements: [...entry.placements] };
    },

    async mutateWidgetRegionPlacements({ regionKey, placements }) {
      const entry = areas.get(regionKey);
      if (!entry) throw new Error(`fake widget region not found: ${regionKey}`);
      const updatedArea: AdminWidgetArea = { ...entry.area, version: entry.area.version + 1, updatedAt: new Date(0).toISOString() };
      const updatedPlacements: AdminWidgetPlacement[] = placements.map((p) => ({
        placementId: p.placementId,
        widgetEntryId: p.widgetEntryId,
        enabled: p.enabled,
        widgetTitle: null,
        widgetType: null,
        broken: false,
      }));
      areas.set(regionKey, { area: updatedArea, placements: updatedPlacements });
      return { area: updatedArea };
    },

    async getWidget(id) {
      const widget = options.widgets?.[id];
      if (!widget) throw new Error(`fake widget not found: ${id}`);
      return { widget };
    },
  };
}
