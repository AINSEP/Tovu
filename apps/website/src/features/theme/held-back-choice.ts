import fs from "node:fs";
import path from "node:path";

/**
 * @file Addressing a theme that site import held back (left under `<siteDir>/.import-quarantine/
 * themes/<tierPath>/<name>/`), and the one-line marker that remembers which theme the imported site
 * had chosen when import switched it to the fallback. Import itself records nothing about that
 * choice (`import-keep-off.ts` only rewrites the active theme id), so without this marker the
 * Themes screen could not tell the owner why the site looks different.
 *
 * Tovu's own on-disk site layout, not a Jini concern.
 */

/** The unserved folder import writes every refused file under (`import-restore-placement.ts`). */
export const HELD_BACK_DIR = ".import-quarantine";
const MARKER_FILE = "held-back-choice.json";

/** Folder names accepted as a theme name: must start with a letter or digit, so `.`, `..` and dot
 *  folders can never be spelled; at most 128 characters. Import itself accepts any `[^/]+`, so a
 *  stranger name is simply not addressable here (it stays held back). */
const NAME = "[A-Za-z0-9][A-Za-z0-9._-]{0,127}";
const HELD_BACK_ID = new RegExp(`^((?:__original-themes__/)?(?:static|declarative))/(${NAME})$`);
const THEME_NAME = new RegExp(`^${NAME}$`);
/** Only the two tiers a live site's chosen theme can sit in; originals are never "chosen". */
const CHOSEN_TIERS = ["static", "declarative"] as const;

export type HeldBackErrorCode = "INVALID_ID" | "HELD_BACK_NOT_FOUND" | "APPROVAL_REQUIRED" | "CHECK_FAILED" | "CHANGED_SINCE_CHECK" | "NAME_TAKEN";

/** A refusal the routes map to an HTTP status; `problems` is set for `CHECK_FAILED`. */
export class HeldBackThemeError extends Error {
  readonly code: HeldBackErrorCode;
  readonly problems: readonly string[];
  constructor(required: { code: HeldBackErrorCode; message: string }, optional: { problems?: readonly string[]; cause?: unknown } = {}) {
    super(required.message, optional.cause === undefined ? undefined : { cause: optional.cause });
    this.name = "HeldBackThemeError";
    this.code = required.code;
    this.problems = optional.problems ?? [];
  }
}

export interface HeldBackId { id: string; tierPath: string; name: string }
export interface HeldBackChoice { chosenThemeId: string; fallbackThemeId: string }
export interface ChosenThemeHeldBack { themeId: string; name: string; fallbackThemeId: string }

/**
 * Parse a held-back theme id (`static/foo`, `__original-themes__/declarative/foo`).
 * @throws {HeldBackThemeError} `INVALID_ID` for anything else, including traversal and absolute paths.
 * @complexity O(id length).
 */
export function parseHeldBackId(required: { themeId: string }): HeldBackId {
  const match = HELD_BACK_ID.exec(required.themeId);
  if (!match) throw new HeldBackThemeError({ code: "INVALID_ID", message: "That is not a held-back theme name." });
  return { id: required.themeId, tierPath: match[1]!, name: match[2]! };
}

/** `<siteDir>/.import-quarantine`. @complexity O(1). */
export function heldBackRoot(required: { siteDir: string }): string {
  return path.join(required.siteDir, HELD_BACK_DIR);
}

/** True for "nothing is there" (`ENOENT`, or a path component that is not a folder). Anything
 *  else (permissions, I/O) is a real fault and is rethrown by the callers. @complexity O(1). */
