import { assertThemeFileWritable, findThemeOrThrow, reloadThemeInPlace, isShapeRejection, ThemeFileReadOnlyError, ThemeFileIdentityLockedError, type ThemeToolDeps } from "./asset-operations.js";
import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
import { requireInputRecord, requireString, withSchemaOnRejection, type ToolHandler } from "@jini-ai/core";
import { requireToolPermission } from "@jini-ai/cms/core";
import { THEME_WRITE_PERMISSION } from "./agent-tools.js";
import { copyThemeFile, nextAvailableFileName, renameThemeFile } from "@jini-ai/cms/themes/files/moves";
import { themeFileMovePorts } from "./theme-file-write-ports.js";
import { listThemeFiles } from "./theme-file-listing.js";
import { resolveThemeFileWriteScope } from "./theme-file-policy.js";
import { ThemePathError } from "./theme-files.js";
import { type DiscoveredTheme } from "./theme.js";
// The shared "can this file's identity (name/existence) change" gate — same-module sibling import
// (this file lives inside `features/theme`, so a direct import is the module's own internal wiring,
// not a deep-import-from-outside the `no-deep-imports:features/theme` rule polices). `explore.ts`'s
// HTTP rename/delete routes call the exact same function — see `file-identity-lock.ts`'s own header
// for why the decision had to live here rather than in `explore.ts` alongside its original home.
import { fileExtension, isTrashedThemePath, validateFileIdentityChange } from "./file-identity-lock.js";
import { CATALOG_BY_ID } from "./theme-tool-catalog.js";
import { toThemeToolView } from "./theme-tool-view.js";


/** `name` is a bare filename, not a path — mirrors `explore.ts`'s `validateRenameTargetName` (the
 *  HTTP rename route's identical check on the identical input shape); kept as its own small
 *  duplicate here rather than a third shared module, since it is a 3-line, dependency-free input
 *  check with nothing else to drift out of sync. `null` means `name` is valid. An empty `name`
 *  never reaches this: the handler's `requireString` already refuses it. */
function invalidRenameTargetNameReason({ name }: { name: string }, _optional = {}): string | null {
  if (name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    return `name '${name}' must be a plain filename in the same folder, not a path`;
  }
  return null;
}

/**
 * Perform `theme_rename_file`'s actual rename once every refusal check has passed, mirroring
 * `explore.ts`'s `renameThemeFileIfChanged` (same no-op/collision/extension-preservation/
 * destination-write-scope shape) but throwing instead of writing an HTTP response — see that
 * function's own doc for the full reasoning behind each check.
 *
 * Exported (only) so the defense-in-depth `destWriteScope` check below can be direct-invoke tested
 * the same way `renameThemeFileIfChanged`'s identical branch is — see that function's test in
 * `explore-pure-helpers.unit.test.ts`.
 *
 * @returns The path the file ends up at (`sourcePath` unchanged, for the deliberate no-op case).
 */
