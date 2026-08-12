import { api, type AdminMenu } from "../../../lib/api";
import type { MenusPort } from "./menus-port.hooks";

/**
 * @file The only place under `features/menus` that reaches `lib/api` for the five `MenusPort`
 * routes — see `menus-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies
 *  .hooks.ts`'s `defaultRedirectsPort`. */
export const defaultMenusPort: MenusPort = {
  listMenus: () => api.listMenus(),
  getMenu: (id) => api.getMenu(id),
  createMenu: (input, options) => api.createMenu(input, options),
  updateMenuTree: (target, options) => api.updateMenuTree(target, options),
  deleteMenu: (target, options) => api.deleteMenu(target, options),
};

/** Seed state for {@link createFakeMenusPort}. */
export interface FakeMenusPortOptions {
  menus?: AdminMenu[];
}

/**
 * An in-memory {@link MenusPort} for tests — lets a test describe "there are these two menus"
 * directly, instead of hand-building `Response` objects and stubbing global `fetch`. Shipped
 * alongside the real binding per the pattern's "every port gets a fake" rule.
 */
export function createFakeMenusPort(options: FakeMenusPortOptions = {}): MenusPort & {
  /** Every menu currently in the fake's store, in list order. */
  readonly menus: AdminMenu[];
} {
  const menus = [...(options.menus ?? [])];

  return {
    menus,

    async listMenus() {
      return { menus: [...menus] };
    },

    async getMenu(id) {
      const menu = menus.find((m) => m.id === id);
      if (!menu) throw new Error(`fake menu not found: ${id}`);
      return { menu };
    },

    async createMenu(input, createOptions) {
      const created: AdminMenu = {
        id: `fake-${menus.length + 1}`,
        workspaceId: "fake-ws",
        slug: input.slug,
        title: input.title,
        status: "draft",
        items: createOptions.items ?? [],
        locations: [],
        updatedAt: new Date(0).toISOString(),
        version: 1,
      };
      menus.push(created);
      return { menu: created };
    },

    async updateMenuTree({ id, items }, updateOptions) {
      const index = menus.findIndex((m) => m.id === id);
      if (index < 0) throw new Error(`fake menu not found: ${id}`);
      const updated: AdminMenu = {
        ...menus[index]!,
        items,
        title: updateOptions.title ?? menus[index]!.title,
        slug: updateOptions.slug ?? menus[index]!.slug,
        version: menus[index]!.version + 1,
      };
      menus[index] = updated;
      return { menu: updated };
    },

    async deleteMenu({ id }, deleteOptions) {
      const index = menus.findIndex((m) => m.id === id);
      if (index < 0) throw new Error(`fake menu not found: ${id}`);
      if (!deleteOptions.force) {
        const trashed: AdminMenu = { ...menus[index]!, status: "trash" };
        menus[index] = trashed;
        return { menu: trashed, purged: false };
      }
      menus.splice(index, 1);
      return { menu: null, purged: true };
    },
  };
}
