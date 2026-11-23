import { WORKSPACE_ID } from "@/lib/admin-http/config";
import { request } from "@/lib/admin-http/request";
import { createMenusApi } from "@jini-ai/admin/screens/menus/api/menus-api";

/**
 * @file The admin's menus binding: `@jini-ai/admin`'s menus API client, bound once to this host's
 * authenticated `request` and its single local workspace id. Every menus caller reads this singleton.
 */

/** The admin API calls of the menus feature, over this host's `request` and `WORKSPACE_ID`. */
export const menusApi = createMenusApi({ request, workspaceId: WORKSPACE_ID });