export function performThemeFileRename(
  {
    routeDeps,
    theme,
    paths,
    existingPaths,
  }: {
    routeDeps: ThemeToolDeps;
    theme: DiscoveredTheme;
    paths: { sourcePath: string; destPath: string; name: string };
    existingPaths: ReadonlySet<string>;
  },
  _optional = {}
): string {
  const { sourcePath, destPath, name } = paths;
  if (destPath === sourcePath) return sourcePath;

  if (existingPaths.has(destPath)) {
    throw new ThemePathError({ message: `'${destPath}' already exists in this theme` });
  }
  if (fileExtension({ relativePath: sourcePath }) !== fileExtension({ relativePath: destPath })) {
    throw new ThemePathError({ message: `renaming '${sourcePath}' to '${name}' would change its extension, which is not allowed — a file's extension decides how it is served and must not change via rename` });
  }
  // Defense-in-depth, not currently reachable: `destPath` is always built from `sourcePath`'s OWN
  // directory (`name` may not contain `/`), so its write-scope is provably identical to
  // `sourcePath`'s already-checked one. Asserted directly anyway, matching `explore.ts`'s own
  // identical comment on this exact check.
  const destWriteScope = resolveThemeFileWriteScope({ manifest: theme.manifest, relativePath: destPath });
  if (destWriteScope.kind === "generated-readonly") {
    throw new ThemeFileReadOnlyError({ message: `'${destPath}' is read-only: ${destWriteScope.reason}` });
  }

  renameThemeFile({ ports: themeFileMovePorts, themeDir: theme.dir, themesRoot: routeDeps.themesDir, sourcePath, destPath });
  return destPath;
}

    export async function theme_rename_file(routeDeps: ThemeToolDeps, ctx: Parameters<ToolHandler>[0]) {
      const input = requireInputRecord({ input: ctx.input });
      const themeId = requireString({ input: input, key: "themeId" });
      const relativePath = requireString({ input: input, key: "path" });
      const name = requireString({ input: input, key: "name" });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: THEME_WRITE_PERMISSION }, { entityType: "theme", entityId: themeId });

      return withSchemaOnRejection({ toolId: "theme_rename_file", catalog: CATALOG_BY_ID, isShapeRejection: ({ error }) => isShapeRejection({ error }), fn: async () => {
        const theme = findThemeOrThrow({ routeDeps, themeId });

        // A trashed file is restored (theme_restore_trashed_file), never renamed in place — renaming
        // inside `.trash/` would leave `theme_trash_file`'s own response (`trashedPath`) pointing at
        // nothing, with no benefit over restoring to the name the caller actually wants.
        if (isTrashedThemePath({ relativePath })) {
          throw new ThemePathError({ message: `'${relativePath}' is inside the trash — restore it first with theme_restore_trashed_file` });
        }

        const nameError = invalidRenameTargetNameReason({ name });
        if (nameError) throw new ThemePathError({ message: nameError });

        // The ONE shared gate `explore.ts`'s HTTP rename route also calls — see
        // `file-identity-lock.ts`'s own header for why the decision lives there now. Refuses a
        // theme's own required files, a built theme's generated tree, and `script`/`other`-group
        // files (nothing tracks what still references a file by its old name).
        const writeScope = resolveThemeFileWriteScope({ manifest: theme.manifest, relativePath });
        const lock = validateFileIdentityChange({ theme, path: relativePath, writeScope, action: "renamed" });
        if (lock) throw new ThemeFileIdentityLockedError({ message: lock.error });

        const existingPaths = new Set(listThemeFiles({ themeDir: theme.dir, themesRoot: routeDeps.themesDir }));
        if (!existingPaths.has(relativePath)) {
          throw new ThemePathError({ message: `file '${relativePath}' does not exist in this theme` });
        }

        const slash = relativePath.lastIndexOf("/");
        const destPath = slash === -1 ? name : `${relativePath.slice(0, slash)}/${name}`;
        ctx.signal.throwIfAborted();
        const finalPath = performThemeFileRename({ routeDeps, theme, paths: { sourcePath: relativePath, destPath, name }, existingPaths });

        const reloaded = reloadThemeInPlace({ routeDeps, theme, themeId });

        return {
          themeId,
          path: finalPath,
          renamedFrom: relativePath,
          status: reloaded.status,
          errors: reloaded.errors,
          theme: toThemeToolView(reloaded),
        };
      } });
    }

    /**
     * Duplicates one file inside a theme's folder — mirrors `explore.ts`'s own POST `.../file/copy`
     * route exactly: the destination is always server-computed (`nextAvailableFileName`'s `name-1`,
     * `name-2`, … suffix scheme), never operator-chosen, so unlike `theme_rename_file` there is no
     * second input to validate. Offered for every file group, including `script`/`other` (read-only-
     * to-EDIT, not read-only-to-copy) — duplicating bytes under a new name changes nothing about the
     * original and nothing anything else references, so it carries none of the risk a script's
     * content-edit block exists to prevent.
     */
    export async function theme_copy_file(routeDeps: ThemeToolDeps, ctx: Parameters<ToolHandler>[0]) {
      const input = requireInputRecord({ input: ctx.input });
      const themeId = requireString({ input: input, key: "themeId" });
      const sourcePath = requireString({ input: input, key: "path" });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: THEME_WRITE_PERMISSION }, { entityType: "theme", entityId: themeId });

      return withSchemaOnRejection({ toolId: "theme_copy_file", catalog: CATALOG_BY_ID, isShapeRejection: ({ error }) => isShapeRejection({ error }), fn: async () => {
        const theme = findThemeOrThrow({ routeDeps, themeId });

        // Same refusal every other write-shaped tool in this domain checks — duplicating INTO a
        // built theme's generated tree is a write, just phrased as "copy"; duplicating a file
        // currently in `.trash/...` is refused too (restore it first), tightening the one case
        // `explore.ts`'s own HTTP copy route does not itself check — see `assertThemeFileWritable`'s
        // own doc for why one shared gate is what keeps every write-shaped tool here in agreement.
        assertThemeFileWritable({ theme, relativePath: sourcePath });

        const existingPaths = new Set(listThemeFiles({ themeDir: theme.dir, themesRoot: routeDeps.themesDir }));
        if (!existingPaths.has(sourcePath)) {
          throw new ThemePathError({ message: `file '${sourcePath}' was not found in this theme` });
        }

        const destPath = nextAvailableFileName({ desiredPath: sourcePath, existingPaths });
        ctx.signal.throwIfAborted();
        copyThemeFile({ ports: themeFileMovePorts, themeDir: theme.dir, themesRoot: routeDeps.themesDir, sourcePath, destPath });
        const reloaded = reloadThemeInPlace({ routeDeps, theme, themeId });

        return {
          themeId,
          path: destPath,
          copiedFrom: sourcePath,
          status: reloaded.status,
          errors: reloaded.errors,
          theme: toThemeToolView(reloaded),
        };
      } });
    }
