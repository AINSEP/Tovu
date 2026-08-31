import { resolveThemeLayout } from "./theme-layout.js";
import { isPageFilePath, isPartialFilePath } from "./theme-layout.js";
import { isGeneratedThemePath, type ThemeFileWriteScope } from "./theme-files.js";
import type { ThemeManifest } from "./theme.js";

/**
 * @file The shared "can this file's IDENTITY change" gate — extracted (2026-08-30) from
 * `server/inbound/admin-http/routes/themes/explore.ts`, which owned every one of these functions
 * privately until now, so its HTTP rename/delete routes were the ONLY callers. That was fine while
 * rename/delete were human-only operations, but adding `theme_rename_file` as an agent tool
 * (`features/theme/tool-registrations.ts`) meant a second caller needed the identical decision — and
 * `feature-no-server-or-framework-imports` (`.dependency-cruiser.mjs`, `error` severity) forbids a
 * `features/**` module from importing anything under `server/**`, even a type-only edge. There was
 * therefore no way for the agent-tool handlers to reach `explore.ts`'s copy without either violating
 * that boundary or re-deriving the same policy a second time — the exact "two gates that can drift
 * apart" risk `explore.ts`'s own prior doc comments already warned about for
 * `isThemeFileWritable`/`isGeneratedThemePath`. Moving the logic itself down into `features/theme` (a
 * direction `server -> features` already takes everywhere else in this file) resolves both problems
 * at once: `explore.ts` now imports this exactly like every other `features/theme` export it already
 * uses, and `tool-registrations.ts` imports the SAME functions as a same-module sibling.
 *
 * `theme_delete_file` (hard delete) is deliberately NOT one of the agent-tool callers — owner
 * decision 2026-08-30: agents get soft-delete only (`theme_trash_file`/`theme_restore_trashed_file`,
 * below), hard delete stays human-gated through `explore.ts`'s existing, unwidened HTTP route. This
 * module's {@link TRASH_DIR_NAME}/{@link trashDestinationFor}/{@link originalPathFromTrashedPath} are
 * the soft-delete half; the identity-lock gate itself (below) is shared by rename AND trash, exactly
 * as it was already shared by rename and (human) delete.
 *
 * Behavior is unchanged from the code this replaced — this is a relocation, not a rewrite. See
 * {@link validateFileIdentityChange}'s own doc for the three lock reasons, and `explore.ts`'s own
 * `IDENTITY_LOCKED_GROUPS` history (now here) for why `script` stays identity-locked even though its
 * CONTENT became editable (2026-08-29).
 */

/** Every group {@link fileGroup} can return. Renamed from `explore.ts`'s own `ThemeExploreFileGroup`
 *  now that a second module (`features/theme/tool-registrations.ts`) needs it too — `explore.ts`
 *  keeps exporting the old name as a type alias so nothing there had to change. */
export type ThemeFileGroup = "page" | "partial" | "style" | "script" | "config" | "asset" | "other";

/**
 * Media extensions that make up the `asset` group: images, video, audio, and fonts — the file kinds
 * an Explore author might replace but never hand-edits as source. (`.svg` is the one image format
 * also text-readable elsewhere, deliberately — see `explore.ts`'s `TEXT_READABLE_EXTENSIONS`.)
 */
const ASSET_EXTENSIONS = new Set([
  // Images
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".ico", ".bmp", ".tif", ".tiff",
  // Video
  ".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v",
  // Audio
  ".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac",
  // Fonts
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
]);

function isAssetExtension(relativePath: string): boolean {
  const dot = relativePath.lastIndexOf(".");
  return dot === -1 ? false : ASSET_EXTENSIONS.has(relativePath.slice(dot).toLowerCase());
}

/** A path's own extension, lowercased (`""` if none) — the dot must fall after the last slash to
 *  count, matching {@link import("./theme-layout.js")}'s layout paths using the same rule. */
export function fileExtension(relativePath: string): string {
  const dot = relativePath.lastIndexOf(".");
  const slash = relativePath.lastIndexOf("/");
  return dot > slash ? relativePath.slice(dot).toLowerCase() : "";
}

