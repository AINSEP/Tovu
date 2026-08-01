import { useEffect, useState } from "react";
import { ApiError, api, describeApiError, type AdminWidget, type AdminWidgetType, type AdminWidgetWhereUsed } from "../lib/api";
import { defaultWidgetConfig, WidgetConfigFields, WIDGET_TYPE_OPTIONS } from "../components/WidgetConfigFields";
import { navigate } from "../lib/router";

/**
 * @file `WidgetInstanceEditorScreen` (`ui.spec.md` §2.2/§3.3/§4.3) — create/edit one widget
 * instance, `/admin/widgets/new?type=X` and `/admin/widgets/{id}`. Mirrors `MenuEditor.tsx`'s editor-shell
 * shape; config editing delegates to the shared `WidgetConfigFields` (§3.4).
 */

const STALE_VERSION_MESSAGE = "This widget changed since you loaded it, refresh and try again.";

/** The five closed v1 widget types (`WIDGET_TYPE_OPTIONS`, REQ-09) as a lookup set — used to catch
 *  a garbage `?type=` query param on `/widgets/new` before it reaches a live editor shell. */
const KNOWN_WIDGET_TYPES = new Set<string>(WIDGET_TYPE_OPTIONS.map((o) => o.value));

function fieldErrorsOf(e: unknown): Array<{ field: string; reason: string }> {
  if (e instanceof ApiError && e.code === "WIDGETS_CONFIG_VALIDATION_ERROR") {
    const details = e.body?.details as { fieldErrors?: Array<{ field: string; reason: string }> } | undefined;
    return details?.fieldErrors ?? [];
  }
  return [];
}

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

export function WidgetInstanceEditor(props: { widgetId: string | null; widgetType: string | null }) {
  const isNew = props.widgetId === null;
  const [widget, setWidget] = useState<AdminWidget | null>(null);
  const [whereUsed, setWhereUsed] = useState<AdminWidgetWhereUsed>({ count: 0, references: [] });
  const [title, setTitle] = useState("");
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Array<{ field: string; reason: string }>>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const widgetType = (isNew ? props.widgetType : widget?.widgetType) as AdminWidgetType | null;

  useEffect(() => {
    if (isNew) {
      setWidget(null);
      setTitle("");
      setConfig(defaultWidgetConfig((props.widgetType as AdminWidgetType) ?? "text"));
      setWhereUsed({ count: 0, references: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .getWidget(props.widgetId as string)
      .then((r) => {
        setWidget(r.widget);
        setTitle(r.widget.title);
        setConfig(r.widget.config);
        setWhereUsed(r.whereUsed);
      })
      .catch((e) => setError(describeApiError(e, "failed to load widget")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.widgetId, props.widgetType, isNew]);

  async function save() {
    if (!widgetType) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    setFieldErrors([]);
    try {
      if (isNew) {
        const { widget: created } = await api.createWidget({ widgetType, title, config });
        navigate(`/widgets/${created.id}`);
        return;
      }
      if (!widget) return;
      const { widget: saved } = await api.updateWidget({ id: widget.id, baseVersion: widget.version, config });
      setWidget(saved);
      setConfig(saved.config);
      setMessage(`Saved · version ${saved.version}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "WIDGETS_VERSION_CONFLICT") {
        setError(STALE_VERSION_MESSAGE);
      } else if (e instanceof ApiError && e.code === "WIDGETS_CONFIG_VALIDATION_ERROR") {
        setFieldErrors(fieldErrorsOf(e));
        setError(describeApiError(e, "save failed"));
      } else {
        setError(describeApiError(e, "save failed"));
      }
    } finally {
      setSaving(false);
    }
  }

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
  if (isNew && !KNOWN_WIDGET_TYPES.has(widgetType)) {
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
      <p className="muted-cell">Type: {WIDGET_TYPE_OPTIONS.find((o) => o.value === widgetType)?.label ?? widgetType}</p>

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
