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
 * (`server/routes/admin/presentation/patch-active-theme.ts`, `server/routes/admin/themes/list.ts`)
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
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  type AuthorizeFn,
  buildDomainRegistrations,
  indexCatalogById,
  optionalString,
  requireInputRecord,
  requireString,
  requireToolPermission,
  withSchemaOnRejection,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";
import { buildConfirmationSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";
import type { ToolContributor } from "#src/assistant/index";
import {
  createSurfaceExchangeStore,
  resolveConfirmationDecision,
  SURFACE_EXCHANGE_ID_PARAM,
  type AssistantSurfaceDeps,
  type SurfaceExchange,
} from "../../contracts/core/tool-surface-exchanges.js";
import {
  getThemesAgentToolCatalog,
  THEME_READ_PERMISSION,
  THEME_WRITE_PERMISSION,
} from "./agent-tools.js";
import {
  copyThemeFile,
  isGeneratedThemePath,
  listThemeFiles,
  MAX_THEME_FILE_BYTES,
  nextAvailableFileName,
  readThemeFile,
  renameThemeFile,
  resetThemeFileToOriginal,
  resolveThemeFileWriteScope,
  ThemePathError,
  writeThemeFile,
} from "./theme-files.js";
import { loadTheme, THEME_CATALOG_DIR, type DiscoveredTheme } from "./theme.js";
// The shared "can this file's identity (name/existence) change" gate — same-module sibling import
// (this file lives inside `features/theme`, so a direct import is the module's own internal wiring,
// not a deep-import-from-outside the `no-deep-imports:features/theme` rule polices). `explore.ts`'s
// HTTP rename/delete routes call the exact same function — see `file-identity-lock.ts`'s own header
// for why the decision had to live here rather than in `explore.ts` alongside its original home.
import {
  fileExtension,
  isTrashedThemePath,
  originalPathFromTrashedPath,
  trashDestinationFor,
  validateFileIdentityChange,
} from "./file-identity-lock.js";

const CATALOG_BY_ID = indexCatalogById(getThemesAgentToolCatalog());

/**
 * The exact slice of the route-deps bag Themes' tool handlers read. Declared structurally (rather
 * than importing `server/routes/types`'s `RouteDeps`) so this module carries no back-edge into the
 * composition root — the same reason `core/tools/registration-kit.ts`'s `requireToolPermission`
 * takes a bare `{ authorize, workspaceId }` shape instead of the whole deps bag. `server/routes/*`
 * satisfies this structurally by passing its existing `RouteDeps` object; nothing there changes.
 */
export interface ThemeToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  /**
   * Boot-discovered themes (built-in + site `themes/` dir). Mutated in place by
   * `theme_write_file` — see that handler's own comment — so this is `DiscoveredTheme[]`, not a
   * readonly array, mirroring `RouteDeps.themes`'s identical mutable-array contract.
   */
  themes: DiscoveredTheme[];
  themesDir: string;
}

/** Raised when `themeId` names no discovered theme. Its own class so the handler layer can decorate
 * it with the published schema — a wrong id is a shape problem a different input fixes. */
class ThemeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeNotFoundError";
  }
}

/** Raised when `theme_write_file`/`theme_edit_file` targets a BUILT theme's generated tree — ADR-020
 * §5's "editor-read-only" half of the lifecycle split. A different `path` (inside `build.sourceDir`,
 * or `theme.json`) is exactly what would fix this, so it is a shape rejection like
 * {@link ThemePathError}. */
class ThemeFileReadOnlyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeFileReadOnlyError";
  }
}

/** Raised when `theme_edit_file`'s `oldString` does not match the file's current content exactly
 * once — either zero matches (nothing to replace) or more than one without `replaceAll: true`
 * (which occurrence was meant is genuinely ambiguous, and guessing would risk changing the wrong
 * one). A different `oldString`/`replaceAll` is exactly what would fix this, so it is a shape
 * rejection like {@link ThemePathError}. */
class ThemeFileEditMatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeFileEditMatchError";
  }
}

/** Raised when `theme_reset_file` has nothing to reset FROM — either this theme has no stored
 * original at all (a hand-authored theme, never installed from a catalog copy), or this particular
 * file has no original of its own (added after install, e.g. via `theme_copy_file`). A different
 * `themeId`/`path` is what would fix the second case; the first is a property of the theme itself —
 * either way, retrying with the SAME input cannot succeed, so this is a shape rejection like
 * {@link ThemePathError}, matching `explore.ts`'s own `NO_ORIGINAL`/`NOT_IN_ORIGINAL` HTTP codes for
 * the identical two refusals on its per-file reset route. */
class ThemeFileNoOriginalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeFileNoOriginalError";
  }
}

