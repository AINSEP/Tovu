import type { AdminMenu, AdminMenuItem } from "../../../lib/api";

/**
 * @file What `use-menu-editor.hooks.ts` and `use-menus.hooks.ts` need from the outside world, as
 * an interface rather than a direct `lib/api` import.
 *
 * Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `development/docs/architecture/wired-hooks-convention.md` and `redirects-port.hooks.ts` (the
 * canonical reference): this file declares, `menus-dependencies.hooks.ts` binds the real `api`
 * client, and nothing else under `features/menus` imports `lib/api` for these five routes. One
 * shared port rather than one per hook — both hooks read/write the same `/menus` resource.
 *
 * Neither hook calls `useAdminLocale()` or `t()` — every message in this feature is hardcoded
 * English (see `use-menu-editor.hooks.ts`/`use-menus.hooks.ts`'s own `e instanceof Error ?
 * e.message : "failed to ..."` fallbacks) — so unlike `media-port.hooks.ts`/`widgets-port
 * .hooks.ts`, this port has no accompanying `locale` dependency to inject alongside it.
 */
export interface MenusPort {
  listMenus(): Promise<{ menus: AdminMenu[] }>;
  getMenu(id: string): Promise<{ menu: AdminMenu }>;
  createMenu(input: { title: string; slug: string }, options: { items?: AdminMenuItem[] }): Promise<{ menu: AdminMenu }>;
  updateMenuTree(
    target: { id: string; expectedVersion: number; items: AdminMenuItem[] },
    options: { title?: string; slug?: string }
  ): Promise<{ menu: AdminMenu }>;
  deleteMenu(target: { id: string }, options: { force?: boolean }): Promise<{ menu: AdminMenu | null; purged: boolean }>;
}