export function isAbsent(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/** `theme.json`'s `name` when it is a non-empty string, else the folder name (also when the
 *  manifest is missing or not JSON). @throws on any other read fault. @complexity O(manifest size). */
export function heldBackThemeName(required: { dir: string; fallback: string }): string {
  try {
    const name = JSON.parse(fs.readFileSync(path.join(required.dir, "theme.json"), "utf8"))?.name;
    return typeof name === "string" && name.trim() ? name : required.fallback;
  } catch (err) {
    if (err instanceof SyntaxError || isAbsent(err)) return required.fallback;
    throw err;
  }
}

/** Whether `<root>/themes/<id>` is a real folder (a link to one does not count). @complexity O(1). */
export function isHeldBackFolder(required: { siteDir: string; id: string }): boolean {
  try { return fs.lstatSync(path.join(heldBackRoot(required), "themes", required.id)).isDirectory(); } catch (err) {
    if (isAbsent(err)) return false;
    throw err;
  }
}

/**
 * The marker, or `null` when it is absent, not JSON, or names something that is not a held-back id.
 * @throws on any other read fault.
 * @complexity O(marker size).
 */
export function readHeldBackChoice(required: { siteDir: string }): HeldBackChoice | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(heldBackRoot(required), MARKER_FILE), "utf8"));
    if (typeof raw?.fallbackThemeId !== "string" || typeof raw.chosenThemeId !== "string") return null;
    parseHeldBackId({ themeId: raw.chosenThemeId });
    return { chosenThemeId: raw.chosenThemeId, fallbackThemeId: raw.fallbackThemeId };
  } catch (err) {
    if (err instanceof SyntaxError || err instanceof HeldBackThemeError || isAbsent(err)) return null;
    throw err;
  }
}

/**
 * Import-time decision: remember the archive's chosen theme when import switched the site away from
 * it AND that theme now sits in the quarantine. The chosen id comes from the archive, so it must
 * pass the name grammar before it is ever joined into a path.
 * @returns the marker written, or `null` when none was due.
 * @complexity O(1) — two `lstat`s and at most one small write.
 */
export function recordHeldBackChoice(required: { siteDir: string; chosenThemeId: string | null; finalThemeId: string | null }): HeldBackChoice | null {
  const { siteDir, chosenThemeId: chosen, finalThemeId: final } = required;
  // Import copies unknown archive files into the quarantine verbatim, so a marker may have arrived
  // inside the archive itself. Only this decision may leave one behind: clear it first.
  fs.rmSync(path.join(heldBackRoot({ siteDir }), MARKER_FILE), { force: true });
  if (!chosen || !final || chosen === final || !THEME_NAME.test(chosen)) return null;
  const tier = CHOSEN_TIERS.find(candidate => isHeldBackFolder({ siteDir, id: candidate + "/" + chosen }));
  if (!tier) return null;
  const marker = { chosenThemeId: tier + "/" + chosen, fallbackThemeId: final };
  fs.writeFileSync(path.join(heldBackRoot({ siteDir }), MARKER_FILE), JSON.stringify(marker), { mode: 0o600 });
  return marker;
}

/** Delete the marker only when it names `themeId`; any other marker is left as it is. @complexity O(1). */
export function forgetHeldBackChoice(required: { siteDir: string; themeId: string }): void {
  if (readHeldBackChoice(required)?.chosenThemeId !== required.themeId) return;
  fs.rmSync(path.join(heldBackRoot(required), MARKER_FILE), { force: true });
}

/**
 * The "your chosen theme was held back" notice: only while the marked theme is still held back and
 * the site still shows the fallback import picked (the owner has not chosen another theme since).
 * @complexity O(1) plus one manifest read.
 */
export function chosenThemeHeldBack(required: { siteDir: string; activeThemeId: string | null }): ChosenThemeHeldBack | null {
  const choice = readHeldBackChoice(required);
  if (!choice || choice.fallbackThemeId !== required.activeThemeId || !isHeldBackFolder({ siteDir: required.siteDir, id: choice.chosenThemeId })) return null;
  const { name } = parseHeldBackId({ themeId: choice.chosenThemeId });
  const dir = path.join(heldBackRoot(required), "themes", choice.chosenThemeId);
  return { themeId: choice.chosenThemeId, name: heldBackThemeName({ dir, fallback: name }), fallbackThemeId: choice.fallbackThemeId };
}