/** Raised when `theme_rename_file`/`theme_trash_file` targets a path
 * {@link validateFileIdentityChange} refuses to let change identity — a theme's own required file,
 * a `script`/`other`-group file, or (message-only overlap with {@link ThemeFileReadOnlyError}'s own
 * concern) a built theme's generated tree. Kept as its OWN class rather than reusing
 * {@link ThemeFileReadOnlyError}: that class's existing callers (`theme_write_file`/`theme_edit_file`)
 * mean specifically "this ADR-020 generated-tree write is refused," and folding the identity-lock's
 * three DIFFERENT reasons into the same class would blur which check actually fired. A different
 * `path` is exactly what would fix this, so it is a shape rejection like {@link ThemePathError}. */
class ThemeFileIdentityLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeFileIdentityLockedError";
  }
}

/** Errors a DIFFERENT input would fix, and therefore worth publishing the schema back with. A
 * genuine I/O failure (a permission-denied disk, a full volume) is not one of these and propagates
 * undecorated, because retrying with different arguments would not help. */
function isShapeRejection(error: unknown): boolean {
  return (
    error instanceof ThemePathError ||
    error instanceof ThemeNotFoundError ||
    error instanceof ThemeFileReadOnlyError ||
    error instanceof ThemeFileEditMatchError ||
    error instanceof ThemeFileIdentityLockedError ||
    error instanceof ThemeFileNoOriginalError
  );
}

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

function findThemeOrThrow(routeDeps: ThemeToolDeps, themeId: string): DiscoveredTheme {
  const theme = routeDeps.themes.find((t) => t.manifest.id === themeId);
  if (!theme) {
    const known = routeDeps.themes.map((t) => t.manifest.id).join(", ") || "(none discovered)";
    throw new ThemeNotFoundError(`theme '${themeId}' was not found — discovered themes are: ${known}`);
  }
  return theme;
}

/**
 * The three refusals `theme_write_file` and `theme_edit_file` both need to check BEFORE touching
 * disk — pulled into one function once a second write-path tool needed the identical checks, so
 * there is exactly one place that decides "can this path be written at all" rather than copies that
 * could drift. The ADR-020/`preview/` pair is unchanged from `theme_write_file`'s own original inline
 * comments (git history); the `.trash/` refusal is new (2026-08-30, soft-delete) — see
 * `file-identity-lock.ts`'s `TRASH_DIR_NAME` doc for why writing directly into trash has to be
 * refused rather than merely left unlikely: `theme_restore_trashed_file` is the only sanctioned door
 * back out, and an agent that could `theme_write_file`/`theme_edit_file` a `.trash/...` path in place
 * would have a second, unaudited way to mutate what is supposed to be inert, already-soft-deleted
 * content.
 */
function assertThemeFileWritable(theme: DiscoveredTheme, relativePath: string): void {
  const writeScope = resolveThemeFileWriteScope({ manifest: theme.manifest, relativePath });
  if (writeScope.kind === "generated-readonly") {
    throw new ThemeFileReadOnlyError(`'${relativePath}' is read-only: ${writeScope.reason}`);
  }
  if (isGeneratedThemePath(relativePath)) {
    throw new ThemeFileReadOnlyError(
      `'${relativePath}' is read-only: this file is generated output (build-preview.mjs's own preview tree); it is not real theme source and is silently overwritten on the next preview build — edit the file it derives from instead`
    );
  }
  if (isTrashedThemePath(relativePath)) {
    throw new ThemeFileReadOnlyError(
      `'${relativePath}' is inside the trash and cannot be written to directly — restore it first with theme_restore_trashed_file`
    );
  }
}

/** `theme`'s folder inside the originals catalog — the one place `theme_reset_file` reads from and
 *  compares against. */
