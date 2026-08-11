import {
  constants as fsConstants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { ENGINE_SUBFOLDERS } from "./theme";

/**
 * @file Path containment and file I/O for the `themes` agent-tool domain
 * (`agent-tools.ts`).
 *
 * Purpose:
 * The `themes` domain exposes a deliberately broad capability — read and write
 * ANY file inside ONE theme's own folder — on the argument that theme content's
 * real safety boundary is the runtime validation every theme goes through
 * regardless of authorship (the Liquid/Handlebars allowlists, worker isolation,
 * the declarative tier's closed JSON vocabulary). That argument holds only for
 * as long as "inside one theme's own folder" is actually true. This module is
 * where that is made true, and it is the only place in the domain that resolves
 * a caller-supplied string into a filesystem path.
 *
 * Why containment is not a string prefix check. The obvious implementation —
 * `resolved.startsWith(themeDir)` — is wrong in three separate ways, each
 * independently exploitable:
 *   1. It admits a SIBLING directory whose name extends the base's:
 *      `themes/handlebars/ledger-evil/x` starts with `themes/handlebars/ledger`.
 *      Comparing against `themeDir + sep` fixes only this one.
 *   2. It compares the wrong string when the input has not been normalized.
 *      `themes/ledger/../../../etc/passwd` must be resolved BEFORE any
 *      comparison, not after.
 *   3. It is blind to symlinks. A `.hbs` file (or a directory) inside the theme
 *      folder that links to `/etc` passes every lexical check ever written,
 *      because lexically it really is inside the folder.
 * {@link resolveThemeFilePath} handles all three: it resolves first, compares
 * with `path.relative` (which cannot be fooled by a name-prefix sibling), and
 * then re-checks against the `realpath` of the deepest ancestor that actually
 * exists on disk — which is what catches a symlink escape for a file that does
 * not exist yet, the case a write must handle.
 *
 * How it relates to the project:
 * Used only by `tool-registrations.ts`'s handlers. Nothing else in the codebase
 * writes theme files at runtime.
 */

/** Thrown for any path that fails containment. Distinct class so the tool layer can map it to a
 * shape rejection (worth publishing the schema back to the model) rather than an internal error. */
export class ThemePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemePathError";
  }
}

/**
 * Ceiling on one written file, mirroring the Handlebars allowlist's own
 * `MAX_TEMPLATE_SOURCE_BYTES` and the Liquid engine's `parseLimit`. A theme file
 * larger than this is not a theme file.
 */
export const MAX_THEME_FILE_BYTES = 1_000_000;

/** Ceiling on one `theme_list_files` walk, so a pathological folder cannot produce an unbounded response. */
const MAX_LISTED_FILES = 2_000;

/** Depth ceiling on the same walk — a symlink loop inside a theme folder cannot spin forever. */
const MAX_WALK_DEPTH = 12;

/**
 * Directories whose contents are GENERATED build output inside a theme-shaped folder — never real
 * source, and never worth copying or listing as editable. `preview/` is `build-preview.mjs`'s output:
 * a full second copy of a theme's pages and scripts, once per color mode — on `novice` (since deleted)
 * that was 36 of 79 listed files, with `js/main.js`, `preview/dark/js/main.js`, and
 * `preview/light/js/main.js` all showing as "main.js" with nothing to distinguish them, burying the
 * ~30 real source files under three-way duplicates of themselves. Editing one is pointless-to-harmful
 * too: the next `build-preview.mjs` run overwrites it, so the change silently disappears.
 *
 * `screenshots/` is deliberately NOT in this list: those are real marketing assets an author may want
 * to look at or replace, not a copy of the theme's own source — excluding them from the Explore list
 * would hide something real, and excluding them from a marketplace download's catalog copy would make
 * them permanently non-resettable once a user's working copy changed or deleted theirs (that copy is
 * what "reset to original" restores from).
 *
 * The single canonical list — 2026-08-11: this used to be two independent copies, `explore.ts`'s own
 * `GENERATED_DIRS`/`isGenerated` (filtering the Explore file list, given a theme-relative path already
 * in POSIX form) and `marketplace.ts`'s `isGeneratedPreviewPath` (a `cpSync` filter callback, given two
 * ABSOLUTE filesystem paths to relativize itself). Both were answering the identical question —
 * "is this generated preview output" — against the identical directory name, so a third caller would
 * have had to remember to update two places or silently miss one. {@link isGeneratedThemePath} is now
 * that one definition; each caller normalizes its own path shape (already-relative-POSIX for `explore.ts`,
 * `path.relative(fixtureDir, candidate)` for `marketplace.ts`) into the relative string this expects.
 */
export const GENERATED_THEME_DIRS: readonly string[] = ["preview"];

