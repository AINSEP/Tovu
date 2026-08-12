import type { AdminWidget, AdminWidgetType, AdminWidgetWhereUsed } from "../../../lib/api";

/**
 * @file What `use-widgets-library.hooks.ts` and `use-widget-instance-editor.hooks.ts` need from
 * the outside world, as an interface rather than a direct `lib/api` import.
 *
 * Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `development/docs/architecture/wired-hooks-convention.md` and `redirects-port.hooks.ts` (the
 * canonical reference): this file declares, `widgets-dependencies.hooks.ts` binds the real `api`
 * client, and nothing else under `features/widgets` imports `lib/api` for these six routes. One
 * shared port rather than one per hook — both hooks read/write the same widget-INSTANCE resource
 * (`AdminWidget`); region/placement routes are a different resource, covered by the separate
 * `WidgetRegionsPort` next to `use-widget-region-editor.hooks.ts`/`use-widget-regions.hooks.ts`.
 *
 * `describeApiError`/`ApiError` stay direct imports in the hooks that use this port — pure
 * error-classification, no I/O, same reasoning as `redirects-port.hooks.ts`'s own exclusion of
 * `describeApiError`.
 */
export interface WidgetsPort {
  listWidgets(options?: { widgetType?: string; includeInactive?: boolean }): Promise<{ widgets: AdminWidget[]; skippedCount?: number }>;
  getWidget(id: string): Promise<{ widget: AdminWidget; whereUsed: AdminWidgetWhereUsed }>;
  /** No `options` (`api.createWidget`'s own `slug` override) — narrowed to what's actually called:
   *  `use-widget-instance-editor.hooks.ts` always calls this with one argument. Forwarding a second
   *  positional `undefined` when nothing was passed is observably different from omitting the
   *  argument entirely (an exact-arity `toHaveBeenCalledWith` assertion on the real `api.createWidget`
   *  spy distinguishes them) — narrowing here, not widening the wrapper, is what keeps the port a
   *  true callee-rename with zero behavior change. */
  createWidget(input: { widgetType: AdminWidgetType; title: string; config: Record<string, unknown> }): Promise<{ widget: AdminWidget }>;
  updateWidget(target: { id: string; baseVersion: number; config: Record<string, unknown> }): Promise<{ widget: AdminWidget }>;
  trashWidget(id: string): Promise<{ widget: AdminWidget }>;
  purgeWidget(target: { id: string }, options?: { force?: boolean }): Promise<{ purged: true }>;
}