function catalogDirFor(routeDeps: ThemeToolDeps, theme: DiscoveredTheme): string {
  return join(routeDeps.themesDir, THEME_CATALOG_DIR, theme.manifest.tier, theme.manifest.id);
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
 * @throws {ThemeFileNoOriginalError} If this theme has no catalog directory at all, or the catalog
 * has no regular file at this path (including a path that escapes the catalog folder).
 */
function resetFromOriginalForTool(
  routeDeps: ThemeToolDeps,
  theme: DiscoveredTheme,
  relativePath: string
): { wasModified: boolean; bytes: number } {
  const catalogDir = catalogDirFor(routeDeps, theme);
  if (!existsSync(catalogDir)) {
    throw new ThemeFileNoOriginalError(`theme '${theme.manifest.id}' has no stored original, so nothing can be reset`);
  }
  const reset = resetThemeFileToOriginal({
    themeDir: theme.dir,
    themesRoot: routeDeps.themesDir,
    originalDir: catalogDir,
    originalsRoot: join(routeDeps.themesDir, THEME_CATALOG_DIR),
    relativePath,
  });
  if (!reset) {
    throw new ThemeFileNoOriginalError(`'${relativePath}' is not in this theme's original, so there is nothing to reset it to`);
  }
  return reset;
}

/**
 * Re-validate `themeId` through the SAME `loadTheme()` boot-time discovery uses, and swap the result
 * into the live `routeDeps.themes` array in place — the one piece of live-state coupling every write
 * tool in this domain shares (`theme_write_file`'s own header explains why: the running site serves
 * out of this array, not off disk, so skipping this makes a successful write invisible to the next
 * page view). Returns the reloaded theme so the caller can report its `status`/`errors` in the same
 * turn.
 */
function reloadThemeInPlace(routeDeps: ThemeToolDeps, theme: DiscoveredTheme, themeId: string): DiscoveredTheme {
  const reloaded = loadTheme({ themeDir: theme.dir, id: themeId, source: theme.source });
  const index = routeDeps.themes.findIndex((t) => t.manifest.id === themeId);
  if (index >= 0) routeDeps.themes[index] = reloaded;
  return reloaded;
}

/** How many times `needle` occurs in `haystack`, as a plain literal substring (never a regex) — the
 *  same counting trick `split(needle).length - 1` uses everywhere else a literal (not regex) count
 *  is wanted, avoiding any need to escape `needle` for a regex engine. */
function countOccurrences(haystack: string, needle: string): number {
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
  currentContent: string,
  edit: { oldString: string; newString: string; replaceAll: boolean },
  relativePath: string
): string {
  const occurrences = countOccurrences(currentContent, edit.oldString);
  if (occurrences === 0) {
    throw new ThemeFileEditMatchError(
      `oldString was not found in '${relativePath}' — read the file with theme_read_file and copy the exact text to replace, including whitespace`
    );
  }
  if (occurrences > 1 && !edit.replaceAll) {
    throw new ThemeFileEditMatchError(
      `oldString matches ${occurrences} times in '${relativePath}'; pass more surrounding context in oldString to make it unique, or replaceAll: true to change every occurrence`
    );
  }
  return edit.replaceAll
    ? currentContent.split(edit.oldString).join(edit.newString)
    : currentContent.replace(edit.oldString, edit.newString);
}

/** `name` is a bare filename, not a path — mirrors `explore.ts`'s `validateRenameTargetName` (the
 *  HTTP rename route's identical check on the identical input shape); kept as its own small
 *  duplicate here rather than a third shared module, since it is a 3-line, dependency-free input
 *  check with nothing else to drift out of sync. `null` means `name` is valid. */
function invalidRenameTargetNameReason(name: string): string | null {
  if (name.length === 0) return "name is required";
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
 * @returns The path the file ends up at (`sourcePath` unchanged, for the deliberate no-op case).
 */
function performThemeFileRename(
  routeDeps: ThemeToolDeps,
  theme: DiscoveredTheme,
  paths: { sourcePath: string; destPath: string; name: string },
  existingPaths: ReadonlySet<string>
): string {
  const { sourcePath, destPath, name } = paths;
  if (destPath === sourcePath) return sourcePath;

  if (existingPaths.has(destPath)) {
    throw new ThemePathError(`'${destPath}' already exists in this theme`);
  }
  if (fileExtension(sourcePath) !== fileExtension(destPath)) {
    throw new ThemePathError(
      `renaming '${sourcePath}' to '${name}' would change its extension, which is not allowed — a file's extension decides how it is served and must not change via rename`
    );
  }
  // Defense-in-depth, not currently reachable: `destPath` is always built from `sourcePath`'s OWN
  // directory (`name` may not contain `/`), so its write-scope is provably identical to
  // `sourcePath`'s already-checked one. Asserted directly anyway, matching `explore.ts`'s own
  // identical comment on this exact check.
  const destWriteScope = resolveThemeFileWriteScope({ manifest: theme.manifest, relativePath: destPath });
  if (destWriteScope.kind === "generated-readonly") {
    throw new ThemeFileReadOnlyError(`'${destPath}' is read-only: ${destWriteScope.reason}`);
  }

  renameThemeFile({ themeDir: theme.dir, themesRoot: routeDeps.themesDir, sourcePath, destPath });
  return destPath;
}

const THEME_TRASH_TOOL_ID = "theme_trash_file";

/** The `ui://` URI for one trash-confirmation instance — keyed by the exchange id. A theme file has
 *  no version/row to key against the way a post does, mirroring `source-control/tool-registrations.ts`'s
 *  `commitConfirmationUri` reasoning. */
function trashConfirmationUri(exchangeId: string): UIResourceUri {
  return `ui://tovu/theme-trash-file/${exchangeId}` as UIResourceUri;
}

/**
 * Renders `theme_trash_file`'s confirmation dialog directly from the model's own input — no entity
 * read is needed to describe it truthfully (unlike `content_post_delete`/`comments_trash_comment`):
 * `themeId`/`path` ARE the whole of what a human needs to see to consent, and are shown back exactly
 * as the model supplied them. If either turns out to be invalid, that surfaces as the ordinary thrown
 * error AFTER confirmation, same as before this gate existed — nothing destructive happens either way.
 *
 * @complexity O(1).
 */
function buildTrashConfirmationResource(spec: { themeId: string; path: string; exchangeId: string }): UIResource {
  const { themeId, path, exchangeId } = spec;
  return buildConfirmationSurface({
    uri: trashConfirmationUri(exchangeId),
    title: "Trash this theme file?",
    description: "The file will be moved into the theme's .trash/ folder. It can be restored with theme_restore_trashed_file.",
    details: [
      { label: "Theme", value: themeId },
      { label: "Path", value: path },
    ],
    danger: true,
    confirm: {
      label: "Trash file",
      toolName: THEME_TRASH_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" },
    },
    cancel: {
      label: "Cancel",
      toolName: THEME_TRASH_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "cancel" },
    },
    app: { appName: "tovu-theme-trash-file", appVersion: "1" },
    preferredFrameSize: ["100%", "320px"],
  });
}

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually does.
 * See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own `sideEffects`
 * declaration.
 */
export const themesDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> routeDeps.themes.map(): reads already-discovered in-memory state, no I/O at all.
  ["theme_list", "none"],
  // -> listThemeFiles(): readdir under one theme folder, no writes.
  ["theme_list_files", "none"],
  // -> readThemeFile(): one readFileSync under one theme folder, no writes.
  ["theme_read_file", "none"],
  // -> writeThemeFile(): mkdir + writeFileSync on disk, then loadTheme() + in-place replacement of
  //    the live routeDeps.themes entry. Durable on both counts.
  ["theme_write_file", "mutates-durable-state"],
  // -> readThemeFile() + writeThemeFile(): same durable write as theme_write_file, just computed
  //    from a read instead of taking the whole content as input.
  ["theme_edit_file", "mutates-durable-state"],
  // -> resetThemeFileToOriginal(): a byte compare against the catalog copy, then copyFileSync to a
  //    temp file renamed over the live file when the bytes differ, then loadTheme() + in-place
  //    replacement. Same durable write as theme_write_file, just sourced from the theme's own stored
  //    original instead of caller-supplied content. An already-pristine file is not written.
  ["theme_reset_file", "mutates-durable-state"],
  // -> renameThemeFile(): renameSync on disk, then loadTheme() + in-place replacement. Durable.
  ["theme_rename_file", "mutates-durable-state"],
  // -> copyThemeFile(): copyFileSync creating a NEW file on disk, then loadTheme() + in-place
  //    replacement. Durable, same class as theme_write_file's own create-or-overwrite.
  ["theme_copy_file", "mutates-durable-state"],
  // -> renameThemeFile() into .trash/: same durable move as theme_rename_file, just to a
  //    system-computed destination. Reversible (theme_restore_trashed_file), but still a disk write.
  ["theme_trash_file", "mutates-durable-state"],
  // -> renameThemeFile() out of .trash/: the mirror-image move. Durable.
  ["theme_restore_trashed_file", "mutates-durable-state"],
]);

