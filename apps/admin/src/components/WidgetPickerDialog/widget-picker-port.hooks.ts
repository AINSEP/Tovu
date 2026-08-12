import type { AdminWidget, AdminWidgetType } from "../../lib/api";

/**
 * @file What `WidgetPickerDialog.hooks.tsx` needs from the outside world, as an interface rather
 * than a direct `lib/api` import.
 *
 * Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `development/docs/architecture/wired-hooks-convention.md` and `redirects-port.hooks.ts` (the
 * canonical reference). This port is deliberately its own file rather than reusing
 * `features/widgets/hooks/widgets-port.hooks.ts`'s (larger) `WidgetsPort`: `components/` sits below
 * every feature and must not import from one (the same "nothing outside this feature needs it"
 * boundary `media-port.hooks.ts` itself states, just enforced in the other direction here) — a
 * reusable dialog depending on a specific feature's port would be a back-edge into the composition
 * root's dependency graph (see `project_tovu_architecture_metrics`). Scoped to the two routes this
 * dialog actually calls — mirrors `media-picker-port.hooks.ts`'s exact reasoning.
 *
 * `describeApiError` stays a direct import in the hook — pure error-classification, no I/O, same
 * reasoning as `redirects-port.hooks.ts`'s own exclusion of it.
 */
export interface WidgetPickerPort {
  listWidgets(options: { widgetType: AdminWidgetType }): Promise<{ widgets: AdminWidget[] }>;
  createWidget(input: { widgetType: AdminWidgetType; title: string; config: Record<string, unknown> }): Promise<{ widget: AdminWidget }>;
}
