import { useEffect, useState } from "react";

import { ApiError, describeApiError, type AdminWidgetArea, type AdminWidgetPlacement } from "../../../lib/api";
import { buildDraftPlacement, movePlacement } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { WIDGETS_DICT, t as translate } from "../widgets-i18n";
import type { Translate } from "../../../lib/dictionary-translator";
import { defaultWidgetRegionsPort } from "./widget-regions-dependencies.hooks";
import type { WidgetRegionsPort } from "./widget-regions-port.hooks";

/**
 * @file Everything the `WidgetRegionEditor` screen does, so `WidgetRegionEditor.tsx` is only
 * markup.
 *
 * Extracted verbatim — same state, same order, same effect, same error handling. Naming follows
 * `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because nothing
 * outside `features/widgets` needs it.
 *
 * `deps.port`/`deps.locale` are injected (see `widget-regions-port.hooks.ts`) rather than reaching
 * for `lib/api`'s `api` and `useAdminLocale()` directly, sharing the `WidgetRegionsPort`
 * `use-widget-regions.hooks.ts` also injects — both read/write the region/placement resource.
 * `widgets-i18n.ts`'s own `t(locale, key)` — aliased `translate` here to avoid colliding with this
 * file's own bound `(key) => string` closure — stays a direct import for this hook's OWN error
 * strings: a pure `DICT[locale]?.[key] ?? key` lookup with no host boundary, same "pure, no-I/O"
 * category the convention doc names for `describeApiError`.
 *
 * `deps.t` (standing i18n rule, 2026-08-11 — see `use-widgets-library.hooks.ts`'s identical note):
 * injected so `WidgetRegionEditor.tsx` sources its UI copy from this hook instead of its own
 * `useAdminLocale()`/`WIDGETS_DICT` import.
 */

export interface WidgetRegionEditorDependencies {
  port: WidgetRegionsPort;
  locale: string;
  t: Translate;
}

/** Locale-aware replacement for the old `STALE_VERSION_MESSAGE` constant — this string is only
 *  ever read inside this hook itself (after a `WIDGETS_AREA_CONFLICT` 409), so it can be a
 *  function of `locale` instead of a locale-blind module constant. */
export function staleVersionMessage(locale: string): string {
  return translate(locale, "This region changed since you loaded it, refresh and try again.");
}

export interface WidgetRegionEditorController {
  area: AdminWidgetArea | null;
  placements: AdminWidgetPlacement[];
  message: string | null;
  error: string | null;
  loading: boolean;
  saving: boolean;
  removeAt: (placementId: string) => void;
  moveAt: (index: number, direction: -1 | 1) => void;
  toggleEnabled: (placementId: string) => void;
  addPlacement: (widgetInstanceId: string) => void;
  save: () => Promise<void>;
  /** Bound translator — `WidgetRegionEditor.tsx`'s only source of UI copy; see this file's own
   *  header. */
  t: Translate;
}

export function useWidgetRegionEditor(regionKey: string, { port, locale, t }: WidgetRegionEditorDependencies): WidgetRegionEditorController {
  const [area, setArea] = useState<AdminWidgetArea | null>(null);
  const [placements, setPlacements] = useState<AdminWidgetPlacement[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    port
      .getWidgetRegion(regionKey)
      .then((r) => {
        setArea(r.area);
        setPlacements(r.placements);
      })
      .catch((e) => setError(describeApiError(e, translate(locale, "failed to load region"))))
      .finally(() => setLoading(false));
  }

  useEffect(load, [regionKey]);

  function removeAt(placementId: string) {
    setPlacements((prev) => prev.filter((p) => p.placementId !== placementId));
  }
  function moveAt(index: number, direction: -1 | 1) {
    setPlacements((prev) => movePlacement(prev, index, direction));
  }
  function toggleEnabled(placementId: string) {
    setPlacements((prev) => prev.map((p) => (p.placementId === placementId ? { ...p, enabled: !p.enabled } : p)));
  }
  function addPlacement(widgetInstanceId: string) {
    setPlacements((prev) => [...prev, buildDraftPlacement(widgetInstanceId)]);
  }

  async function save() {
    if (!area) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const { area: saved } = await port.mutateWidgetRegionPlacements({
        regionKey,
        baseVersion: area.version,
        placements: placements.map((p) => ({ placementId: p.placementId, widgetEntryId: p.widgetEntryId, enabled: p.enabled })),
      });
      setArea(saved);
      setMessage(`Saved · version ${saved.version}`);
      load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "WIDGETS_AREA_CONFLICT") {
        setError(staleVersionMessage(locale));
      } else {
        setError(describeApiError(e, translate(locale, "save failed")));
      }
    } finally {
      setSaving(false);
    }
  }

  return { area, placements, message, error, loading, saving, removeAt, moveAt, toggleEnabled, addPlacement, save, t };
}

/**
 * Binds the real `/api/.../widgets/regions` client, the real `useAdminLocale()`, and a
 * `WIDGETS_DICT`-bound translator — see `widget-regions-dependencies.hooks.ts`.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `WidgetRegionEditor.tsx` composes this and a test composes {@link useWidgetRegionEditor} with
 * `createFakeWidgetRegionsPort`.
 */
export function useWiredWidgetRegionEditor(regionKey: string): WidgetRegionEditorController {
  const locale = useAdminLocale();
  const t = (key: string): string => WIDGETS_DICT[locale]?.[key] ?? key;
  return useWidgetRegionEditor(regionKey, { port: defaultWidgetRegionsPort, locale, t });
}
