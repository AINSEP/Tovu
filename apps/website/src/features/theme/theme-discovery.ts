import { type ThemeTier } from "./render-contract.js";
import { readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { themeIdCandidates } from "./theme-id-aliases.js";
import { ENGINE_SUBFOLDERS, THEME_CATALOG_DIR } from "./theme-layout.js";
import { type DiscoveredTheme, loadTheme } from "./theme.js";


/**
 * Discover every theme folder under `dir`. Missing dir ⇒ empty list (a site
 * served without a themes/ dir is legal, SPEC-004 REQ-05).
 *
 * `exclude` skips named subdirectories that aren't themes themselves — used by
 * {@link discoverAllBuiltInThemes} to keep the engine-specific subfolders
 * (`templated/`, `handlebars/`) from being scanned as (invalid) top-level theme
 * candidates when it also scans them directly as their own theme roots.
 *
 * Separately (and unconditionally, not via `exclude`), any child directory whose name starts with
 * {@link MIGRATION_STAGING_DIR_PREFIX} is skipped too — `exclude` only expresses exact names known
 * ahead of time (engine subfolders, the two catalog dirs), never a per-run-randomized prefix like
 * migration scratch output, so that one case gets its own always-on check here instead of being
 * threaded through every caller's `exclude` array.
 */
export function discoverThemes(
  required: { dir: string; source: "built-in" | "site"; exclude?: readonly string[] },
  _optional: Record<string, never> = {}
): DiscoveredTheme[] {
  const { dir, source, exclude } = required;
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => {
      if (exclude?.includes(name)) return false;
      if (name.startsWith(MIGRATION_STAGING_DIR_PREFIX)) return false;
      if (name.startsWith(".")) return false;
      if (name === PUBLISH_STAGING_DIR || name === PUBLISH_PREVIOUS_DIR) return false;
      const full = join(dir, name);
      return statSync(full).isDirectory();
    })
    .map((name) => loadTheme({ themeDir: join(dir, name), id: name, source }))
    .sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
}

/**
 * Prefix of the scratch directory `migrate-theme.ts`'s `createStagingDir` creates as a sibling of the
 * real theme folder it's migrating (`.tovu-migrate-staging-<id>-<random-hex>`), and deliberately
 * LEAVES ON DISK after a dry run or a failed migration for inspection (see that module's own header).
 * Not a tier and not a theme — same status as {@link THEME_CATALOG_DIR}
 * — but unlike that fixed name, discovery can't skip it by exact-name `exclude` because the
 * random suffix makes every occurrence's name unique; {@link discoverThemes} matches on this prefix
 * instead. ARCH-001 (2026-08-19): two such directories were swept into a commit by a broad `git add`
 * and discovered as three "basic"-id themes (the real one plus both scratch copies, which retain the
 * migrated manifest's `id`) before this constant existed to filter them out.
 *
 * `duplicate-theme.ts` stages a whole-theme copy under this same prefix (`<prefix>duplicate-<id>-<hex>`)
 * before renaming it into place, so every reader that already skips migration scratch (discovery,
 * `publish-content.ts`, `theme-static-assets.ts`) skips a half-written duplicate too, with no new rule.
 * Unlike a migration's, that scratch is removed on failure.
 */
export const MIGRATION_STAGING_DIR_PREFIX = ".tovu-migrate-staging-";

/**
 * The deleted theme marketplace's fixture folder name. The marketplace (and the fixture, gone since
 * `8fb1f2fea`) was removed 2026-10-04, but a site whose `themes/` was seeded before then still has a
 * copy of this folder under its own themes root. Discovery keeps skipping it so that leftover never
 * surfaces as an invalid "__marketplace__" theme, with no manual cleanup needed.
 */
const LEGACY_MARKETPLACE_DIR = "__marketplace__";

/**
 * Publish's own scratch folders at the themes ROOT (`publish-files-plan-2026-09-24.md` §3):
 * `theme-files` apply stages an incoming tree under {@link PUBLISH_STAGING_DIR} and moves the tree
 * it replaces under {@link PUBLISH_PREVIOUS_DIR}, so the swap is two renames on one filesystem. Not
 * tiers and not themes — {@link discoverThemes} skips both by name, as the site backup does.
 */
