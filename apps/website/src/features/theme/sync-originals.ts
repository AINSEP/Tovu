import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { discoverAllBuiltInThemes, THEME_CATALOG_DIR, type ThemeTier } from "./theme.js";
import { isGeneratedThemePath } from "./theme-files.js";

/**
 * @file Generate `__original-themes__` from the shipped themes it is meant to mirror, instead of
 * hand-maintaining it.
 *
 * ---------------------------------------------------------------------------
 * The bug this exists to fix
 * ---------------------------------------------------------------------------
 * `content/themes/__original-themes__/<tier>/<id>` is what "reset to original" restores from
 * (`theme-files.ts`'s `restoreBuiltThemeGeneratedTree`, `explore.ts`'s per-file reset). Nothing
 * connected an edit to a shipped theme with its stored original — it was copied in by hand once and
 * never touched again. `497c9d35` migrated `static/basic` to the v2 folder layout without carrying
 * the change into its original; 16 further commits (WCAG contrast fixes, the observer-threshold fix
 * that un-blanked long pages, Geist vendoring, the PWA icon set) landed on the live theme and none of
 * them touched the original either. `c7ef123d` repaired that ONE theme's data by hand. The other
 * seven of the eight shipped themes had no original at all — not drifted, never created.
 *
 * This module removes the cause: `syncThemeOriginals()` DERIVES `__original-themes__` from the live
 * shipped tree, filtering out the same generated-output paths `downloadMarketplaceTheme` already
 * excludes ({@link isGeneratedThemePath} — `preview/`, a static theme's generated root `index.html`).
 * Run it (`tovu theme sync-originals`) and every shipped theme's original is, by construction, an
 * exact filtered copy of what shipped — nobody maintains it by hand again, and the exclusion cannot
 * silently reopen for a ninth theme added later.
 *
 * ---------------------------------------------------------------------------
 * Scope: the package's own `content/themes/`, never a site
 * ---------------------------------------------------------------------------
 * This is a build-time step against the repo tree, invoked by a maintainer or the release process —
 * never by the running product. It does not reach `<site>/themes/` and must not: a site's copy is
 * meant to diverge from its original (that divergence IS the user's work), and `seedSiteThemes()`
 * already gets a correct, complete catalog to a NEW site for free once this has run once against the
 * package. An already-seeded site is unaffected either way; propagating a package-side update to one
 * is a separate, later question this module deliberately does not answer.
 */

/** One theme's outcome from {@link syncThemeOriginals}. */
export interface SyncThemeOriginalsThemeResult {
  tier: ThemeTier;
  id: string;
}

/** What {@link syncThemeOriginals} did, across every shipped theme it found. */
export interface SyncThemeOriginalsResult {
  themes: SyncThemeOriginalsThemeResult[];
}

/**
 * Name of the sibling staging directory a single theme's generated copy lands in before being
 * renamed into place — same idiom as `seed-site-themes.ts`'s `STAGING_DIR_NAME`, scoped per-theme
 * (suffixed with the theme id) rather than once for the whole tree, so an interrupted run only ever
 * leaves ONE theme's generation incomplete rather than risking every theme's staging output
 * colliding in a shared name.
 */
const STAGING_DIR_PREFIX = ".theme-original-sync-staging-";

/**
 * Copy one theme's live folder into a target directory, filtered to exclude generated output
 * ({@link isGeneratedThemePath}) — the primitive both {@link syncThemeOriginals} and its own test
 * suite build on, and the one this canary re-points at to regenerate-and-diff instead of comparing a
 * tree against itself.
 *
 * Writes to a sibling staging directory first and renames it into place, mirroring
 * `seed-site-themes.ts`'s crash-safety idiom: `targetDir`'s parent never observes a half-written
 * folder under `targetDir`'s own name. Unlike `seedSiteThemes()` this DOES replace an existing
 * `targetDir` — regeneration must mirror `liveDir` exactly, including a file `liveDir` no longer has,
 * so a plain merge-copy onto a pre-existing target would leave a stale file behind. The replace itself
 * (`rmSync` old target, then `renameSync` staging into place) is not one atomic syscall — a crash
 * between those two lines could leave `targetDir` briefly absent — but this only ever runs against
 * `content/themes/` on a dev/release machine, never a live site, so the failure mode is a dirty `git
 * status` to re-run, not a user-facing loss (see this file's own header).
 *
 * @param required.liveDir - Absolute path to the shipped theme's live folder to copy from.
 * @param required.targetDir - Absolute path to the original-catalog folder to (re)write.
 * @throws Whatever `node:fs` throws on an unreadable `liveDir` or an unwritable `targetDir` parent.
 * @complexity O(f) in `liveDir`'s file count: one filtered recursive copy, one recursive removal of
 * any pre-existing target, one rename.
 */
