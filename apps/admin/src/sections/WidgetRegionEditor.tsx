import { useEffect, useState } from "react";
import { ApiError, api, type AdminWidgetArea, type AdminWidgetPlacement } from "../lib/api";
import { WidgetAddControl } from "../components/WidgetPickerDialog";

/**
 * @file `RegionPlacementEditorScreen` + `RegionPlacementList` (`ui.spec.md` §2.5/§2.6/§3.7/§3.8/
 * §4.6/§4.7) — `/admin/widgets/regions/{regionKey}`. Flat ordered list, ↑/↓ move controls, mirrors
 * `MenuEditor.tsx`'s `ItemRow`/`moveAtPath` reorder UX exactly, without the nesting a menu tree
 * has (a region's placement list has no parent/child structure, REQ-15).
 */

const STALE_VERSION_MESSAGE = "This region changed since you loaded it, refresh and try again.";

function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message || fallback;
  return e instanceof Error ? e.message : fallback;
}

function move<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function WidgetRegionEditor(props: { regionKey: string }) {
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
      .getWidgetRegion(props.regionKey)
      .then((r) => {
        setArea(r.area);
        setPlacements(r.placements);
      })
      .catch((e) => setError(describeApiError(e, "failed to load region")))
      .finally(() => setLoading(false));
  }

  useEffect(load, [props.regionKey]);

  function removeAt(placementId: string) {
    setPlacements((prev) => prev.filter((p) => p.placementId !== placementId));
  }
  function moveAt(index: number, direction: -1 | 1) {
    setPlacements((prev) => move(prev, index, direction));
  }
  function toggleEnabled(placementId: string) {
    setPlacements((prev) => prev.map((p) => (p.placementId === placementId ? { ...p, enabled: !p.enabled } : p)));
  }
  function addPlacement(widgetInstanceId: string) {
    setPlacements((prev) => [
      ...prev,
      { placementId: globalThis.crypto?.randomUUID?.() ?? `p-${Date.now()}`, widgetEntryId: widgetInstanceId, enabled: true, widgetTitle: null, widgetType: null, broken: false },
    ]);
  }

  async function save() {
    if (!area) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const { area: saved } = await api.mutateWidgetRegionPlacements({
        regionKey: props.regionKey,
        baseVersion: area.version,
        placements: placements.map((p) => ({ placementId: p.placementId, widgetEntryId: p.widgetEntryId, enabled: p.enabled })),
      });
      setArea(saved);
      setMessage(`Saved · version ${saved.version}`);
      load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "WIDGETS_AREA_CONFLICT") {
        setError(STALE_VERSION_MESSAGE);
      } else {
        setError(describeApiError(e, "save failed"));
      }
    } finally {
      setSaving(false);
    }
  }

  if (error && !area) return <div className="notice error">{error}</div>;
  if (loading) return <div className="notice">Loading region…</div>;
  if (!area) return null;

  return (
    <div className="editor-page">
      <div className="editor-header">
        <a href="/admin/widgets/regions">← Regions</a>
        <div className="editor-actions">
          {message ? <span className="save-ok">{message}</span> : null}
          {error ? (
            <span className="save-error" role="alert">
              {error}
            </span>
          ) : null}
          <button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <h1>Region: {props.regionKey}</h1>

      <div className="widget-region-placements">
        {placements.length === 0 ? (
          <p className="muted-cell">No widgets placed in this region yet.</p>
        ) : (
          placements.map((placement, i) => (
            <div key={placement.placementId} className="menu-item-row">
              <div className="menu-item-fields">
                {placement.broken ? (
                  <span className="widget-embed-node--broken">⚠ Broken reference</span>
                ) : (
                  <span>
                    <strong>{placement.widgetTitle}</strong> <span className="muted-cell">({placement.widgetType})</span>
                  </span>
                )}
                <label>
                  <input type="checkbox" checked={placement.enabled} onChange={() => toggleEnabled(placement.placementId)} />
                  Enabled
                </label>
                <button className="tb-btn" onClick={() => moveAt(i, -1)} title="Move up">
                  ↑
                </button>
                <button className="tb-btn" onClick={() => moveAt(i, 1)} title="Move down">
                  ↓
                </button>
                <button className="tb-btn" onClick={() => removeAt(placement.placementId)} title="Remove">
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
        <WidgetAddControl triggerLabel="+ Add widget" onResolved={(widgetInstanceId) => addPlacement(widgetInstanceId)} />
      </div>
    </div>
  );
}
