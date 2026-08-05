import { type AdminWidgetType } from "../../lib/api";
import { WIDGET_TYPE_OPTIONS } from "../../components/WidgetConfigFields";
import { ConfirmDialog, DataTable } from "@jini-ai/admin/react";
import { widgetTypeLabel } from "./rules";
import { useWidgetsLibrary } from "./hooks/use-widgets-library.hooks";

/**
 * @file `WidgetsLibraryScreen` (`ui.spec.md` §2.1/§3.1/§4.1) — the widget library/list screen,
 * `/admin/widgets` — markup only. Mirrors `Menus.tsx`'s list-table/status-badge/header-action
 * shape exactly.
 *
 * State, the fetch, and the trash/purge/force-purge escalation live in
 * `hooks/use-widgets-library.hooks.ts`; the shared type-label and referencing-locations
 * derivations live in `rules.ts`.
 */
export interface WidgetsLibraryProps {
  /**
   * Dependency injection seam for tests — the same convention `Posts.tsx`'s `usePostsHook` uses.
   * Defaulted to the real hook, so production callers pass nothing and behave exactly as before.
   */
  useWidgetsLibraryHook?: typeof useWidgetsLibrary;
}

export function WidgetsLibrary({ useWidgetsLibraryHook = useWidgetsLibrary }: WidgetsLibraryProps = {}) {
  const {
    widgets,
    error,
    skippedCount,
    createType,
    setCreateType,
    pendingForcePurge,
    cancelForcePurge,
    forcePurging,
    confirmForcePurge,
    trashOrPurge,
  } = useWidgetsLibraryHook();

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
      {skippedCount > 0 ? (
        <div className="notice">
          {skippedCount === 1
            ? "1 row could not be displayed."
            : `${skippedCount} rows could not be displayed.`}
        </div>
      ) : null}
      <DataTable
        rows={widgets}
        rowKey={(widget) => widget.id}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>No widgets yet.</p>
              <p className="page-description">Create one above to get started.</p>
            </div>
          </div>
        }
        columns={[
          {
            key: "title",
            header: "Title",
            cell: (widget) => <a href={`/admin/widgets/${widget.id}`}>{widget.title}</a>,
          },
          {
            key: "type",
            header: "Type",
            cell: (widget) => widgetTypeLabel(widget.widgetType),
          },
          {
            key: "status",
            header: "Status",
            cell: (widget) => <span className={`status status-${widget.status}`}>{widget.status}</span>,
          },
          { key: "version", header: "v", cell: (widget) => widget.version },
          {
            key: "actions",
            // Not converted to a `RowMenu` — this is the row's only action (see report: a menu
            // with one item is pure overhead over a direct button). Still labeled for
            // accessibility, matching `Roles.tsx`/`Users.tsx`'s existing pattern for an actions
            // column that isn't a bare `<th></th>`.
            headerLabel: "Actions",
            cell: (widget) => (
              <button onClick={() => trashOrPurge(widget)}>
                {widget.status === "active" ? "Trash" : "Delete permanently"}
              </button>
            ),
          },
        ]}
      />
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
        onCancel={cancelForcePurge}
      />
    </div>
  );
}
