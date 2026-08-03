import { useEffect, useState } from "react";
import { api, type AdminMenu } from "../lib/api";
import { ConfirmDialog, DataTable } from "@jini-ai/admin/react";

/**
 * @file Menus admin screens: list view (this file) + tree editor
 * (`MenuEditor.tsx`), wiring the ADR-029 `navigation` backend into the admin
 * UI.
 */

export function Menus() {
  const [menus, setMenus] = useState<AdminMenu[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locationDrafts, setLocationDrafts] = useState<Record<string, string>>({});
  // The already-trashed menu a force-delete click is asking to confirm — `null` when the dialog
  // is closed. `ConfirmDialog` stays mounted unconditionally below (see its own doc comment on
  // why); this is what drives its `open` prop.
  const [pendingForceDelete, setPendingForceDelete] = useState<AdminMenu | null>(null);
  const [forceDeleting, setForceDeleting] = useState(false);

  function load() {
    api
      .listMenus()
      .then((r) => setMenus(r.menus))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load menus"));
  }

  useEffect(load, []);

  async function assign(menuId: string) {
    const locationKey = (locationDrafts[menuId] ?? "").trim();
    if (!locationKey) return;
    setError(null);
    try {
      await api.assignMenuLocation({ id: menuId, locationKey });
      setLocationDrafts((prev) => ({ ...prev, [menuId]: "" }));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "assign failed");
    }
  }

  /** Trashing an active menu still needs no confirmation (unchanged). Permanently deleting an
   *  already-trashed one now gates via a `ConfirmDialog` modal (`setPendingForceDelete` below)
   *  rather than `window.confirm` — same upgrade `Posts.tsx`/`Pages.tsx` already made for their
   *  own Delete. Copy is the exact previous sentence, unchanged. */
  async function trashOrPurge(menu: AdminMenu) {
    setError(null);
    if (menu.status === "trash") {
      setPendingForceDelete(menu);
      return;
    }
    try {
      await api.deleteMenu({ id: menu.id }, { force: false });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete failed");
    }
  }

  async function confirmForceDelete() {
    if (!pendingForceDelete) return;
    const menu = pendingForceDelete;
    setForceDeleting(true);
    setError(null);
    try {
      await api.deleteMenu({ id: menu.id }, { force: true });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete failed");
    } finally {
      setForceDeleting(false);
      setPendingForceDelete(null);
    }
  }

  if (error && !menus) return <div className="notice error">{error}</div>;
  if (!menus) return <div className="notice">Loading menus…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Content</p>
          <h1 className="page-title">Menus</h1>
          <p className="page-description">Build navigation menus and assign them to your theme's menu locations.</p>
        </div>
        <div className="page-actions">
          <a href="/admin/menus/new">
            <button>Add New</button>
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
              <p>No menus yet.</p>
              <p className="page-description">Create your first menu to get started.</p>
            </div>
          </div>
        }
        columns={[
          { key: "title", header: "Title", cell: (menu) => <a href={`/admin/menus/${menu.id}`}>{menu.title}</a> },
          { key: "slug", header: "Slug", cell: (menu) => menu.slug },
          {
            key: "status",
            header: "Status",
            cell: (menu) => <span className={`status status-${menu.status}`}>{menu.status}</span>,
          },
          {
            key: "locations",
            header: "Locations",
            cell: (menu) => (menu.locations.length ? menu.locations.join(", ") : "—"),
          },
          {
            key: "assign-location",
            header: "Assign location",
            cell: (menu) => (
              <>
                <input
                  value={locationDrafts[menu.id] ?? ""}
                  onChange={(e) =>
                    setLocationDrafts((prev) => ({ ...prev, [menu.id]: e.target.value }))
                  }
                  placeholder="e.g. primary"
                />
                <button onClick={() => assign(menu.id)}>Assign</button>
              </>
            ),
          },
          { key: "version", header: "v", cell: (menu) => menu.version },
          {
            key: "actions",
            headerLabel: "Actions",
            cell: (menu) => (
              <button onClick={() => trashOrPurge(menu)}>
                {menu.status === "trash" ? "Delete permanently" : "Trash"}
              </button>
            ),
          },
        ]}
      />
      <ConfirmDialog
        open={pendingForceDelete !== null}
        title="Permanently delete menu?"
        body={
          pendingForceDelete ? (
            <p>
              Permanently delete &quot;{pendingForceDelete.title}&quot;? This cannot be undone.
            </p>
          ) : null
        }
        confirmLabel="Permanently delete"
        destructive
        pending={forceDeleting}
        onConfirm={confirmForceDelete}
        onCancel={() => setPendingForceDelete(null)}
      />
    </div>
  );
}
