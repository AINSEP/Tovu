import { type AdminWidgetType } from "../../lib/api";
import { WIDGET_TYPE_OPTIONS } from "../../components/WidgetConfigFields/WidgetConfigFields";
import { ConfirmDialog, DataTable } from "@jini-ai/admin/react";
import { agentHandle } from "@jini-ai/agentic";
import { buildAgentListHandles } from "../../lib/agent-list-handles";
import { widgetTypeLabel } from "./rules";
import { useWiredWidgetsLibrary } from "./hooks/use-widgets-library.hooks";

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
  useWidgetsLibraryHook?: typeof useWiredWidgetsLibrary;
}

/** The list screen's two independent notices — a fetch/action error, and how many rows the server
 *  sent back that couldn't be displayed — pulled out of `WidgetsLibrary`'s own render body as a
 *  top-level component under the tightened ≤9/≤9 pass. `skippedCount`'s own singular/plural
 *  ternary is part of the same extraction, since it only exists inside this notice. */
export function WidgetsLibraryNotices({
  error,
  skippedCount,
  t = (key: string) => key,
}: {
  error: string | null;
  skippedCount: number;
  /** Translator closure — see `WidgetsLibrary()`'s own `t`. Optional (identity default) since this
   *  component is exported and unit-tested directly without one — same "default to the real thing,
   *  a stub renders English" convention every `use*Hook` prop in this app already follows. */
  t?: (key: string) => string;
}) {
  return (
    <>
      {error ? <div className="notice error">{error}</div> : null}
      {skippedCount > 0 ? (
        <div className="notice">
          {skippedCount === 1
            ? t("1 row could not be displayed.")
            : t("{n} rows could not be displayed.").replace("{n}", String(skippedCount))}
        </div>
      ) : null}
    </>
  );
}

export function WidgetsLibrary({ useWidgetsLibraryHook = useWiredWidgetsLibrary }: WidgetsLibraryProps = {}) {
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
    t,
    locale,
  } = useWidgetsLibraryHook();

  if (error && !widgets) return <div className="notice error">{error}</div>;
  if (!widgets) return <div className="notice">Loading widgets…</div>;

  // Widget ids are stable and unique, same per-row-handle derivation every other list on this
  // workstream uses (`buildAgentListHandles`) — the title link and the Trash/Delete button both
  // need one, since `DataTable`'s `cell` callback only receives the row, not its index.
  const rowHandles = buildAgentListHandles(
    "widgets-row",
    widgets.map((widget) => widget.id),
  );
  const rowHandleById = new Map(widgets.map((widget, index) => [widget.id, rowHandles[index]!]));

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Content")}</p>
          <h1 className="page-title">{t("Widgets")}</h1>
          <p className="page-description">
            {t("Create reusable content blocks and place them into your theme's widget regions.")}
          </p>
        </div>
        <div className="page-actions">
          <a
            href="/admin/widgets/regions"
            {...agentHandle("widgets-regions-link", { role: "link", label: "Go to Widget Regions" })}
          >
            {t("Regions →")}
          </a>
          <select
            value={createType}
            onChange={(e) => setCreateType(e.target.value as AdminWidgetType)}
            aria-label="Widget type to create"
            {...agentHandle("widgets-create-type", { role: "field", label: "Widget type to create" })}
          >
            {WIDGET_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <a
            href={`/admin/widgets/new?type=${createType}`}
            {...agentHandle("widgets-add-new", { role: "link", label: "Create a new widget of the selected type" })}
          >
            <button>{t("Add New")}</button>
          </a>
        </div>
      </div>
      <WidgetsLibraryNotices error={error} skippedCount={skippedCount} t={t} />
      <DataTable
        rows={widgets}
        rowKey={(widget) => widget.id}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>{t("No widgets yet.")}</p>
              <p className="page-description">{t("Create one above to get started.")}</p>
            </div>
          </div>
        }
        columns={[
          {
            key: "title",
            header: t("Title"),
            cell: (widget) => (
              <a
                href={`/admin/widgets/${widget.id}`}
                {...agentHandle(`${rowHandleById.get(widget.id)}-edit`, { role: "link", label: `Edit the "${widget.title}" widget` })}
              >
                {widget.title}
              </a>
            ),
          },
          {
            key: "type",
            header: t("Type"),
            cell: (widget) => widgetTypeLabel(widget.widgetType, locale),
          },
          {
            key: "status",
            header: t("Status"),
            cell: (widget) => <span className={`status status-${widget.status}`}>{widget.status}</span>,
          },
          { key: "version", header: "v", cell: (widget) => widget.version },
          {
            key: "actions",
            // Not converted to a `RowMenu` — this is the row's only action (see report: a menu
            // with one item is pure overhead over a direct button). Still labeled for
            // accessibility, matching `Roles.tsx`/`Users.tsx`'s existing pattern for an actions
            // column that isn't a bare `<th></th>`.
            headerLabel: t("Actions"),
            cell: (widget) => (
              <button
                onClick={() => trashOrPurge(widget)}
                {...agentHandle(`${rowHandleById.get(widget.id)}-trash-or-purge`, {
                  role: "button",
                  label: widget.status === "active" ? `Move "${widget.title}" to trash` : `Permanently delete "${widget.title}"`,
                })}
              >
                {widget.status === "active" ? t("Trash") : t("Delete permanently")}
              </button>
            ),
          },
        ]}
      />
      <ConfirmDialog
        open={pendingForcePurge !== null}
        agentHandle="widgets-force-purge"
        title={t("Still in use")}
        body={
          pendingForcePurge ? (
            <p>
              {t('"{title}" is still used in: {summary}.')
                .replace("{title}", pendingForcePurge.widget.title)
                .replace("{summary}", pendingForcePurge.summary)}
              <br />
              {t("Permanently delete anyway? This cannot be undone.")}
            </p>
          ) : null
        }
        confirmLabel={t("Permanently delete")}
        destructive
        pending={forcePurging}
        onConfirm={confirmForcePurge}
        onCancel={cancelForcePurge}
      />
    </div>
  );
}
