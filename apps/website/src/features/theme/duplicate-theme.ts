import { randomBytes } from "node:crypto";
import { constants as fsConstants, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { TRASH_DIR_NAME } from "./file-identity-lock.js";
import { isRecognizedThemeRoot, MAX_LISTED_FILES, MAX_THEME_FILE_BYTES, MAX_WALK_DEPTH } from "./theme-files.js";
import { writeGeneratedThemeOriginal } from "./sync-originals.js";
import { MIGRATION_STAGING_DIR_PREFIX, nextAvailableThemeId, rescanThemes, THEME_CATALOG_DIR, type DiscoveredTheme, type ThemeTier } from "./theme.js";

/**
 * @file `duplicateTheme` — the one way a NEW theme folder comes into existence at runtime: copy an
 * existing discovered theme (a stock theme the site was seeded with counts — every stock theme is
 * a discovered theme under the site's own `themesDir`) into a fresh sibling folder, then give the
 * copy its own identity in `theme.json`.
 *
 * Two callers, one service (owner, 2026-10-08): the `theme_duplicate` agent tool
 * (`duplicate-theme-tool.ts`) and the admin Themes screen's Duplicate action
 * (`server/inbound/admin-http/routes/themes/duplicate.ts`). Both go through
 * {@link duplicateDiscoveredTheme}, so "what id does the copy get", "what counts as taken", and
 * "what gets refused" can never differ between the human and the agent.
 *
 * Same "copy the original, edit the copy" model `development/scripts/theme-tool.ts`'s `copy`
 * command implements for the CLI, including its `lineage` manifest field and its id-assignment rule
 * ({@link nextAvailableThemeId}). The source is only ever READ: every write lands in a staging
 * folder that is renamed into place at the end, so a refusal or crash halfway never leaves a
 * half-copied theme for discovery to find, and never touches the source.
 *
 * Generic? No — this is Tovu's on-disk theme layout (`<themesRoot>/<tier>/<id>/theme.json`), not a
 * Jini concern.
 */

/** Total bytes one duplicate may copy. 50 × the per-file text ceiling: the largest stock theme is
 *  ~2.5MB, so this only stops a pathological folder, never a real theme. */
export const MAX_DUPLICATE_THEME_BYTES = MAX_THEME_FILE_BYTES * 50;

/** Display-name length ceiling — a label, not a description. */
const MAX_THEME_NAME_LENGTH = 120;

/** Folder-safe id: lowercase alphanumerics and single hyphens, no leading/trailing hyphen, ≤ 64
 *  chars. Excludes `.`/`_` outright, so an id can never spell `..`, a dot-folder, or a `__catalog__`
 *  name. */
const THEME_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/** The version a copy starts at — it is a new theme, not the source's next release. */
const DUPLICATE_INITIAL_VERSION = "1.0.0";

export type DuplicateThemeErrorCode =
  | "SOURCE_NOT_FOUND"
  | "INVALID_NAME"
  | "INVALID_ID"
  | "ID_TAKEN"
  | "SOURCE_NOT_COPYABLE"
  | "SYMLINK"
  | "TOO_LARGE"
  | "BAD_MANIFEST";

/** Every refusal {@link duplicateTheme} raises. A different input (or a different source) fixes each
 *  one, so callers map it to a 4xx / a tool input error, never a 500. `ID_TAKEN` is a conflict. */
export class DuplicateThemeError extends Error {
  readonly code: DuplicateThemeErrorCode;
  constructor(code: DuplicateThemeErrorCode, message: string) {
    super(message);
    this.name = "DuplicateThemeError";
    this.code = code;
  }
}

export interface DuplicateThemeResult {
  id: string;
  name: string;
  tier: ThemeTier;
  /** Absolute folder of the new theme. Callers addressing a model or a browser drop this. */
  dir: string;
  sourceThemeId: string;
  files: number;
  bytes: number;
}

/**
 * Turn a display name into a folder-safe id candidate: strip diacritics, lowercase, collapse every
 * run of non-alphanumerics to one hyphen, trim hyphens, cap at 48 chars (leaving room for a `-N`
 * suffix inside {@link THEME_ID_PATTERN}'s 64). Empty when the name has no Latin letters/digits.
 * @complexity O(n) in the name length.
 */
export function themeIdFromName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

/** Trimmed, length-checked, control-character-free display name, or a refusal. */
function validateThemeName(newName: string): string {
  const name = newName.trim();
  if (name.length === 0) throw new DuplicateThemeError("INVALID_NAME", "newName must not be empty");
  if (name.length > MAX_THEME_NAME_LENGTH) {
    throw new DuplicateThemeError("INVALID_NAME", `newName must be at most ${MAX_THEME_NAME_LENGTH} characters`);
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) throw new DuplicateThemeError("INVALID_NAME", "newName must not contain control characters");
  return name;
}

/**
 * The id the copy gets. An explicit `newId` is the caller's exact choice: malformed or taken is
 * refused, never silently suffixed (the caller asked for THAT id). An omitted one is derived from the
 * name and suffixed `-1`, `-2`, … through {@link nextAvailableThemeId} — the CLI's rule.
 */
function assignThemeId(
  required: { source: DiscoveredTheme; themesRoot: string; name: string; takenIds: ReadonlySet<string> },
  optional: { newId?: string }
): string {
  const { source, themesRoot, name, takenIds } = required;
  const parentDir = dirname(source.dir);
  const alsoTaken = (id: string): boolean => takenIds.has(id) || existsSync(join(parentDir, id));
  const pick = (desiredId: string): string =>
    nextAvailableThemeId({ desiredId, themesRoot, tier: source.manifest.tier }, { alsoTaken });

  if (optional.newId !== undefined) {
    if (!THEME_ID_PATTERN.test(optional.newId)) {
      throw new DuplicateThemeError(
        "INVALID_ID",
        `newId '${optional.newId}' must be lowercase letters, digits and single hyphens (1-64 chars, no leading/trailing hyphen)`
      );
    }
    if (pick(optional.newId) !== optional.newId) {
      throw new DuplicateThemeError("ID_TAKEN", `theme id '${optional.newId}' is already taken — pick another newId, or omit it to get a free one`);
    }
    return optional.newId;
  }
  return pick(themeIdFromName(name) || `${source.manifest.id}-copy`);
}

/** One file to copy, relative to the theme folder (`/`-separated). */
interface PlannedFile {
  relativePath: string;
  bytes: number;
}

/**
 * Walk the source folder and plan the copy, refusing — before a single byte is written — anything
 * the theme store would not hold: a symlink anywhere (never followed, never copied: a link is how a
 * copy would read outside the theme), more files than {@link MAX_LISTED_FILES}, deeper than
 * {@link MAX_WALK_DEPTH}, or more than {@link MAX_DUPLICATE_THEME_BYTES} in total. The top-level
 * `.trash/` is skipped: soft-deleted files are not part of the theme.
 * @complexity O(n) in the source's file count, one `lstat` each.
 */
function planThemeCopy(sourceDir: string): { files: PlannedFile[]; dirs: string[]; bytes: number } {
  const files: PlannedFile[] = [];
  const dirs: string[] = [];
  let bytes = 0;

  const visit = (absDir: string, relDir: string, depth: number): void => {
    if (depth > MAX_WALK_DEPTH) {
      throw new DuplicateThemeError("TOO_LARGE", `source theme is nested deeper than ${MAX_WALK_DEPTH} folders ('${relDir}')`);
    }
    for (const entry of readdirSync(absDir).sort()) {
      const relativePath = relDir ? `${relDir}/${entry}` : entry;
      if (relativePath === TRASH_DIR_NAME) continue;
      const stat = lstatSync(join(absDir, entry));
      if (stat.isSymbolicLink()) {
        throw new DuplicateThemeError("SYMLINK", `source theme contains a symbolic link ('${relativePath}'); themes with links cannot be duplicated`);
      }
      if (stat.isDirectory()) {
        dirs.push(relativePath);
        visit(join(absDir, entry), relativePath, depth + 1);
        continue;
      }
      if (!stat.isFile()) continue;
      bytes += stat.size;
      files.push({ relativePath, bytes: stat.size });
      if (files.length > MAX_LISTED_FILES) {
        throw new DuplicateThemeError("TOO_LARGE", `source theme has more than ${MAX_LISTED_FILES} files`);
      }
      if (bytes > MAX_DUPLICATE_THEME_BYTES) {
        throw new DuplicateThemeError("TOO_LARGE", `source theme is larger than ${MAX_DUPLICATE_THEME_BYTES} bytes`);
      }
    }
  };

  visit(sourceDir, "", 0);
  return { files, dirs, bytes };
}

/**
 * Give the staged copy its own identity: `id` (must equal the folder name or the theme loads
 * `invalid`), `name`, a reset `version`, and `lineage` — the same metadata-only record the CLI's
 * `copy` writes (nothing at runtime reads it; it answers "what was this forked from").
 */
function rewriteCopiedManifest(stagingDir: string, identity: { id: string; name: string; source: DiscoveredTheme }): void {
  const manifestPath = join(stagingDir, "theme.json");
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    throw new DuplicateThemeError("BAD_MANIFEST", `source theme '${identity.source.manifest.id}' has no readable theme.json`);
  }
  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
    throw new DuplicateThemeError("BAD_MANIFEST", `source theme '${identity.source.manifest.id}' has a theme.json that is not a JSON object`);
  }
  const record = manifest as Record<string, unknown>;
  const sourceVersion = String(record.version ?? identity.source.manifest.version ?? "0.0.0");
  record.id = identity.id;
  record.name = identity.name;
  record.version = DUPLICATE_INITIAL_VERSION;
  record.lineage = { from: identity.source.manifest.id, tier: identity.source.manifest.tier, version: sourceVersion };
  writeFileSync(manifestPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

/**
 * Snapshot the just-created copy into the site's originals catalog
 * (`<themesRoot>/__original-themes__/<tier>/<id>`), the same place a seeded theme's original lives,
 * so the copy's Explore has something to Reset to and shows no "no stored original" banner (owner
 * 2026-10-08). Reuses `writeGeneratedThemeOriginal` — the generator the shipped originals come from —
 * so a copy's original is filtered exactly like theirs. `nextAvailableThemeId` already counts a
 * catalog folder as taken, so the target is free and nothing existing is replaced.
 *
 * A copy without its original is the state this exists to end, so a failure here removes the copy
 * (a folder this same call just created) and rethrows — the caller sees one failed duplicate.
 *
 * @throws Whatever `node:fs` throws writing the catalog folder, after removing `destDir`.
 * @complexity O(f) in the copy's file count.
 */
function writeCopyOriginal(required: { destDir: string; themesRoot: string; tier: ThemeTier; id: string }): void {
  const { destDir, themesRoot, tier, id } = required;
  try {
    writeGeneratedThemeOriginal({ liveDir: destDir, targetDir: join(themesRoot, THEME_CATALOG_DIR, tier, id) });
  } catch (err) {
    rmSync(destDir, { recursive: true, force: true });
    throw err;
  }
}

/**
 * Copy `source` into a new sibling theme folder named after the assigned id.
 *
 * @param required.source - The discovered theme to copy. Only read, never written.
 * @param required.themesRoot - The site's themes root (`RouteDeps.themesDir`); the source must sit at
 * a recognized theme root under it.
 * @param required.newName - Display name for the copy (`theme.json` `name`).
 * @param required.takenIds - Every discovered theme id; the copy's id must not collide with any.
 * @param optional.newId - Exact id to use; refused if malformed or taken. Omitted ⇒ derived from
 * `newName` and suffixed until free.
 * @param optional.stagingSuffix - Test seam for the staging folder's random suffix.
 * @returns The new theme's id, name, tier, folder, and what was copied.
 * @throws {DuplicateThemeError} On any refusal; nothing is left on disk. A failed write of the copy's
 * stored original ({@link writeCopyOriginal}) also leaves nothing — the copy is removed.
 * @complexity O(n + b) in the source's file count and bytes (copied twice: the theme and its original).
 */
export function duplicateTheme(
  required: { source: DiscoveredTheme; themesRoot: string; newName: string; takenIds: ReadonlySet<string> },
  optional: { newId?: string; stagingSuffix?: () => string } = {}
): DuplicateThemeResult {
  const { source, themesRoot, takenIds } = required;
  if (!isRecognizedThemeRoot({ themeDir: source.dir, themesRoot }) || !existsSync(source.dir)) {
    throw new DuplicateThemeError("SOURCE_NOT_COPYABLE", `theme '${source.manifest.id}' is not inside this site's themes folder`);
  }
  const name = validateThemeName(required.newName);
  const id = assignThemeId({ source, themesRoot, name, takenIds }, { newId: optional.newId });

  const sourceDir = realpathSync(source.dir);
  const plan = planThemeCopy(sourceDir);
  const parentDir = dirname(source.dir);
  const destDir = join(parentDir, id);
  const suffix = optional.stagingSuffix?.() ?? randomBytes(6).toString("hex");
  const stagingDir = join(parentDir, `${MIGRATION_STAGING_DIR_PREFIX}duplicate-${id}-${suffix}`);

  try {
    mkdirSync(stagingDir);
    for (const dir of plan.dirs) mkdirSync(join(stagingDir, dir), { recursive: true });
    for (const file of plan.files) {
      copyFileSync(join(sourceDir, file.relativePath), join(stagingDir, file.relativePath), fsConstants.COPYFILE_EXCL);
    }
    rewriteCopiedManifest(stagingDir, { id, name, source });
    // Re-checked right before the rename: `renameSync` onto an EMPTY existing directory replaces it
    // silently on POSIX, so a folder created since `assignThemeId` must be refused here, not merged.
    if (existsSync(destDir)) throw new DuplicateThemeError("ID_TAKEN", `theme id '${id}' was taken while copying — try again`);
    renameSync(stagingDir, destDir);
  } catch (err) {
    rmSync(stagingDir, { recursive: true, force: true });
    throw err;
  }
  writeCopyOriginal({ destDir, themesRoot, tier: source.manifest.tier, id });

  return { id, name, tier: source.manifest.tier, dir: destDir, sourceThemeId: source.manifest.id, files: plan.files.length, bytes: plan.bytes };
}

/**
 * The service both callers use: find `sourceThemeId` among the live discovered themes, duplicate it,
 * then {@link rescanThemes} so the copy is in `themes` (the array every request reads) before this
 * returns — a duplicate the next page view cannot see would look like a failure.
 *
 * @returns The duplicate's result plus the copy's discovered entry (its `status`/`errors` tell the
 * caller whether it loaded `valid`).
 * @throws {DuplicateThemeError} `SOURCE_NOT_FOUND` for an unknown id, plus every {@link duplicateTheme} refusal.
 * @complexity O(n + b) for the copy, plus one full rediscovery (O(t) themes).
 */
export function duplicateDiscoveredTheme(
  required: { themes: DiscoveredTheme[]; themesDir: string; sourceThemeId: string; newName: string },
  optional: { newId?: string; stagingSuffix?: () => string } = {}
): { result: DuplicateThemeResult; theme: DiscoveredTheme | undefined } {
  const { themes, themesDir, sourceThemeId, newName } = required;
  const source = themes.find((t) => t.manifest.id === sourceThemeId);
  if (!source) {
    const known = themes.map((t) => t.manifest.id).join(", ") || "(none discovered)";
    throw new DuplicateThemeError("SOURCE_NOT_FOUND", `theme '${sourceThemeId}' was not found — discovered themes are: ${known}`);
  }
  const takenIds = new Set(themes.map((t) => t.manifest.id));
  const result = duplicateTheme({ source, themesRoot: themesDir, newName, takenIds }, optional);
  rescanThemes({ themes, dir: themesDir });
  return { result, theme: themes.find((t) => t.manifest.id === result.id && basename(t.dir) === result.id) };
}