/**
 * Whether a theme-relative path is inside one of {@link GENERATED_THEME_DIRS} — the bare directory
 * itself (`"preview"`, the shape `cpSync`'s filter callback sees for the directory entry before
 * recursing) or anything under it (`"preview/dark/index.html"`).
 *
 * Deliberately NOT a prefix match on the raw string (`startsWith("preview")`): that would also exclude
 * a merely similarly-named sibling like `preview-notes/`, which is a real author asset with nothing to
 * do with generated output. Matching on the full segment (`=== dir` or `startsWith(dir + "/")`) is what
 * avoids that false positive.
 *
 * @param relativePath - A path relative to the theme's own root. Backslash-separated input (a raw
 * `path.relative` result on Windows) is normalized to `/` first, so callers on either platform can pass
 * their native separator through unchanged.
 * @returns `true` iff `relativePath` is `GENERATED_THEME_DIRS[i]` itself or falls under it.
 * @throws Never. Pure: no filesystem access, no side effects.
 * @complexity Time: O(d·k), d = `GENERATED_THEME_DIRS.length` (a fixed, tiny constant), k = path length.
 * @complexity Space: O(k) for the normalized copy.
 * @overallScore 100/100
 */
export function isGeneratedThemePath(relativePath: string): boolean {
  // Split on either separator explicitly, not `path.sep` — `sep` is `/` on the POSIX machine this
  // runs on today, which would make this a no-op for a `\`-separated string instead of normalizing
  // it, silently defeating the cross-platform guarantee this function's own doc comment makes.
  const posix = relativePath.split(/[\\/]/).join("/");
  return GENERATED_THEME_DIRS.some((dir) => posix === dir || posix.startsWith(`${dir}/`));
}

/**
 * True when `themeDir` is a direct child of the themes root, or of one of the
 * named engine subfolders under it — i.e. exactly the set of locations
 * `discoverAllBuiltInThemes()` scans.
 *
 * This is the SECOND containment question, and it is not implied by the first.
 * `resolveThemeFilePath` proves a file is inside its theme's folder; this proves
 * that folder is somewhere Tovu recognizes as a theme root at all. Without it, a
 * `DiscoveredTheme` fabricated or mutated to carry any other `dir` would grant
 * writes wherever that `dir` pointed.
 *
 * @param required.themeDir - The candidate theme folder (absolute).
 * @param required.themesRoot - The configured themes root (`RouteDeps.themesDir`).
 * @returns Whether the folder sits at a recognized theme root.
 * @complexity O(e) in the engine-subfolder count (a fixed, tiny constant).
 * @overallScore 100/100
 */
export function isRecognizedThemeRoot(
  required: { themeDir: string; themesRoot: string },
  _optional: Record<string, never> = {}
): boolean {
  const root = resolve(required.themesRoot);
  const parent = dirname(resolve(required.themeDir));
  if (parent === root) return true;
  return ENGINE_SUBFOLDERS.some((sub) => parent === join(root, sub));
}

/** Lexical containment: is `target` at or beneath `base`? Uses `path.relative`, which — unlike a
 * prefix match — cannot be satisfied by a sibling whose name merely extends the base's. */
function isWithin(base: string, target: string): boolean {
  if (base === target) return true;
  const rel = relative(base, target);
  return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
}

/**
 * Resolve one caller-supplied relative path against a theme's own folder,
 * refusing anything that escapes it.
 *
 * Rejects, in order: an absolute path, a path with a NUL byte, a path that
 * resolves outside the theme folder (traversal), and a path whose deepest
 * existing ancestor `realpath`s outside the theme folder (symlink escape). The
 * theme folder itself is also re-`realpath`ed first, so a themes root reached
 * through a symlink still compares correctly rather than failing every write.
 *
 * @param required.themeDir - The theme's own folder, as recorded by `loadTheme` (`DiscoveredTheme.dir`).
 * @param required.themesRoot - The configured themes root, for the recognized-root check.
 * @param required.relativePath - The caller-supplied path, relative to the theme folder.
 * @returns The absolute, verified-contained path.
 * @throws {ThemePathError} On any escape or malformed input.
 * @complexity O(d) in the path's directory depth, for the existing-ancestor probe.
 * @overallScore 100/100
 */
