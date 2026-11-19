import { findThemeOrThrow, isShapeRejection, type ThemeToolDeps } from "./asset-operations.js";
import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
import { requestThemePreviewRefresh, validatePreviewPath } from "./preview-refresh.js";
import { NO_THEME_ID } from "./active-theme.js";
import { statSync } from "node:fs";
import { ToolInputError } from "@jini-ai/core";
import { optionalThemeReadInteger, pageThemeReadContent, selectThemeReadContent, themeReadSelection } from "./theme-read-content.js";
import { optionalString, requireInputRecord, requireString, withSchemaOnRejection, type ToolHandler } from "@jini-ai/core";
import { requireToolPermission } from "@jini-ai/cms/core";
import { THEME_READ_PERMISSION } from "./agent-tools.js";
import { listThemeFiles } from "./theme-file-listing.js";
import { readThemeFile, resolveThemeFilePath } from "./theme-files.js";
import { findStoredTheme, rescanThemes } from "./theme-discovery.js";
import { isPublishableThemePageCandidate, isStandaloneThemePage } from "./theme-page-eligibility.js";
import { loadTheme } from "./theme.js";
// The shared "can this file's identity (name/existence) change" gate — same-module sibling import
// (this file lives inside `features/theme`, so a direct import is the module's own internal wiring,
// not a deep-import-from-outside the `no-deep-imports:features/theme` rule polices). `explore.ts`'s
// HTTP rename/delete routes call the exact same function — see `file-identity-lock.ts`'s own header
// for why the decision had to live here rather than in `explore.ts` alongside its original home.
import { isTrashedThemePath } from "./file-identity-lock.js";
import { toThemeToolView } from "./theme-tool-view.js";
import { CATALOG_BY_ID } from "./theme-tool-catalog.js";

    export async function preview_reload(routeDeps: ThemeToolDeps, ctx: Parameters<ToolHandler>[0]) {
      const input = requireInputRecord({ input: ctx.input ?? {} });
      const path = optionalString({ input, key: "path" });
      if (path !== undefined) validatePreviewPath({ path });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: THEME_READ_PERMISSION }, { entityType: "theme" });
      return { reloaded: true, ...requestThemePreviewRefresh({ themesDir: routeDeps.themesDir }, { path }) };
    }
    /**
     * Refreshes the rendering registry in place after folders arrive or disappear.
     * @param ctx - Principal and empty input; dependencies supply the local theme root/registry.
     * @returns Added/removed ids and all invalid themes with their validation errors.
     * @throws ToolInputError for malformed input; permission and discovery failures propagate.
     * @complexity O(t log t + b) time/space in theme count and theme bytes read during discovery.
     */
    export async function theme_rescan(routeDeps: ThemeToolDeps, ctx: Parameters<ToolHandler>[0]) {
      requireInputRecord({ input: ctx.input ?? {} });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: THEME_READ_PERMISSION }, { entityType: "presentation" });
      const changed = rescanThemes({ themes: routeDeps.themes, dir: routeDeps.themesDir });
      return {
        added: changed.added, removed: changed.removed,
        invalid: routeDeps.themes.filter((theme) => theme.status === "invalid")
          .map((theme) => ({ themeId: theme.manifest.id, errors: theme.errors })),
      };
    }

    export async function theme_list(routeDeps: ThemeToolDeps, ctx: Parameters<ToolHandler>[0]) {
      const input = requireInputRecord({ input: ctx.input ?? {} });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: THEME_READ_PERMISSION }, { entityType: "theme" });

      const tier = optionalString({ input: input, key: "tier" });
      const status = optionalString({ input: input, key: "status" });
      // Resolve before filtering: a hidden, invalid or renamed selection is still configured.
      // Read failures propagate rather than falsely reporting every theme as inactive.
      const activeThemeId = await routeDeps.resolveActiveThemeId();
      const activeTheme = activeThemeId === NO_THEME_ID ? undefined : findStoredTheme({ themes: routeDeps.themes, id: activeThemeId });
      const themes = routeDeps.themes
        .filter((t) => (tier ? t.manifest.tier === tier : true))
        .filter((t) => (status ? t.status === status : true))
        .map(theme => ({ ...toThemeToolView(theme), active: theme === activeTheme }));
      return { themes, activeThemeId };
    }

    /** Reloads disk state and delegates eligibility/visibility to the public renderer's predicates. */
    export async function theme_list_page_publications(routeDeps: ThemeToolDeps, ctx: Parameters<ToolHandler>[0]) {
      const themeId = requireString({ input: requireInputRecord({ input: ctx.input }), key: "themeId" });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: THEME_READ_PERMISSION }, { entityType: "theme", entityId: themeId });
      const known = routeDeps.themes.find(theme => theme.manifest.id === themeId);
      if (!known) throw new ToolInputError({ message: `theme '${themeId}' was not found. Use content_read.theme to find a theme id.` });
      // The same containment owner as theme_read_file checks the directory before loadTheme reads it.
      readThemeFile({ themeDir: known.dir, themesRoot: routeDeps.themesDir, relativePath: "theme.json" });
      const theme = loadTheme({ themeDir: known.dir, id: themeId, source: known.source });
      if (theme.manifest.tier !== "static") throw new ToolInputError({ message: `theme '${themeId}' is tier '${theme.manifest.tier}' — publish state only applies to static-tier themes` });
      return { pages: Object.keys(theme.pages).sort().filter(page => isPublishableThemePageCandidate({ theme, pageId: page }))
        .map(page => ({ themeId, page, published: isStandaloneThemePage({ theme, pageId: page }) })) };
    }
    export async function theme_list_files(routeDeps: ThemeToolDeps, ctx: Parameters<ToolHandler>[0]) {
      const input = requireInputRecord({ input: ctx.input });
      const themeId = requireString({ input: input, key: "themeId" });
      const includeTrash = input.includeTrash === true;
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: THEME_READ_PERMISSION }, { entityType: "theme", entityId: themeId });

      return withSchemaOnRejection({ toolId: "theme_list_files", catalog: CATALOG_BY_ID, isShapeRejection: ({ error }) => isShapeRejection({ error }), fn: async () => {
        const theme = findThemeOrThrow({ routeDeps, themeId });
        const files = listThemeFiles({ themeDir: theme.dir, themesRoot: routeDeps.themesDir });
        // Trashed files are hidden by default (2026-08-30 soft-delete requirement: a trashed file
        // must not surface as a file-list entry) — `includeTrash: true` is the deliberate escape
        // hatch an agent needs to discover what it can restore.
        return { themeId, files: includeTrash ? files : files.filter((path) => !isTrashedThemePath({ relativePath: path })) };
      } });
    }

    /**
     * Reads one contained file, retaining small full responses and paging larger full/line reads.
     * Requires theme read permission, validates selectors, and retains the full-file 1 MB limit.
     * Selected reads add full-file totals and range/match metadata. No writes.
     * @complexity O(b) time and space in file size (bounded at MAX_THEME_FILE_BYTES).
     */
    export async function theme_read_file(routeDeps: ThemeToolDeps, ctx: Parameters<ToolHandler>[0]) {
      const input = requireInputRecord({ input: ctx.input });
      const themeId = requireString({ input: input, key: "themeId" });
      const relativePath = requireString({ input: input, key: "path" });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: THEME_READ_PERMISSION }, { entityType: "theme", entityId: themeId });

      return withSchemaOnRejection({ toolId: "theme_read_file", catalog: CATALOG_BY_ID, isShapeRejection: ({ error }) => isShapeRejection({ error }), fn: async () => {
        const selection = themeReadSelection(input);
        const offset = optionalThemeReadInteger({ input, key: "offset", minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
        if (selection.mode === "find" && offset !== undefined) throw new ToolInputError({ message: "theme_read_file: offset cannot be combined with find. Use a narrower find or a paged file read." });
        const theme = findThemeOrThrow({ routeDeps, themeId });
        const file = { themeDir: theme.dir, themesRoot: routeDeps.themesDir, relativePath };
        const content = readThemeFile(file);
        if (selection.mode === "full") return { themeId, path: relativePath, ...pageThemeReadContent({ content, offset }) };
        // Use the file's byte size, rather than decoded UTF-8 length (which differs for binary text).
        const totalBytes = statSync(resolveThemeFilePath(file)).size;
        const selected = selectThemeReadContent({ content, selection });
        const page = selection.mode === "window" ? pageThemeReadContent({ content: selected.content, offset }) : {};
        return { themeId, path: relativePath, ...selected, ...page, totalBytes };
      } });
    }