export function buildThemesRegistrations(
  routeDeps: ThemeToolDeps,
  surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore() },
): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    theme_list: async (ctx) => {
      const input = requireInputRecord(ctx.input ?? {});
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: THEME_READ_PERMISSION,
        entityType: "theme",
      });

      const tier = optionalString(input, "tier");
      const status = optionalString(input, "status");
      const themes = routeDeps.themes
        .filter((t) => (tier ? t.manifest.tier === tier : true))
        .filter((t) => (status ? t.status === status : true))
        .map(toThemeToolView);
      return { themes };
    },

    theme_list_files: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const themeId = requireString(input, "themeId");
      const includeTrash = input.includeTrash === true;
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: THEME_READ_PERMISSION,
        entityType: "theme",
        entityId: themeId,
      });

      return withSchemaOnRejection({ toolId: "theme_list_files", catalog: CATALOG_BY_ID, isShapeRejection }, async () => {
        const theme = findThemeOrThrow(routeDeps, themeId);
        const files = listThemeFiles({ themeDir: theme.dir, themesRoot: routeDeps.themesDir });
        // Trashed files are hidden by default (2026-08-30 soft-delete requirement: a trashed file
        // must not surface as a file-list entry) — `includeTrash: true` is the deliberate escape
        // hatch an agent needs to discover what it can restore.
        return { themeId, files: includeTrash ? files : files.filter((path) => !isTrashedThemePath(path)) };
      });
    },

    theme_read_file: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const themeId = requireString(input, "themeId");
      const relativePath = requireString(input, "path");
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: THEME_READ_PERMISSION,
        entityType: "theme",
        entityId: themeId,
      });

      return withSchemaOnRejection({ toolId: "theme_read_file", catalog: CATALOG_BY_ID, isShapeRejection }, async () => {
        const theme = findThemeOrThrow(routeDeps, themeId);
        const content = readThemeFile({ themeDir: theme.dir, themesRoot: routeDeps.themesDir, relativePath });
        return { themeId, path: relativePath, content };
      });
    },

    theme_write_file: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const themeId = requireString(input, "themeId");
      const relativePath = requireString(input, "path");
      const content = requireString(input, "content");
      // Only the boolean `true` opts in, the same way `theme_edit_file` reads `replaceAll`.
      const overwriteOversized = input.overwriteOversized === true;
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: THEME_WRITE_PERMISSION,
        entityType: "theme",
        entityId: themeId,
      });

      return withSchemaOnRejection({ toolId: "theme_write_file", catalog: CATALOG_BY_ID, isShapeRejection }, async () => {
        const theme = findThemeOrThrow(routeDeps, themeId);

        // ADR-020 §5 generated-tree refusal + the `preview/` security-parity refusal (2026-08-18) —
        // both checked BEFORE any filesystem write, so a rejected write never touches disk. See
        // `assertThemeFileWritable`'s own doc; shared with `theme_edit_file` below.
        assertThemeFileWritable(theme, relativePath);

        writeThemeFile({ themeDir: theme.dir, themesRoot: routeDeps.themesDir, relativePath, content }, { overwriteOversized });

        // Re-validate through the SAME `loadTheme()` a boot-time discovery uses — the whole point of
        // this domain's safety argument is that an agent-authored file is validated identically to a
        // human-authored one, so re-running the real loader (rather than a bespoke "check what we
        // just wrote" path) is what makes that true rather than merely claimed.
        const reloaded = reloadThemeInPlace(routeDeps, theme, themeId);

        return {
          themeId,
          path: relativePath,
          bytesWritten: Buffer.byteLength(content, "utf8"),
          status: reloaded.status,
          errors: reloaded.errors,
          theme: toThemeToolView(reloaded),
        };
      });
    },

    theme_edit_file: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const themeId = requireString(input, "themeId");
      const relativePath = requireString(input, "path");
      const oldString = requireString(input, "oldString");
      const newString = requireString(input, "newString");
      const replaceAll = input.replaceAll === true;
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: THEME_WRITE_PERMISSION,
        entityType: "theme",
        entityId: themeId,
      });

      return withSchemaOnRejection({ toolId: "theme_edit_file", catalog: CATALOG_BY_ID, isShapeRejection }, async () => {
        const theme = findThemeOrThrow(routeDeps, themeId);

        // Same two ADR-020/`preview/` refusals `theme_write_file` checks, and for the identical
        // reason — a partial edit is still a write, and must be refused BEFORE reading the file so
        // an agent gets one clear reason rather than a read that then turns out pointless.
        assertThemeFileWritable(theme, relativePath);

        const currentContent = readThemeFile({ themeDir: theme.dir, themesRoot: routeDeps.themesDir, relativePath });
        const nextContent = applyThemeFileEdit(currentContent, { oldString, newString, replaceAll }, relativePath);
        const occurrencesReplaced = replaceAll ? countOccurrences(currentContent, oldString) : 1;

        writeThemeFile({ themeDir: theme.dir, themesRoot: routeDeps.themesDir, relativePath, content: nextContent });
        const reloaded = reloadThemeInPlace(routeDeps, theme, themeId);

        return {
          themeId,
          path: relativePath,
          occurrencesReplaced,
          bytesWritten: Buffer.byteLength(nextContent, "utf8"),
          status: reloaded.status,
          errors: reloaded.errors,
          theme: toThemeToolView(reloaded),
        };
      });
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
      const input = requireInputRecord(ctx.input);
      const themeId = requireString(input, "themeId");
      const relativePath = requireString(input, "path");
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: THEME_WRITE_PERMISSION,
        entityType: "theme",
        entityId: themeId,
      });

      return withSchemaOnRejection({ toolId: "theme_reset_file", catalog: CATALOG_BY_ID, isShapeRejection }, async () => {
        const theme = findThemeOrThrow(routeDeps, themeId);

        // Same three refusals theme_write_file/theme_edit_file check — a reset is still a write, and
        // this also correctly refuses a compiled theme's generated tree (see this handler's own doc)
        // and a `.trash/...` path (restore it first with theme_restore_trashed_file).
        assertThemeFileWritable(theme, relativePath);

        // Byte comparison against the catalog copy, never mtime or size alone, then a byte copy only
        // when they differ.
        const { wasModified, bytes } = resetFromOriginalForTool(routeDeps, theme, relativePath);
        // Reloaded even when nothing was written: `status`/`errors` report the theme as it is on disk
        // now, and this process's snapshot is stale whenever a different process wrote the theme.
        const reloaded = reloadThemeInPlace(routeDeps, theme, themeId);

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
      });
    },

    theme_rename_file: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const themeId = requireString(input, "themeId");
      const relativePath = requireString(input, "path");
      const name = requireString(input, "name");
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: THEME_WRITE_PERMISSION,
        entityType: "theme",
        entityId: themeId,
      });

      return withSchemaOnRejection({ toolId: "theme_rename_file", catalog: CATALOG_BY_ID, isShapeRejection }, async () => {
        const theme = findThemeOrThrow(routeDeps, themeId);

        // A trashed file is restored (theme_restore_trashed_file), never renamed in place — renaming
        // inside `.trash/` would leave `theme_trash_file`'s own response (`trashedPath`) pointing at
        // nothing, with no benefit over restoring to the name the caller actually wants.
        if (isTrashedThemePath(relativePath)) {
          throw new ThemePathError(`'${relativePath}' is inside the trash — restore it first with theme_restore_trashed_file`);
        }

        const nameError = invalidRenameTargetNameReason(name);
        if (nameError) throw new ThemePathError(nameError);

        // The ONE shared gate `explore.ts`'s HTTP rename route also calls — see
        // `file-identity-lock.ts`'s own header for why the decision lives there now. Refuses a
        // theme's own required files, a built theme's generated tree, and `script`/`other`-group
        // files (nothing tracks what still references a file by its old name).
        const writeScope = resolveThemeFileWriteScope({ manifest: theme.manifest, relativePath });
        const lock = validateFileIdentityChange(theme, relativePath, writeScope, "renamed");
        if (lock) throw new ThemeFileIdentityLockedError(lock.error);

        const existingPaths = new Set(listThemeFiles({ themeDir: theme.dir, themesRoot: routeDeps.themesDir }));
        if (!existingPaths.has(relativePath)) {
          throw new ThemePathError(`file '${relativePath}' does not exist in this theme`);
        }

        const slash = relativePath.lastIndexOf("/");
        const destPath = slash === -1 ? name : `${relativePath.slice(0, slash)}/${name}`;
        const finalPath = performThemeFileRename(routeDeps, theme, { sourcePath: relativePath, destPath, name }, existingPaths);

        const reloaded = reloadThemeInPlace(routeDeps, theme, themeId);

        return {
          themeId,
          path: finalPath,
          renamedFrom: relativePath,
          status: reloaded.status,
          errors: reloaded.errors,
          theme: toThemeToolView(reloaded),
        };
      });
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
      const input = requireInputRecord(ctx.input);
      const themeId = requireString(input, "themeId");
      const sourcePath = requireString(input, "path");
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: THEME_WRITE_PERMISSION,
        entityType: "theme",
        entityId: themeId,
      });

      return withSchemaOnRejection({ toolId: "theme_copy_file", catalog: CATALOG_BY_ID, isShapeRejection }, async () => {
        const theme = findThemeOrThrow(routeDeps, themeId);

        // Same refusal every other write-shaped tool in this domain checks — duplicating INTO a
        // built theme's generated tree is a write, just phrased as "copy"; duplicating a file
        // currently in `.trash/...` is refused too (restore it first), tightening the one case
        // `explore.ts`'s own HTTP copy route does not itself check — see `assertThemeFileWritable`'s
        // own doc for why one shared gate is what keeps every write-shaped tool here in agreement.
        assertThemeFileWritable(theme, sourcePath);

        const existingPaths = new Set(listThemeFiles({ themeDir: theme.dir, themesRoot: routeDeps.themesDir }));
        if (!existingPaths.has(sourcePath)) {
          throw new ThemePathError(`file '${sourcePath}' was not found in this theme`);
        }

        const destPath = nextAvailableFileName({ desiredPath: sourcePath, existingPaths });
        copyThemeFile({ themeDir: theme.dir, themesRoot: routeDeps.themesDir, sourcePath, destPath });
        const reloaded = reloadThemeInPlace(routeDeps, theme, themeId);

        return {
          themeId,
          path: destPath,
          copiedFrom: sourcePath,
          status: reloaded.status,
          errors: reloaded.errors,
          theme: toThemeToolView(reloaded),
        };
      });
    },

    /**
     * The MCP-UI-gated trash — migrated onto the shared held-open confirmation exchange (2026-09-08,
     * ADS-memory/reports/2026-09-08-delete-confirmation-build.md). No pre-dialog entity read: the
     * dialog is built directly from `themeId`/`path`, which is already the whole truth a human needs
     * to consent to (see `buildTrashConfirmationResource`'s own doc). All validation — theme lookup,
     * already-trashed check, identity-lock, generated-readonly check — runs exactly once, AFTER
     * confirmation, in the same place it always ran; there is nothing to re-validate for staleness
     * since it was never validated before the dialog in the first place.
     */
    theme_trash_file: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const themeId = requireString(input, "themeId");
      const relativePath = requireString(input, "path");
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: THEME_WRITE_PERMISSION,
        entityType: "theme",
        entityId: themeId,
      });

      return withSchemaOnRejection({ toolId: "theme_trash_file", catalog: CATALOG_BY_ID, isShapeRejection }, async () => {
        if (!ctx.emitSurface) {
          throw new Error(
            "theme_trash_file: this execution context has no interactive confirmation channel " +
              "(no emitSurface), so a destructive trash cannot be gated here. Nothing was trashed."
          );
        }

        const exchange: SurfaceExchange = surfaces.surfaceExchanges.open(
          { toolId: THEME_TRASH_TOOL_ID, principalId: ctx.principal.id },
          ctx.emitSurface
        );
        const ui = buildTrashConfirmationResource({ themeId, path: relativePath, exchangeId: exchange.id });

        const closeOnAbort = () => exchange.close();
        ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
        try {
          const outcome = await resolveConfirmationDecision(exchange, { channel: "mcp-ui", payload: { resource: ui } });
          if (!outcome.confirmed) {
            if (outcome.reason === "declined") {
              return { trashed: false, cancelled: true, themeId, path: relativePath };
            }
            return {
              trashed: false,
              cancelled: false,
              reason: outcome.reason,
              note:
                outcome.reason === "expired"
                  ? "The user did not respond to the confirmation dialog before it expired. Nothing was trashed."
                  : "The confirmation dialog was closed because the run ended. Nothing was trashed.",
            };
          }

          const theme = findThemeOrThrow(routeDeps, themeId);

          if (isTrashedThemePath(relativePath)) {
            throw new ThemePathError(`'${relativePath}' is already inside the trash`);
          }

          // Soft-delete shares the SAME identity-lock gate rename/hard-delete use — a theme's own
          // required files, a built theme's generated tree, and script/other-group files stay
          // un-trashable, for the identical reasons theme_delete_file was never wired at all (see
          // `agent-tools.ts`'s header — losing a required file still drops the theme to 'invalid',
          // and nothing tracks what still references a script/other file by its old location).
          const writeScope = resolveThemeFileWriteScope({ manifest: theme.manifest, relativePath });
          const lock = validateFileIdentityChange(theme, relativePath, writeScope, "trashed");
          if (lock) throw new ThemeFileIdentityLockedError(lock.error);

          const trashedPath = trashDestinationFor(relativePath);
          // Defense-in-depth, mirroring performThemeFileRename's own destWriteScope check: `.trash/`
          // sits at the theme's ROOT, which is only "editable" for an authored theme (every theme on
          // disk today). For a COMPILED theme, `.trash/` resolves generated-readonly (it is neither
          // `theme.json` nor inside `build.sourceDir`) — trashing is refused outright rather than
          // silently landing an untracked extra inside ADR-020's generated region, where a later
          // "restore the generated tree" call would wipe it without warning.
          const trashWriteScope = resolveThemeFileWriteScope({ manifest: theme.manifest, relativePath: trashedPath });
          if (trashWriteScope.kind === "generated-readonly") {
            throw new ThemeFileReadOnlyError(
              `'${relativePath}' cannot be trashed: this theme is a built release with no writable location outside build.sourceDir/theme.json to move a trashed file into`
            );
          }

          renameThemeFile({ themeDir: theme.dir, themesRoot: routeDeps.themesDir, sourcePath: relativePath, destPath: trashedPath });
          const reloaded = reloadThemeInPlace(routeDeps, theme, themeId);

          return {
            trashed: true,
            cancelled: false,
            themeId,
            path: relativePath,
            trashedPath,
            status: reloaded.status,
            errors: reloaded.errors,
            theme: toThemeToolView(reloaded),
          };
        } finally {
          ctx.signal.removeEventListener("abort", closeOnAbort);
        }
      });
    },

    theme_restore_trashed_file: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const themeId = requireString(input, "themeId");
      const trashedPath = requireString(input, "trashedPath");
      const explicitRestoreTo = optionalString(input, "restoreTo");
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: THEME_WRITE_PERMISSION,
        entityType: "theme",
        entityId: themeId,
      });

      return withSchemaOnRejection({ toolId: "theme_restore_trashed_file", catalog: CATALOG_BY_ID, isShapeRejection }, async () => {
        const theme = findThemeOrThrow(routeDeps, themeId);

        const derivedRestoreTo = originalPathFromTrashedPath(trashedPath);
        if (derivedRestoreTo === null) {
          throw new ThemePathError(`'${trashedPath}' is not a path theme_trash_file ever produced — it must look like '.trash/<number>/<original path>'`);
        }
        const restoreTo = explicitRestoreTo ?? derivedRestoreTo;

        const existingPaths = new Set(listThemeFiles({ themeDir: theme.dir, themesRoot: routeDeps.themesDir }));
        if (!existingPaths.has(trashedPath)) {
          throw new ThemePathError(`'${trashedPath}' does not exist in this theme's trash`);
        }
        if (existingPaths.has(restoreTo)) {
          throw new ThemePathError(`'${restoreTo}' already exists in this theme — pass a different restoreTo, or move/rename the existing file first`);
        }

        // Defense-in-depth, mirroring theme_trash_file's own destination check: an explicit
        // `restoreTo` could otherwise name a location inside a built theme's generated tree.
        const destWriteScope = resolveThemeFileWriteScope({ manifest: theme.manifest, relativePath: restoreTo });
        if (destWriteScope.kind === "generated-readonly") {
          throw new ThemeFileReadOnlyError(`'${restoreTo}' is read-only: ${destWriteScope.reason}`);
        }

        renameThemeFile({ themeDir: theme.dir, themesRoot: routeDeps.themesDir, sourcePath: trashedPath, destPath: restoreTo });
        const reloaded = reloadThemeInPlace(routeDeps, theme, themeId);

        return {
          themeId,
          path: restoreTo,
          restoredFrom: trashedPath,
          status: reloaded.status,
          errors: reloaded.errors,
          theme: toThemeToolView(reloaded),
        };
      });
    },
  };

  return buildDomainRegistrations({
    domain: "themes",
    catalogModule: "features/theme/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: themesDerivedRisk,
  });
}

