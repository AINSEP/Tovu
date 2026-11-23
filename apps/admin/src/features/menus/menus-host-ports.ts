import { WORKSPACE_ID } from "@/lib/admin-http/config";
import { ApiError, request } from "@/lib/admin-http/request";
import type { MenusHostKit } from "@jini-ai/admin/screens/menus/menus-host-kit";
import { createMenusApi } from "@jini-ai/admin/screens/menus/api/menus-api";
import { createMenusPort } from "@jini-ai/admin/screens/menus/hooks/menus-dependencies.hooks";
import { pagesApi } from "@/features/pages/api/pages-api";
import { trashApi } from "@/features/trash/api/trash-api";
import { pagePublicPath } from "../pages/rules";

/**
 * @file The admin's menus binding: `@jini-ai/admin`'s menus API client, bound once to this host's
 * authenticated `request` and its single local workspace id. Every menus caller reads this singleton.
 */

/** The admin API calls of the menus feature, over this host's `request` and `WORKSPACE_ID`. */
export const menusApi = createMenusApi({ request, workspaceId: WORKSPACE_ID });

/** The live `MenusPort` over {@link menusApi}, this host's Trash client and its page catalogue
 *  (pages client + `pagePublicPath`). */
export const defaultMenusPort = createMenusPort({
  api: menusApi,
  trash: trashApi,
  listPages: async (_required, _optional = {}) => ({ pages: (await pagesApi.listPages()).posts.map(({ post }) => ({ id: post.id, title: post.title, status: post.status, publicPath: pagePublicPath({ slug: post.slug }) })) }),
});

/** The menus hooks' host kit: this host's admin request error class, as the trash classifier's
 *  predicate (`@jini-ai/admin/screens/menus/menus-host-kit`). */
export const menusHostKit: MenusHostKit = {
  isApiError: (e): e is ApiError => e instanceof ApiError,
};
