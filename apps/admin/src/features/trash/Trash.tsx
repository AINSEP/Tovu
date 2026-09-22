import { DataTable, ConfirmDialog, type DataTableColumn } from "@jini-ai/admin/react";
import { agentHandle } from "@jini-ai/agentic";

import type { AdminTrashItem } from "../../lib/api";
import { buildAgentListHandles } from "../../lib/agent-list-handles";
import { formatTimestamp } from "../../lib/format-timestamp";
import { interpolate } from "../../lib/template-i18n";
import { translateAdminNavLabel } from "../../lib/admin-nav-i18n";
import { actorLabel, coverageLine, entityTypeLabel, itemSubtitle } from "./rules";
import { t } from "./trash-i18n";
import { useWiredTrash, type TrashController } from "./hooks/use-trash.hooks";

/**
 * @file The Trash screen — markup only. Every piece of state lives in `hooks/use-trash.hooks.ts`.
 *
 * Replaces the `soon: true` Placeholder `panels.tsx` rendered for this nav entry since the tab was
 * added. Design of record: `ADS-memory/reports/2026-09-20-trash-delete-architecture.md`.
 *
 * The coverage line under the title is not decoration and is not behind a disclosure: phase 1
 * collects four of the seven kinds this admin can delete, so a user who deletes a widget and does
 * not find it here would otherwise conclude it is gone for good.
 */

/** The select-all checkbox that lives in the table's first header cell. */
function SelectAllHeader(props: { locale: string; allSelected: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <label className="form-checkbox-field">
      <input
        type="checkbox"
        checked={props.allSelected}
        disabled={props.disabled}
        onChange={props.onToggle}
        {...agentHandle("trash-select-all", {
          role: "checkbox",
          label: t(props.locale, "Select every item shown"),
        })}
      />
      <span className="visually-hidden">{t(props.locale, "Select every item shown")}</span>
    </label>
  );
}

/** Builds the table's column descriptors. A plain function, not a hook-scoped closure. */
function trashColumns(props: {
  locale: string;
  selected: ReadonlySet<string>;
  allSelected: boolean;
  anyRows: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  handleForRow: (id: string) => string;
  actorUsernames: ReadonlyMap<string, string>;
}): DataTableColumn<AdminTrashItem>[] {
  return [
    {
      key: "select",
      header: (
        <SelectAllHeader
          locale={props.locale}
          allSelected={props.allSelected}
          disabled={!props.anyRows}
          onToggle={props.onToggleAll}
        />
      ),
      headerLabel: t(props.locale, "Select every item shown"),
      cell: (item) => (
        <label className="form-checkbox-field">
          <input
            type="checkbox"
            checked={props.selected.has(item.id)}
            onChange={() => props.onToggle(item.id)}
            {...agentHandle(`${props.handleForRow(item.id)}-select`, {
              role: "checkbox",
              label: interpolate(t(props.locale, 'Select "{title}"'), { title: item.title }),
            })}
          />
          <span className="visually-hidden">{interpolate(t(props.locale, 'Select "{title}"'), { title: item.title })}</span>
        </label>
      ),
    },
    {
      key: "title",
      header: t(props.locale, "Title"),
      cell: (item) => (
        <>
          <div>{item.title}</div>
          {itemSubtitle(props.locale, item) ? <div className="muted-cell">{itemSubtitle(props.locale, item)}</div> : null}
        </>
      ),
    },
    {
      key: "kind",
      header: t(props.locale, "Kind"),
      cell: (item) => entityTypeLabel(props.locale, item.entityType),
    },
    {
      key: "deleted",
      header: t(props.locale, "Deleted"),
      cell: (item) => formatTimestamp(item.trashedAt),
    },
    {
      key: "actor",
      header: t(props.locale, "Deleted by"),
      cell: (item) => {
        const actor = actorLabel(props.locale, item, props.actorUsernames);
        // `title` is the plugin/agent id, as a tooltip — see `rules.ts`'s `actorLabel` doc for why
        // it no longer replaces the human-readable label outright.
        return actor.title ? <span title={actor.title}>{actor.label}</span> : actor.label;
      },
    },
    {
      key: "days",
      header: t(props.locale, "Days left"),
      cell: (item) => item.daysRemaining,
    },
  ];
}

