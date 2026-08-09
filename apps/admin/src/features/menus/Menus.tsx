import { ConfirmDialog, DataTable } from "@jini-ai/admin/react";
import { useMenus } from "./hooks/use-menus.hooks";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { MENUS_DICT } from "./menus-i18n";

/**
 * @file Menus admin screens: list view (this file) + tree editor
 * (`MenuEditor.tsx`), wiring the ADR-029 `navigation` backend into the admin
 * UI.
 *
 * Every piece of state and every API call for this list lives in `hooks/use-menus.hooks.ts`; see
 * that file's header for why. What stays here is presentation only: columns, empty state, and the
 * confirm copy.
 */
export function Menus() {
  const {
    menus,
    error,
    locationDrafts,
    setLocationDrafts,
    pendingForceDelete,
    setPendingForceDelete,
    forceDeleting,
    assign,
    trashOrPurge,
    confirmForceDelete,
  } = useMenus();
  const locale = useAdminLocale();
  const t = (key: string): string => MENUS_DICT[locale]?.[key] ?? key;

  if (error && !menus) return <div className="notice error">{error}</div>;
  if (!menus) return <div className="notice">Loading menus…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Content")}</p>
          <h1 className="page-title">{t("Menus")}</h1>
          <p className="page-description">{t("Build navigation menus and assign them to your theme's menu locations.")}</p>
        </div>
        <div className="page-actions">
          <a href="/admin/menus/new">
            <button>{t("Add New")}</button>
          </a>
        </div>
      </div>
      {error ? <div className="notice error">{error}</div> : null}
      <DataTable
        rows={menus}
        rowKey={(menu) => menu.id}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>{t("No menus yet.")}</p>
              <p className="page-description">{t("Create your first menu to get started.")}</p>
            </div>
          </div>
        }
        columns={[
          { key: "title", header: t("Title"), cell: (menu) => <a href={`/admin/menus/${menu.id}`}>{menu.title}</a> },
          { key: "slug", header: "Slug", cell: (menu) => menu.slug },
          {
            key: "status",
            header: t("Status"),
            cell: (menu) => <span className={`status status-${menu.status}`}>{menu.status}</span>,
          },
          {
            key: "locations",
            header: t("Locations"),
            cell: (menu) => (menu.locations.length ? menu.locations.join(", ") : "—"),
          },
          {
            key: "assign-location",
            header: t("Assign location"),
            cell: (menu) => (
              <>
                <input
                  value={locationDrafts[menu.id] ?? ""}
                  onChange={(e) =>
                    setLocationDrafts((prev) => ({ ...prev, [menu.id]: e.target.value }))
                  }
                  placeholder="e.g. primary"
                />
                <button onClick={() => assign(menu.id)}>{t("Assign")}</button>
              </>
            ),
          },
          { key: "version", header: "v", cell: (menu) => menu.version },
          {
            key: "actions",
            headerLabel: t("Actions"),
            cell: (menu) => (
              <button onClick={() => trashOrPurge(menu)}>
                {menu.status === "trash" ? t("Delete permanently") : t("Trash")}
              </button>
            ),
          },
        ]}
      />
      <ConfirmDialog
        open={pendingForceDelete !== null}
        title={t("Permanently delete menu?")}
        body={
          pendingForceDelete ? (
            <p>
              {t('Permanently delete "{title}"? This cannot be undone.').replace("{title}", pendingForceDelete.title)}
            </p>
          ) : null
        }
        confirmLabel={t("Permanently delete")}
        destructive
        pending={forceDeleting}
        onConfirm={confirmForceDelete}
        onCancel={() => setPendingForceDelete(null)}
      />
    </div>
  );
}
