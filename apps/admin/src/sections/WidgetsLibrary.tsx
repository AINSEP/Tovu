import { useEffect, useState } from "react";
import { ApiError, api, describeApiError, type AdminWidget, type AdminWidgetType } from "../lib/api";
import { WIDGET_TYPE_OPTIONS } from "../components/WidgetConfigFields";

/**
 * @file `WidgetsLibraryScreen` (`ui.spec.md` §2.1/§3.1/§4.1) — the widget library/list screen,
 * `/admin/widgets`. Mirrors `Menus.tsx`'s list-table/status-badge/header-action shape exactly.
 */

export function WidgetsLibrary() {
  const [widgets, setWidgets] = useState<AdminWidget[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createType, setCreateType] = useState<AdminWidgetType>("text");

  function load() {
    api
      .listWidgets({ includeInactive: true })
      .then((r) => setWidgets(r.widgets))
      .catch((e) => setError(describeApiError(e, "failed to load widgets")));
  }

  useEffect(load, []);

  /** REQ-42/`ui.spec.md` §4.2: the first purge attempt is always `force: false` — only on a
   * `WidgetReferencedError` 409 (naming every referencing location) does a `force: true` retry
   * become an option, and only after an explicit confirmation. Never `force` on the first try. */
  async function purge(widget: AdminWidget) {
    setError(null);
    try {
      await api.purgeWidget({ id: widget.id }, { force: false });
      load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "WIDGETS_REFERENCED") {
        const locations = (e.body?.details as { referencingLocations?: Array<{ kind: string; entryId: string }> } | undefined)?.referencingLocations ?? [];
        const summary = locations.map((l) => `${l.kind} (${l.entryId})`).join(", ") || "at least one other place";
        if (window.confirm(`"${widget.title}" is still used in: ${summary}.\n\nPermanently delete anyway? This cannot be undone.`)) {
          try {
            await api.purgeWidget({ id: widget.id }, { force: true });
            load();
          } catch (e2) {
            setError(describeApiError(e2, "force-purge failed"));
          }
        }
        return;
      }
      setError(describeApiError(e, "delete failed"));
    }
  }

  async function trashOrPurge(widget: AdminWidget) {
    setError(null);
    try {
      if (widget.status === "active") {
        await api.trashWidget(widget.id);
        load();
        return;
      }
      await purge(widget);
    } catch (e) {
      setError(describeApiError(e, "delete failed"));
    }
  }

  if (error && !widgets) return <div className="notice error">{error}</div>;
  if (!widgets) return <div className="notice">Loading widgets…</div>;

  return (
    <div>
      <div className="editor-header">
        <h1>Widgets</h1>
        <span className="editor-actions">
          <a href="/admin/widgets/regions">Regions →</a>
          <select value={createType} onChange={(e) => setCreateType(e.target.value as AdminWidgetType)} aria-label="Widget type to create">
            {WIDGET_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <a href={`/admin/widgets/new?type=${createType}`}>
            <button>Add New</button>
          </a>
        </span>
      </div>
      {error ? <div className="notice error">{error}</div> : null}
      {widgets.length === 0 ? (
        <p className="muted-cell">No widgets yet — create one above.</p>
      ) : (
        <table className="list-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Status</th>
              <th>v</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {widgets.map((widget) => (
              <tr key={widget.id}>
                <td>
                  <a href={`/admin/widgets/${widget.id}`}>{widget.title}</a>
                </td>
                <td>{WIDGET_TYPE_OPTIONS.find((o) => o.value === widget.widgetType)?.label ?? widget.widgetType}</td>
                <td>
                  <span className={`status status-${widget.status}`}>{widget.status}</span>
                </td>
                <td>{widget.version}</td>
                <td>
                  <button onClick={() => trashOrPurge(widget)}>
                    {widget.status === "active" ? "Trash" : "Delete permanently"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