/** The toolbar: what the selection can have done to it. Both actions act on the SAME selection. */
function TrashToolbar(props: { controller: TrashController; selectedCount: number }) {
  const { controller, selectedCount } = props;
  const locale = controller.locale;
  const none = selectedCount === 0 || controller.busy;

  return (
    <div className="toolbar">
      <span className="muted-cell">
        {interpolate(t(locale, "{count} selected"), { count: String(selectedCount) })}
      </span>
      <button
        type="button"
        className="btn-secondary"
        disabled={controller.refreshing || controller.busy}
        onClick={() => controller.refresh()}
        {...agentHandle("trash-refresh", {
          role: "button",
          label: controller.refreshing ? t(locale, "Refreshing…") : t(locale, "Refresh"),
        })}
      >
        {controller.refreshing ? t(locale, "Refreshing…") : t(locale, "Refresh")}
      </button>
      <button
        type="button"
        className="btn-secondary"
        disabled={none}
        onClick={() => void controller.onRestoreSelected()}
        {...agentHandle("trash-restore", { role: "button", label: t(locale, "Restore") })}
      >
        {t(locale, "Restore")}
      </button>
      <button
        type="button"
        className="btn-danger"
        disabled={none}
        onClick={() => controller.setPurgeConfirmOpen(true)}
        {...agentHandle("trash-purge", { role: "button", label: t(locale, "Delete permanently") })}
      >
        {t(locale, "Delete permanently")}
      </button>
    </div>
  );
}

/** Loading / empty / populated, as a flat if-chain rather than nested ternaries. */
function TrashItemsView(props: { controller: TrashController }) {
  const { controller } = props;
  const locale = controller.locale;

  if (!controller.items) return <div className="notice">{t(locale, "Loading the Trash…")}</div>;
  if (controller.items.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <p>{t(locale, "The Trash is empty.")}</p>
        </div>
      </div>
    );
  }

  const rowHandles = buildAgentListHandles(
    "trash-row",
    controller.items.map((item) => item.id),
  );
  const handleById = new Map(controller.items.map((item, index) => [item.id, rowHandles[index]!]));

  return (
    <>
      <DataTable
        rows={controller.items}
        rowKey={(item) => item.id}
        columns={trashColumns({
          locale,
          selected: controller.selected,
          allSelected: controller.allSelected,
          anyRows: controller.items.length > 0,
          onToggle: controller.toggle,
          onToggleAll: controller.toggleAll,
          handleForRow: (id) => handleById.get(id)!,
          actorUsernames: controller.actorUsernames,
        })}
      />
      {controller.nextCursor ? (
        <button
          type="button"
          className="btn-secondary"
          onClick={controller.loadMore}
          disabled={controller.loadingMore}
          {...agentHandle("trash-load-more", { role: "button", label: t(locale, "Load more") })}
        >
          {controller.loadingMore ? t(locale, "Loading…") : t(locale, "Load more")}
        </button>
      ) : null}
    </>
  );
}

/**
 * The permanent-deletion confirm modal. Stays mounted and is driven by `open`, the same shape
 * `Comments.tsx`'s purge dialog uses.
 */
function TrashPurgeDialog(props: { controller: TrashController; selectedCount: number }) {
  const { controller, selectedCount } = props;
  const locale = controller.locale;
  return (
    <ConfirmDialog
      open={controller.purgeConfirmOpen}
      agentHandle="trash-purge-confirm"
      title={t(locale, "Delete permanently?")}
      body={
        <p>
          {interpolate(t(locale, "{count} item(s) will be deleted permanently. This cannot be undone."), {
            count: String(selectedCount),
          })}
        </p>
      }
      confirmLabel={t(locale, "Delete permanently")}
      tone="danger"
      pending={controller.busy}
      onConfirm={() => void controller.onPurgeConfirmed()}
      onCancel={() => controller.setPurgeConfirmOpen(false)}
    />
  );
}

/**
 * The Trash screen.
 *
 * `useTrashHook` is the DI seam every screen in this app carries — a test mounts this component
 * with a controller built over `createFakeTrashPort` instead of stubbing global `fetch`.
 */
export function Trash(props: { useTrashHook?: () => TrashController } = {}) {
  const controller = (props.useTrashHook ?? useWiredTrash)();
  const locale = controller.locale;
  const selectedCount = controller.selected.size;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{translateAdminNavLabel(locale, "Administration")}</p>
          <h1 className="page-title">{translateAdminNavLabel(locale, "Trash")}</h1>
          <p className="page-description">
            {t(locale, "Deleted items stay here for 60 days, then are removed automatically.")}
          </p>
          {/* Not behind a disclosure, on purpose — see this file's header. */}
          <p className="page-description">{coverageLine(locale)}</p>
        </div>
      </div>

      {controller.error ? (
        <div className="notice error" role="alert">
          {controller.error}
        </div>
      ) : null}
      {controller.notice ? <div className="notice">{controller.notice}</div> : null}

      <TrashToolbar controller={controller} selectedCount={selectedCount} />
      <TrashItemsView controller={controller} />
      <TrashPurgeDialog controller={controller} selectedCount={selectedCount} />
    </div>
  );
}