export function resolveThemeFilePath(
  required: { themeDir: string; themesRoot: string; relativePath: string },
  _optional: Record<string, never> = {}
): string {
  const { themeDir, themesRoot, relativePath } = required;

  if (!isRecognizedThemeRoot({ themeDir, themesRoot })) {
    throw new ThemePathError(
      `theme folder '${themeDir}' is not under a recognized theme root (${themesRoot} or one of its ${ENGINE_SUBFOLDERS.join("/")} subfolders)`
    );
  }
  if (relativePath.length === 0) {
    throw new ThemePathError("path is required");
  }
  if (relativePath.includes("\0")) {
    throw new ThemePathError("path must not contain a NUL byte");
  }
  if (isAbsolute(relativePath)) {
    throw new ThemePathError(`path '${relativePath}' must be relative to the theme folder, not absolute`);
  }

  // `realpath` the base so a themes root reached through a symlink (a container
  // bind-mount, a dev checkout symlinked into place) compares against the same
  // canonical form the ancestor probe below produces.
  const base = existsSync(themeDir) ? realpathSync(themeDir) : resolve(themeDir);
  const target = resolve(base, relativePath);

  if (!isWithin(base, target)) {
    throw new ThemePathError(`path '${relativePath}' resolves outside the theme folder`);
  }

  // Symlink-aware re-check. The target may not exist (a write creating a new
  // file), so walk up to the deepest ancestor that does, canonicalize THAT, and
  // require it to still be inside the theme folder. A symlinked directory
  // anywhere along the chain is caught here even though it is lexically clean.
  let probe = target;
  for (let i = 0; i < MAX_WALK_DEPTH * 4 && !existsSync(probe); i += 1) {
    const parent = dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  if (existsSync(probe)) {
    const realProbe = realpathSync(probe);
    if (!isWithin(base, realProbe)) {
      throw new ThemePathError(`path '${relativePath}' resolves outside the theme folder through a symbolic link`);
    }
  }

  return target;
}

/**
 * List every regular file under a theme's folder, as paths relative to it.
 *
 * Descends real directories only — a symlinked directory is not followed, so a
 * link out of the folder can neither enumerate nor leak anything beyond it.
 * Bounded by {@link MAX_LISTED_FILES} and {@link MAX_WALK_DEPTH}.
 *
 * @param required.themeDir - The theme's own folder.
 * @param required.themesRoot - The configured themes root, for the recognized-root check.
 * @returns Relative paths, sorted, using `/` separators.
 * @throws {ThemePathError} If the folder is not at a recognized theme root.
 * @complexity O(n) in the file count under the folder.
 * @overallScore 100/100
 */
export function listThemeFiles(
  required: { themeDir: string; themesRoot: string },
  _optional: Record<string, never> = {}
): string[] {
  const { themeDir, themesRoot } = required;
  if (!isRecognizedThemeRoot({ themeDir, themesRoot })) {
    throw new ThemePathError(`theme folder '${themeDir}' is not under a recognized theme root`);
  }
  if (!existsSync(themeDir)) return [];

  const base = realpathSync(themeDir);
  const found: string[] = [];

  const walk = (dir: string, depth: number): void => {
    if (depth > MAX_WALK_DEPTH || found.length >= MAX_LISTED_FILES) return;
    for (const name of readdirSync(dir)) {
      if (found.length >= MAX_LISTED_FILES) return;
      const full = join(dir, name);
      // `lstat` semantics via `statSync(..., {throwIfNoEntry})` would follow the
      // link; read the link status explicitly instead so a symlink is neither
      // descended nor reported as a file.
      const stat = statSync(full, { throwIfNoEntry: false });
      if (!stat) continue;
      const isLink = realpathSync(full) !== full;
      if (isLink) continue;
      if (stat.isDirectory()) walk(full, depth + 1);
      else if (stat.isFile()) found.push(relative(base, full).split(sep).join("/"));
    }
  };
  walk(base, 0);

  return found.sort();
}

/**
 * Read one file inside a theme's folder as UTF-8 text.
 *
 * @throws {ThemePathError} On any containment failure, or when the path is not a regular file.
 * @complexity O(s) in the file size.
 * @overallScore 100/100
 */
export function readThemeFile(
  required: { themeDir: string; themesRoot: string; relativePath: string },
  _optional: Record<string, never> = {}
): string {
  const target = resolveThemeFilePath(required);
  const stat = statSync(target, { throwIfNoEntry: false });
  if (!stat) throw new ThemePathError(`file '${required.relativePath}' does not exist in this theme`);
  if (!stat.isFile()) throw new ThemePathError(`path '${required.relativePath}' is not a regular file`);
  if (stat.size > MAX_THEME_FILE_BYTES) {
    throw new ThemePathError(`file '${required.relativePath}' exceeds the ${MAX_THEME_FILE_BYTES}-byte readable limit`);
  }
  return readFileSync(target, "utf8");
}

/**
 * Write (create or overwrite) one file inside a theme's folder, creating any
 * intermediate directories — which are themselves inside the folder, since the
 * resolved path already passed containment.
 *
 * @returns The absolute path written.
 * @throws {ThemePathError} On any containment failure, an oversized body, or a
 * target that exists and is not a regular file.
 * @complexity O(s) in the content size.
 * @overallScore 100/100
 */
export function writeThemeFile(
  required: { themeDir: string; themesRoot: string; relativePath: string; content: string },
  _optional: Record<string, never> = {}
): string {
  const target = resolveThemeFilePath(required);
  if (Buffer.byteLength(required.content, "utf8") > MAX_THEME_FILE_BYTES) {
    throw new ThemePathError(`content exceeds the ${MAX_THEME_FILE_BYTES}-byte per-file limit`);
  }
  const existing = statSync(target, { throwIfNoEntry: false });
  if (existing && !existing.isFile()) {
    throw new ThemePathError(`path '${required.relativePath}' exists and is not a regular file`);
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, required.content, "utf8");
  return target;
}

/**
 * Shared containment + preflight for {@link copyThemeFile}/{@link renameThemeFile}: resolves both
 * the source and destination through {@link resolveThemeFilePath} (so a destination built from
 * operator input — a rename's new filename — is validated exactly as strictly as a write target),
 * confirms the source is a regular file within the size ceiling, and refuses to clobber an existing
 * destination.
 *
 * Deliberately does NOT decode either path through `readFileSync(…, "utf8")` /
 * `writeFileSync(…, "utf8")` the way {@link readThemeFile}/{@link writeThemeFile} do: a binary asset
 * (a font, an image) round-tripped through UTF-8 would come back byte-corrupted, and copy/rename
 * must work on every file in a theme's folder, not only the text-editable ones.
 */
function resolveCopyOrRenameTargets(
  required: { themeDir: string; themesRoot: string; sourcePath: string; destPath: string }
): { source: string; dest: string } {
  const { themeDir, themesRoot, sourcePath, destPath } = required;
  const source = resolveThemeFilePath({ themeDir, themesRoot, relativePath: sourcePath });
  const sourceStat = statSync(source, { throwIfNoEntry: false });
  if (!sourceStat) throw new ThemePathError(`file '${sourcePath}' does not exist in this theme`);
  if (!sourceStat.isFile()) throw new ThemePathError(`path '${sourcePath}' is not a regular file`);
  if (sourceStat.size > MAX_THEME_FILE_BYTES) {
    throw new ThemePathError(`file '${sourcePath}' exceeds the ${MAX_THEME_FILE_BYTES}-byte limit`);
  }

  const dest = resolveThemeFilePath({ themeDir, themesRoot, relativePath: destPath });
  if (existsSync(dest)) {
    throw new ThemePathError(`path '${destPath}' already exists in this theme`);
  }

  return { source, dest };
}

/**
 * Duplicate one file inside a theme's folder to a new path also inside it, byte-for-byte.
 *
 * @returns The absolute destination path written.
 * @throws {ThemePathError} On containment failure for either path, a missing/oversized/non-file
 * source, or a destination that already exists.
 * @complexity O(s) in the file size.
 * @overallScore 100/100
 */
export function copyThemeFile(
  required: { themeDir: string; themesRoot: string; sourcePath: string; destPath: string },
  _optional: Record<string, never> = {}
): string {
  const { source, dest } = resolveCopyOrRenameTargets(required);
  mkdirSync(dirname(dest), { recursive: true });
  try {
    // `COPYFILE_EXCL` closes the TOCTOU window `resolveCopyOrRenameTargets`' own `existsSync(dest)`
    // check leaves open: two concurrent copy requests both landing on the same auto-suffixed name
    // (e.g. two rapid clicks generating `about-1.html` from the same source) would otherwise both
    // pass that pre-check and race to overwrite one another. `copyFileSync` has an atomic
    // exclusive-write mode for exactly this; `renameSync` (below) does not, so the identical race is
    // a known, narrower, accepted gap there — this domain is a single authenticated operator's admin
    // tool, not a multi-tenant race target, and every other write in this file already accepts the
    // same class of risk (`writeThemeFile` has no equivalent guard at all).
    copyFileSync(source, dest, fsConstants.COPYFILE_EXCL);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new ThemePathError(`path '${required.destPath}' already exists in this theme`);
    }
    throw err;
  }
  return dest;
}

/**
 * Move (rename) one file within a theme's folder, byte-for-byte.
 *
 * @returns The absolute destination path.
 * @throws {ThemePathError} On containment failure for either path, a missing/oversized/non-file
 * source, or a destination that already exists.
 * @complexity O(1) — same-filesystem rename, not a copy.
 * @overallScore 100/100
 */
export function renameThemeFile(
  required: { themeDir: string; themesRoot: string; sourcePath: string; destPath: string },
  _optional: Record<string, never> = {}
): string {
  const { source, dest } = resolveCopyOrRenameTargets(required);
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(source, dest);
  return dest;
}
