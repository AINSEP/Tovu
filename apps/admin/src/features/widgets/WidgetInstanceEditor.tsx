import { WidgetConfigFields } from "../../components/WidgetConfigFields";
import { isKnownWidgetType, widgetTypeLabel } from "./rules";
import { useWidgetInstanceEditor } from "./hooks/use-widget-instance-editor.hooks";
import type { AdminWidgetWhereUsed } from "../../lib/api";

/**
 * @file `WidgetInstanceEditorScreen` (`ui.spec.md` §2.2/§3.3/§4.3) — create/edit one widget
 * instance, `/admin/widgets/new?type=X` and `/admin/widgets/{id}` — markup only. Mirrors
 * `MenuEditor.tsx`'s editor-shell shape; config editing delegates to the shared
 * `WidgetConfigFields` (§3.4).
 *
 * State, the fetch, and save live in `hooks/use-widget-instance-editor.hooks.ts`; the field-error
 * extraction, the known-type check, and the type label live in `rules.ts`.
 */

/** REQ-34/`ui.spec.md` §3.5 — rendered only when `references.length > 0`, before the config form. */
function WhereUsedBanner(props: { whereUsed: AdminWidgetWhereUsed }) {
  if (props.whereUsed.count === 0) return null;
  return (
    <div className="notice widget-where-used-banner">
      <strong>Used in {props.whereUsed.count} place{props.whereUsed.count === 1 ? "" : "s"}:</strong>
      <ul>
        {props.whereUsed.references.map((ref, i) => (
          <li key={i}>
            {ref.kind === "region" ? "Region area" : "Inline embed"} ({ref.sourceEntryId})
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface WidgetInstanceEditorProps {
  widgetId: string | null;
  widgetType: string | null;
  /**
   * Dependency injection seam for tests — the same convention `Posts.tsx`'s `usePostsHook` uses.
   * Defaulted to the real hook, so production callers pass nothing and behave exactly as before.
   */
  useWidgetInstanceEditorHook?: typeof useWidgetInstanceEditor;
}

export function WidgetInstanceEditor(props: WidgetInstanceEditorProps) {
  const { widgetId, widgetType: queryWidgetType, useWidgetInstanceEditorHook = useWidgetInstanceEditor } = props;
  const { isNew, widget, whereUsed, title, setTitle, config, setConfig, message, error, fieldErrors, loading, saving, widgetType, save } =
    useWidgetInstanceEditorHook({ widgetId, widgetType: queryWidgetType });

  if (error && !isNew && !widget) return <div className="notice error">{error}</div>;
  if (loading) return <div className="notice">Loading widget…</div>;
  if (!widgetType) return <div className="notice error">No widget type specified.</div>;
  // Missing `?type=` was already caught above; a GARBAGE one previously wasn't (audit Major
  // finding): `widgetType` is a query param cast to `AdminWidgetType` with no runtime check, so an
  // unrecognized value reached a full live editor shell — title field, working Save button — with
  // zero config fields and zero explanation (`WidgetConfigFields`'s switch has no `default` beyond
  // `return null`). Scoped to `isNew` only: an already-saved widget's type was validated server-side
  // at creation, so this guards the one confirmed-reachable path (a hand-typed or bookmarked
  // `?type=` value) rather than second-guessing already-loaded data.
  if (isNew && !isKnownWidgetType(widgetType)) {
    return <div className="notice error">Unknown widget type "{widgetType}".</div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Content</p>
          <h1 className="page-title">{isNew ? "New widget" : "Edit widget"}</h1>
          <p className="page-description">Configure this widget&apos;s title and settings.</p>
        </div>
        <div className="page-actions">
          <a href="/admin/widgets">
            <button type="button" className="btn-secondary">
              ← Widgets
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

      {widget ? <WhereUsedBanner whereUsed={whereUsed} /> : null}

      {/* Audit finding: placeholder-only, no `<label>` — same fix as `PostEditor.tsx`'s title field
          (see `styles/editor.css`'s `.a11y-label-wrap` comment). */}
      <label className="a11y-label-wrap">
        <span className="visually-hidden">Widget title</span>
        <input className="editor-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Widget title" />
      </label>
      <p className="muted-cell">Type: {widgetTypeLabel(widgetType)}</p>

      <div className="widget-config-form">
        <WidgetConfigFields widgetType={widgetType} config={config} onChange={setConfig} />
        {fieldErrors.map((fe, i) => (
          <p key={i} className="save-error" role="alert">
            {fe.field}: {fe.reason}
          </p>
        ))}
      </div>
    </div>
  );
}