/**
 * Coarse grouping for a theme file, derived from path/extension (plus the theme's own `apiVersion`,
 * for the page/partial cases) alone. See `explore.ts`'s original doc (git history) for the full
 * per-group reasoning; unchanged here, just relocated.
 */
export function fileGroup(relativePath: string, apiVersion: 2 | undefined): ThemeFileGroup {
  if (isPageFilePath(relativePath, apiVersion)) return "page";
  if (relativePath.endsWith(".css")) return "style";
  if (/\.(m|c)?js$/.test(relativePath)) return "script";
  if (/^(theme|tokens|tokens\.light)\.json$/.test(relativePath)) return "config";
  if (isPartialFilePath(relativePath, apiVersion)) return "partial";
  if (isAssetExtension(relativePath)) return "asset";
  return "other";
}

/**
 * Groups whose files can never be RENAMED or DELETED, regardless of content-editability —
 * unchanged from `explore.ts`'s original `IDENTITY_LOCKED_GROUPS`. `script` stays here on purpose
 * even though its CONTENT became editable (2026-08-29): nothing in this codebase tracks cross-file
 * references, so a `<script src="main.js">` (or an `other`-group `<link rel="manifest" ...>`) the
 * operator renamed or deleted would silently 404 on the live page with no way to trace what still
 * points at the old name. `other` stays for the same reason it was never a group an author was asked
 * to touch from Explore at all.
 */
export const IDENTITY_LOCKED_GROUPS: ReadonlySet<ThemeFileGroup> = new Set(["script", "other"]);

/** A framework's own source extensions inside a compiled theme's `build.sourceDir` — see
 *  `explore.ts`'s original `FRAMEWORK_SOURCE_EXTENSIONS`/`SOURCE_DIR_WRITABLE_EXTENSIONS` doc
 *  (git history) for the full browser-executable-content reasoning this excludes `.html`/`.svg`/
 *  `.js`/`.mjs`/`.cjs`/`.webmanifest` for. */
const FRAMEWORK_SOURCE_EXTENSIONS = new Set([".tsx", ".ts", ".jsx", ".vue", ".svelte", ".astro", ".scss", ".less"]);

const SOURCE_DIR_WRITABLE_EXTENSIONS = new Set([...FRAMEWORK_SOURCE_EXTENSIONS, ".css", ".json", ".md", ".txt"]);

/** Whether `relativePath` sits inside a BUILT theme's real, hand-authored source (ADR-020 §5,
 *  `build.sourceDir`) — the LOCATION half of the sourceDir carve-out; unchanged from `explore.ts`'s
 *  original `isInsideCompiledSourceDir`. */
export function isInsideCompiledSourceDir(
  theme: { manifest: Pick<ThemeManifest, "build"> },
  relativePath: string,
  writeScope: ThemeFileWriteScope
): boolean {
  return theme.manifest.build?.source === "compiled" && writeScope.kind === "editable" && relativePath !== "theme.json";
}

/** The extension half of the sourceDir carve-out — unchanged from `explore.ts`'s original
 *  `isSourceDirWritableExtension`. */
export function isSourceDirWritableExtension(relativePath: string): boolean {
  return SOURCE_DIR_WRITABLE_EXTENSIONS.has(fileExtension(relativePath));
}

/**
 * Files `loadTheme` treats as REQUIRED — their absence pushes a load error and flips a theme's
 * `status` to `"invalid"`. Unchanged from `explore.ts`'s original `requiredThemeFiles`; derived from
 * `resolveThemeLayout` so it stays in lockstep with `pagesDir`/`indexPagePath` rather than
 * re-spelling the same path a second time.
 */
export function requiredThemeFiles(apiVersion: 2 | undefined): readonly string[] {
  return resolveThemeLayout(apiVersion).requiredFiles;
}