/**
 * Contributes Themes' AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module.
 *
 * 2026-08-17: Themes was briefly converted to the tool-contribution registry (`contributeThemesTools`,
 * registered via `#src/assistant/index`'s `registerToolContributor`) alongside identity/members/
 * taxonomy/redirects in the same Stage 2 batch, then reverted the same night — `check:architecture`
 * showed it opened a NEW module cycle: `export/route-manifest.ts` imports `#src/features/theme/index`
 * (a `#src/*` subpath import, not a relative one — the reason a plain relative-path grep for this
 * domain's importers missed it beforehand), and `assistant` already reached `export` transitively
 * through its still-static `deployments`/`source-control` `DOMAIN_SLICES` entries. Adding
 * `themes -> assistant` closed a 6-module SCC: `assistant, export, features/deployments,
 * features/source-control, features/theme, features/vendor-credentials`.
 *
 * RETRIED 2026-08-17 (same day, later pass) after `source-control` converted cleanly — `deployments`
 * did NOT convert yet (reverted again on a different edge). Empirically wired `registerToolContributor`
 * here and ran `check:architecture --list`: `source-control` leaving `DOMAIN_SLICES` alone was NOT
 * enough — `deployments` staying static (plus the SAME previously-undocumented
 * `vendor-credentials/store.ts` `extractGitHubLogin` edge that blocked `deployments`/`static-publish`
 * themselves) still gave `assistant` a path into this cluster. Largest strongly-connected component
 * grew 0 -> 5 — `[assistant, export, features/deployments, features/theme,
 * features/vendor-credentials]`. Reverted cleanly instead.
 *
 * RETRIED AND LANDED HERE (2026-08-17, same session) after `deployments`/`static-publish` both
 * converted (see `features/deployments/tool-registrations.ts`'s own header for the
 * `vendor-credentials/store.ts` `extractGitHubLogin` fix that unblocked them). With `deployments`
 * off `DOMAIN_SLICES` too, `assistant` no longer reaches `export` transitively through any
 * still-static `DOMAIN_SLICES` entry — `check:architecture` confirms 0 module cycles / largest SCC
 * 0 with Themes wired this way. `export/route-manifest.ts`'s own `#src/features/theme/index` import
 * is untouched and still real; it simply no longer closes a cycle back to `assistant` now that
 * nothing reachable from `assistant` reaches `export`.
 */
export function contributeThemesTools(): ToolContributor {
  return { domain: "themes", build: buildThemesRegistrations, risk: themesDerivedRisk };
}
