import { useEffect, useState } from "react";
import { api, type AdminMenu } from "../lib/api";

/**
 * @file Menus admin screens: list view (this file) + tree editor
 * (`MenuEditor.tsx`), wiring the ADR-029 `navigation` backend into the admin
 * UI.
 */

export function Menus() {
  const [menus, setMenus] = useState<AdminMenu[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locationDrafts, setLocationDrafts] = useState<Record<string, string>>({});

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

  async function trashOrPurge(menu: AdminMenu) {
    setError(null);
    const force = menu.status === "trash";
    if (force && !window.confirm(`Permanently delete "${menu.title}"? This cannot be undone.`)) {
      return;
    }
    try {
      await api.deleteMenu({ id: menu.id }, { force });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete failed");
    }
  }

  if (error && !menus) return <div className="notice error">{error}</div>;
  if (!menus) return <div className="notice">Loading menus…</div>;

  return (
    <div>
      <div className="editor-header">
        <h1>Menus</h1>
        <a href="#/menus/new">
          <button>Add New</button>
        </a>
      </div>
      {error ? <div className="notice error">{error}</div> : null}
      <table className="list-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Slug</th>
            <th>Status</th>
            <th>Locations</th>
            <th>Assign location</th>
            <th>v</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {menus.map((menu) => (
            <tr key={menu.id}>
              <td>
                <a href={`#/menus/${menu.id}`}>{menu.title}</a>
              </td>
              <td>{menu.slug}</td>
              <td>
                <span className={`status status-${menu.status}`}>{menu.status}</span>
              </td>
              <td>{menu.locations.length ? menu.locations.join(", ") : "—"}</td>
              <td>
                <input
                  value={locationDrafts[menu.id] ?? ""}
                  onChange={(e) =>
                    setLocationDrafts((prev) => ({ ...prev, [menu.id]: e.target.value }))
                  }
                  placeholder="e.g. primary"
                />
                <button onClick={() => assign(menu.id)}>Assign</button>
              </td>
              <td>{menu.version}</td>
              <td>
                <button onClick={() => trashOrPurge(menu)}>
                  {menu.status === "trash" ? "Delete permanently" : "Trash"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