/**
 * The top-level folder `theme_trash_file` moves a soft-deleted file into (2026-08-30, owner
 * decision: "agent can only do soft-delete and hard-delete is gated by needing a human" — see
 * `tool-registrations.ts`'s `theme_trash_file`/`theme_restore_trashed_file` for the operations that
 * use this).
 *
 * Deliberately NOT the `_unpublished/` convention an earlier agent invented ad hoc the same week to
 * hide a page from public routing (moving its file out of `render/pages/` and dropping it from
 * `theme.json`, entirely outside any audited read/write path — see that convention's own removal,
 * replaced by `ThemeManifest.publishedPages`). The lesson that removal leaves: a new "hidden" location
 * has to be a location every relevant scanner/writer explicitly knows about, not a side channel
 * nothing else is aware of. `.trash/` is that: every discovery loader in `theme.ts` only ever
 * `readdirSync`s a SPECIFIC named folder (`pagesDir`/`partialsDir`/`templatesDir`, never `themeDir`
 * itself), so a `.trash/` folder is invisible to page/partial/template discovery for every tier by
 * construction — but `theme_list_files` and `explore.ts`'s own file list are BOTH updated to filter
 * it out explicitly (not left to accidentally not-show-up), and `assertThemeFileWritable`/
 * `isThemeFileWritable` both refuse writing INTO it directly, so the only doors in or out are
 * `theme_trash_file`/`theme_restore_trashed_file` themselves.
 */
export const TRASH_DIR_NAME = ".trash";

/** Collapse a theme-relative path to comparable segments — `/` separators, no `.`, no `..`, no empty
 *  segments. A small local copy of the same normalization `theme-files.ts`'s own (private, exported
 *  by nothing) `normalizeThemeRelativePath` performs for `isGeneratedThemePath`, for the identical
 *  reason that function's own doc cites a real historical bypass for: comparing a path AS SPELLED
 *  would let `pages/../.trash/x` look like an ordinary `pages/` path to a caller that never resolves
 *  `..` before asking "is this in the trash folder". */
function normalizedPathSegments(relativePath: string): string[] {
  const segments: string[] = [];
  for (const segment of relativePath.split(/[\\/]/)) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments;
}

/** Whether `relativePath` (once `.`/`..`-collapsed) is `.trash` itself or sits inside it. */
export function isTrashedThemePath(relativePath: string): boolean {
  return normalizedPathSegments(relativePath)[0] === TRASH_DIR_NAME;
}

/**
 * Where `theme_trash_file` moves `relativePath` to: `.trash/<epoch-ms>/<relativePath>`, preserving
 * the ORIGINAL relative path (including its own subfolders) verbatim under a per-operation, always-
 * unique timestamp segment.
 *
 * Why a timestamp segment rather than a `name-1`/`name-2` collision suffix on the trashed name itself
 * (the scheme `explore.ts`'s own `nextAvailableFileName` uses for copy/rename): a suffix on the
 * trashed name would make {@link originalPathFromTrashedPath}
 * lossy — stripping `.trash/` from `.trash/styles-1.css` cannot tell whether the true original was
 * `styles.css` (suffixed to avoid a collision) or genuinely `styles-1.css`. Nesting each trash
 * operation under its own timestamp folder instead makes the ORIGINAL path recoverable byte-for-byte
 * with no ambiguity, at the cost of needing no collision detection at all (every operation gets its
 * own folder). Collisions are not merely rare but not a decision this function has to make: this is a
 * single-operator admin tool processing one call at a time, the same accepted-risk class
 * `copyThemeFile`'s own doc already states for an analogous same-millisecond scenario.
 */
export function trashDestinationFor(relativePath: string): string {
  return `${TRASH_DIR_NAME}/${Date.now()}/${relativePath}`;
}

/**
 * The inverse of {@link trashDestinationFor}: recovers the original relative path from a
 * `.trash/<epoch-ms>/<original>` path, or `null` if `trashedPath` is not shaped that way (not under
 * `.trash/` at all, or missing the timestamp segment) — a caller-supplied `trashedPath` that does not
 * match this shape is a shape error the caller should report (`tool-registrations.ts`'s
 * `theme_restore_trashed_file` throws `theme-files.ts`'s `ThemePathError` for it), not a value this
 * function should guess at.
 */