export const PUBLISH_STAGING_DIR = ".publish-staging";
export const PUBLISH_PREVIOUS_DIR = ".publish-previous";

/**
 * Discover every built-in theme across the top-level (declarative) folder plus every engine
 * subfolder in {@link ENGINE_SUBFOLDERS}. The one call site every composition root should use
 * instead of a raw {@link discoverThemes} call, so the liquidjs/handlebars split is a detail this
 * function owns rather than something every caller re-derives.
 */
export function discoverAllBuiltInThemes(
  required: { dir: string; source: "built-in" | "site" },
  _optional: Record<string, never> = {}
): DiscoveredTheme[] {
  const { dir, source } = required;
  const topLevel = discoverThemes({
    dir,
    source,
    exclude: [...ENGINE_SUBFOLDERS, THEME_CATALOG_DIR, LEGACY_MARKETPLACE_DIR],
  });
  const engineThemes = ENGINE_SUBFOLDERS.flatMap((sub) => discoverThemes({ dir: join(dir, sub), source }));
  return [...topLevel, ...engineThemes].sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
}

/**
 * Assign a folder-safe id for a NEW theme being installed under `themesRoot`, guaranteeing it does
 * not collide with anything already there. Theme ids are unique per FOLDER, not globally (see
 * {@link duplicateThemeIds}) — the fix is to never create a second folder claiming an id already in
 * use, which is what this makes possible at the call site that creates theme folders today
 * (`development/scripts/theme-tool.ts`'s `copy` command).
 *
 * Checks BOTH the installed tier folder (`<themesRoot>/<tier>/<id>`) and the catalog
 * (`<themesRoot>/{@link THEME_CATALOG_DIR}/<tier>/<id>`) — the two are kept in step, so
 * a folder existing in only one of them (e.g. a previous run left the pair out of sync) still counts
 * as taken. Picking an id free in one and not the other would recreate the exact desync this exists
 * to prevent.
 *
 * `desiredId` is only ever SUFFIXED, never renumbered: an id that already ends in a digit (e.g.
 * `basic9`) gets `basic9-1` on collision, not `basic10` — the suffix always unambiguously means "the
 * Nth copy of this id", never a digit that could be mistaken for part of the original id.
 *
 * @param required.desiredId - The id to try first (typically the source theme's own `theme.json` id).
 * @param required.themesRoot - The themes root both the tier folder and the catalog live under.
 * @param required.tier - Which {@link ENGINE_SUBFOLDERS} tier's folder to check.
 * @param optional.alsoTaken - Extra "taken" rule ORed with the two folder checks. `duplicate-theme.ts`
 * passes every discovered id (ids must stay unique across tiers too — {@link duplicateThemeIds}) and
 * the source theme's own parent folder (a legacy top-level theme's copy lands beside it, not under
 * `<tier>/`). Omitted, only the two folder checks apply — the CLI's original behavior.
 * @returns `desiredId` if free, else `desiredId-1`, `desiredId-2`, … — the first free suffix.
 * @complexity O(n) filesystem existence checks, where n is the number of prior collisions on
 * `desiredId` (2 checks each, plus one `alsoTaken` call); O(1) in the common, no-collision case.
 */
export function nextAvailableThemeId(
  required: { desiredId: string; themesRoot: string; tier: ThemeTier },
  optional: { alsoTaken?: (required: { id: string }, optional?: Record<string, never>) => boolean } = {}
): string {
  const { desiredId, themesRoot, tier } = required;
  const isTaken = ({ id }: { id: string }, _optional = {}): boolean =>
    existsSync(join(themesRoot, tier, id)) ||
    existsSync(join(themesRoot, THEME_CATALOG_DIR, tier, id)) ||
    optional.alsoTaken?.({ id }) === true;

  if (!isTaken({ id: desiredId })) return desiredId;

  let suffix = 1;
  while (isTaken({ id: `${desiredId}-${suffix}` })) suffix += 1;
  return `${desiredId}-${suffix}`;
}

