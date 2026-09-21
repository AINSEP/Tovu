import { useEffect, useState } from "react";
import { type AdminMenu } from "@/lib/api";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as translate } from "../menus-i18n";
import { defaultMenusPort } from "./menus-dependencies.hooks";
import type { MenusPort } from "./menus-port.hooks";
import type { Translate } from "@/lib/dictionary-translator";

/**
 * @file Everything the Menus LIST does, so `Menus.tsx` is only markup.
 *
 * Extracted verbatim — same state, same order, same effect, same error strings. Naming follows
 * `hooks/use-settings-slice.hooks.ts` and `hooks/use-dirty-guard.hooks.ts`: `use-<thing>.hooks.ts`.
 * Feature-local because nothing outside `features/menus` needs it; promote to `src/hooks/` only
 * when a second feature actually does.
 *
 * `deps.port` is injected (see `menus-port.hooks.ts`) rather than reaching for `lib/api`'s `api`
 * directly, sharing the `MenusPort` `use-menu-editor.hooks.ts` also injects.
 *
 * `t` (standing i18n rule, 2026-08-11 — a component with a hook gets a BOUND `t` from that hook,
 * not its own `useAdminLocale()`/dictionary import, same shape `use-pages.hooks.ts` established):
 * injected alongside `port` purely so `Menus.tsx` has somewhere to source the UI copy it renders.
 * This hook's OWN error strings stay hardcoded English (unchanged) — `useAdminLocale()` and
 * `MENUS_DICT` are read only inside {@link useWiredMenus}.
 */

export interface MenusDependencies {
  port: MenusPort;
  t: Translate;
}

export interface MenusController {
  menus: AdminMenu[] | null;
  error: string | null;
  /** The already-trashed menu a force-delete click is asking to confirm — `null` when the dialog
   *  is closed. `ConfirmDialog` stays mounted unconditionally in the view (see its own doc comment
   *  on why); this is what drives its `open` prop. */
  pendingForceDelete: AdminMenu | null;
  setPendingForceDelete: (menu: AdminMenu | null) => void;
  forceDeleting: boolean;
  trashOrPurge: (menu: AdminMenu) => Promise<void>;
  confirmForceDelete: () => Promise<void>;
  /** Bound translator — `Menus.tsx`'s only source of UI copy; see this file's own header. */
  t: Translate;
}

export function useMenus({ port, t }: MenusDependencies): MenusController {
  const [menus, setMenus] = useState<AdminMenu[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingForceDelete, setPendingForceDelete] = useState<AdminMenu | null>(null);
  const [forceDeleting, setForceDeleting] = useState(false);

  function load() {
    port
      .listMenus()
      .then((r) => setMenus(r.menus))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load menus"));
  }

  useEffect(load, [port]);

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
      await port.deleteMenu({ id: menu.id }, { force: false });
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
      await port.deleteMenu({ id: menu.id }, { force: true });
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
    pendingForceDelete,
    setPendingForceDelete,
    forceDeleting,
    trashOrPurge,
    confirmForceDelete,
    t,
  };
}

/**
 * Binds the real `/api/.../menus` client and a `MENUS_DICT`-bound translator — see
 * `menus-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Menus.tsx` composes
 * this and a test composes {@link useMenus} with `createFakeMenusPort`.
 */
export function useWiredMenus(): MenusController {
  const locale = useAdminLocale();
  const t = (key: string): string => translate(locale, key);
  return useMenus({ port: defaultMenusPort, t });
}
