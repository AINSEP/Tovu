import { useDirtyGuard } from "@jini-ai/ui/panel-kit";
import { useCachedLoader, useFetchQuery } from "@jini-ai/ui/fetch-query";
import { WORKSPACE_ID } from "@/lib/admin-http/config";
import { ApiError, request } from "@/lib/admin-http/request";
import type { MenusHostKit } from "@jini-ai/admin/screens/menus/menus-host-kit";
import { createMenusApi } from "@jini-ai/admin/screens/menus/api/menus-api";
import { useMenuEditorState, useMenuFieldActions, useMenuItemActions } from "@jini-ai/admin/screens/menus/hooks/use-menu-editor-state.hooks";
import { useMenuCopyEmbed, useMenuSave } from "@jini-ai/admin/screens/menus/hooks/use-menu-editor-writes.hooks";
import { createMenusPort } from "@jini-ai/admin/screens/menus/hooks/menus-dependencies.hooks";
import { pagesApi } from "@/features/pages/api/pages-api";
import { trashApi } from "@/features/trash/api/trash-api";
import { pagePublicPath } from "../pages/rules";
import { isVersionConflict } from "@/lib/shell-collaborators";
import { VERSION_CONFLICT_MESSAGE } from "@jini-ai/admin/shell/lib/version-conflict";
import { isClipboardRefusal } from "@jini-ai/admin/shell/lib/admin-failure-reporter";
import { adminFailureChannel, publishLocalAdminFailure } from "@/lib/admin-failure-channel";
import { slugRedirectPath } from "@jini-ai/admin/shell/lib/slug-redirect-path";
import { toSlug } from "@jini-ai/cms/html/site/slug";

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

/** The menus hooks' host kit (`@jini-ai/admin/screens/menus/menus-host-kit`): this host's admin
 *  request error class (the trash classifier's predicate), its version-conflict test and copy key,
 *  the website's browser-safe slug rule, the admin shell's slug-redirect rule and the admin failure
 *  channel the menu editor reports a failed embed copy through, and the menu editor's own state/action
 *  and write hooks (`@jini-ai/admin`'s implementations, passed in). */
export const menusHostKit: MenusHostKit = {
  isApiError: (e): e is ApiError => e instanceof ApiError,
  isVersionConflict: ({ error }) => isVersionConflict({ error }),
  versionConflictMessage: VERSION_CONFLICT_MESSAGE,
  toSlug: ({ text }) => toSlug({ text }),
  slugRedirectPath: ({ base, requestedId, item }) => slugRedirectPath({ base, requestedId, item }),
  failures: {
    getGeneration: () => adminFailureChannel.getGeneration(),
    isClipboardRefusal: ({ error }) => isClipboardRefusal({ error }),
    publishLocal: (required, optional) => publishLocalAdminFailure(required, optional),
  },
  useMenuEditorState,
  useMenuFieldActions,
  useMenuItemActions,
  useMenuCopyEmbed,
  useMenuSave,
  useCachedLoader,
  useDirtyGuard,
  useFetchQuery,
};
