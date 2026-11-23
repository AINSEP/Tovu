import { themeDetailRoute } from "@jini-ai/cms/admin-http/routes/themes/explore-detail";
import { themeFileDeleteRoute } from "@jini-ai/cms/admin-http/routes/themes/explore-file-delete";
import { themeFileGetRoute } from "@jini-ai/cms/admin-http/routes/themes/explore-file-get";
import { themeFilePutRoute } from "@jini-ai/cms/admin-http/routes/themes/explore-file-put";
import { themePagePublishRoute } from "@jini-ai/cms/admin-http/routes/themes/explore-page-publish";
import { themeSaveOriginalRoute } from "@jini-ai/cms/admin-http/routes/themes/explore-save-original";
import {
  findTheme,
  listThemeFiles,
  readThemeFile,
  resolveThemeFileWriteScope,
  saveThemeAsOriginal,
  setThemePagePublished,
  ThemeFileReadOnlyError,
  ThemePagePublicationError,
  ThemePathError,
  trashThemeFile,
  validateFileIdentityChange,
  writeThemeFile,
  type DiscoveredTheme,
  type ThemeFileWriteScope,
} from "#src/features/theme/index";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { describeThemeDetailFiles, isPutWritable, reloadTheme } from "#src/server/inbound/admin-http/routes/themes/explore";
import type { ContentRouteDeps, ContentRouteRegistrar } from "#src/server/inbound/admin-http/routes/content/deps";

/**
 * @file The theme Explore screen's backend registrars (K1, RT-K1-adm-themes-1): one theme's editable
 * surface plus read/write of its files, as Jini route specs (`@jini-ai/cms/admin-http/routes/themes/
 * explore-*`) mounted behind the admin ports. `ContentRouteDeps` is read only here: each mount builds
 * that route's own small deps object, binding the host's theme feature (discovery, file I/O, trash,
 * originals, page publication and its error classes) as functions.
 *
 * Every route answers `theme.set` through the direct authorizer (`authorizeThemeSetPermission` used
 * `authorizeDirectOrRespond`), and every unexpected failure keeps the one `sendAdminFailure`
 * operation the hand-written file used, `routes/themes/explore`. Export names and registration order
 * (owned by `content.ts`) are unchanged.
 */

/** The unexpected-failure copy key and the authorization mode every Explore route had. */
const EXPLORE_MOUNT = { authorization: "direct" as const, failure: { operation: "routes/themes/explore", code: "INTERNAL_ERROR" } };

/** The port fields plus the `:themeId` lookup and file-error predicates every Explore mount passes.
 *  `authorize` and `themes` are read per request, as the hand-written routes read `deps.*`, so a later
 *  reassignment (tests, a theme rescan) is still honoured. */
function explorePortDeps({ deps }: { deps: ContentRouteDeps }, _optional: Record<string, never> = {}) {
  const ports: AdminJsonRoutePortDeps = { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
  return {
    ...ports,
    findTheme: ({ themeId }: { themeId: string }) => findTheme({ themes: deps.themes, id: themeId }),
    isThemeFileReadOnlyError: ({ err }: { err: unknown }) => err instanceof ThemeFileReadOnlyError,
    isThemePathError: ({ err }: { err: unknown }) => err instanceof ThemePathError,
  };
}

/** Every file path in the theme folder, relative to it, through the host's containment helper. */
function themeFilePaths({ deps, theme }: { deps: ContentRouteDeps; theme: DiscoveredTheme }, _optional: Record<string, never> = {}): string[] {
  return listThemeFiles({ themeDir: theme.dir, themesRoot: deps.themesDir });
}

/** The rename/delete identity lock, given the path's ADR-020 write scope — the same gate the assistant's
 *  `theme_rename_file`/`theme_delete_file` tools call. */
function fileIdentityLock({ theme, path, action }: { theme: DiscoveredTheme; path: string; action: "renamed" | "deleted" }, _optional: Record<string, never> = {}) {
  const writeScope = resolveThemeFileWriteScope({ manifest: theme.manifest, relativePath: path });
  return validateFileIdentityChange({ theme, path, writeScope, action });
}

/** The ADR-020 write scope and the post-write reload every writing Explore route binds. */
function exploreWriteDeps({ deps }: { deps: ContentRouteDeps }, _optional: Record<string, never> = {}) {
  return {
    resolveWriteScope: ({ theme, path }: { theme: DiscoveredTheme; path: string }) => resolveThemeFileWriteScope({ manifest: theme.manifest, relativePath: path }),
    reloadTheme: ({ themeId }: { themeId: string }) => reloadTheme({ deps, themeId }),
  };
}

/** GET one theme's detail — what the Explore screen lists and what its banner says. */
export const registerAdminThemeDetailRoute: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: themeDetailRoute, deps: {
    ...explorePortDeps({ deps }),
    describeThemeFiles: ({ theme }: { theme: DiscoveredTheme }) => describeThemeDetailFiles({ deps, theme }),
  } }, EXPLORE_MOUNT);
};

