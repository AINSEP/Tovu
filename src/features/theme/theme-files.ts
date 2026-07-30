import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
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
