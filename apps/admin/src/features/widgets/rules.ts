import { ApiError, type AdminWidget, type AdminWidgetPlacement, type AdminWidgetType } from "../../lib/api";
import { WIDGET_TYPE_OPTIONS } from "../../components/WidgetConfigFields/WidgetConfigFields";

/**
 * @file Pure logic shared by the four `widgets` feature screens (`WidgetsLibrary`,
 * `WidgetInstanceEditor`, `WidgetRegionEditor`, `WidgetRegions`) — everything that computes a
 * value rather than rendering one. One shared module for the whole folder, matching
 * `features/posts/rules.ts` and `features/collections/rules.ts`'s convention for a multi-component
 * feature: the decisions live in one importable, directly testable module with no React in it.
 */

/** The five closed v1 widget types (`WIDGET_TYPE_OPTIONS`, REQ-09) as a lookup set — used to catch
 *  a garbage `?type=` query param on `/widgets/new` before it reaches a live editor shell. */
const KNOWN_WIDGET_TYPES = new Set<string>(WIDGET_TYPE_OPTIONS.map((o) => o.value));

/**
 * The display label for a widget's type — `WidgetsLibrary`'s type column and
 * `WidgetInstanceEditor`'s type caption both fall back to the raw stored value when it isn't one
 * of the known v1 types, rather than rendering blank.
 *
 * @complexity Time/space: O(k) in `WIDGET_TYPE_OPTIONS`'s fixed, small size (five entries) — not
 * caller-controlled, so effectively O(1).
 */
export function widgetTypeLabel(widgetType: string): string {
  return WIDGET_TYPE_OPTIONS.find((o) => o.value === widgetType)?.label ?? widgetType;
}

/** Whether `widgetType` is one of the five closed v1 types — see {@link KNOWN_WIDGET_TYPES}'s own
 *  comment for why this only matters for `isNew`/`?type=` (a garbage already-saved type was
 *  validated server-side at creation and can't reach this check).
 *
 * @complexity Time/space: O(1) — `Set` membership.
 */
export function isKnownWidgetType(widgetType: string): boolean {
  return KNOWN_WIDGET_TYPES.has(widgetType);
}

/**
 * REQ-42/`ui.spec.md` §4.2's escalation summary — turns a `WIDGETS_REFERENCED` 409's
 * `referencingLocations` into the "still used in: ..." copy `WidgetsLibrary`'s escalation
 * `ConfirmDialog` shows. Falls back to a generic phrase on an empty list (the 409 fired but the
 * server didn't name anything) rather than rendering "still used in: ." with nothing after the
 * colon.
 *
 * @complexity Time/space: O(n) in the number of referencing locations.
 */
export function describeReferencingLocations(locations: Array<{ kind: string; entryId: string }>): string {
  return locations.map((l) => `${l.kind} (${l.entryId})`).join(", ") || "at least one other place";
}

/** The field errors a `WIDGETS_CONFIG_VALIDATION_ERROR` 409 carries, or an empty array for any
 *  other error shape — `WidgetInstanceEditor`'s save path only has field-level copy to show for
 *  this one error code. */
export function widgetConfigFieldErrors(e: unknown): Array<{ field: string; reason: string }> {
  if (e instanceof ApiError && e.code === "WIDGETS_CONFIG_VALIDATION_ERROR") {
    const details = e.body?.details as { fieldErrors?: Array<{ field: string; reason: string }> } | undefined;
    return details?.fieldErrors ?? [];
  }
  return [];
}

/**
 * `WidgetInstanceEditor`'s single source of truth for "what type is this editor configuring" —
 * the `?type=` query param while creating, the loaded widget's own type once one exists. Kept as
 * one derivation (not two independent reads) so the two paths can't drift.
 *
 * @complexity Time/space: O(1).
 */
export function resolveEditorWidgetType(
  isNew: boolean,
  queryWidgetType: string | null,
  widget: AdminWidget | null,
): AdminWidgetType | null {
  return (isNew ? queryWidgetType : widget?.widgetType) as AdminWidgetType | null;
}

/**
 * Reorders `items` by swapping the element at `index` with its neighbor in `direction`, or returns
 * `items` unchanged when the swap would go out of bounds — `WidgetRegionEditor`'s ↑/↓ move
 * controls, mirroring `MenuEditor.tsx`'s `moveAtPath` for a flat (non-nested) list.
 *
 * Returns a new array rather than mutating `items` — callers pass this straight to a `useState`
 * setter, which needs a new reference to re-render.
 *
 * @complexity Time/space: O(n) — one array copy per call.
 */
export function movePlacement<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * The locally-drafted placement `WidgetRegionEditor` appends when an operator picks a widget from
 * `WidgetAddControl`, before a Save round trip assigns it a server-known identity. `placementId`
 * prefers `crypto.randomUUID()` (unavailable in some test/SSR environments, hence the fallback) —
 * either way it is a draft key the reorder/remove/toggle handlers can address by, not a value the
 * server ever sees verbatim (Save sends `widgetEntryId`/`enabled` per placement, not this id).
 *
 * @complexity Time/space: O(1).
 */
export function buildDraftPlacement(widgetInstanceId: string): AdminWidgetPlacement {
  return {
    placementId: globalThis.crypto?.randomUUID?.() ?? `p-${Date.now()}`,
    widgetEntryId: widgetInstanceId,
    enabled: true,
    widgetTitle: null,
    widgetType: null,
    broken: false,
  };
}
