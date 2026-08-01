import { useEffect, useState } from "react";
import { ApiError, api, describeApiError, type AdminWidget, type AdminWidgetType } from "../lib/api";
import { WIDGET_TYPE_OPTIONS } from "../components/WidgetConfigFields";
import { ConfirmDialog } from "../components/ConfirmDialog";

/**
 * @file `WidgetsLibraryScreen` (`ui.spec.md` §2.1/§3.1/§4.1) — the widget library/list screen,
 * `/admin/widgets`. Mirrors `Menus.tsx`'s list-table/status-badge/header-action shape exactly.
 */

export function WidgetsLibrary() {
  const [widgets, setWidgets] = useState<AdminWidget[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createType, setCreateType] = useState<AdminWidgetType>("text");
  // The widget + its referencing-locations summary a `WIDGETS_REFERENCED` 409 (below) is asking to
  // force-purge past — `null` when the dialog is closed. `ConfirmDialog` stays mounted
  // unconditionally below (see its own doc comment on why); this is what drives its `open` prop.
  const [pendingForcePurge, setPendingForcePurge] = useState<{ widget: AdminWidget; summary: string } | null>(null);
  const [forcePurging, setForcePurging] = useState(false);

  function load() {
    api
      .listWidgets({ includeInactive: true })
      .then((r) => setWidgets(r.widgets))
      .catch((e) => setError(describeApiError(e, "failed to load widgets")));
  }

  useEffect(load, []);

  /** REQ-42/`ui.spec.md` §4.2: the first purge attempt is always `force: false` — only on a
   * `WidgetReferencedError` 409 (naming every referencing location) does a `force: true` retry
   * become an option, and only after an explicit confirmation. Never `force` on the first try.
   *
   * The escalation confirmation now gates via a `ConfirmDialog` modal (`setPendingForcePurge`)
   * rather than a `window.confirm` built from the same dynamic "still used in: ..." message —
   * computed here, at the point the 409 is caught, same as before; only where it's rendered
   * (a real dialog body instead of a blocking prompt string) changed. */
  async function purge(widget: AdminWidget) {
    setError(null);
    try {
      await api.purgeWidget({ id: widget.id }, { force: false });
      load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "WIDGETS_REFERENCED") {
        const locations = (e.body?.details as { referencingLocations?: Array<{ kind: string; entryId: string }> } | undefined)?.referencingLocations ?? [];
        const summary = locations.map((l) => `${l.kind} (${l.entryId})`).join(", ") || "at least one other place";
        setPendingForcePurge({ widget, summary });
        return;
      }
      setError(describeApiError(e, "delete failed"));
    }
  }

  async function confirmForcePurge() {
    if (!pendingForcePurge) return;
    const { widget } = pendingForcePurge;
    setForcePurging(true);
    try {
      await api.purgeWidget({ id: widget.id }, { force: true });
      load();
    } catch (e2) {
      setError(describeApiError(e2, "force-purge failed"));
    } finally {
      setForcePurging(false);
      setPendingForcePurge(null);
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
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Content</p>
          <h1 className="page-title">Widgets</h1>
          <p className="page-description">
            Create reusable content blocks and place them into your theme's widget regions.
          </p>
        </div>
        <div className="page-actions">
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
        </div>
      </div>
      {error ? <div className="notice error">{error}</div> : null}
      {widgets.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>No widgets yet.</p>
            <p className="page-description">Create one above to get started.</p>
          </div>
        </div>
      ) : (
        <div className="table-scroll">
        <table className="list-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Status</th>
              <th>v</th>
              {/* Not converted to a `RowMenu` — this is the row's only action (see report: a menu
                  with one item is pure overhead over a direct button). Still labeled for
                  accessibility, matching `Roles.tsx`/`Users.tsx`'s existing pattern for an actions
                  column that isn't a bare `<th></th>`. */}
              <th aria-label="Actions" />
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
        </div>
      )}
      <ConfirmDialog
        open={pendingForcePurge !== null}
        title="Still in use"
        body={
          pendingForcePurge ? (
            <p>
              &quot;{pendingForcePurge.widget.title}&quot; is still used in: {pendingForcePurge.summary}.
              <br />
              Permanently delete anyway? This cannot be undone.
            </p>
          ) : null
        }
        confirmLabel="Permanently delete"
        destructive
        pending={forcePurging}
        onConfirm={confirmForcePurge}
        onCancel={() => setPendingForcePurge(null)}
      />
    </div>
  );
}
