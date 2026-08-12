import { useEffect, useRef, useState } from "react";

import { describeApiError, type AdminWidgetArea, type AdminWidgetPlacement } from "../../../lib/api";
import { buildDraftPlacement, movePlacement, resolveWidgetRegionSaveError } from "../rules";
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

  // Stale-response guard (2026-08-12 audit finding): `load` has two call sites — the mount/
  // `regionKey`-change effect below, AND `save()`'s own post-mutation re-read — so a per-effect-run
  // closure flag (fine when there is only one call site) can't track staleness here: a `save()`-
  // triggered reload has no effect run of its own to flip a flag on cleanup. A monotonic request id
  // does: every `load()` call — from either site — mints the next id, and a completion only commits
  // if it is still the most recent one. Without this, navigating from one region to another while an
  // older `getWidgetRegion` is still in flight (or a `save()`-triggered reload racing a nav away) can
  // overwrite the currently-viewed region with a previous one's placements. Guarded on every
  // completion path (`then`/`catch`/`finally`), not just the success path — an unguarded `finally`
  // clearing `loading` is the one most likely to leave stale data on screen with no spinner to flag
  // it.
  const loadRequestIdRef = useRef(0);

  function load() {
    const requestId = ++loadRequestIdRef.current;
    setLoading(true);
    setError(null);
    // A freshly-loading region, by definition, has no save of its OWN in flight yet — clears
    // `saving` so a save started against the region navigated away FROM (guarded no-op below once
    // it resolves) can't leave this region's spinner stuck on indefinitely. Also fires (harmlessly,
    // to the same value) when THIS call is save()'s own post-success reload, since `saving` is about
    // to read false either way once that save's own `finally` runs.
    setSaving(false);
    port
      .getWidgetRegion(regionKey)
      .then((r) => {
        if (loadRequestIdRef.current !== requestId) return;
        setArea(r.area);
        setPlacements(r.placements);
      })
      .catch((e) => {
        if (loadRequestIdRef.current !== requestId) return;
        setError(describeApiError(e, translate(locale, "failed to load region")));
      })
      .finally(() => {
        if (loadRequestIdRef.current !== requestId) return;
        setLoading(false);
      });
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

  // Stale-response guard, save() half (2026-08-12 audit finding): reuses `loadRequestIdRef` rather
  // than adding a second mechanism — save() snapshots the request id in flight when it STARTS, and
  // a completion only commits if no `load()` (from the `regionKey`-change effect below, i.e. the
  // operator navigating to a different region) has minted a newer one since. This also fixes the
  // interaction the audit flagged: an unguarded save used to call `load()` on completion even after
  // going stale, and THAT trailing `load()` would mint a newer request id than the new region's own
  // in-flight load — discarding the new region's correct response as "stale" by comparison. Skipping
  // the trailing `load()` entirely once `save()` itself is known-stale removes that interaction.
  async function save() {
    if (!area) return;
    const requestId = loadRequestIdRef.current;
    setSaving(true);
    setMessage(null);
    setError(null);
    let stale = false;
    try {
      const { area: saved } = await port.mutateWidgetRegionPlacements({
        regionKey,
        baseVersion: area.version,
        placements: placements.map((p) => ({ placementId: p.placementId, widgetEntryId: p.widgetEntryId, enabled: p.enabled })),
      });
      stale = loadRequestIdRef.current !== requestId;
      if (stale) return;
      setArea(saved);
      setMessage(`Saved · version ${saved.version}`);
      load();
    } catch (e) {
      stale = loadRequestIdRef.current !== requestId;
      if (!stale) setError(resolveWidgetRegionSaveError(e, locale, staleVersionMessage));
    } finally {
      if (!stale) setSaving(false);
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
