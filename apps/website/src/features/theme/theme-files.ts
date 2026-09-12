import {
  accessSync,
  chmodSync,
  closeSync,
  constants as fsConstants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  type Stats,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { ENGINE_SUBFOLDERS, THEME_CATALOG_DIR, type ThemeManifest } from "./theme.js";

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
 * Generated ROOT FILES (as opposed to {@link GENERATED_THEME_DIRS}' whole directories) — same
 * "regenerate the whole thing, never patch it" contract as `preview/`, just a single file instead of a
 * tree. `index.html` (Milestone 5, 2026-08-18) is `static-portability-index.ts`'s own output: a
 * `static`-tier theme's generated portability snapshot, rebuilt from `render/pages/index.html` +
 * `render/partials/*` + `tokens*.json` every time it regenerates, never hand-edited in place — editing
 * it directly is exactly as pointless as editing `preview/`'s output, for the same reason (the next
 * regeneration silently overwrites it).
 */
export const GENERATED_THEME_ROOT_FILES: readonly string[] = ["index.html"];

/**
 * Whether a theme-relative path is inside one of {@link GENERATED_THEME_DIRS} — the bare directory
 * itself (`"preview"`, the shape `cpSync`'s filter callback sees for the directory entry before
 * recursing) or anything under it (`"preview/dark/index.html"`) — or is itself one of
 * {@link GENERATED_THEME_ROOT_FILES} exactly.
 *
 * Deliberately NOT a prefix match on the raw string (`startsWith("preview")`): that would also exclude
 * a merely similarly-named sibling like `preview-notes/`, which is a real author asset with nothing to
 * do with generated output. Matching on the full segment (`=== dir` or `startsWith(dir + "/")`) is what
 * avoids that false positive.
 *
 * `.`/`..` segments are COLLAPSED before comparing (2026-08-13). Without that, this predicate judged
 * the path as literally spelled while `resolveThemeFilePath` — the function that decides which file
 * actually gets written — judged it normalized, so the two disagreed about which file a request names.
 * `PUT {"path":"css/../preview/app.css"}` was accepted (200) and overwrote generated output, walking
 * around the `preview/` rule on EVERY route that consults this predicate. Live-confirmed through the
 * real Express routes before the fix; regression test in `explore-built-theme-gate.test.ts`.
 *
 * A gate and its writer must resolve a name the same way; anything else is a bypass waiting to be
 * spelled differently. `..` popping past the root is left to produce a path that
 * `resolveThemeFilePath`'s own containment check rejects — this function answers only "is it generated".
 *
 * @param relativePath - A path relative to the theme's own root. Backslash-separated input (a raw
 * `path.relative` result on Windows) is normalized to `/` first, so callers on either platform can pass
 * their native separator through unchanged.
 * @returns `true` iff `relativePath`, once normalized, exactly matches a {@link GENERATED_THEME_ROOT_FILES}
 * entry, or is a {@link GENERATED_THEME_DIRS} entry itself or under it.
 * @throws Never. Pure: no filesystem access, no side effects.
 * @complexity Time: O((d+r)·k), d = `GENERATED_THEME_DIRS.length`, r = `GENERATED_THEME_ROOT_FILES.length`
 * (both fixed, tiny constants), k = path length.
 * @complexity Space: O(k) for the normalized copy.
 * @overallScore 100/100
 */
export function isGeneratedThemePath(relativePath: string): boolean {
  const normalized = normalizeThemeRelativePath(relativePath);
  if (GENERATED_THEME_ROOT_FILES.includes(normalized)) return true;
  return GENERATED_THEME_DIRS.some((dir) => normalized === dir || normalized.startsWith(`${dir}/`));
}

/**
 * Whether a compiled theme's declared `build.sourceDir` conflicts with a {@link GENERATED_THEME_DIRS}
 * entry — the install-time half of the two-layer `preview/` defense. {@link isGeneratedThemePath}
 * stops a WRITE that names a generated path; this stops the MANIFEST that would make an entire,
 * ordinary-looking source tree alias generated output, checked by `loadTheme` (`theme.ts`) so a
 * conflicting manifest fails to load at all rather than depending solely on each write route's own
 * `isGeneratedThemePath` refusal (added 2026-08-13 after `PUT {"path":"preview/foo.tsx"}` on a
 * `sourceDir: "preview"` manifest reached disk — see that history in `isGeneratedThemePath`'s doc, and
 * `explore.ts`'s PUT handler for the call-site layer this one is in front of, not a replacement for).
 *
 * Three shapes conflict, because each makes some path indistinguishable as source vs. generated:
 *  1. `sourceDir` names a generated dir exactly (`"preview"`).
 *  2. `sourceDir` is NESTED inside one (`"preview/src"`) — the same "exact segment or a path under it"
 *     shape {@link isGeneratedThemePath} already answers for a file path; reused here for `sourceDir`
 *     rather than re-derived, so a `sourceDir` string and a file path are never judged by two different
 *     rules.
 *  3. `sourceDir` is an ANCESTOR of a generated dir — in practice only the theme root itself (`"."`,
 *     which normalizes to `""`), which would put every {@link GENERATED_THEME_DIRS} entry INSIDE the
 *     declared source tree. An empty `sourceDir` (`""`) is already refused earlier in `loadTheme` as
 *     falsy (`build.sourceDir is required`), so the only shape this adds is a truthy root spelling like
 *     `"."`. Any generated-dir list is non-empty by construction (see that constant's own doc), so a
 *     root `sourceDir` conflicts unconditionally rather than needing a per-entry comparison.
 *
 * `"preview-notes"` — merely PREFIXED with a generated dir's name — must NOT conflict; the per-segment
 * comparison below is what avoids that false positive, exactly as it does for {@link isGeneratedThemePath}.
 *
 * @param sourceDir - `theme.json`'s `build.sourceDir`, as authored (any separator, `./`, `..`).
 * @returns `true` iff normalizing `sourceDir` lands on, inside, or astride any
 * {@link GENERATED_THEME_DIRS} entry.
 * @throws Never. Pure: no filesystem access, no side effects.
 * @complexity Time: O(d·k), d = `GENERATED_THEME_DIRS.length`, k = path length. Space: O(k).
 */
export function isSourceDirGeneratedConflict(sourceDir: string): boolean {
  const normalizedSource = normalizeThemeRelativePath(sourceDir);
  // The root sourceDir case: no per-entry comparison can express "is an ancestor of every entry"
  // via a single startsWith check the way the nested-inside direction can, so it is handled directly.
  if (normalizedSource === "") return true;
  return GENERATED_THEME_DIRS.some(
    (dir) =>
      normalizedSource === dir ||
      normalizedSource.startsWith(`${dir}/`) ||
      dir.startsWith(`${normalizedSource}/`)
  );
}

/**
 * Collapse a theme-relative path to comparable segments: `/` separators, no `.`, no `..`, no empty
 * segments. Shared by every predicate here that compares a path against a directory name, so a gate
 * and the writer it guards cannot disagree about which file a string names.
 *
 * Split on either separator explicitly, not `path.sep` — `sep` is `/` on the POSIX machine this runs
 * on today, which would make the split a no-op for a `\`-separated string instead of normalizing it,
 * silently defeating the cross-platform guarantee these functions' doc comments make.
 */
function normalizeThemeRelativePath(relativePath: string): string {
  const segments: string[] = [];
  for (const segment of relativePath.split(/[\\/]/)) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
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
 * Walks up from `path` to the deepest existing ancestor, `realpath`s it, and confirms that ancestor
 * is still inside `base` — catches a symlinked directory anywhere along the chain even though the
 * lexical path is clean. `path` need not exist (a write creating a new file).
 *
 * Split out of {@link resolveThemeFilePath} as one unit — the walk-up loop and its containment
 * re-check are one symlink-escape probe, not two independent decisions.
 */
function assertNoSymlinkEscape(base: string, path: string, relativePathForError: string): void {
  let probe = path;
  for (let i = 0; i < MAX_WALK_DEPTH * 4 && !existsSync(probe); i += 1) {
    const parent = dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  if (!existsSync(probe)) return;
  const realProbe = realpathSync(probe);
  if (!isWithin(base, realProbe)) {
    throw new ThemePathError(`path '${relativePathForError}' resolves outside the theme folder through a symbolic link`);
  }
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

  // Symlink-aware re-check — the target may not exist (a write creating a new file). See
  // `assertNoSymlinkEscape`'s own doc for what it walks and why.
  assertNoSymlinkEscape(base, target, relativePath);

  return target;
}

/**
 * One directory entry's contribution to {@link walkThemeDir}'s file listing: skip symlinks entirely
 * (neither descended nor reported — see the caller's own header on why a link out of the folder can
 * neither enumerate nor leak anything beyond it), recurse into real subdirectories, and record real
 * files (`found` is mutated in place, the shared accumulator for one `listThemeFiles` call).
 */
function visitThemeDirEntry(dir: string, name: string, depth: number, base: string, found: string[]): void {
  const full = join(dir, name);
  // lstatSync, NEVER statSync — statSync follows the link, so a circular symlink (a -> b -> a) made
  // it throw ELOOP straight out of `listThemeFiles`' own "throws only ThemePathError" contract (this
  // file's JSDoc on that function). lstatSync reports the link itself, never its target, so
  // `isSymbolicLink()` below catches every shape uniformly — normal, broken, or circular — before any
  // call that would follow it, so a symlink is neither descended nor reported as a file. Matches the
  // identical fix in `validation/structure.ts`'s `visitPackageEntry`.
  const stat = lstatSync(full, { throwIfNoEntry: false });
  if (!stat) return;
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) walkThemeDir(full, depth + 1, base, found);
  else if (stat.isFile()) found.push(relative(base, full).split(sep).join("/"));
}

/**
 * Descends real directories under `base` only, collecting relative file paths into `found`
 * (mutated in place), bounded by {@link MAX_WALK_DEPTH} and {@link MAX_LISTED_FILES}. Split from
 * {@link visitThemeDirEntry} so the loop itself carries none of the per-entry branching.
 */
function walkThemeDir(dir: string, depth: number, base: string, found: string[]): void {
  if (depth > MAX_WALK_DEPTH || found.length >= MAX_LISTED_FILES) return;
  for (const name of readdirSync(dir)) {
    if (found.length >= MAX_LISTED_FILES) return;
    visitThemeDirEntry(dir, name, depth, base, found);
  }
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
  walkThemeDir(base, 0, base, found);

  return found.sort();
}

/**
 * `statSync(target, { throwIfNoEntry: false })`, but converts any OTHER thrown error into this
 * module's own {@link ThemePathError} instead of letting it escape raw. `throwIfNoEntry: false` only
 * suppresses `ENOENT`; the realistic other case is `ELOOP` from `target` itself being a circular
 * symlink (`a -> b -> a`) — {@link resolveThemeFilePath}'s own containment check does not resolve this
 * case: its walk-up to find an EXISTING ancestor stops at the theme folder itself, because a
 * self-referential symlink never "exists" by `existsSync`'s own ELOOP-swallowing definition, so it
 * never realpaths the cycle and never throws. Following the link here (rather than `lstat`ing it, the
 * way {@link visitThemeDirEntry}'s listing walk does) is deliberate: a symlink pointing to a real file
 * INSIDE the theme is meant to read through, which `resolveThemeFilePath`'s realpath-based containment
 * check already allows — only the cyclic case needs converting.
 *
 * Return type is `Stats | undefined`, not `ReturnType<typeof statSync>` — `statSync` is overloaded
 * and never called here with `bigint: true`, so the call below can only ever produce a `Stats` (or
 * `undefined` via `throwIfNoEntry: false`); `ReturnType<typeof statSync>` instead resolves against
 * the type's LAST overload (`Stats | BigIntStats | undefined`), which is why callers of this
 * function (`writeFileAtomically`) saw a `bigint` in `existing.mode`'s type that can never actually
 * occur at runtime.
 */
function statOrThemePathError(target: string, relativePath: string): Stats | undefined {
  try {
    return statSync(target, { throwIfNoEntry: false });
  } catch (err) {
    throw new ThemePathError(`path '${relativePath}' could not be read: ${err instanceof Error ? err.message : String(err)}`);
  }
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
  const stat = statOrThemePathError(target, required.relativePath);
  if (!stat) throw new ThemePathError(`file '${required.relativePath}' does not exist in this theme`);
  if (!stat.isFile()) throw new ThemePathError(`path '${required.relativePath}' is not a regular file`);
  if (stat.size > MAX_THEME_FILE_BYTES) {
    throw new ThemePathError(`file '${required.relativePath}' exceeds the ${MAX_THEME_FILE_BYTES}-byte readable limit`);
  }
  return readFileSync(target, "utf8");
}

/** Read size for {@link filesHaveSameBytes}: its memory is two buffers of this size, however large
 *  the files being compared are. */
const COMPARE_CHUNK_BYTES = 64 * 1024;

/** Fills `buffer` from `fd` starting at `position`, looping over short reads. Returns the byte count
 *  that landed, which is below `buffer.length` only at end of file. */
function readFullChunk(fd: number, buffer: Buffer, position: number): number {
  let filled = 0;
  while (filled < buffer.length) {
    const bytesRead = readSync(fd, buffer, filled, buffer.length - filled, position + filled);
    if (bytesRead === 0) break;
    filled += bytesRead;
  }
  return filled;
}

/**
 * Whether the files at `pathA` and `pathB` hold identical bytes, compared chunk by chunk until the
 * first mismatch or end of file. `pathA` is opened first, so an open failure on it is the one thrown.
 *
 * @complexity O(s) time in the file size, O(1) space (two {@link COMPARE_CHUNK_BYTES} buffers).
 */
function filesHaveSameBytes(pathA: string, pathB: string): boolean {
  const fdA = openSync(pathA, "r");
  try {
    const fdB = openSync(pathB, "r");
    try {
      const chunkA = Buffer.allocUnsafe(COMPARE_CHUNK_BYTES);
      const chunkB = Buffer.allocUnsafe(COMPARE_CHUNK_BYTES);
      for (let position = 0; ; position += COMPARE_CHUNK_BYTES) {
        const readA = readFullChunk(fdA, chunkA, position);
        const readB = readFullChunk(fdB, chunkB, position);
        if (readA !== readB || !chunkA.subarray(0, readA).equals(chunkB.subarray(0, readB))) return false;
        if (readA < COMPARE_CHUNK_BYTES) return true;
      }
    } finally {
      closeSync(fdB);
    }
  } finally {
    closeSync(fdA);
  }
}

/**
 * The catalog original's absolute path and size for `relativePath`, or `null` when there is no
 * regular file there to compare against: missing, a directory, or a path that fails containment
 * against the catalog folder. Any containment failure maps to `null` rather than throwing: from the
 * caller's side it means "no original for this path", which `explore.ts`'s per-file reset route
 * reports as `NOT_IN_ORIGINAL` and `theme_reset_file` as `ThemeFileNoOriginalError`.
 */
function originalRegularFile(required: {
  originalDir: string;
  originalsRoot: string;
  relativePath: string;
}): { path: string; size: number } | null {
  try {
    const path = resolveThemeFilePath({
      themeDir: required.originalDir,
      themesRoot: required.originalsRoot,
      relativePath: required.relativePath,
    });
    const stat = statOrThemePathError(path, required.relativePath);
    return stat?.isFile() ? { path, size: stat.size } : null;
  } catch (err) {
    if (err instanceof ThemePathError) return null;
    throw err;
  }
}

/**
 * Whether one file in a theme's live folder differs from its catalog original, byte for byte.
 *
 * Decided from content only, never from mtime. Different sizes answer `true` from the two stats
 * without opening either file; equal sizes always go to a full byte comparison. No line-ending or
 * whitespace normalization: a CRLF-vs-LF difference is a difference.
 *
 * @param required.themeDir - The live theme's own folder (`DiscoveredTheme.dir`).
 * @param required.themesRoot - The configured themes root, for the live side's recognized-root check.
 * @param required.originalDir - The theme's catalog folder (`<themesRoot>/__original-themes__/<tier>/<id>`).
 * @param required.originalsRoot - The catalog root (`<themesRoot>/__original-themes__`).
 * @param required.relativePath - The file, relative to both folders.
 * @returns `null` when the catalog has no regular file at `relativePath` (so there is nothing to
 * compare against, and nothing to reset to). Otherwise `true` when the live file is missing, is not
 * a regular file, or its bytes differ; `false` when the bytes are identical.
 * @throws {ThemePathError} When `relativePath` fails containment against the LIVE folder, or the live
 * path cannot be stat'ed for a reason other than not existing (e.g. a circular symlink).
 * @throws Whatever `openSync`/`readSync` throw when equal-size files cannot be read (e.g. `EACCES`).
 * @complexity O(1) stats when there is no original or the sizes differ; otherwise O(s) time in the
 * file size and O(1) space.
 */
export function themeFileDiffersFromOriginal(
  required: { themeDir: string; themesRoot: string; originalDir: string; originalsRoot: string; relativePath: string },
  _optional: Record<string, never> = {}
): boolean | null {
  const { themeDir, themesRoot, relativePath } = required;
  const livePath = resolveThemeFilePath({ themeDir, themesRoot, relativePath });
  const original = originalRegularFile(required);
  if (!original) return null;
  const live = statOrThemePathError(livePath, relativePath);
  if (!live?.isFile() || live.size !== original.size) return true;
  return !filesHaveSameBytes(livePath, original.path);
}

/**
 * Replace `target` by filling a sibling temp file in the SAME directory and `renameSync`-ing it over
 * `target`, instead of truncating `target` in place. `fillTemp` creates that temp file at the path it
 * is given: {@link writeThemeFile} writes text there, and {@link resetThemeFileToOriginal} copies a
 * catalog original's bytes there.
 *
 * Why this matters: a plain `writeFileSync(target, …, "w")` truncates `target`'s own inode the
 * instant it opens, before any content lands — a crash or a concurrent reader mid-write can then
 * observe an empty or partial file. For `theme.json`, the file `loadTheme()` must parse whole,
 * that turns one torn write into a broken WHOLE theme. Renaming a fully-written temp file over
 * `target` instead swaps the directory entry atomically: a reader that already has `target` open
 * by descriptor keeps reading the old, complete inode; a reader that opens `target` by path
 * afterward sees either the fully-old or fully-new content, never a partial one.
 *
 * The temp file is a sibling of `target` (same directory), not under a shared system tmp dir,
 * because `renameSync` requires both paths on the SAME filesystem — a cross-device rename throws
 * `EXDEV` instead of renaming.
 *
 * Checks write access on an existing `target` up front: `rename()` only needs write permission on
 * the DIRECTORY, not the destination file, so a bare temp-then-rename would otherwise silently
 * succeed over a read-only target — regressing the permission-denied refusal a `"w"`-flag
 * `writeFileSync` open gave callers before this change. The temp file also inherits `target`'s
 * existing mode before the rename, so replacing a file does not silently change its permissions.
 * When `target` does not exist yet, the new file keeps the mode `fillTemp` created it with.
 *
 * @throws whatever `accessSync`, `fillTemp`, `chmodSync` or `renameSync` throws, or
 * {@link ThemePathError} if the pre-write stat on `target` hits anything other than ENOENT (see
 * {@link statOrThemePathError}). The temp file is removed before the error propagates,
 * so a failed write leaves no artifact behind in the theme folder.
 * @complexity O(s) in the size of what `fillTemp` writes.
 */
function writeFileAtomically(target: string, relativePathForError: string, fillTemp: (tempPath: string) => void): void {
  // statOrThemePathError, NEVER a bare statSync — same circular-symlink ELOOP escape the other
  // post-resolve stat calls in this file were fixed for (see that wrapper's own doc). In practice
  // both callers (`writeThemeFile`, `resetThemeFileToOriginal`) already run an identical stat on the
  // same `target` just before and throw first for a circular symlink, so this call is shadowed
  // under ordinary single-process execution; it still guards a genuine TOCTOU window (an external
  // process replacing `target` with a symlink cycle between the two calls) and any future caller
  // that skips that earlier check. Still follows a symlink pointing at a real file inside the theme,
  // matching `renameSync` below, which replaces that symlink's own directory entry.
  const existing = statOrThemePathError(target, relativePathForError);
  if (existing) {
    accessSync(target, fsConstants.W_OK);
  }
  const tempPath = join(dirname(target), `.${basename(target)}.${process.pid}-${randomUUID()}.tmp`);
  try {
    fillTemp(tempPath);
    if (existing) chmodSync(tempPath, existing.mode);
    renameSync(tempPath, target);
  } catch (err) {
    rmSync(tempPath, { force: true });
    throw err;
  }
}

/**
 * Refuses a write over `existing` when it is not a regular file, or when it is past the
 * {@link MAX_THEME_FILE_BYTES} read limit and `overwriteOversized` is false. {@link readThemeFile}
 * refuses a file that size, so a body sent for it was never an edit of its text: checking only the new
 * body's size let a short body replace the whole file. `undefined` (no file yet) always passes.
 *
 * @throws {ThemePathError} On either refusal.
 * @complexity O(1).
 */
function assertOverwritableTarget(existing: Stats | undefined, relativePath: string, overwriteOversized: boolean): void {
  if (!existing) return;
  if (!existing.isFile()) {
    throw new ThemePathError(`path '${relativePath}' exists and is not a regular file`);
  }
  if (existing.size > MAX_THEME_FILE_BYTES && !overwriteOversized) {
    throw new ThemePathError(
      `file '${relativePath}' exceeds the ${MAX_THEME_FILE_BYTES}-byte readable limit; overwriting it requires overwriteOversized: true`
    );
  }
}

/**
 * Write (create or overwrite) one file inside a theme's folder, creating any
 * intermediate directories — which are themselves inside the folder, since the
 * resolved path already passed containment.
 *
 * @param optional.overwriteOversized - Must be `true` to replace an existing file past the
 * {@link MAX_THEME_FILE_BYTES} read limit. The admin editor never sets it.
 * @returns The absolute path written.
 * @throws {ThemePathError} On any containment failure, an oversized body, a
 * target that exists and is not a regular file, or an existing target past the
 * {@link MAX_THEME_FILE_BYTES} read limit without `overwriteOversized`.
 * @complexity O(s) in the content size.
 * @overallScore 100/100
 */
export function writeThemeFile(
  required: { themeDir: string; themesRoot: string; relativePath: string; content: string },
  optional: { overwriteOversized?: boolean } = {}
): string {
  const target = resolveThemeFilePath(required);
  if (Buffer.byteLength(required.content, "utf8") > MAX_THEME_FILE_BYTES) {
    throw new ThemePathError(`content exceeds the ${MAX_THEME_FILE_BYTES}-byte per-file limit`);
  }
  // statOrThemePathError, NEVER a bare statSync — same circular-symlink (a -> b -> a) ELOOP escape
  // `readThemeFile` was fixed for (see that wrapper's own doc): `resolveThemeFilePath` does not
  // resolve a `target` that is ITSELF a self-referential symlink, so this is the first call that can
  // observe the cycle. Following the link (rather than `lstat`ing it) is deliberate here too: a
  // symlink pointing to a real file inside the theme is meant to be overwritten through, exactly like
  // any other existing target.
  const existing = statOrThemePathError(target, required.relativePath);
  assertOverwritableTarget(existing, required.relativePath, optional.overwriteOversized === true);
  mkdirSync(dirname(target), { recursive: true });
  writeFileAtomically(target, required.relativePath, (tempPath) => writeFileSync(tempPath, required.content, "utf8"));
  return target;
}

/**
 * Restore one file in a theme's live folder to its catalog original, byte for byte.
 *
 * Never decodes either file. The original is copied with `copyFileSync` into a temp file that
 * {@link writeFileAtomically} renames over the live path, so a binary asset (an image, a font) comes
 * back exactly and then compares unmodified in {@link themeFileDiffersFromOriginal}. Going through
 * {@link readThemeFile}/{@link writeThemeFile} instead would decode via UTF-8 and turn every invalid
 * byte into U+FFFD. There is no {@link MAX_THEME_FILE_BYTES} ceiling here for the same reason: that
 * limit bounds text a caller reads or writes, and a reset carries no text.
 *
 * A live file whose bytes already match is not written at all. A missing live file is recreated,
 * along with any missing parent folders, and takes the original's mode (`copyFileSync` copies it).
 * An existing live file keeps its own mode.
 *
 * @param required.themeDir - The live theme's own folder (`DiscoveredTheme.dir`).
 * @param required.themesRoot - The configured themes root, for the live side's recognized-root check.
 * @param required.originalDir - The theme's catalog folder (`<themesRoot>/__original-themes__/<tier>/<id>`).
 * @param required.originalsRoot - The catalog root (`<themesRoot>/__original-themes__`).
 * @param required.relativePath - The file, relative to both folders.
 * @returns `null` when the catalog has no regular file at `relativePath`. That is checked before the
 * live side is resolved, so nothing is touched. Otherwise `bytes` is the original's size, and
 * `wasModified` is `false` when the live bytes already matched (nothing written) or `true` after the
 * copy.
 * @throws {ThemePathError} When `relativePath` fails containment against the LIVE folder, or the live
 * path exists and is not a regular file.
 * @throws Whatever `openSync`/`readSync`/`accessSync`/`copyFileSync`/`chmodSync`/`renameSync` throw,
 * e.g. `EACCES` for an unreadable original or a read-only live file. A failed copy leaves no temp
 * file behind.
 * @complexity O(s) time in the file size, for the comparison and the copy; O(1) space in this process.
 */
export function resetThemeFileToOriginal(
  required: { themeDir: string; themesRoot: string; originalDir: string; originalsRoot: string; relativePath: string },
  _optional: Record<string, never> = {}
): { wasModified: boolean; bytes: number } | null {
  const { themeDir, themesRoot, relativePath } = required;
  const original = originalRegularFile(required);
  if (!original) return null;
  const target = resolveThemeFilePath({ themeDir, themesRoot, relativePath });
  const live = statOrThemePathError(target, relativePath);
  if (live && !live.isFile()) {
    throw new ThemePathError(`path '${relativePath}' exists and is not a regular file`);
  }
  if (live?.size === original.size && filesHaveSameBytes(target, original.path)) {
    return { wasModified: false, bytes: original.size };
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileAtomically(target, relativePath, (tempPath) => copyFileSync(original.path, tempPath));
  return { wasModified: true, bytes: original.size };
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
  // statOrThemePathError, NEVER a bare statSync — same circular-symlink ELOOP escape the other
  // post-resolve stat calls in this file were fixed for (see statOrThemePathError's own doc):
  // `resolveThemeFilePath` does not resolve a `source` that is ITSELF a self-referential symlink, so
  // this is the first call that can observe the cycle. Still follows a symlink pointing at a real
  // file inside the theme — `copyFileSync`/`renameSync` below already read/move through such a link
  // the same way `open()` does, so this check must match that, not refuse it.
  const sourceStat = statOrThemePathError(source, sourcePath);
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
 * Suffix a caller-desired relative path to avoid colliding with anything already in `existingPaths`,
 * following the same `name`, `name-1`, `name-2` … shape `nextAvailableThemeId` (`theme.ts`) uses for
 * theme ids — but split around the extension, since a theme id (`basic`) is a bare folder name with
 * no extension to preserve, while a file path (`pages/about.html`) needs `about-1.html`, not
 * `about.html-1`. That shape difference is why this is its own small function instead of a direct
 * call into `nextAvailableThemeId`: the collision LOOP is identical, the thing being suffixed is not.
 *
 * Moved here from `explore.ts` (2026-09-12) so `tool-registrations.ts`'s `theme_copy_file` agent tool
 * can call the exact same collision-avoidance the HTTP copy route uses, without a
 * `features/theme` -> `server/**` import — the identical reason `validateFileIdentityChange` moved
 * to `file-identity-lock.ts` on 2026-08-30 (see that module's own header). `explore.ts` re-exports
 * this definition rather than defining its own, so its existing callers and tests are unchanged.
 *
 * @complexity O(n) in the number of existing collisions with the desired name.
 * @overallScore 100/100
 */
export function nextAvailableFileName(
  required: { desiredPath: string; existingPaths: ReadonlySet<string> },
  _optional: Record<string, never> = {}
): string {
  const { desiredPath, existingPaths } = required;
  const slash = desiredPath.lastIndexOf("/");
  const dot = desiredPath.lastIndexOf(".");
  // A dot has to fall AFTER the last slash to be the filename's own extension — otherwise it belongs
  // to a directory segment (not a real case in this theme layout, but cheap to get right).
  const hasExt = dot > slash;
  const base = hasExt ? desiredPath.slice(0, dot) : desiredPath;
  const ext = hasExt ? desiredPath.slice(dot) : "";

  if (!existingPaths.has(desiredPath)) return desiredPath;
  let suffix = 1;
  let candidate = `${base}-${suffix}${ext}`;
  while (existingPaths.has(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}${ext}`;
  }
  return candidate;
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

/**
 * Delete one file inside a theme's folder.
 *
 * Callers are expected to have already decided this delete is SAFE to perform — required-file,
 * generated-tree, and identity-lock checks live one layer up ({@link resolveThemeFileWriteScope}, and
 * `explore.ts`'s own `validateFileIdentityChange`, shared with {@link renameThemeFile}'s own route).
 * This function only enforces the one thing every write in this file enforces: containment. There is
 * no recovery path if a caller got that wrong — this repo keeps no theme-file revision history, so a
 * deleted file is gone until it is re-authored, or (for a file with a catalog original) reset from
 * there before it was deleted, which is no longer possible once the path itself does not exist.
 *
 * @throws {ThemePathError} On containment failure, a missing target, or a target that is not a
 * regular file — deleting a directory through this path is refused, not attempted.
 * @complexity O(1) — a single `rmSync`.
 * @overallScore 100/100
 */
export function deleteThemeFile(
  required: { themeDir: string; themesRoot: string; relativePath: string },
  _optional: Record<string, never> = {}
): void {
  const target = resolveThemeFilePath(required);
  // statOrThemePathError, NEVER a bare statSync — same circular-symlink ELOOP escape `readThemeFile`
  // and `writeThemeFile` were fixed for (see statOrThemePathError's own doc): `resolveThemeFilePath`
  // does not resolve a `target` that is ITSELF a self-referential symlink, so this is the first call
  // that can observe the cycle. Still follows a symlink pointing at a real file inside the theme — the
  // delete then removes that symlink's own directory entry via `rmSync` below, same as deleting any
  // other existing target.
  const stat = statOrThemePathError(target, required.relativePath);
  if (!stat) throw new ThemePathError(`file '${required.relativePath}' does not exist in this theme`);
  if (!stat.isFile()) throw new ThemePathError(`path '${required.relativePath}' is not a regular file`);
  rmSync(target);
}

/**
 * Whether one path resolves to a BUILT theme's generated tree — read-only from every per-file surface
 * — or to a location that stays editable (ADR-020 §5, `ThemeBuildInfo`'s own doc: "a built theme's
 * source keeps per-file reset and AI-authorability; only its generated tree loses granularity").
 *
 * `"editable"` for every theme on disk today (`manifest.build?.source !== "compiled"` — every theme is
 * `authored`, unchanged). For a COMPILED theme, `"editable"` is narrowed to exactly two things: `
 * theme.json` itself (the one file a compiled theme still needs to keep editing — author, lineage —
 * without touching generated output), and anything under `manifest.build.sourceDir`, which is real,
 * hand-authored source with no cross-file desync risk an editable file doesn't already carry on its
 * own. Everything else is `"generated-readonly"`: one `pages/index.html` edited or reset in isolation
 * from the same build's `js/main.js` would desync the release from what `build.artifactHashes` actually
 * verifies (`build-conformance.ts`), so the generated tree is never mutated file-by-file — it is
 * restored, when it is, only as one complete, re-verified release.
 *
 * A compiled theme declaring no `sourceDir` has no editable region here at all beyond `theme.json` —
 * `loadTheme`'s own manifest-shape validation already flags such a theme `invalid` (`sourceDir` is
 * REQUIRED when `build.source` is `"compiled"`), so this function does not need to guess a fallback
 * convention like `src/` a real author's build might not even use.
 *
 * This is a PURE policy decision, not itself a containment check — callers still resolve
 * `relativePath` through {@link resolveThemeFilePath} before touching the filesystem; this only
 * answers "is this write/reset allowed at all for this theme's lifecycle class."
 */
export type ThemeFileWriteScope =
  | { readonly kind: "editable" }
  | { readonly kind: "generated-readonly"; readonly reason: string };

export function resolveThemeFileWriteScope(
  required: { manifest: Pick<ThemeManifest, "build">; relativePath: string },
  _optional: Record<string, never> = {}
): ThemeFileWriteScope {
  const { manifest, relativePath } = required;
  if (manifest.build?.source !== "compiled") return { kind: "editable" };

  // Normalized (not raw) for the same reason `isGeneratedThemePath` is — see its doc. Comparing the
  // path as spelled let `src/../pages/index.html` match the `sourceDir` prefix and resolve "editable",
  // handing back write permission on a built theme's GENERATED tree, which is the ADR-020 §5 refusal
  // this function exists to make.
  const normalized = normalizeThemeRelativePath(relativePath);
  if (normalized === "theme.json") return { kind: "editable" };

  const sourceDir = manifest.build.sourceDir;
  if (sourceDir !== undefined && (normalized === sourceDir || normalized.startsWith(`${sourceDir}/`))) {
    return { kind: "editable" };
  }

  return {
    kind: "generated-readonly",
    reason:
      "this file is generated output of a built theme (theme.json build.source: 'compiled'); it is versioned and restored only as one complete release, never edited or reset file-by-file — edit the source under build.sourceDir and rebuild instead",
  };
}

/**
 * Restore a BUILT theme's entire generated tree — every path {@link resolveThemeFileWriteScope}
 * classifies `generated-readonly` for this manifest — from its catalog original, as one operation.
 * Never partial: every existing generated file is removed first, then every catalog generated file is
 * recopied, so the live tree ends up an EXACT copy of the catalog's generated output rather than a
 * merge of old and new. `theme.json` and everything under `build.sourceDir` are untouched — this
 * restores only the region {@link resolveThemeFileWriteScope} already refuses to write, the other half
 * of ADR-020 §5's "restored atomically" (per-file reset still covers the source, unchanged).
 *
 * "One operation" here means indivisible from the CALLER's perspective — enumerate both sides fully
 * before mutating anything — not an OS-level transaction; a crash mid-restore can still leave a
 * partial tree, the same caveat every other multi-file write in this codebase already accepts
 * (`downloadMarketplaceTheme`'s own two `cpSync` calls carry the identical caveat, undocumented there).
 *
 * Reuses {@link listThemeFiles}'s walk for both sides (live and catalog) rather than a second directory
 * walker: `THEME_CATALOG_DIR`'s own layout mirrors a real themes root's `<tier>/<id>/` shape (see that
 * constant's doc), so `listThemeFiles({ themeDir: catalogDir, themesRoot: catalogRoot })` passes the
 * same recognized-root check a live theme's call does, and inherits the same symlink-refusing,
 * bounded walk for free.
 *
 * @throws {ThemePathError} If this theme is not a compiled build (nothing to restore — every file
 * already resets per-file), or has no catalog original to restore from at all.
 * @complexity O(f) in the theme's own generated file count — two bounded directory walks plus one
 * `rmSync`/`copyFileSync` per generated file.
 */
export function restoreBuiltThemeGeneratedTree(
  required: { themeDir: string; themesRoot: string; manifest: Pick<ThemeManifest, "id" | "tier" | "build"> },
  _optional: Record<string, never> = {}
): { restoredFiles: string[] } {
  const { themeDir, themesRoot, manifest } = required;
  if (manifest.build?.source !== "compiled") {
    throw new ThemePathError("this theme is not a built release; there is no generated tree to restore");
  }

  const catalogDir = join(themesRoot, THEME_CATALOG_DIR, manifest.tier, manifest.id);
  if (!existsSync(catalogDir)) {
    throw new ThemePathError(`theme '${manifest.id}' has no stored original, so its generated tree cannot be restored`);
  }

  const isGenerated = (relativePath: string): boolean =>
    resolveThemeFileWriteScope({ manifest, relativePath }).kind === "generated-readonly";

  // Enumerate both sides fully before touching disk, so a read failure on either side aborts before
  // any file is removed.
  const liveGenerated = listThemeFiles({ themeDir, themesRoot }).filter(isGenerated);
  const catalogRoot = join(themesRoot, THEME_CATALOG_DIR);
  const catalogGenerated = listThemeFiles({ themeDir: catalogDir, themesRoot: catalogRoot }).filter(isGenerated);

  for (const relativePath of liveGenerated) {
    rmSync(join(themeDir, relativePath), { force: true });
  }
  for (const relativePath of catalogGenerated) {
    const dest = join(themeDir, relativePath);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(catalogDir, relativePath), dest);
  }

  return { restoredFiles: catalogGenerated.sort() };
}
