import { WidgetAddControl } from "../../components/WidgetPickerDialog/WidgetPickerDialog";
import { agentHandle } from "@jini-ai/agentic";
import { buildAgentListHandles } from "../../lib/agent-list-handles";
import { useWiredWidgetRegionEditor } from "./hooks/use-widget-region-editor.hooks";

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
  useWidgetRegionEditorHook?: typeof useWiredWidgetRegionEditor;
}

/** The page header's actions cluster — the "back to regions" link, the save-status message/error,
 *  and the Save button — pulled out of `WidgetRegionEditor`'s own render body as a top-level
 *  component under the tightened ≤9/≤9 pass. Each of the three spans below is its own independent
 *  conditional (a save succeeded, a save failed, the save is in flight); extracting the whole
 *  cluster moves all three out of the parent's own scope at once. */
export function WidgetRegionEditorHeaderActions({
  message,
  error,
  saving,
  onSave,
  t = (key: string) => key,
}: {
  message: string | null;
  error: string | null;
  saving: boolean;
  onSave: () => void;
  /** Translator closure — see `WidgetRegionEditor()`'s own `t`. Optional (identity default) since
   *  this component is exported and unit-tested directly without one. */
  t?: (key: string) => string;
}) {
  return (
    <div className="page-actions">
      <a
        className="btn-secondary"
        href="/admin/widgets/regions"
        {...agentHandle("widget-region-editor-back", { role: "link", label: "Back to Widget Regions" })}
      >
        ← {t("Regions")}
      </a>
      {message ? <span className="save-ok">{message}</span> : null}
      {error ? (
        <span className="save-error" role="alert">
          {error}
        </span>
      ) : null}
      <button
        onClick={onSave}
        disabled={saving}
        {...agentHandle("widget-region-editor-save", { role: "button", label: "Save this region's placements" })}
      >
        {saving ? t("Saving…") : t("Save")}
      </button>
    </div>
  );
}

export function WidgetRegionEditor(props: WidgetRegionEditorProps) {
  const { regionKey, useWidgetRegionEditorHook = useWiredWidgetRegionEditor } = props;
  const { area, placements, message, error, loading, saving, removeAt, moveAt, toggleEnabled, addPlacement, save, t } =
    useWidgetRegionEditorHook(regionKey);

  if (error && !area) return <div className="notice error">{error}</div>;
  if (loading) return <div className="notice">Loading region…</div>;
  if (!area) return null;

  // Placement ids are stable and unique, same per-row-handle derivation every other list on this
  // workstream uses (`buildAgentListHandles`).
  const placementHandles = buildAgentListHandles(
    "widget-region-placement",
    placements.map((placement) => placement.placementId),
  );

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Content")}</p>
          <h1 className="page-title">{t("Region:")} {regionKey}</h1>
          <p className="page-description">{t("Manage which widgets appear in this region and their order.")}</p>
        </div>
        <WidgetRegionEditorHeaderActions message={message} error={error} saving={saving} onSave={save} t={t} />
      </div>

      <div className="widget-region-placements">
        {placements.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <p>{t("No widgets placed in this region yet.")}</p>
            </div>
          </div>
        ) : (
          placements.map((placement, i) => (
            <div key={placement.placementId} className="menu-item-row">
              <div className="menu-item-fields">
                {placement.broken ? (
                  <span className="widget-embed-node--broken">{t("⚠ Broken reference")}</span>
                ) : (
                  <span>
                    <strong>{placement.widgetTitle}</strong> <span className="muted-cell">({placement.widgetType})</span>
                  </span>
                )}
                <label>
                  <input
                    type="checkbox"
                    checked={placement.enabled}
                    onChange={() => toggleEnabled(placement.placementId)}
                    {...agentHandle(`${placementHandles[i]}-enabled`, { role: "field", label: `Whether "${placement.widgetTitle}" is enabled` })}
                  />
                  {t("Enabled")}
                </label>
                <button
                  className="tb-btn"
                  onClick={() => moveAt(i, -1)}
                  title="Move up"
                  {...agentHandle(`${placementHandles[i]}-move-up`, { role: "button", label: `Move "${placement.widgetTitle}" up` })}
                >
                  ↑
                </button>
                <button
                  className="tb-btn"
                  onClick={() => moveAt(i, 1)}
                  title="Move down"
                  {...agentHandle(`${placementHandles[i]}-move-down`, { role: "button", label: `Move "${placement.widgetTitle}" down` })}
                >
                  ↓
                </button>
                <button
                  className="tb-btn"
                  onClick={() => removeAt(placement.placementId)}
                  title="Remove"
                  {...agentHandle(`${placementHandles[i]}-remove`, { role: "button", label: `Remove "${placement.widgetTitle}" from this region` })}
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
        <WidgetAddControl
          triggerLabel={t("+ Add widget")}
          onResolved={(widgetInstanceId) => addPlacement(widgetInstanceId)}
          agentHandle="widget-region-add"
        />
      </div>
    </div>
  );
}