export function originalPathFromTrashedPath(trashedPath: string): string | null {
  const segments = normalizedPathSegments(trashedPath);
  if (segments.length < 3 || segments[0] !== TRASH_DIR_NAME) return null;
  return segments.slice(2).join("/");
}

/**
 * Whether `path`'s IDENTITY — its name (rename) or its existence (delete) — can change at all, given
 * its already-resolved write scope. Unchanged from `explore.ts`'s original `isFileIdentityChangeAllowed`:
 * inside a compiled theme's sourceDir, ONLY {@link isSourceDirWritableExtension} decides; everywhere
 * else, {@link IDENTITY_LOCKED_GROUPS} does.
 */
function isFileIdentityChangeAllowed(
  theme: { manifest: Pick<ThemeManifest, "apiVersion" | "build"> },
  path: string,
  writeScope: ThemeFileWriteScope
): boolean {
  return (
    !isGeneratedThemePath(path) &&
    (isInsideCompiledSourceDir(theme, path, writeScope)
      ? isSourceDirWritableExtension(path)
      : !IDENTITY_LOCKED_GROUPS.has(fileGroup(path, theme.manifest.apiVersion)))
  );
}

/** One reason `path`'s identity is locked, plus the transport-agnostic pieces both an HTTP response
 *  (`explore.ts`) and a thrown tool error (`tool-registrations.ts`) need: `status` for the former,
 *  `error`/`code` for both. Every reason today maps to 409/`Conflict` — kept as a field rather than
 *  hardcoded at each call site so a future reason with a different status is just a different value
 *  here, not a second place that has to remember the mapping. */
export interface FileIdentityLockResult {
  status: number;
  error: string;
  code: "REQUIRED_FILE_LOCKED" | "GENERATED_READONLY" | "READ_ONLY_FILE";
}

/**
 * The three independent reasons `path`'s identity might be locked against `action` (`"renamed"`,
 * `"deleted"`, or `"trashed"`), checked in priority order and collapsed into one result so a caller
 * has a single branch to make rather than three. Unchanged from `explore.ts`'s original
 * `validateFileIdentityChange` for `"renamed"`/`"deleted"` — see that function's git history for the
 * full per-reason reasoning (required file, ADR-020 generated tree, `IDENTITY_LOCKED_GROUPS`). `null`
 * means `path`'s identity may change.
 *
 * `"trashed"` (2026-08-30, owner decision) is the SAME question for `theme_trash_file`
 * (`tool-registrations.ts`) as `"deleted"` was for the `theme_delete_file` this replaced: soft-delete
 * still changes whether `path` exists at its current location, so every reason a hard delete would
 * have been refused applies identically — a theme's own required files stay un-trashable (the theme
 * would still drop to `status: "invalid"`), a built theme's generated tree stays un-trashable, and
 * `script`/`other` stay identity-locked (nothing tracks what still references a file by its old
 * location, whether that location stops existing via delete or merely moves via trash).
 *
 * The ONE shared gate for rename AND trash, and for both the HTTP surface (`explore.ts`'s rename
 * route) and the agent-tool surface (`tool-registrations.ts`'s `theme_rename_file`/
 * `theme_trash_file`) — see this file's own header for why a single relocated function, not
 * independently-written copies, is the point.
 */
export function validateFileIdentityChange(
  theme: { manifest: Pick<ThemeManifest, "apiVersion" | "build"> },
  path: string,
  writeScope: ThemeFileWriteScope,
  action: "renamed" | "deleted" | "trashed"
): FileIdentityLockResult | null {
  if (requiredThemeFiles(theme.manifest.apiVersion).includes(path)) {
    return {
      status: 409,
      error: `'${path}' cannot be ${action} — every theme requires it at this exact path`,
      code: "REQUIRED_FILE_LOCKED",
    };
  }
  if (writeScope.kind === "generated-readonly") {
    return { status: 409, error: `'${path}' is read-only: ${writeScope.reason}`, code: "GENERATED_READONLY" };
  }
  if (!isFileIdentityChangeAllowed(theme, path, writeScope)) {
    return { status: 409, error: `'${path}' is read-only in Explore and cannot be ${action}`, code: "READ_ONLY_FILE" };
  }
  return null;
}
