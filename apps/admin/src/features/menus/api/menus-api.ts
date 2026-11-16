import { WORKSPACE_ID } from "../../../lib/admin-http/config";
import { request } from "../../../lib/admin-http/request";
import type { AdminMenu, AdminMenuAuthoring, AdminMenuItem } from "./menus-api.types";

/** The admin API calls of the menus feature. */
export const menusApi = {
  listMenus: () =>
    request<{ menus: AdminMenu[] }>({ path: `/workspaces/${WORKSPACE_ID}/menus` }),
  getMenu: ({ id }: { id: string }, _optional: Record<string, never> = {}) =>
    request<{ menu: AdminMenu }>({ path: `/workspaces/${WORKSPACE_ID}/menus/${encodeURIComponent(id)}` }),
  createMenu: (
    { title, slug }: { title: string; slug: string },
    options: { items?: AdminMenuItem[] } & AdminMenuAuthoring = {}
  ) =>
    request<{ menu: AdminMenu }>({ path: `/workspaces/${WORKSPACE_ID}/menus` }, { init: {
      method: "POST",
      body: JSON.stringify({ title, slug, items: options.items, mode: options.mode, html: options.html }),
    } }),
  updateMenuTree: (
    { id, expectedVersion, items }: { id: string; expectedVersion: number; items: AdminMenuItem[] },
    options: { title?: string; slug?: string } & AdminMenuAuthoring = {}
  ) =>
    request<{ menu: AdminMenu }>({ path: `/workspaces/${WORKSPACE_ID}/menus/${encodeURIComponent(id)}` }, { init: {
      method: "PUT",
      body: JSON.stringify({ expectedVersion, items, title: options.title, slug: options.slug, mode: options.mode, html: options.html }),
    } }),
};
