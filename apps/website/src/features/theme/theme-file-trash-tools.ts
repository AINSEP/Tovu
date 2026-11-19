import { trashThemeFile, assertThemeFileWritable, findThemeOrThrow, reloadThemeInPlace, isShapeRejection, ThemeFileIdentityLockedError, type ThemeToolDeps } from "./asset-operations.js";
import { adaptLegacyAuthorize } from "@jini-ai/cms/core";

import { dirname, resolve } from "node:path";
import { rmdirSync } from "node:fs";
import { optionalString, requireInputRecord, requireString, withSchemaOnRejection, type ToolHandler } from "@jini-ai/core";
import { requireToolPermission } from "@jini-ai/cms/core";
import { THEME_WRITE_PERMISSION } from "./agent-tools.js";
import { listThemeFiles } from "./theme-file-listing.js";
import { renameThemeFile } from "./theme-file-moves.js";
import { resolveThemeFileWriteScope } from "./theme-file-policy.js";
import { ThemePathError } from "./theme-files.js";
// The shared "can this file's identity (name/existence) change" gate — same-module sibling import
// (this file lives inside `features/theme`, so a direct import is the module's own internal wiring,
// not a deep-import-from-outside the `no-deep-imports:features/theme` rule polices). `explore.ts`'s
// HTTP rename/delete routes call the exact same function — see `file-identity-lock.ts`'s own header
// for why the decision had to live here rather than in `explore.ts` alongside its original home.
import { originalPathFromTrashedPath, validateFileIdentityChange } from "./file-identity-lock.js";
import { CATALOG_BY_ID } from "./theme-tool-catalog.js";
import { toThemeToolView } from "./theme-tool-view.js";


/**
 * Prune empty ancestors of a successfully restored theme file, keeping the theme's .trash root.
 * @param required - Theme directory and the validated trash path just moved by renameThemeFile.
 * @param _options - Reserved operation settings.
 * @returns Nothing; nonempty directories stop cleanup, other filesystem errors propagate.
 * @complexity O(d) filesystem operations and path space for d ancestor levels.
 */
function pruneRestoredThemeTrash(
  { themeDir, trashedPath }: { themeDir: string; trashedPath: string },
  _options: Record<string, never> = {},
): void {
  const trashRoot = resolve(themeDir, ".trash");
  let directory = dirname(resolve(themeDir, trashedPath));
  while (directory !== trashRoot) {
    try {
      // Nonrecursive removal preserves other trashed files, including concurrent additions.
      rmdirSync(directory);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOTEMPTY" || code === "EEXIST") return;
      if (code !== "ENOENT") throw error;
    }
    directory = dirname(directory);
  }
}

    /** Reversibly moves a writable file into the theme's .trash folder after authorization. */
    export async function theme_trash_file(routeDeps: ThemeToolDeps, ctx: Parameters<ToolHandler>[0]) {
      const input = requireInputRecord({ input: ctx.input });
      const themeId = requireString({ input: input, key: "themeId" });
      const relativePath = requireString({ input: input, key: "path" });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: THEME_WRITE_PERMISSION }, { entityType: "theme", entityId: themeId });

      return withSchemaOnRejection({ toolId: "theme_trash_file", catalog: CATALOG_BY_ID, isShapeRejection: ({ error }) => isShapeRejection({ error }), fn: async () => {
        const theme = findThemeOrThrow({ routeDeps, themeId });

        ctx.signal.throwIfAborted();
        const { trashedPath, reloaded } = trashThemeFile({ deps: routeDeps, theme, relativePath });

        return {
          trashed: true,
          cancelled: false,
          themeId,
          path: relativePath,
          trashedPath,
          note: "Moved to the theme's trash; restore with theme_restore_trashed_file using this themeId and trashedPath.",
          status: reloaded.status,
          errors: reloaded.errors,
          theme: toThemeToolView(reloaded),
        };

      } });
    }

    export async function theme_restore_trashed_file(routeDeps: ThemeToolDeps, ctx: Parameters<ToolHandler>[0]) {
      const input = requireInputRecord({ input: ctx.input });
      const themeId = requireString({ input: input, key: "themeId" });
      const trashedPath = requireString({ input: input, key: "trashedPath" });
      const explicitRestoreTo = optionalString({ input: input, key: "restoreTo" });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: THEME_WRITE_PERMISSION }, { entityType: "theme", entityId: themeId });

      return withSchemaOnRejection({ toolId: "theme_restore_trashed_file", catalog: CATALOG_BY_ID, isShapeRejection: ({ error }) => isShapeRejection({ error }), fn: async () => restoreTrashedFileForTool({ routeDeps, themeId, trashedPath, explicitRestoreTo, ctx }) });
    }

