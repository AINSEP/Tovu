/** Shared theme file gates and live reload, independent of tool registration. */
import type { AuthorizeFn } from "@jini-ai/cms/core";
import { isGeneratedThemePath, resolveThemeFileWriteScope, ThemePathError } from "./theme-files.js";
import { isInsideCompiledSourceDir, isSourceDirWritableExtension, isTrashedThemePath } from "./file-identity-lock.js";
import { loadTheme, type DiscoveredTheme } from "./theme.js";
import { requestThemePreviewRefresh } from "./preview-refresh.js";

export { THEME_WRITE_PERMISSION } from "./agent-tools.js";
export {
  resolveThemeFilePath,
  writeThemeBinaryFile,
  nextAvailableFileName,
} from "./theme-files.js";
export {
  sniffThemeImportType,
  THEME_IMPORT_MAX_BYTES,
  THEME_IMPORT_POLICY,
  THEME_IMPORT_ACCEPT,
} from "./theme-file-import.js";

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
  /** Stored selection reader, wired to presentation's resolveActiveThemeId by the host. */
  resolveActiveThemeId: () => Promise<string>;
  /**
   * Boot-discovered themes (built-in + site `themes/` dir). Mutated in place by
   * `theme_write_file` — see that handler's own comment — so this is `DiscoveredTheme[]`, not a
   * readonly array, mirroring `RouteDeps.themes`'s identical mutable-array contract.
   */
  themes: DiscoveredTheme[];
  themesDir: string;
  /** Design C — the package's own read-only catalog fallback; see
   *  `RouteDeps.packageThemesDir`'s own doc (`server/routes/types.ts`) for the full rationale.
   *  Optional: `undefined` for any caller that predates this field, structurally satisfied by every
   *  existing `RouteDeps`-shaped test fixture without a source change. */
  packageThemesDir?: string;
}

/** Raised when `themeId` names no discovered theme. Its own class so the handler layer can decorate
 * it with the published schema — a wrong id is a shape problem a different input fixes. */
export class ThemeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeNotFoundError";
  }
}

/** Raised when `theme_write_file`/`theme_edit_file` targets a BUILT theme's generated tree — ADR-020
 * §5's "editor-read-only" half of the lifecycle split. A different `path` (inside `build.sourceDir`,
 * or `theme.json`) is exactly what would fix this, so it is a shape rejection like
 * {@link ThemePathError}. */
export class ThemeFileReadOnlyError extends Error {
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
export class ThemeFileEditMatchError extends Error {
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
export class ThemeFileNoOriginalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeFileNoOriginalError";
  }
}

/** Raised when `theme_reset_file`'s theme HAS a stored original but {@link themeOriginalResetRefusal}
 * refuses it: saved under a different layout version than the live theme, or with an unreadable
 * `theme.json`. Its own class rather than {@link ThemeFileNoOriginalError}, so which check fired stays
 * clear. Retrying with the same input cannot succeed, so it is a shape rejection like that class; the
 * other bucket reaches the agent as a redacted internal failure, and the agent needs this message. */
export class ThemeOriginalLayoutMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeOriginalLayoutMismatchError";
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
export class ThemeFileIdentityLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeFileIdentityLockedError";
  }
}

/** Errors a DIFFERENT input would fix, and therefore worth publishing the schema back with. A
 * genuine I/O failure (a permission-denied disk, a full volume) is not one of these and propagates
 * undecorated, because retrying with different arguments would not help. */
export function isShapeRejection(error: unknown): boolean {
  return [ThemePathError, ThemeNotFoundError, ThemeFileReadOnlyError, ThemeFileEditMatchError,
    ThemeFileIdentityLockedError, ThemeFileNoOriginalError, ThemeOriginalLayoutMismatchError]
    .some(ErrorType => error instanceof ErrorType);
}

export function findThemeOrThrow(routeDeps: ThemeToolDeps, themeId: string): DiscoveredTheme {
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
export function assertThemeFileWritable(theme: DiscoveredTheme, relativePath: string): void {
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
  // Same disjoint sourceDir rule `explore.ts`'s HTTP PUT route enforces (`isPutWritable`): inside a
  // compiled theme's `build.sourceDir`, ONLY the framework-source extension allowlist decides —
  // falling back to the group-based checks above would silently readmit an extension (e.g. `.js`)
  // the sourceDir allowlist exists to exclude. Without this, `theme_write_file`/`theme_edit_file`
  // could write straight past the PUT route's own gate on the identical compiled-theme path.
  if (isInsideCompiledSourceDir(theme, relativePath, writeScope) && !isSourceDirWritableExtension(relativePath)) {
    throw new ThemeFileReadOnlyError(
      `'${relativePath}' is read-only: only framework source extensions can be written inside a compiled theme's build.sourceDir`
    );
  }
}

/**
 * Re-validate `themeId` through the SAME `loadTheme()` boot-time discovery uses, and swap the result
 * into the live `routeDeps.themes` array in place — the one piece of live-state coupling every write
 * tool in this domain shares (`theme_write_file`'s own header explains why: the running site serves
 * out of this array, not off disk, so skipping this makes a successful write invisible to the next
 * page view). Returns the reloaded theme so the caller can report its `status`/`errors` in the same
 * turn.
 */
export function reloadThemeInPlace(routeDeps: ThemeToolDeps, theme: DiscoveredTheme, themeId: string): DiscoveredTheme {
  const reloaded = loadTheme({ themeDir: theme.dir, id: themeId, source: theme.source });
  const index = routeDeps.themes.findIndex((t) => t.manifest.id === themeId);
  if (index >= 0) routeDeps.themes[index] = reloaded;
  requestThemePreviewRefresh({ themesDir: routeDeps.themesDir });
  return reloaded;
}

