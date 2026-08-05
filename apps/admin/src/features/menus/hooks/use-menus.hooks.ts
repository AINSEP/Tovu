import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { api, type AdminMenu } from "../../../lib/api";

/**
 * @file Everything the Menus LIST does, so `Menus.tsx` is only markup.
 *
 * Extracted verbatim — same state, same order, same effect, same error strings. Naming follows
 * `hooks/use-settings-slice.hooks.ts` and `hooks/use-dirty-guard.hooks.ts`: `use-<thing>.hooks.ts`.
 * Feature-local because nothing outside `features/menus` needs it; promote to `src/hooks/` only
 * when a second feature actually does.
 */

export interface MenusController {
  menus: AdminMenu[] | null;
  error: string | null;
  locationDrafts: Record<string, string>;
  setLocationDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  /** The already-trashed menu a force-delete click is asking to confirm — `null` when the dialog
   *  is closed. `ConfirmDialog` stays mounted unconditionally in the view (see its own doc comment
   *  on why); this is what drives its `open` prop. */
  pendingForceDelete: AdminMenu | null;
  setPendingForceDelete: (menu: AdminMenu | null) => void;
  forceDeleting: boolean;
  assign: (menuId: string) => Promise<void>;
  trashOrPurge: (menu: AdminMenu) => Promise<void>;
  confirmForceDelete: () => Promise<void>;
}

export function useMenus(): MenusController {
  const [menus, setMenus] = useState<AdminMenu[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locationDrafts, setLocationDrafts] = useState<Record<string, string>>({});
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

  return {
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
  };
}
