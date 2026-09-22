import { ApiError, describeApiError, type AdminWidget, type AdminWidgetPlacement, type AdminWidgetType } from "../../lib/api";
import { WIDGET_TYPE_OPTIONS } from "../../components/WidgetConfigFields/WidgetConfigFields";
import { t as translate } from "./widgets-i18n";

/**
 * @file Pure logic shared by the four `widgets` feature screens (`WidgetsLibrary`,
 * `WidgetInstanceEditor`, `WidgetRegionEditor`, `WidgetRegions`) — everything that computes a
 * value rather than rendering one. One shared module for the whole folder, matching
 * `features/posts/rules.ts` and `features/collections/rules.ts`'s convention for a multi-component
 * feature: the decisions live in one importable, directly testable module with no React in it.
 */

/** The Widgets library screen's name on `lib/content-refresh-bus.ts` — see `taxonomy/rules.ts`'s
 *  `TAXONOMY_RESOURCE` for why this is a plain colocated constant rather than a shared registry.
 *  Agent-writable via `widgets_create_instance`/`widgets_update_instance`/`widgets_trash_instance`
 *  (`apps/website/src/features/widgets/agent-tools.ts`), each of which changes a row this screen
 *  lists. */
export const WIDGETS_LIBRARY_RESOURCE = "widgets-library";

/** The Widget Regions screen's own name on the same bus — a separate constant because it is a
 *  separate screen backed by a separate read (`listWidgetRegions`, not `listWidgets`). Agent-
 *  writable via `widgets_bind_region`, which adds a row this screen lists. The per-region PLACEMENT
 *  edits (`widgets_set_region_placements`/`widgets_insert_embed`/`widgets_remove_embed`/
 *  `widgets_reorder_embeds`) land on `WidgetRegionEditor` instead — a single-region editor with its
 *  own `baseVersion`-guarded save, the same "an open editor gets optimistic-concurrency, not a bus
 *  subscription" precedent `use-dockerfile-source.hooks.ts` and `use-post-editor.hooks.ts` already
 *  establish — so it is deliberately NOT wired here. */
export const WIDGETS_REGIONS_RESOURCE = "widgets-regions";

/** The five closed v1 widget types (`WIDGET_TYPE_OPTIONS`, REQ-09) as a lookup set — used to catch
 *  a garbage `?type=` query param on `/widgets/new` before it reaches a live editor shell. */
const KNOWN_WIDGET_TYPES = new Set<string>(WIDGET_TYPE_OPTIONS.map((o) => o.value));

/**
 * The display label for a widget's type — `WidgetsLibrary`'s type column and
 * `WidgetInstanceEditor`'s type caption both fall back to the raw stored value when it isn't one
 * of the known v1 types, rather than rendering blank. The English label is translated afterward via
 * `widgets-i18n.ts`'s `WIDGETS_DICT` (keyed by the English label text, same "translate the resolved
 * display string" shape `lib/admin-nav-i18n.ts`'s `translateAdminNavLabel` uses) rather than
 * `WIDGET_TYPE_OPTIONS` itself carrying per-locale labels — that constant is shared with
 * `WidgetConfigFields.tsx`'s config-form dispatch and is out of this pass's scope.
 *
 * @complexity Time/space: O(k) in `WIDGET_TYPE_OPTIONS`'s fixed, small size (five entries) — not
 * caller-controlled, so effectively O(1).
 */
export function widgetTypeLabel(widgetType: string, locale: string): string {
  const rawLabel = WIDGET_TYPE_OPTIONS.find((o) => o.value === widgetType)?.label ?? widgetType;
  return translate(locale, rawLabel);
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

/** What `WidgetInstanceEditor`'s `save` sets on a caught error — the message plus any field-level
 *  errors the `WIDGETS_CONFIG_VALIDATION_ERROR` case carries. */
export interface WidgetSaveErrorOutcome {
  error: string;
  fieldErrors: Array<{ field: string; reason: string }>;
}

/**
 * `save`'s catch-block decision, pulled out to a top-level pure function per the 2026-08-12
 * complexity-ceiling pass: classifies a caught error into the message/field-errors combination the
 * save path shows, so the three-way `instanceof`/`.code` branching doesn't count against `save`'s
 * own scope. `staleVersionMessage` is injected rather than imported so this module doesn't need to
 * know which resource's own stale-version copy applies — `WidgetRegionEditor`'s save path has its
 * own, differently-worded one.
 *
 * @complexity Time/space: O(1).
 */
export function resolveWidgetSaveError(
  e: unknown,
  locale: string,
  staleVersionMessage: (locale: string) => string
): WidgetSaveErrorOutcome {
  if (e instanceof ApiError && e.code === "WIDGETS_VERSION_CONFLICT") {
    return { error: staleVersionMessage(locale), fieldErrors: [] };
  }
  if (e instanceof ApiError && e.code === "WIDGETS_CONFIG_VALIDATION_ERROR") {
    return { error: describeApiError(e, translate(locale, "save failed")), fieldErrors: widgetConfigFieldErrors(e) };
  }
  return { error: describeApiError(e, translate(locale, "save failed")), fieldErrors: [] };
}

/**
 * `WidgetRegionEditor`'s save catch-block decision, pulled out for the same reason as
 * {@link resolveWidgetSaveError} (2026-08-12 stale-save-guard pass pushed `save`'s own cognitive
 * complexity over the 9/9 ceiling): the `WIDGETS_AREA_CONFLICT`/generic two-way branch doesn't need
 * to count against `save`'s own scope. Only an error string — unlike the instance editor's version,
 * this screen's save path has no per-field validation errors to carry.
 *
 * @complexity Time/space: O(1).
 */
export function resolveWidgetRegionSaveError(
  e: unknown,
  locale: string,
  staleVersionMessage: (locale: string) => string
): string {
  if (e instanceof ApiError && e.code === "WIDGETS_AREA_CONFLICT") {
    return staleVersionMessage(locale);
  }
  return describeApiError(e, translate(locale, "save failed"));
}
