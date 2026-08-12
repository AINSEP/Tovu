import type { AdminWidgetArea, AdminWidgetPlacement, AdminWidgetRegionBinding } from "../../../lib/api";

/**
 * @file What `use-widget-region-editor.hooks.ts` and `use-widget-regions.hooks.ts` need from the
 * outside world, as an interface rather than a direct `lib/api` import.
 *
 * Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `development/docs/architecture/wired-hooks-convention.md` and `redirects-port.hooks.ts` (the
 * canonical reference): this file declares, `widget-regions-dependencies.hooks.ts` binds the real
 * `api` client, and nothing else under `features/widgets` imports `lib/api` for these four routes.
 * One shared port rather than one per hook — both hooks read/write the region/placement resource
 * (`AdminWidgetRegionBinding`/`AdminWidgetArea`/`AdminWidgetPlacement`), a DIFFERENT resource from
 * the widget-INSTANCE routes covered by the sibling `WidgetsPort` next to
 * `use-widgets-library.hooks.ts`/`use-widget-instance-editor.hooks.ts`.
 *
 * `describeApiError`/`ApiError` stay direct imports in the hooks that use this port — pure
 * error-classification, no I/O, same reasoning as `redirects-port.hooks.ts`'s own exclusion of
 * `describeApiError`.
 */
export interface WidgetRegionsPort {
  listWidgetRegions(): Promise<{ regions: AdminWidgetRegionBinding[] }>;
  bindWidgetRegion(regionKey: string): Promise<{ area: AdminWidgetArea }>;
  getWidgetRegion(regionKey: string): Promise<{ area: AdminWidgetArea; placements: AdminWidgetPlacement[] }>;
  mutateWidgetRegionPlacements(target: {
    regionKey: string;
    baseVersion: number;
    placements: Array<{ placementId: string; widgetEntryId: string; enabled: boolean }>;
  }): Promise<{ area: AdminWidgetArea }>;
}
