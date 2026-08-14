import { ConfirmDialog, DataTable } from "@jini-ai/admin/react";
import { useWiredMenus } from "./hooks/use-menus.hooks";

/**
 * @file Menus admin screens: list view (this file) + tree editor
 * (`MenuEditor.tsx`), wiring the ADR-029 `navigation` backend into the admin
 * UI.
 *
 * Every piece of state and every API call for this list lives in `hooks/use-menus.hooks.ts`; see
 * that file's header for why. What stays here is presentation only: columns, empty state, and the
 * confirm copy.
 */
export interface MenusProps {
  /** Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   *  for `useCustomSelect`. Defaulted to the real hook, so production callers (`panels.tsx`) pass
   *  nothing and behave exactly as before. */
  useMenusHook?: typeof useWiredMenus;
}

export function Menus({ useMenusHook = useWiredMenus }: MenusProps = {}) {
  const {
    menus,
    error,
    pendingForceDelete,
    setPendingForceDelete,
    forceDeleting,
    trashOrPurge,
    confirmForceDelete,
    t,
  } = useMenusHook();

  if (error && !menus) return <div className="notice error">{error}</div>;
  if (!menus) return <div className="notice">Loading menus…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Content")}</p>
          <h1 className="page-title">{t("Menus")}</h1>
          <p className="page-description">{t("Build navigation menus for your theme's header and footer.")}</p>
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
