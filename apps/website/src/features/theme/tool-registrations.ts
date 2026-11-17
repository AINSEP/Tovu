export { contributeImportThemeFileTools } from "./import-theme-file-tool.js";
export { assertThemeFileWritable, findThemeOrThrow, reloadThemeInPlace, isShapeRejection } from "./asset-operations.js";
export type { ThemeToolDeps } from "./asset-operations.js";
import { trashThemeFile, assertThemeFileWritable, findThemeOrThrow, reloadThemeInPlace, isShapeRejection, ThemeFileReadOnlyError, ThemeFileEditMatchError, ThemeFileNoOriginalError, ThemeOriginalLayoutMismatchError, ThemeFileIdentityLockedError, type ThemeToolDeps } from "./asset-operations.js";
import { toolMetadata } from '../../contracts/core/tool-metadata/theme.js';
export { contributeSetActiveThemeTools, type SetActiveThemeToolDeps } from "./set-active-theme-tool.js";
export { contributePreviewSwitcherTools, type PreviewSwitcherToolDeps } from "./preview-switcher-tools.js";
export { contributeTrashThemeTools, type TrashThemeToolDeps } from "./trash-theme-tool.js";
export { contributeDuplicateThemeTools } from "./duplicate-theme-tool.js";
import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
/**
 * @file Themes' half of ADR-049 Decision 4: maps every one of `agent-tools.ts`'s catalog entries
 * onto real filesystem reads/writes inside one theme's own folder, as `ToolRegistration`s
 * (`theme_list`/`theme_list_files`/`theme_read_file`/`theme_write_file`/`theme_edit_file`/
 * `theme_reset_file`/`theme_rename_file`/`theme_copy_file`/`theme_trash_file`/
 * `theme_restore_trashed_file` as of 2026-09-12, when `theme_reset_file`/`theme_copy_file` closed
 * the last two gaps a read-only survey found against the human Explore screen's own file
 * operations — see `ADS-memory/reports/2026-09-12-theme-agent-tools-survey.md`). The catalog is
 * wired in full — there is no `unwiredToolIds` set here, which means the kit treats ANY future
 * catalog entry added without a handler as a build failure. See `agent-tools.ts`'s own file header
 * for the operations deliberately never put in the catalog at all (hard file-delete,
 * rename/create/delete a whole theme's folder) and why.
 *
 * Authorization shape: nothing in `theme.ts`/`theme-files.ts` accepts an `authorize` dependency —
 * they are pure discovery/filesystem functions with no notion of a principal, exactly like
 * `redirects.ts`'s write chokepoint. The admin routes over this surface
 * (`apps/website/src/server/inbound/admin-http/routes/presentation/patch-active-theme.ts`, `apps/website/src/server/inbound/admin-http/routes/themes/list.ts`)
 * therefore call `authorize()` inline as their own first line, and every handler below does the same
 * via the kit's `requireToolPermission` — ADR-021 §2's single evaluator, located at the handler
 * rather than inside the domain function.
 *
 * Live-state coupling, stated explicitly because it is the one thing here that is not a pure
 * function: a successful `theme_write_file` re-runs `loadTheme()` and REPLACES that theme's entry in
 * `routeDeps.themes` — the same array `routes/site/pages.ts` resolves the active theme out of. That
 * is deliberate and is what makes this domain a usable edit loop rather than a write-and-wait-for-
 * restart one: an agent writes a template, the next page view renders it. It is also why the write
 * tool returns `status`/`errors` in its response — if the edit did not validate, the agent has to
 * learn that in the same turn, because the live site has already started serving the fallback body
 * for that theme.
 */