/** GET the raw source of one file inside a theme. */
export const registerAdminThemeFileGetRoute: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: themeFileGetRoute, deps: {
    ...explorePortDeps({ deps }),
    readThemeFile: ({ theme, path }: { theme: DiscoveredTheme; path: string }) => readThemeFile({ themeDir: theme.dir, themesRoot: deps.themesDir, relativePath: path }),
  } }, EXPLORE_MOUNT);
};

/** PUT one file inside a theme (the host's save gate decides what Explore may write). */
export const registerAdminThemeFilePutRoute: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: themeFilePutRoute, deps: {
    ...explorePortDeps({ deps }),
    ...exploreWriteDeps({ deps }),
    isPutWritable: ({ theme, path, writeScope }: { theme: DiscoveredTheme; path: string; writeScope: ThemeFileWriteScope }) => isPutWritable({ theme, path, writeScope }),
    writeThemeFile: ({ theme, path, content, overwriteOversized }: { theme: DiscoveredTheme; path: string; content: string; overwriteOversized: boolean }) =>
      writeThemeFile({ themeDir: theme.dir, themesRoot: deps.themesDir, relativePath: path, content }, { overwriteOversized }),
  } }, EXPLORE_MOUNT);
};

export {
  registerAdminThemeFileCopyRoute,
  registerAdminThemeFileRenameRoute,
  registerAdminThemeFileResetRoute,
} from "#src/server/inbound/admin-http/routes/themes/explore";

/** POST — save the theme's current files as its stored original (refused when one exists). */
export const registerAdminThemeSaveOriginalRoute: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: themeSaveOriginalRoute, deps: {
    ...explorePortDeps({ deps }),
    saveThemeAsOriginal: ({ theme }: { theme: DiscoveredTheme }) => saveThemeAsOriginal({ theme, themesRoot: deps.themesDir, packageThemesRoot: deps.packageThemesDir }),
  } }, EXPLORE_MOUNT);
};

/** POST — move one file into the theme's restorable trash (the assistant's trash lifecycle). */
export const registerAdminThemeFileDeleteRoute: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: themeFileDeleteRoute, deps: {
    ...explorePortDeps({ deps }),
    checkFileIdentityChange: fileIdentityLock,
    listThemeFiles: ({ theme }: { theme: DiscoveredTheme }) => themeFilePaths({ deps, theme }),
    trashThemeFile: ({ theme, path }: { theme: DiscoveredTheme; path: string }) => trashThemeFile({ deps, theme, relativePath: path }),
  } }, EXPLORE_MOUNT);
};

/** POST — publish or unpublish one of a static theme's own pages through the shared publication service. */
export const registerAdminThemePagePublishRoute: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: themePagePublishRoute, deps: {
    ...explorePortDeps({ deps }),
    setThemePagePublished: (input: { themeId: string; page: string; published: boolean }) => setThemePagePublished(deps, input),
    isThemePagePublicationError: ({ err }: { err: unknown }) => err instanceof ThemePagePublicationError,
  } }, EXPLORE_MOUNT);
};
