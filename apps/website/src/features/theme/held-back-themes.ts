import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { explainThemeTree } from "#src/features/site-backup/import-restore-placement";
import { MAX_DUPLICATE_THEME_BYTES } from "./duplicate-theme.js";
import { MAX_WALK_DEPTH } from "./theme-files.js";
import { MAX_LISTED_FILES } from "./theme-file-listing.js";
import { rescanThemes } from "./theme-discovery.js";
import { loadTheme, type DiscoveredTheme } from "./theme.js";
import { forgetHeldBackChoice, heldBackRoot, isAbsent, heldBackThemeName, HeldBackThemeError, parseHeldBackId, type HeldBackId } from "./held-back-choice.js";

/**
 * @file The "Held back on import" themes: list them, re-run import's own checks on one, and move a
 * theme that now passes to its live folder after the owner approved exactly what was checked.
 * Restore never activates a theme and never deletes anything; the folder is renamed, not copied.
 *
 * Tovu's own on-disk site layout, not a Jini concern.
 */

/** Where import may hold a theme back (`import-restore-placement.ts`'s THEME_FILE tiers). */
const TIER_PATHS = ["static", "declarative", "__original-themes__/static", "__original-themes__/declarative"] as const;

export interface HeldBackTheme { id: string; name: string; tier: "static" | "declarative"; original: boolean; files: number; bytes: number }
export interface HeldBackCheck { themeId: string; passes: boolean; problems: string[]; digest: string | null; nameTaken: boolean }
export interface RestoredHeldBackTheme { theme: { id: string; name: string; status: "valid" | "invalid" }; restoredFrom: string }

interface TreeFile { relativePath: string; size: number }
interface HeldBackTree { files: TreeFile[]; bytes: number; links: string[]; tooLarge: boolean }

/**
 * Walk one held-back folder with `lstat` only: links are recorded, never followed; the walk stops
 * at the duplicate service's caps (files, depth, bytes) and reports `tooLarge` instead of throwing.
 * @complexity O(entries), one `lstat` each, sorted per folder.
 */
function walkHeldBackTree(required: { dir: string }): HeldBackTree {
  const tree: HeldBackTree = { files: [], bytes: 0, links: [], tooLarge: false };
  const pending = [{ abs: required.dir, rel: "", depth: 0 }];
  while (pending.length && !tree.tooLarge) {
    const { abs, rel, depth } = pending.pop()!;
    if (depth > MAX_WALK_DEPTH) { tree.tooLarge = true; break; }
    for (const entry of fs.readdirSync(abs).sort().reverse()) {
      const childRel = rel ? rel + "/" + entry : entry;
      const stat = fs.lstatSync(path.join(abs, entry));
      if (stat.isSymbolicLink()) tree.links.push(childRel);
      else if (stat.isDirectory()) pending.push({ abs: path.join(abs, entry), rel: childRel, depth: depth + 1 });
      else if (stat.isFile()) { tree.files.push({ relativePath: childRel, size: stat.size }); tree.bytes += stat.size; }
    }
    tree.tooLarge ||= tree.files.length > MAX_LISTED_FILES || tree.bytes > MAX_DUPLICATE_THEME_BYTES;
  }
  tree.files.sort((a, b) => (a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0));
  tree.links.sort();
  return tree;
}