/**
 * Re-run discovery and refill `themes` IN PLACE with the result.
 *
 * Discovery is otherwise a boot-time snapshot: the composition root calls {@link
 * discoverAllBuiltInThemes} once and freezes the array into `RouteDeps.themes`, so a theme that
 * appears on disk afterwards — copied from the originals catalog,
 * dropped in by hand, pulled in by git — is invisible until the process restarts. That is fine for a
 * server whose themes only ever ship with it, and wrong for one where copying a theme is a normal
 * thing a user does in the admin UI.
 *
 * Mutates rather than returns because `RouteDeps.themes` is a plain array every consumer already
 * holds a reference to and reads per request (`deps.themes.find(...)` at request time, not at
 * registration time). Refilling that one array updates every reader at once; handing back a new array
 * would update only whoever remembered to re-read it, which is the same staleness bug one level in.
 *
 * Returns what changed so a caller can report it — a rescan that silently finds nothing is
 * indistinguishable from a rescan that didn't run.
 */
export function rescanThemes(
  required: { themes: DiscoveredTheme[]; dir: string; source?: "built-in" | "site" },
  _optional: Record<string, never> = {}
): { added: string[]; removed: string[]; total: number } {
  const { themes, dir, source = "built-in" } = required;
  const before = new Set(themes.map((t) => t.manifest.id));
  const fresh = discoverAllBuiltInThemes({ dir, source });
  const after = new Set(fresh.map((t) => t.manifest.id));

  themes.length = 0;
  themes.push(...fresh);

  return {
    added: [...after].filter((id) => !before.has(id)).sort(),
    removed: [...before].filter((id) => !after.has(id)).sort(),
    total: fresh.length,
  };
}

/**
 * Theme ids that more than one discovered theme claims.
 *
 * Ids are unique per FOLDER, not globally: `loadTheme` only checks that `theme.json`'s `id` equals
 * its own folder name, and {@link discoverAllBuiltInThemes} concatenates the top level with every
 * engine subfolder. So `static/nordic` and `handlebars/nordic` both load, both claim `nordic`, and
 * {@link findTheme} silently returns whichever sorts first — meaning `active_theme_id` can name two
 * different themes and the site renders one of them with no error anywhere.
 *
 * Surfaced rather than resolved: picking a winner here would hide the collision, and the real fix is
 * assigning a unique id when the theme is created (a download/copy appends `-1`, `-2`, …). This is
 * what lets the admin say so instead of rendering the wrong theme quietly.
 */
export function duplicateThemeIds({ themes }: { themes: DiscoveredTheme[] }, _optional = {}): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const theme of themes) {
    if (seen.has(theme.manifest.id)) duplicates.add(theme.manifest.id);
    seen.add(theme.manifest.id);
  }
  return [...duplicates].sort();
}

/** Ids of discovered themes that passed validation. */
export function validThemeIds({ themes }: { themes: DiscoveredTheme[] }, _optional = {}): string[] {
  return themes.filter((t) => t.status === "valid").map((t) => t.manifest.id);
}

/** Find a theme by id (any status). */
export function findTheme(
  required: { themes: DiscoveredTheme[]; id: string },
  _optional: Record<string, never> = {}
): DiscoveredTheme | undefined {
  const { themes, id } = required;
  return themes.find((t) => t.manifest.id === id);
}

/**
 * {@link findTheme} for a STORED id (the active-theme setting), which may name a renamed theme by
 * its retired id or name the current id on a site that still only has the retired folder. Tries
 * `themeIdCandidates({ id })` in order (current name first). Explicit per-theme admin routes keep using
 * the exact {@link findTheme}: they address a theme the listing just showed, by its real id.
 */
export function findStoredTheme(required: { themes: DiscoveredTheme[]; id: string }): DiscoveredTheme | undefined {
  for (const candidate of themeIdCandidates({ id: required.id })) {
    const theme = findTheme({ themes: required.themes, id: candidate });
    if (theme) return theme;
  }
  return undefined;
}
