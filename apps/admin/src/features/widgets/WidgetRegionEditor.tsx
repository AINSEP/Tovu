import { WidgetAddControl } from "../../components/WidgetPickerDialog/WidgetPickerDialog";
import { useWidgetRegionEditor } from "./hooks/use-widget-region-editor.hooks";

/**
 * @file `RegionPlacementEditorScreen` + `RegionPlacementList` (`ui.spec.md` §2.5/§2.6/§3.7/§3.8/
 * §4.6/§4.7) — `/admin/widgets/regions/{regionKey}` — markup only. Flat ordered list, ↑/↓ move
 * controls, mirrors `MenuEditor.tsx`'s `ItemRow`/`moveAtPath` reorder UX exactly, without the
 * nesting a menu tree has (a region's placement list has no parent/child structure, REQ-15).
 *
 * State, the fetch, and save live in `hooks/use-widget-region-editor.hooks.ts`; the reorder swap
 * and the draft-placement builder live in `rules.ts`.
 */
export interface WidgetRegionEditorProps {
  regionKey: string;
  /**
   * Dependency injection seam for tests — the same convention `Posts.tsx`'s `usePostsHook` uses.
   * Defaulted to the real hook, so production callers pass nothing and behave exactly as before.
   */
  useWidgetRegionEditorHook?: typeof useWidgetRegionEditor;
}

export function WidgetRegionEditor(props: WidgetRegionEditorProps) {
  const { regionKey, useWidgetRegionEditorHook = useWidgetRegionEditor } = props;
  const { area, placements, message, error, loading, saving, removeAt, moveAt, toggleEnabled, addPlacement, save } =
    useWidgetRegionEditorHook(regionKey);

  if (error && !area) return <div className="notice error">{error}</div>;
  if (loading) return <div className="notice">Loading region…</div>;
  if (!area) return null;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Content</p>
          <h1 className="page-title">Region: {regionKey}</h1>
          <p className="page-description">Manage which widgets appear in this region and their order.</p>
        </div>
        <div className="page-actions">
          <a href="/admin/widgets/regions">
            <button type="button" className="btn-secondary">
              ← Regions
            </button>
          </a>
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

      <div className="widget-region-placements">
        {placements.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <p>No widgets placed in this region yet.</p>
            </div>
          </div>
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