/** Read without following a link swapped in after the walk's `lstat`. */
function readNoFollow(required: { file: string }): Buffer {
  const fd = fs.openSync(required.file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try { return fs.readFileSync(fd); } finally { fs.closeSync(fd); }
}

/**
 * sha256 over the sorted `(relativePath, size, sha256(bytes))` triples: what the owner approved.
 * @complexity O(total bytes), bounded by {@link MAX_DUPLICATE_THEME_BYTES}.
 */
function treeDigest(required: { dir: string; files: readonly TreeFile[] }): string {
  const digest = createHash("sha256");
  for (const file of required.files) {
    const bytes = createHash("sha256").update(readNoFollow({ file: path.join(required.dir, file.relativePath) })).digest("hex");
    digest.update(`${file.relativePath}\0${file.size}\0${bytes}\n`);
  }
  return digest.digest("hex");
}

function exists(required: { file: string }): boolean {
  try { fs.lstatSync(required.file); return true; } catch (err) {
    if (isAbsent(err)) return false;
    throw err;
  }
}

/**
 * The real folder for an id. `realpath` must equal the joined path, so neither the folder nor any
 * parent under the site is a link — such an entry is treated as absent, never followed.
 * @throws {HeldBackThemeError} `INVALID_ID` or `HELD_BACK_NOT_FOUND`.
 * @complexity O(path depth).
 */
function locateHeldBack(required: { siteDir: string; themeId: string }): HeldBackId & { dir: string } {
  const parsed = parseHeldBackId(required);
  const dir = path.join(heldBackRoot(required), "themes", parsed.id);
  const expected = path.join(fs.realpathSync(required.siteDir), path.relative(required.siteDir, dir));
  if (!exists({ file: dir }) || fs.realpathSync(dir) !== expected || !fs.lstatSync(dir).isDirectory()) throw new HeldBackThemeError({ code: "HELD_BACK_NOT_FOUND", message: "No held-back theme has that name." });
  return { ...parsed, dir };
}

/**
 * Every held-back theme tree, sorted by id; `[]` when nothing was held back. A folder that has no
 * `theme.json` while its live twin exists is the preserved build source of a live compiled theme
 * (import keeps that source out of the live tree), not a held-back theme.
 * @complexity O(held-back entries), one bounded walk per theme.
 */
export function listHeldBackThemes(required: { siteDir: string; themesDir: string }): HeldBackTheme[] {
  const themes: HeldBackTheme[] = [];
  for (const tierPath of TIER_PATHS) {
    const tierDir = path.join(heldBackRoot(required), "themes", tierPath);
    if (!exists({ file: tierDir }) || !fs.lstatSync(tierDir).isDirectory()) continue;
    for (const name of fs.readdirSync(tierDir)) {
      const theme = listedTheme({ ...required, id: tierPath + "/" + name });
      if (theme) themes.push(theme);
    }
  }
  return themes.sort((a, b) => (a.id < b.id ? -1 : 1));
}

function listedTheme(required: { siteDir: string; themesDir: string; id: string }): HeldBackTheme | null {
  let located: ReturnType<typeof locateHeldBack>;
  try { located = locateHeldBack({ siteDir: required.siteDir, themeId: required.id }); } catch (err) {
    // A folder name outside the id grammar, or a link: not addressable, so not listed.
    if (err instanceof HeldBackThemeError) return null;
    throw err;
  }
  if (!exists({ file: path.join(located.dir, "theme.json") }) && exists({ file: path.join(required.themesDir, located.id) })) return null;
  const tree = walkHeldBackTree({ dir: located.dir });
  return {
    id: located.id,
    name: heldBackThemeName({ dir: located.dir, fallback: located.name }),
    tier: located.tierPath.endsWith("static") ? "static" : "declarative",
    original: located.tierPath.startsWith("__original-themes__/"),
    files: tree.files.length,
    bytes: tree.bytes,
  };
}

/**
 * Re-run import's checks on one held-back theme: no links, within the caps, import's manifest and
 * file checks ({@link explainThemeTree}), then the theme must load `valid`. Read-only.
 * @throws {HeldBackThemeError} `INVALID_ID` or `HELD_BACK_NOT_FOUND`.
 * @complexity O(total bytes) for the digest, bounded by the walk caps.
 */
export function checkHeldBackTheme(required: { siteDir: string; themesDir: string; themeId: string }): HeldBackCheck {
  const located = locateHeldBack(required);
  const tree = walkHeldBackTree({ dir: located.dir });
  const problems = treeProblems({ tree });
  // Read file contents only once the tree is known to hold no links and to fit the caps.
  if (!problems.length) {
    const files = tree.files.map(file => "themes/" + located.id + "/" + file.relativePath);
    problems.push(...explainThemeTree({ root: heldBackRoot(required), id: located.id, files }));
  }
  if (!problems.length) {
    const theme = loadTheme({ themeDir: located.dir, id: located.name, source: "site" });
    if (theme.status !== "valid") problems.push(`It does not load as a working theme: ${theme.errors.slice(0, 3).join("; ")}`);
  }
  const passes = problems.length === 0;
  return {
    themeId: located.id,
    passes,
    problems,
    digest: passes ? treeDigest({ dir: located.dir, files: tree.files }) : null,
    nameTaken: exists({ file: path.join(required.themesDir, located.id) }),
  };
}

function treeProblems(required: { tree: HeldBackTree }): string[] {
  const { tree } = required;
  const problems: string[] = [];
  if (tree.links.length) problems.push(`It contains a link (${tree.links.slice(0, 5).join(", ")}), and links are never followed.`);
  if (tree.tooLarge) problems.push(`It is too large to restore safely (more than ${MAX_LISTED_FILES} files, ${MAX_WALK_DEPTH} folders deep or ${MAX_DUPLICATE_THEME_BYTES} bytes).`);
  return problems;
}

/**
 * Move one approved held-back theme to its live folder, then rescan so it is choosable. The check
 * is re-run here; the owner's `approvedDigest` must match it, so files changed after approval are
 * refused. The live folder is claimed with an exclusive `mkdir` and the theme renamed over that
 * empty folder (POSIX `rename` replaces only an EMPTY directory), so an existing theme is never
 * overwritten even if it appears between the check and the move.
 * @throws {HeldBackThemeError} `INVALID_ID`, `HELD_BACK_NOT_FOUND`, `APPROVAL_REQUIRED`,
 *   `CHECK_FAILED`, `CHANGED_SINCE_CHECK`, `NAME_TAKEN`; anything else is unexpected.
 * @complexity O(total bytes) for the re-check, plus one rescan of `themesDir`.
 */
export function restoreHeldBackTheme(required: { siteDir: string; themesDir: string; themes: DiscoveredTheme[]; themeId: string; approvedDigest: string }): RestoredHeldBackTheme {
  const located = locateHeldBack(required);
  if (!required.approvedDigest) throw new HeldBackThemeError({ code: "APPROVAL_REQUIRED", message: "Approve this theme before it is restored." });
  const check = checkHeldBackTheme(required);
  if (!check.passes) throw new HeldBackThemeError({ code: "CHECK_FAILED", message: "This theme still fails the safety checks, so it stays held back." }, { problems: check.problems });
  if (check.digest !== required.approvedDigest) throw new HeldBackThemeError({ code: "CHANGED_SINCE_CHECK", message: "This theme's files changed after you approved them. Check it again." });
  const target = path.resolve(required.themesDir, located.id);
  claimLiveFolder({ target });
  try { fs.renameSync(located.dir, target); } catch (err) { fs.rmdirSync(target); throw err; }
  rescanThemes({ themes: required.themes, dir: required.themesDir });
  forgetHeldBackChoice({ siteDir: required.siteDir, themeId: located.id });
  // Originals (`__original-themes__/...`) are not discovered as choosable themes; load them directly.
  const theme = required.themes.find(candidate => path.resolve(candidate.dir) === target) ?? loadTheme({ themeDir: target, id: located.name, source: "site" });
  return {
    theme: { id: located.name, name: theme.manifest.name || located.name, status: theme.status === "valid" ? "valid" : "invalid" },
    restoredFrom: located.id,
  };
}

/** @throws {HeldBackThemeError} `NAME_TAKEN` when the live folder already exists. */
function claimLiveFolder(required: { target: string }): void {
  fs.mkdirSync(path.dirname(required.target), { recursive: true });
  try { fs.mkdirSync(required.target); } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    throw new HeldBackThemeError({ code: "NAME_TAKEN", message: "A theme with this name is already installed. Rename or remove it first." }, { cause: err });
  }
}