export function writeGeneratedThemeOriginal(
  required: { liveDir: string; targetDir: string },
  _optional: Record<string, never> = {}
): void {
  const { liveDir, targetDir } = required;

  const parentDir = dirname(targetDir);
  mkdirSync(parentDir, { recursive: true });
  const stagingDir = join(parentDir, `${STAGING_DIR_PREFIX}${relative(parentDir, targetDir).replaceAll("/", "-")}`);
  // Clears an orphan left by a previous interrupted run — unconditional rather than `existsSync`-guarded
  // for the same reason `seedSiteThemes()` is: `force: true` already makes the absent case a no-op.
  rmSync(stagingDir, { recursive: true, force: true });

  cpSync(liveDir, stagingDir, {
    recursive: true,
    filter: (source: string) => {
      const relativePath = relative(liveDir, source);
      // The root of the copy itself relativizes to "" — always copy it; `isGeneratedThemePath("")`
      // would answer "not generated" anyway (it matches neither a root file nor a generated dir), but
      // being explicit here means this filter never depends on that being true.
      return relativePath === "" || !isGeneratedThemePath(relativePath);
    },
  });

  rmSync(targetDir, { recursive: true, force: true });
  renameSync(stagingDir, targetDir);
}

/**
 * (Re)generate `<themesRoot>/__original-themes__/<tier>/<id>` for every shipped theme discovered
 * under `themesRoot`, from the live shipped copy. Idempotent and safe to run repeatedly: a theme
 * whose live copy has not changed regenerates byte-identical output.
 *
 * Discovery reuses {@link discoverAllBuiltInThemes} (`source: "built-in"`) — the same call every
 * composition root uses — rather than re-walking `themesRoot`'s tiers by hand, so this can never
 * disagree with the product about which folders are real themes (`__original-themes__` and
 * `__marketplace__` are already excluded by that function, and a migration staging leftover is
 * already excluded by name prefix).
 *
 * @param required.themesRoot - A themes root (`content/themes` for the package catalog; a throwaway
 * fixture root in tests). Never a site's `<site>/themes/` — see this file's header.
 * @returns Every theme it (re)generated an original for, in {@link discoverAllBuiltInThemes}'s own
 * id-sorted discovery order.
 * @throws Whatever {@link writeGeneratedThemeOriginal} throws, for the first theme that fails; themes
 * already processed before the failure keep their newly-generated original.
 * @complexity O(t) calls to {@link writeGeneratedThemeOriginal}, t = shipped theme count; O(total
 * shipped bytes) of I/O.
 */
export function syncThemeOriginals(
  required: { themesRoot: string },
  _optional: Record<string, never> = {}
): SyncThemeOriginalsResult {
  const { themesRoot } = required;
  const themes = discoverAllBuiltInThemes({ dir: themesRoot, source: "built-in" });

  const results: SyncThemeOriginalsThemeResult[] = [];
  for (const theme of themes) {
    const tier = theme.manifest.tier;
    const id = theme.manifest.id;
    writeGeneratedThemeOriginal({
      liveDir: theme.dir,
      targetDir: join(themesRoot, THEME_CATALOG_DIR, tier, id),
    });
    results.push({ tier, id });
  }
  return { themes: results };
}

/**
 * Every file under `dir`, as `/`-separated paths relative to it. Shared by {@link syncThemeOriginals}'s
 * own tests and the drift canary so both compare generated output the same way discovery-order issues
 * cannot mask a difference (a missing or extra file, not just a byte mismatch).
 *
 * @param dir - Absolute path to a folder. Returns `[]` for a folder that does not exist, matching
 * "diff against nothing" rather than throwing.
 * @complexity O(f) in `dir`'s entry count — one `readdir` per directory, no file reads.
 */
export function relativeFilePaths(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const walk = (current: string, prefix: string): string[] =>
    readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
      const relativePath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      return entry.isDirectory() ? walk(join(current, entry.name), relativePath) : [relativePath];
    });
  return walk(dir, "").sort();
}

/**
 * Whether two folders hold the same set of files with byte-identical contents. Shared by
 * {@link syncThemeOriginals}'s own tests and the drift canary (regenerate-and-diff) for the exact
 * comparison both need: not just "same file list" and not just "same bytes for files present on both
 * sides", but both together, named separately, so a caller reporting a mismatch can say which kind it
 * is.
 *
 * @param aDir - First folder.
 * @param bDir - Second folder.
 * @returns `added` (in `aDir` only), `removed` (in `bDir` only), `changed` (present on both sides with
 * different bytes) — all empty iff the two folders are identical.
 * @complexity O(f) directory-listing calls plus O(bytes shared by both sides) file reads.
 */
export function diffThemeFolders(
  aDir: string,
  bDir: string
): { added: string[]; removed: string[]; changed: string[] } {
  const aPaths = relativeFilePaths(aDir);
  const bPaths = relativeFilePaths(bDir);
  const aSet = new Set(aPaths);
  const bSet = new Set(bPaths);

  const added = aPaths.filter((p) => !bSet.has(p));
  const removed = bPaths.filter((p) => !aSet.has(p));
  const changed = aPaths.filter(
    (p) => bSet.has(p) && !readFileSync(join(aDir, p)).equals(readFileSync(join(bDir, p)))
  );

  return { added, removed, changed };
}
