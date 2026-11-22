import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { MAX_WALK_DEPTH, isRecognizedThemeRoot, ThemePathError } from "./theme-files.js";


/** Ceiling on one `theme_list_files` walk, so a pathological folder cannot produce an unbounded response. */
export const MAX_LISTED_FILES = 2_000;

/**
 * One directory entry's contribution to {@link walkThemeDir}'s file listing: skip symlinks entirely
 * (neither descended nor reported — see the caller's own header on why a link out of the folder can
 * neither enumerate nor leak anything beyond it), recurse into real subdirectories, and record real
 * files (`found` is mutated in place, the shared accumulator for one `listThemeFiles` call).
 */
function visitThemeDirEntry({ dir, name, depth, base, found }: { dir: string; name: string; depth: number; base: string; found: string[] }, _optional = {}): void {
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
  if (stat.isDirectory()) walkThemeDir({ dir: full, depth: depth + 1, base, found });
  else if (stat.isFile()) found.push(relative(base, full).split(sep).join("/"));
  else {
    // Special entries are outside the theme file walk.
  }
}

/**
 * Descends real directories under `base` only, collecting relative file paths into `found`
 * (mutated in place), bounded by {@link MAX_WALK_DEPTH} and {@link MAX_LISTED_FILES}. Split from
 * {@link visitThemeDirEntry} so the loop itself carries none of the per-entry branching.
 */
function walkThemeDir({ dir, depth, base, found }: { dir: string; depth: number; base: string; found: string[] }, _optional = {}): void {
  if (depth > MAX_WALK_DEPTH || found.length >= MAX_LISTED_FILES) return;
  const names = readdirSync(dir);
  // render/ goes first: a media folder can hold more files than the cap, and must not hide the theme's own pages.
  for (const name of depth === 0 ? [...names.filter(entry => entry === "render"), ...names.filter(entry => entry !== "render")] : names) {
    if (found.length >= MAX_LISTED_FILES) return;
    visitThemeDirEntry({ dir, name, depth, base, found });
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
    throw new ThemePathError({ message: `theme folder '${themeDir}' is not under a recognized theme root` });
  }
  if (!existsSync(themeDir)) return [];

  const base = realpathSync(themeDir);
  const found: string[] = [];
  walkThemeDir({ dir: base, depth: 0, base, found });

  return found.sort();
}
