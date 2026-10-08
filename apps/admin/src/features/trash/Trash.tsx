import { DataTable, ConfirmDialog, type DataTableColumn } from "@jini-ai/admin/react";
import { agentHandle } from "@jini-ai/agentic";
import { InfoTip } from "@jini-ai/ui/admin-widgets";

import type { AdminTrashItem } from "../../lib/api";
import { buildAgentListHandles } from "@jini-ai/agentic";
import { formatTimestamp } from "@jini-ai/ui/panel-kit";
import { interpolate } from "@jini-ai/ui/panel-kit";
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
 * Owner update (2026-10-07): the original always-visible coverage requirement above is superseded
 * by the Users title's shared InfoTip pattern, keeping exceptions discoverable with less intro copy.
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
        {...agentHandle({ handle: "trash-select-all" }, {
          role: "checkbox",
          label: t({ locale: props.locale, key: "Select every item shown" }),
        })}
      />
      <span className="visually-hidden">{t({ locale: props.locale, key: "Select every item shown" })}</span>
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
      headerLabel: t({ locale: props.locale, key: "Select every item shown" }),
      cell: (item) => (
        <label className="form-checkbox-field">
          <input
            type="checkbox"
            checked={props.selected.has(item.id)}
            onChange={() => props.onToggle(item.id)}
            {...agentHandle({ handle: `${props.handleForRow(item.id)}-select` }, {
              role: "checkbox",
              label: interpolate({ template: t({ locale: props.locale, key: 'Select "{title}"' }), vars: { title: item.title } }),
            })}
          />
          <span className="visually-hidden">{interpolate({ template: t({ locale: props.locale, key: 'Select "{title}"' }), vars: { title: item.title } })}</span>
        </label>
      ),
    },
    {
      key: "title",
      header: t({ locale: props.locale, key: "Title" }),
      cell: (item) => (
        <>
          <div>{item.title}</div>
          {itemSubtitle(props.locale, item) ? <div className="muted-cell">{itemSubtitle(props.locale, item)}</div> : null}
        </>
      ),
    },
    {
      key: "kind",
      header: t({ locale: props.locale, key: "Kind" }),
      cell: (item) => entityTypeLabel(props.locale, item.entityType),
    },
    {
      key: "deleted",
      header: t({ locale: props.locale, key: "Deleted" }),
      cell: (item) => formatTimestamp({ iso: item.trashedAt }, { timeZone: "local" }),
    },
    {
      key: "actor",
      header: t({ locale: props.locale, key: "Deleted by" }),
      cell: (item) => {
        const actor = actorLabel(props.locale, item, props.actorUsernames);
        // `title` is the plugin/agent id, as a tooltip — see `rules.ts`'s `actorLabel` doc for why
        // it no longer replaces the human-readable label outright.
        return actor.title ? <span title={actor.title}>{actor.label}</span> : actor.label;
      },
    },
    {
      key: "days",
      header: t({ locale: props.locale, key: "Days left" }),
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
    <div className="toolbar trash-toolbar" data-selection-empty={selectedCount === 0}>
      <span className="muted-cell">
        {interpolate({ template: t({ locale: locale, key: "{count} selected" }), vars: { count: String(selectedCount) } })}
      </span>
      <button
        type="button"
        className="btn-secondary"
        disabled={controller.refreshing || controller.busy}
        onClick={() => controller.refresh()}
        {...agentHandle({ handle: "trash-refresh" }, {
          role: "button",
          label: controller.refreshing ? t({ locale: locale, key: "Refreshing…" }) : t({ locale: locale, key: "Refresh" }),
        })}
      >
        {controller.refreshing ? t({ locale: locale, key: "Refreshing…" }) : t({ locale: locale, key: "Refresh" })}
      </button>
      <button
        type="button"
        className="btn-secondary trash-bulk-action"
        disabled={none}
        onClick={() => void controller.onRestoreSelected()}
        {...agentHandle({ handle: "trash-restore" }, { role: "button", label: t({ locale: locale, key: "Restore" }) })}
      >
        {t({ locale: locale, key: "Restore" })}
      </button>
      <button
        type="button"
        className="btn-danger trash-bulk-action"
        disabled={none}
        onClick={() => controller.setPurgeConfirmOpen(true)}
        {...agentHandle({ handle: "trash-purge" }, { role: "button", label: t({ locale: locale, key: "Delete permanently" }) })}
      >
        {t({ locale: locale, key: "Delete permanently" })}
      </button>
    </div>
  );
}

/** Loading / empty / populated, as a flat if-chain rather than nested ternaries. */
function TrashItemsView(props: { controller: TrashController }) {
  const { controller } = props;
  const locale = controller.locale;

  if (!controller.items) return controller.error ? null : <div className="notice">{t({ locale: locale, key: "Loading the Trash…" })}</div>;
  if (controller.items.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <p>{t({ locale: locale, key: "The Trash is empty." })}</p>
        </div>
      </div>
    );
  }

  const rowHandles = buildAgentListHandles({ prefix: "trash-row", ids: controller.items.map((item) => item.id) }
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
          {...agentHandle({ handle: "trash-load-more" }, { role: "button", label: t({ locale: locale, key: "Load more" }) })}
        >
          {controller.loadingMore ? t({ locale: locale, key: "Loading…" }) : t({ locale: locale, key: "Load more" })}
        </button>
      ) : null}
    </>
  );
}

/**
 * The permanent-deletion confirm modal. Stays mounted and is driven by `open`, the same shape
 * `@jini-ai/admin/comments/react`'s purge dialog uses.
 */
function TrashPurgeDialog(props: { controller: TrashController; selectedCount: number }) {
  const { controller, selectedCount } = props;
  const locale = controller.locale;
  return (
    <ConfirmDialog
      open={controller.purgeConfirmOpen}
      agentHandle="trash-purge-confirm"
      title={t({ locale: locale, key: "Delete permanently?" })}
      body={
        <p>
          {interpolate({ template: t({ locale: locale, key: "{count} item(s) will be deleted permanently. This cannot be undone." }), vars: {
            count: String(selectedCount),
          } })}
        </p>
      }
      confirmLabel={t({ locale: locale, key: "Delete permanently" })}
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
          <p className="page-kicker">{translateAdminNavLabel({ locale: locale, key: "Administration" })}</p>
          <h1 className="page-title">
            {translateAdminNavLabel({ locale: locale, key: "Trash" })}
            {/* Originally not behind a disclosure, on purpose — see this file's header.
                Owner update (2026-10-07): use the Users title's InfoTip to shorten the intro. */}
            <InfoTip label={coverageLine(locale)} agentHandle="trash-coverage-info" />
          </h1>
          <p className="page-description">
            {t({ locale: locale, key: "Deleted items are kept for 60 days." })}
          </p>
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
