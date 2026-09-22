import { useEffect, useState } from "react";
import { ApiError, type AdminMenu } from "@/lib/api";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useSettlementGeneration } from "@/hooks/use-settlement-generation.hooks";
import { t as translate } from "../menus-i18n";
import { defaultMenusPort } from "./menus-dependencies.hooks";
import type { MenusPort } from "./menus-port.hooks";
import type { Translate } from "@/lib/dictionary-translator";

/**
 * @file Everything the Menus LIST does, so `Menus.tsx` is only markup.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts` and `hooks/use-dirty-guard.hooks.ts`:
 * `use-<thing>.hooks.ts`. Feature-local because nothing outside `features/menus` needs it; promote
 * to `src/hooks/` only when a second feature actually does.
 *
 * `deps.port` is injected (see `menus-port.hooks.ts`) rather than reaching for `lib/api`'s `api`
 * directly, sharing the `MenusPort` `use-menu-editor.hooks.ts` also injects.
 *
 * `t` (standing i18n rule, 2026-08-11 — a component with a hook gets a BOUND `t` from that hook,
 * not its own `useAdminLocale()`/dictionary import, same shape `use-pages.hooks.ts` established):
 * injected alongside `port` purely so `Menus.tsx` has somewhere to source the UI copy it renders.
 * This hook's OWN load-error string stays hardcoded English (unchanged) — `useAdminLocale()` and
 * `MENUS_DICT` are read only inside {@link useWiredMenus}.
 *
 * Trash rewrite (2026-09-21, `trash-delete-architecture.md`): every admin delete button now goes
 * through the generic `POST .../trash/items`
 * (`port.trash`, which binds to `api.trash({ type: "menu", id })`), and a trashed menu is hidden
 * from `listMenus()` by the server's own default filter. There is no `status === "trash"` row left
 * to force-delete from this list any more — the Trash screen owns restore/purge from here. Mirrors
 * `use-widgets-library.hooks.ts`'s `requestTrash`/`confirmTrash`/`cancelTrash` shape exactly.
 */

export interface MenusDependencies {
  port: MenusPort;
  t: Translate;
}

export interface MenusController {
  menus: AdminMenu[] | null;
  error: string | null;
  /** The menu a "Trash" click is asking to confirm — `null` when the dialog is closed.
   *  `ConfirmDialog` stays mounted unconditionally in the view (see its own doc comment on why);
   *  this is what drives its `open` prop. Set by {@link requestTrash}; no network call happens
   *  until {@link confirmTrash}. */
  pendingTrash: AdminMenu | null;
  /** True only while the CONFIRMED trash for {@link pendingTrash} is in flight — same
   *  `pendingX !== null && xId === pendingX.id` shape `use-widgets-library.hooks.ts` uses. */
  trashing: boolean;
  requestTrash: (menu: AdminMenu) => void;
  confirmTrash: () => Promise<void>;
  cancelTrash: () => void;
  /** Bound translator — `Menus.tsx`'s only source of UI copy; see this file's own header. */
  t: Translate;
}

/**
 * Classifies a failed `port.trash` call the same way `forms/rules.ts`'s `describeTrashError` does
 * for the generic `POST /trash/items` 404/409 contract — kept local rather than imported since
 * this is the only caller in `features/menus` today (see that file's own doc comment for the fuller
 * rationale, shared verbatim here): a 404 means the row is already gone (quiet re-read, no banner);
 * `TRASH_VERSION_CHANGED` means it changed under the operator since this screen last read it
 * (specific reload-and-retry copy); anything else falls through to the generic fallback message.
 *
 * @complexity Time/space: O(1) — one `instanceof` check plus two fixed comparisons.
 */
function describeMenuTrashError(e: unknown, fallback: string): { alreadyGone: boolean; message: string | null } {
  if (e instanceof ApiError) {
    if (e.status === 404) return { alreadyGone: true, message: null };
    if (e.code === "TRASH_VERSION_CHANGED") {
      return { alreadyGone: false, message: "This item changed since you loaded it. Reload and try again." };
    }
  }
  return { alreadyGone: false, message: e instanceof Error ? e.message : fallback };
}

export function useMenus({ port, t }: MenusDependencies): MenusController {
  const [menus, setMenus] = useState<AdminMenu[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingTrash, setPendingTrash] = useState<AdminMenu | null>(null);
  const [trashingId, setTrashingId] = useState<string | null>(null);

  // Latest-wins for `load()`: the mount read and each trash re-read can be in flight together with
  // no ordering guarantee. Without it, trashing A then B lets A's older read settle last and put B
  // back to `active`. Same guard `use-widgets-library.hooks.ts` uses for the same shape.
  const loadSettlement = useSettlementGeneration();

  function load() {
    const generation = loadSettlement.next();
    port
      .listMenus()
      .then((r) => {
        if (!loadSettlement.isCurrent(generation)) return;
        setMenus(r.menus);
      })
      .catch((e) => {
        if (!loadSettlement.isCurrent(generation)) return;
        setError(e instanceof Error ? e.message : "failed to load menus");
      });
  }

  useEffect(load, [port]);

  /** Opens the "Move to trash?" confirm for `menu` — no network call happens until
   *  {@link confirmTrash}. */
  function requestTrash(menu: AdminMenu) {
    setError(null);
    setPendingTrash(menu);
  }

  function cancelTrash() {
    setPendingTrash(null);
  }

  /** The confirmed trash request. See {@link describeMenuTrashError} for the 404/409 mapping. */
  async function confirmTrash() {
    if (!pendingTrash) return;
    const menu = pendingTrash;
    setTrashingId(menu.id);
    setError(null);
    try {
      await port.trash({ id: menu.id });
      load();
    } catch (e) {
      const { alreadyGone, message } = describeMenuTrashError(e, "delete failed");
      if (alreadyGone) {
        load();
      } else {
        setError(message);
      }
    } finally {
      setTrashingId((current) => (current === menu.id ? null : current));
      setPendingTrash((current) => (current?.id === menu.id ? null : current));
    }
  }

  return {
    menus,
    error,
    pendingTrash,
    trashing: pendingTrash !== null && trashingId === pendingTrash.id,
    requestTrash,
    confirmTrash,
    cancelTrash,
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
