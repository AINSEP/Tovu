import { assertThemeFileWritable, findThemeOrThrow, reloadThemeInPlace, isShapeRejection, ThemeFileNoOriginalError, ThemeOriginalLayoutMismatchError, type ThemeToolDeps } from "./asset-operations.js";
import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
import { requireInputRecord, requireString, withSchemaOnRejection, type ToolHandler } from "@jini-ai/core";
import { requireToolPermission } from "@jini-ai/cms/core";
import { THEME_WRITE_PERMISSION } from "./agent-tools.js";
import { MAX_THEME_FILE_BYTES, readThemeFile } from "./theme-files.js";
import { resetThemeFileToOriginal } from "@jini-ai/cms/themes/files/originals";
import { themeOriginalFilePorts } from "./theme-file-write-ports.js";
import { resolveThemeOriginalSource, hasThemeOriginalLayoutMismatch, type ThemeOriginalSource } from "@jini-ai/cms/themes/files/original-source";
import { ORIGINAL_LAYOUT_MISMATCH_REFUSAL } from "./theme-file-errors.js";
import { type DiscoveredTheme } from "./theme.js";
import { CATALOG_BY_ID } from "./theme-tool-catalog.js";
import { toThemeToolView } from "./theme-tool-view.js";


/**
 * Where `theme_reset_file` reads its original from and compares against: the site's own catalog
 * copy, or — since Design C, only when the site has none at all — the package's own
 * read-only catalog. See `resolveThemeOriginalSource`'s own doc (`theme-files.ts`) for the full
 * rationale; `routeDeps.packageThemesDir` is `undefined` for any caller that predates that field,
 * which resolves the identical "no fallback" answer this tool always got before.
 */
function originalSourceForTool(routeDeps: ThemeToolDeps, theme: DiscoveredTheme): ThemeOriginalSource | null {
  return resolveThemeOriginalSource({
    manifest: theme.manifest,
    siteThemesRoot: routeDeps.themesDir,
    packageThemesRoot: routeDeps.packageThemesDir,
  });
}

/**
 * Restore `relativePath` from the originals catalog for `theme_reset_file`, byte for byte, through
 * {@link resetThemeFileToOriginal}: the same call `explore.ts`'s per-file reset route makes, with the
 * same two refusal reasons, but throwing instead of writing an HTTP response, matching every other
 * refusal in this file. `path` is operator input, and this is the one place in this file that
 * resolves it against a directory OUTSIDE the theme's own folder; `resetThemeFileToOriginal` runs it
 * through the containment check against the CATALOG root before it touches the live side.
 *
 * @returns The original's size in `bytes`, and whether the live file differed and was rewritten.
 * @throws {ThemeFileNoOriginalError} If this theme has no catalog directory at all (site or
 * package), or the catalog has no regular file at this path (including a path that escapes the
 * catalog folder).
 * @throws {ThemeOriginalLayoutMismatchError} If {@link hasThemeOriginalLayoutMismatch} refuses the theme's
 * original, checked before any file is looked at: the same guard, and the same message, as the HTTP
 * route's `ORIGINAL_LAYOUT_MISMATCH`.
 */
function resetFromOriginalForTool(
  { routeDeps, theme, relativePath }: { routeDeps: ThemeToolDeps; theme: DiscoveredTheme; relativePath: string },
  _optional = {}
): { wasModified: boolean; bytes: number } {
  const originalSource = originalSourceForTool(routeDeps, theme);
  if (!originalSource) {
    throw new ThemeFileNoOriginalError({ message: `theme '${theme.manifest.id}' has no stored original, so nothing can be reset` });
  }
  const refusal = hasThemeOriginalLayoutMismatch({ themeDir: theme.dir, originalDir: originalSource.originalDir, maxManifestBytes: MAX_THEME_FILE_BYTES }) ? ORIGINAL_LAYOUT_MISMATCH_REFUSAL : null;
  if (refusal) throw new ThemeOriginalLayoutMismatchError({ message: refusal.message });
  const reset = resetThemeFileToOriginal({ ports: themeOriginalFilePorts,
    themeDir: theme.dir,
    themesRoot: routeDeps.themesDir,
    originalDir: originalSource.originalDir,
    originalsRoot: originalSource.originalsRoot,
    relativePath,
  });
  if (!reset) {
    throw new ThemeFileNoOriginalError({ message: `'${relativePath}' is not in this theme's original, so there is nothing to reset it to` });
  }
  return reset;
}

    /**
     * Restores one file to the pristine copy in the originals catalog — the payoff of the copy-not-
     * inherit model `explore.ts`'s own per-file reset route documents: "put it back" is a byte-for-
     * byte file copy from a directory that was never mutated, needing no diff or history. Binary
     * files and files past the {@link MAX_THEME_FILE_BYTES} text-read limit reset the same way; the
     * result's `content` is `null` for the latter. Only the PER-FILE
     * path: unlike the HTTP route's `writeScope.kind === "generated-readonly"` branch (which restores
     * a compiled theme's whole generated tree as one atomic operation via
     * `restoreBuiltThemeGeneratedTree`), this tool refuses that case outright through
     * `assertThemeFileWritable` — whole-tree revert is a separate, wider-blast-radius decision the
     * owner has not extended to agents (see `2026-09-12-theme-agent-tools-survey.md`'s gap table).
     *
     * An already-pristine file (live bytes identical to the catalog copy) is a successful no-op, not a
     * refusal: the goal state already holds, so nothing is written and the result says
     * `wasModified: false`, `bytesWritten: 0` — the same "already there is not an error" call the
     * rename tool makes for a same-name rename.
     */
    export async function theme_reset_file(routeDeps: ThemeToolDeps, ctx: Parameters<ToolHandler>[0]) {
      const input = requireInputRecord({ input: ctx.input });
      const themeId = requireString({ input: input, key: "themeId" });
      const relativePath = requireString({ input: input, key: "path" });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: THEME_WRITE_PERMISSION }, { entityType: "theme", entityId: themeId });

      return withSchemaOnRejection({ toolId: "theme_reset_file", catalog: CATALOG_BY_ID, isShapeRejection: ({ error }) => isShapeRejection({ error }), fn: async () => {
        const theme = findThemeOrThrow({ routeDeps, themeId });

        // Same three refusals theme_write_file/theme_edit_file check — a reset is still a write, and
        // this also correctly refuses a compiled theme's generated tree (see this handler's own doc)
        // and a `.trash/...` path (restore it first with theme_restore_trashed_file).
        assertThemeFileWritable({ theme, relativePath });

        // Byte comparison against the catalog copy, never mtime or size alone, then a byte copy only
        // when they differ.
        const { wasModified, bytes } = resetFromOriginalForTool({ routeDeps, theme, relativePath });
        // Reloaded even when nothing was written: `status`/`errors` report the theme as it is on disk
        // now, and this process's snapshot is stale whenever a different process wrote the theme.
        const reloaded = reloadThemeInPlace({ routeDeps, theme, themeId });

        return {
          themeId,
          path: relativePath,
          wasModified,
          bytesWritten: wasModified ? bytes : 0,
          // The restored file as the same text theme_read_file returns, or null past its read limit.
          content: bytes > MAX_THEME_FILE_BYTES ? null : readThemeFile({ themeDir: theme.dir, themesRoot: routeDeps.themesDir, relativePath }),
          status: reloaded.status,
          errors: reloaded.errors,
          theme: toThemeToolView(reloaded),
        };
      } });
    }