function restoreTrashedFileForTool(
  { routeDeps, themeId, trashedPath, explicitRestoreTo, ctx }: { routeDeps: ThemeToolDeps; themeId: string; trashedPath: string; explicitRestoreTo: string | undefined; ctx: Parameters<ToolHandler>[0] }, _options = {}
) {
        const theme = findThemeOrThrow({ routeDeps, themeId });

        const derivedRestoreTo = originalPathFromTrashedPath({ trashedPath });
        if (derivedRestoreTo === null) {
          throw new ThemePathError({ message: `'${trashedPath}' is not a path theme_trash_file ever produced — it must look like '.trash/<number>/<original path>'` });
        }
        const restoreTo = explicitRestoreTo ?? derivedRestoreTo;

        const existingPaths = new Set(listThemeFiles({ themeDir: theme.dir, themesRoot: routeDeps.themesDir }));
        if (!existingPaths.has(trashedPath)) {
          throw new ThemePathError({ message: `'${trashedPath}' does not exist in this theme's trash` });
        }
        if (existingPaths.has(restoreTo)) {
          throw new ThemePathError({ message: `'${restoreTo}' already exists in this theme — pass a different restoreTo, or move/rename the existing file first` });
        }

        // The same write gate every other write path in this file runs (`theme_write_file`/
        // `theme_edit_file`): refuses a built theme's generated tree, a compiled theme's
        // non-writable sourceDir extension, and — the case the old, generated-readonly-only check
        // here missed — an explicit `restoreTo` that names a location BACK inside `.trash/` itself.
        assertThemeFileWritable({ theme, relativePath: restoreTo });

        // An explicit `restoreTo` that differs from the trashed file's own original location is,
        // functionally, a RENAME riding along with the restore. `theme_rename_file` refuses to touch
        // a path inside `.trash/` at all (`isTrashedThemePath`, above), so without this check a
        // script/other-group file — or a compiled theme's identity-locked extension — could change
        // identity by restoring under a new name instead of going through (and being refused by)
        // `theme_rename_file`. Checked against the ORIGINAL location's own write scope, the same
        // input `theme_rename_file` validates against for an in-place rename.
        if (restoreTo !== derivedRestoreTo) {
          const originalWriteScope = resolveThemeFileWriteScope({ manifest: theme.manifest, relativePath: derivedRestoreTo });
          const lock = validateFileIdentityChange({ theme, path: derivedRestoreTo, writeScope: originalWriteScope, action: "renamed" });
          if (lock) throw new ThemeFileIdentityLockedError({ message: lock.error });
        }

        ctx.signal.throwIfAborted();
        renameThemeFile({ themeDir: theme.dir, themesRoot: routeDeps.themesDir, sourcePath: trashedPath, destPath: restoreTo });
        pruneRestoredThemeTrash({ themeDir: theme.dir, trashedPath });
        const reloaded = reloadThemeInPlace({ routeDeps, theme, themeId });

        return {
          themeId,
          path: restoreTo,
          restoredFrom: trashedPath,
          status: reloaded.status,
          errors: reloaded.errors,
          theme: toThemeToolView(reloaded),
        };
      }