import { dirname, resolve } from "node:path";
import { requestThemePreviewRefresh, validatePreviewPath } from "./preview-refresh.js";
import { syncThemeRoster } from "./theme-roster-sync.js";
import { NO_THEME_ID } from "./active-theme.js";
import { describeHardcodedLinkList } from "./hardcoded-link-lists.js";
import { rmdirSync, statSync } from "node:fs";
import { ToolInputError } from "@jini-ai/core";
import { normalizeThemeReadInput, optionalThemeReadInteger, pageThemeReadContent, selectThemeReadContent, themeReadSelection } from "./theme-read-content.js";
import { buildDomainRegistrations, indexCatalogById, optionalString, requireInputRecord, requireString, withSchemaOnRejection, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { requireToolPermission } from "@jini-ai/cms/core";
import type { ToolContributor } from "@jini-ai/core";
import { createSurfaceExchangeStore, type AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import {
  getThemesAgentToolCatalog,
  THEME_READ_PERMISSION,
  THEME_WRITE_PERMISSION,
} from "./agent-tools.js";
import {
  copyThemeFile,
  listThemeFiles,
  MAX_THEME_FILE_BYTES,
  nextAvailableFileName,
  readThemeFile,
  renameThemeFile,
  resetThemeFileToOriginal,
  resolveThemeFilePath,
  resolveThemeFileWriteScope,
  resolveThemeOriginalSource,
  themeOriginalResetRefusal,
  ThemePathError,
  writeThemeFile,
  type ThemeOriginalSource,
} from "./theme-files.js";
import { findStoredTheme, isPublishableThemePageCandidate, isStandaloneThemePage, loadTheme, rescanThemes, type DiscoveredTheme } from "./theme.js";
// The shared "can this file's identity (name/existence) change" gate — same-module sibling import
// (this file lives inside `features/theme`, so a direct import is the module's own internal wiring,
// not a deep-import-from-outside the `no-deep-imports:features/theme` rule polices). `explore.ts`'s
// HTTP rename/delete routes call the exact same function — see `file-identity-lock.ts`'s own header
// for why the decision had to live here rather than in `explore.ts` alongside its original home.
import {
  fileExtension,
  isTrashedThemePath,
  originalPathFromTrashedPath,
  validateFileIdentityChange,
} from "./file-identity-lock.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/platform/system";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { protectThemeFileTools } from './file-mutation-tools.js';

const MUTATES_DURABLE_STATE = "mutates-durable-state";


const CATALOG_BY_ID = indexCatalogById({ catalog: getThemesAgentToolCatalog() });

/**
 * Model-facing theme view. Drops `templates`/`liquidTemplates`/`handlebarsTemplates`/`css` (whole
 * file bodies — an agent asks for those one at a time through `theme_read_file`, and dumping every
 * template of every theme into a list response would swamp a context window for no gain) and `dir`
 * (an absolute host path; the agent addresses themes by id, and leaking the server's filesystem
 * layout into a model response serves nothing). Keeps `errors` in full: it is the entire feedback
 * signal this domain exists to deliver.
 *
 * `author`/`build` (ADR-020 §5, 2026-08-12) surface WHETHER a theme is a built release before the
 * agent ever tries to write into it — trimmed to `source`/`framework`/`sourceDir` (the fields that
 * actually decide what `theme_write_file` will accept, per `resolveThemeFileWriteScope`), dropping
 * `builderVersion`/`lockfileHash`/`artifactHashes` as support/integrity metadata an editing agent has
 * no use for. Without this an agent only learns a theme is built by having a write rejected mid-turn;
 * with it, `theme_list` turns that into something it can plan around up front. Absent for every theme
 * on disk today (authored, unchanged).
 */
function toThemeToolView(theme: DiscoveredTheme) {
  return {
    id: theme.manifest.id,
    name: theme.manifest.name,
    version: theme.manifest.version,
    tier: theme.manifest.tier,
    description: theme.manifest.description,
    ...(theme.manifest.author !== undefined ? { author: theme.manifest.author } : {}),
    ...(theme.manifest.build !== undefined
      ? {
          build: {
            source: theme.manifest.build.source,
            ...(theme.manifest.build.framework ? { framework: theme.manifest.build.framework } : {}),
            ...(theme.manifest.build.sourceDir ? { sourceDir: theme.manifest.build.sourceDir } : {}),
          },
        }
      : {}),
    source: theme.source,
    status: theme.status,
    errors: theme.errors,
  };
}

/** Editable manifest metadata must not turn a compiled release's generated files into source. */
function assertCompiledWriteBoundaryUnchanged(
  { theme, relativePath, content }: { theme: DiscoveredTheme; relativePath: string; content: string },
  _optional = {}
): void {
  if (theme.manifest.build?.source !== "compiled" || resolve(theme.dir, relativePath) !== resolve(theme.dir, "theme.json")) return;
  let next: { build?: { source?: string; sourceDir?: string } } | null;
  try {
    next = JSON.parse(content);
  } catch {
    throw new ThemeFileReadOnlyError({ message: "a compiled release's write boundary is read-only and requires a valid theme.json" });
  }
  if (next?.build?.source !== "compiled" || next.build.sourceDir !== theme.manifest.build.sourceDir) {
    throw new ThemeFileReadOnlyError({ message: "build.source and build.sourceDir are read-only for a compiled release; rebuild the complete release instead" });
  }
}

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
 * @throws {ThemeOriginalLayoutMismatchError} If {@link themeOriginalResetRefusal} refuses the theme's
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
  const refusal = themeOriginalResetRefusal({ themeDir: theme.dir, originalDir: originalSource.originalDir });
  if (refusal) throw new ThemeOriginalLayoutMismatchError({ message: refusal.message });
  const reset = resetThemeFileToOriginal({
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

/** How many times `needle` occurs in `haystack`, as a plain literal substring (never a regex) — the
 *  same counting trick `split(needle).length - 1` uses everywhere else a literal (not regex) count
 *  is wanted, avoiding any need to escape `needle` for a regex engine. */
function countOccurrences({ haystack, needle }: { haystack: string; needle: string }, _optional = {}): number {
  return haystack.split(needle).length - 1;
}

/**
 * Apply `theme_edit_file`'s old-string/new-string replacement to `currentContent`, enforcing the
 * uniqueness contract described on {@link ThemeFileEditMatchError}: `oldString` must appear exactly
 * once unless `replaceAll` is set, in which case every occurrence changes. Ambiguity is refused
 * rather than guessed at — silently picking "the first match" on a multiply-occurring string would
 * risk changing the wrong one with no signal to the caller that anything was ambiguous.
 *
 * @complexity O(n) in the file's size, for the split/replace `oldString`/`newString` each perform.
 */
function applyThemeFileEdit(
  { currentContent, edit, relativePath }: { currentContent: string; edit: { oldString: string; newString: string; replaceAll: boolean; intent?: "delete" }; relativePath: string },
  _optional: Record<string, never> = {},
): string {
  const nextContent = replaceThemeFileText({ currentContent, edit, relativePath });
  // An empty `newString` deletes text (allowed as is); only an edit that leaves NOTHING (empty or
  // whitespace-only) needs the explicit `intent: "delete"` — the one deletion a too-wide oldString
  // could do by accident, and a whole-file wipe is never what "remove this line" meant.
  if (nextContent.trim() === "" && edit.intent !== "delete") {
    throw new ThemeFileEditMatchError({ message: `this edit would leave '${relativePath}' empty; narrow oldString to the text to remove, or pass intent: 'delete' if emptying the whole file is really intended` });
  }
  return nextContent;
}

function replaceThemeFileText(
  { currentContent, edit, relativePath }: { currentContent: string; edit: { oldString: string; newString: string; replaceAll: boolean }; relativePath: string },
  _optional: Record<string, never> = {},
): string {
  const occurrences = countOccurrences({ haystack: currentContent, needle: edit.oldString });
  if (occurrences === 0) {
    throw new ThemeFileEditMatchError({ message: `oldString was not found in '${relativePath}' — read the file with theme_read_file and copy the exact text to replace, including whitespace` });
  }
  if (occurrences > 1 && !edit.replaceAll) {
    throw new ThemeFileEditMatchError({ message: `oldString matches ${occurrences} times in '${relativePath}'; pass more surrounding context in oldString to make it unique, or replaceAll: true to change every occurrence` });
  }
  return edit.replaceAll
    ? currentContent.split(edit.oldString).join(edit.newString)
    : currentContent.replace(edit.oldString, () => edit.newString);
}

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

  renameThemeFile({ themeDir: theme.dir, themesRoot: routeDeps.themesDir, sourcePath, destPath });
  return destPath;
}

const THEME_TRASH_TOOL_ID = "theme_trash_file";

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually does.
 * See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own `sideEffects`
 * declaration.
 */
export const themesDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  ["preview_reload", MUTATES_DURABLE_STATE],
  // -> rescanThemes(): replaces the live discovered-theme registry in place.
  ["theme_rescan", MUTATES_DURABLE_STATE],
  // -> routeDeps.themes.map(): reads already-discovered in-memory state, no I/O at all.
  ["theme_list", "none"],
  // Reload and shared publication predicates: files read, no state changes.
  ["theme_list_page_publications", "none"],
  // -> listThemeFiles(): readdir under one theme folder, no writes.
  ["theme_list_files", "none"],
  // -> readThemeFile(): one readFileSync under one theme folder, plus a stat for selection metadata; no writes.
  ["theme_read_file", "none"],
  // -> writeThemeFile(): mkdir + writeFileSync on disk, then loadTheme() + in-place replacement of
  //    the live routeDeps.themes entry. Durable on both counts.
  ["theme_write_file", MUTATES_DURABLE_STATE],
  // -> readThemeFile() + writeThemeFile(): same durable write as theme_write_file, just computed
  //    from a read instead of taking the whole content as input.
  ["theme_edit_file", MUTATES_DURABLE_STATE],
  // -> resetThemeFileToOriginal(): a byte compare against the catalog copy, then copyFileSync to a
  //    temp file renamed over the live file when the bytes differ, then loadTheme() + in-place
  //    replacement. Same durable write as theme_write_file, just sourced from the theme's own stored
  //    original instead of caller-supplied content. An already-pristine file is not written.
  ["theme_reset_file", MUTATES_DURABLE_STATE],
  // -> renameThemeFile(): renameSync on disk, then loadTheme() + in-place replacement. Durable.
  ["theme_rename_file", MUTATES_DURABLE_STATE],
  // -> copyThemeFile(): copyFileSync creating a NEW file on disk, then loadTheme() + in-place
  //    replacement. Durable, same class as theme_write_file's own create-or-overwrite.
  ["theme_copy_file", MUTATES_DURABLE_STATE],
  // -> renameThemeFile() into .trash/: same durable move as theme_rename_file, just to a
  //    system-computed destination. Reversible (theme_restore_trashed_file), but still a disk write.
  ["theme_trash_file", MUTATES_DURABLE_STATE],
  // -> renameThemeFile() out of .trash/: the mirror-image move. Durable.
  ["theme_restore_trashed_file", MUTATES_DURABLE_STATE],
]);

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

export function buildThemesRegistrations(
  routeDeps: ThemeToolDeps,
  surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) },
): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    preview_reload: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input ?? {} });
      const path = optionalString({ input, key: "path" });
      if (path !== undefined) validatePreviewPath({ path });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: THEME_READ_PERMISSION }, { entityType: "theme" });
      return { reloaded: true, ...requestThemePreviewRefresh({ themesDir: routeDeps.themesDir }, { path }) };
    },
    /**
     * Refreshes the rendering registry in place after folders arrive or disappear.
     * @param ctx - Principal and empty input; dependencies supply the local theme root/registry.
     * @returns Added/removed ids and all invalid themes with their validation errors.
     * @throws ToolInputError for malformed input; permission and discovery failures propagate.
     * @complexity O(t log t + b) time/space in theme count and theme bytes read during discovery.
     */
    theme_rescan: async (ctx) => {
      requireInputRecord({ input: ctx.input ?? {} });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: THEME_READ_PERMISSION }, { entityType: "presentation" });
      const changed = rescanThemes({ themes: routeDeps.themes, dir: routeDeps.themesDir });
      return {
        added: changed.added, removed: changed.removed,
        invalid: routeDeps.themes.filter((theme) => theme.status === "invalid")
          .map((theme) => ({ themeId: theme.manifest.id, errors: theme.errors })),
      };
    },

    theme_list: async (ctx) => {
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
    },

    /** Reloads disk state and delegates eligibility/visibility to the public renderer's predicates. */
    theme_list_page_publications: async (ctx) => {
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
    },
    theme_list_files: async (ctx) => {
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
    },

    /**
     * Reads one contained file, retaining small full responses and paging larger full/line reads.
     * Requires theme read permission, validates selectors, and retains the full-file 1 MB limit.
     * Selected reads add full-file totals and range/match metadata. No writes.
     * @complexity O(b) time and space in file size (bounded at MAX_THEME_FILE_BYTES).
     */
    theme_read_file: async (ctx) => {
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
    },

    theme_write_file: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      const themeId = requireString({ input: input, key: "themeId" });
      const relativePath = requireString({ input: input, key: "path" });
      const content = requireString({ input: input, key: "content" });
      // Only the boolean `true` opts in, the same way `theme_edit_file` reads `replaceAll`.
      const overwriteOversized = input.overwriteOversized === true;
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: THEME_WRITE_PERMISSION }, { entityType: "theme", entityId: themeId });

      return withSchemaOnRejection({ toolId: "theme_write_file", catalog: CATALOG_BY_ID, isShapeRejection: ({ error }) => isShapeRejection({ error }), fn: async () => {
        const theme = findThemeOrThrow({ routeDeps, themeId });

        // ADR-020 §5 generated-tree refusal + the `preview/` security-parity refusal —
        // both checked BEFORE any filesystem write, so a rejected write never touches disk. See
        // `assertThemeFileWritable`'s own doc; shared with `theme_edit_file` below.
        assertThemeFileWritable({ theme, relativePath });

        assertCompiledWriteBoundaryUnchanged({ theme, relativePath, content });
        let previousRevision: { trashedPath: string; note: string } | undefined;
        ctx.signal.throwIfAborted();
        writeThemeFile({ themeDir: theme.dir, themesRoot: routeDeps.themesDir, relativePath, content }, { overwriteOversized,
          onRevision: ({ trashedPath }) => { previousRevision = { trashedPath,
            note: `Read the previous bytes with theme_read_file at '${trashedPath}' and write them back to '${relativePath}' with theme_write_file to undo.` }; },
        });

        // Re-validate through the SAME `loadTheme()` a boot-time discovery uses — the whole point of
        // this domain's safety argument is that an agent-authored file is validated identically to a
        // human-authored one, so re-running the real loader (rather than a bespoke "check what we
        // just wrote" path) is what makes that true rather than merely claimed.
        const reloaded = reloadThemeInPlace({ routeDeps, theme, themeId });
        // A warning, not a refusal: a hard-coded link list in a header/footer partial is a fixable
        // mistake, but plain links can be deliberate (see `hardcoded-link-lists.ts`).
        const warning = describeHardcodedLinkList({ path: relativePath, content });

        return {
          themeId,
          path: relativePath,
          bytesWritten: Buffer.byteLength(content, "utf8"),
          status: reloaded.status,
          errors: reloaded.errors,
          theme: toThemeToolView(reloaded),
          ...(previousRevision ? { previousRevision } : {}),
          ...(warning ? { warning } : {}),
        };
      } });
    },

    theme_edit_file: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      const themeId = requireString({ input: input, key: "themeId" });
      const relativePath = requireString({ input: input, key: "path" });
      const oldString = requireString({ input: input, key: "oldString" });
      const newString = requireString({ input: input, key: "newString" }, { allowEmpty: true });
      const replaceAll = input.replaceAll === true;
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: THEME_WRITE_PERMISSION }, { entityType: "theme", entityId: themeId });

      return withSchemaOnRejection({ toolId: "theme_edit_file", catalog: CATALOG_BY_ID, isShapeRejection: ({ error }) => isShapeRejection({ error }), fn: async () => {
        const theme = findThemeOrThrow({ routeDeps, themeId });

        // Same two ADR-020/`preview/` refusals `theme_write_file` checks, and for the identical
        // reason — a partial edit is still a write, and must be refused BEFORE reading the file so
        // an agent gets one clear reason rather than a read that then turns out pointless.
        assertThemeFileWritable({ theme, relativePath });

        const currentContent = readThemeFile({ themeDir: theme.dir, themesRoot: routeDeps.themesDir, relativePath });
        const nextContent = applyThemeFileEdit({ currentContent, edit: { oldString, newString, replaceAll, ...(input.intent === "delete" ? { intent: "delete" as const } : {}) }, relativePath });
        const occurrencesReplaced = replaceAll ? countOccurrences({ haystack: currentContent, needle: oldString }) : 1;

        assertCompiledWriteBoundaryUnchanged({ theme, relativePath, content: nextContent });
        ctx.signal.throwIfAborted();
        writeThemeFile({ themeDir: theme.dir, themesRoot: routeDeps.themesDir, relativePath, content: nextContent });
        const reloaded = reloadThemeInPlace({ routeDeps, theme, themeId });
        // Checked against the whole file after the edit, the same warning `theme_write_file` returns.
        const warning = describeHardcodedLinkList({ path: relativePath, content: nextContent });

        return {
          themeId,
          path: relativePath,
          occurrencesReplaced,
          bytesWritten: Buffer.byteLength(nextContent, "utf8"),
          status: reloaded.status,
          errors: reloaded.errors,
          theme: toThemeToolView(reloaded),
          ...(warning ? { warning } : {}),
        };
      } });
    },

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
    theme_reset_file: async (ctx) => {
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
    },

    theme_rename_file: async (ctx) => {
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
    },

    /**
     * Duplicates one file inside a theme's folder — mirrors `explore.ts`'s own POST `.../file/copy`
     * route exactly: the destination is always server-computed (`nextAvailableFileName`'s `name-1`,
     * `name-2`, … suffix scheme), never operator-chosen, so unlike `theme_rename_file` there is no
     * second input to validate. Offered for every file group, including `script`/`other` (read-only-
     * to-EDIT, not read-only-to-copy) — duplicating bytes under a new name changes nothing about the
     * original and nothing anything else references, so it carries none of the risk a script's
     * content-edit block exists to prevent.
     */
    theme_copy_file: async (ctx) => {
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
        copyThemeFile({ themeDir: theme.dir, themesRoot: routeDeps.themesDir, sourcePath, destPath });
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
    },

    /** Reversibly moves a writable file into the theme's .trash folder after authorization. */
    theme_trash_file: async (ctx) => {
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
    },

    theme_restore_trashed_file: async (ctx) => {
      const input = requireInputRecord({ input: ctx.input });
      const themeId = requireString({ input: input, key: "themeId" });
      const trashedPath = requireString({ input: input, key: "trashedPath" });
      const explicitRestoreTo = optionalString({ input: input, key: "restoreTo" });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: THEME_WRITE_PERMISSION }, { entityType: "theme", entityId: themeId });

      return withSchemaOnRejection({ toolId: "theme_restore_trashed_file", catalog: CATALOG_BY_ID, isShapeRejection: ({ error }) => isShapeRejection({ error }), fn: async () => {
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
      } });
    },
  };

  // Every handler here reads the roster, and another process (the web server's admin Duplicate or
  // Trash, a second daemon, a CLI) may have changed the themes folder since this one last looked —
  // so each call syncs first: an id created elsewhere is found, an id trashed elsewhere is not.
  // No-op when nothing changed. See `theme-roster-sync.ts`.
  const syncedHandlers = Object.fromEntries(Object.entries(handlers).map(([id, handler]): [string, ToolHandler] => [id, (ctx, options) => {
    syncThemeRoster({ themes: routeDeps.themes, themesDir: routeDeps.themesDir });
    return handler(ctx, options);
  }]));

  return protectThemeFileTools({ deps: routeDeps, catalog: CATALOG_BY_ID, registrations: buildDomainRegistrations({ metadata: toolMetadata,
    domain: "themes",
    catalogModule: "features/theme/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers: syncedHandlers,
    derivedRisk: themesDerivedRisk,
    inputNormalizers: { theme_read_file: normalizeThemeReadInput },
  }) });
}

/**
 * Contributes Themes's AI tools; called once by the composition root's
 * `installFirstPartyToolContributors()`, never as an import side effect.
 * Registration is a composition-root effect; feature imports must not reach back into the assistant.
 */
export function contributeThemesTools(): ToolContributor<ThemeToolDeps, AssistantSurfaceDeps> {
  return { domain: "themes", build: buildThemesRegistrations, risk: themesDerivedRisk };
}
