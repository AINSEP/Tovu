import { themeDuplicateRoute } from "@jini-ai/cms/admin-http/routes/themes/duplicate";
import { themesListRoute } from "@jini-ai/cms/admin-http/routes/themes/list";
import { requestThemePreviewRefresh } from "@jini-ai/cms/themes/preview/refresh";
import { DuplicateThemeError, duplicateDiscoveredTheme, findStoredTheme, validThemeIds } from "#src/features/theme/index";
import { isReservedThemePreviewPath } from "#src/features/theme/preview-policy";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { ContentRouteDeps, ContentRouteRegistrar } from "#src/server/inbound/admin-http/routes/content/deps";

/**
 * @file The `themes` list + duplicate admin registrars (RT-K1-adm-themes-2).
 *
 * Both routes are Jini route specs (`@jini-ai/cms/admin-http/routes/themes/{list,duplicate}`) mounted
 * behind the admin ports. `ContentRouteDeps` is read only here: the host's theme discovery, the
 * duplication service (shared with the `theme_duplicate` agent tool) and the preview refresh are
 * bound as functions that read `deps` per request, since a rescan or duplicate refills `deps.themes`
 * in place. `themes/preview.ts` (a 302/image route) and `themes/explore.ts` stay hand-written.
 */

/** The two port fields every themes mount passes; `authorize` is read per request (tests reassign it). */
function themesPortDeps({ deps }: { deps: ContentRouteDeps }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** Both routes used `authorizeDirectOrRespond` (`"direct"`), each with its own `sendAdminFailure` operation. */
function mountOptions(operation: string) {
  return { authorization: "direct" as const, failure: { operation, code: "INTERNAL_ERROR" } };
}

/** GET the discovered themes with source/status/errors/active, gated by `theme.set`. */
export const registerAdminThemesListRoute: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  const listDeps = {
    ...themesPortDeps({ deps }),
    presentationRepo: deps.presentationRepo,
    themes: () => deps.themes,
    findStoredTheme: ({ id }: { id: string }) => findStoredTheme({ themes: deps.themes, id }),
  };
  mountAdminJsonRoute({ app, spec: themesListRoute, deps: listDeps }, mountOptions("routes/themes/list"));
};

/** POST duplicate one discovered theme into a new folder, gated by `theme.edit`. */
export const registerAdminThemeDuplicateRoute: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  const duplicateDeps = {
    ...themesPortDeps({ deps }),
    duplicateTheme: ({ sourceThemeId, newName }: { sourceThemeId: string; newName: string }, { newId }: { newId?: string | undefined }) =>
      duplicateDiscoveredTheme({ themes: deps.themes, themesDir: deps.themesDir, sourceThemeId, newName }, { newId }),
    refreshThemePreviews: () => requestThemePreviewRefresh({ themesDir: deps.themesDir, isReservedPath: isReservedThemePreviewPath }),
    catalogThemeIds: () => validThemeIds({ themes: deps.themes }),
    duplicateThemeErrorCode: ({ err }: { err: unknown }) => (err instanceof DuplicateThemeError ? err.code : undefined),
  };
  mountAdminJsonRoute({ app, spec: themeDuplicateRoute, deps: duplicateDeps }, mountOptions("routes/themes/duplicate"));
};
