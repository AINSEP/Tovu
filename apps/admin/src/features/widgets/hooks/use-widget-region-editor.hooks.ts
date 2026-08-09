import { useEffect, useState } from "react";

import { ApiError, api, describeApiError, type AdminWidgetArea, type AdminWidgetPlacement } from "../../../lib/api";
import { buildDraftPlacement, movePlacement } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../widgets-i18n";

/**
 * @file Everything the `WidgetRegionEditor` screen does, so `WidgetRegionEditor.tsx` is only
 * markup.
 *
 * Extracted verbatim — same state, same order, same effect, same error handling. Naming follows
 * `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because nothing
 * outside `features/widgets` needs it.
 */

/** Locale-aware replacement for the old `STALE_VERSION_MESSAGE` constant — this string is only
 *  ever read inside this hook itself (after a `WIDGETS_AREA_CONFLICT` 409), so it can be a
 *  function of `locale` instead of a locale-blind module constant. */
export function staleVersionMessage(locale: string): string {
  return t(locale, "This region changed since you loaded it, refresh and try again.");
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
}

export function useWidgetRegionEditor(regionKey: string): WidgetRegionEditorController {
  const locale = useAdminLocale();
  const [area, setArea] = useState<AdminWidgetArea | null>(null);
  const [placements, setPlacements] = useState<AdminWidgetPlacement[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    api
      .getWidgetRegion(regionKey)
      .then((r) => {
        setArea(r.area);
        setPlacements(r.placements);
      })
      .catch((e) => setError(describeApiError(e, t(locale, "failed to load region"))))
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
      const { area: saved } = await api.mutateWidgetRegionPlacements({
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
        setError(describeApiError(e, t(locale, "save failed")));
      }
    } finally {
      setSaving(false);
    }
  }

  return { area, placements, message, error, loading, saving, removeAt, moveAt, toggleEnabled, addPlacement, save };
}
