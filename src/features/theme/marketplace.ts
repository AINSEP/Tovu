import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import {
  discoverThemes,
  ENGINE_SUBFOLDERS,
  loadTheme,
  MARKETPLACE_CATALOG_DIR,
  nextAvailableThemeId,
  rescanThemes,
  THEME_CATALOG_DIR,
  type DiscoveredTheme,
  type ThemeTier,
} from "./theme";

/**
 * @file The local theme marketplace — a FAKE marketplace (no network, no remote catalog, no search,
 * no versioning; see `src/themes/__marketplace__/README.md`) that lets the download flow be built and
 * exercised end-to-end against a real fixture on disk.
 *
 * Download does two things in lockstep, per the product model this implements: it writes the
 * pristine copy into {@link THEME_CATALOG_DIR} (what "reset to original" would restore from) AND an
 * editable copy into the live tier folder (what a user actually edits), both under a freshly assigned
 * id from {@link nextAvailableThemeId} so a name collision never silently overwrites or aliases an
 * existing theme.
 */

/**
 * Shape every theme id on disk under `src/themes/` already matches (`basic`, `basic-1`,
 * `tailark-quartz-dark`, `basic-declarative`, …). A marketplace id — whether it comes from a fixture's
 * own `theme.json` or, for the download route, straight from a caller-supplied URL segment — ends up
 * inside a filesystem `join()`, so anything not shaped like an existing id is rejected before it ever
 * reaches one; the alternative (a raw string reaching `join(themesRoot, tier, marketplaceId)`) would
 * let `../../etc` or similar walk outside the themes tree.
 */
const SAFE_THEME_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/**
 * Thrown by every function in this module that fails. `code` lets a caller (the download/list routes)
 * map the failure to the right HTTP status without re-parsing the message text.
 */
export class MarketplaceThemeError extends Error {
  readonly code: "INVALID_ID" | "NOT_FOUND";

  constructor(code: "INVALID_ID" | "NOT_FOUND", message: string) {
    super(message);
    this.name = "MarketplaceThemeError";
    this.code = code;
  }
}

/** One entry in the marketplace listing. */
export interface MarketplaceListItem {
  id: string;
  name: string;
  tier: ThemeTier;
  description?: string;
  /**
   * Whether `id` is already claimed by an installed theme or a catalog original — i.e. whether
   * downloading this entry as-is would get suffixed (see {@link nextAvailableThemeId}) rather than
   * land at `id` itself.
   */
  idTaken: boolean;
}

/**
 * List every theme installable from the marketplace fixture.
 *
 * Scans {@link MARKETPLACE_CATALOG_DIR} the same way `discoverAllBuiltInThemes` scans a real themes
 * root — one {@link ENGINE_SUBFOLDERS} subfolder at a time — because the fixture is laid out
 * identically. Entries are listed regardless of their own validation `status`; a fixture shipping a
 * broken `theme.json` is marketplace-content the operator should be able to SEE is broken, not one
 * this function hides.
 *
 * @param required.themesRoot - The themes root the marketplace fixture and installed themes both live
 * under (`RouteDeps.themesDir`).
 * @returns Listing entries sorted by id.
 * @complexity O(e·f) — a fixed, small tier count times the fixture folder's entry count.
 */
export function listMarketplaceThemes(
  required: { themesRoot: string },
  _optional: Record<string, never> = {}
): MarketplaceListItem[] {
  const { themesRoot } = required;
  const marketplaceRoot = join(themesRoot, MARKETPLACE_CATALOG_DIR);

  const entries = ENGINE_SUBFOLDERS.flatMap((tier) =>
    discoverThemes({ dir: join(marketplaceRoot, tier), source: "built-in" }).map((theme) => ({ theme, tier }))
  );

  return entries
    .map(({ theme, tier }) => ({
      id: theme.manifest.id,
      name: theme.manifest.name,
      tier,
      description: theme.manifest.description,
      idTaken:
        existsSync(join(themesRoot, tier, theme.manifest.id)) ||
        existsSync(join(themesRoot, THEME_CATALOG_DIR, tier, theme.manifest.id)),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Locate one marketplace fixture by its folder id, trying each {@link ENGINE_SUBFOLDERS} tier in
 * turn — mirrors how an installed theme's own folder name is authoritative for its id (`loadTheme`'s
 * `id`-must-equal-folder-name rule).
 *
 * Validates `marketplaceId` BEFORE any filesystem access — see {@link SAFE_THEME_ID}'s doc comment for
 * why this has to happen first rather than after an `existsSync` probe.
 *
 * @throws {MarketplaceThemeError} `INVALID_ID` for a malformed id, `NOT_FOUND` if no fixture matches
 * in any tier.
 * @complexity O(e) in the fixed engine-subfolder count.
 */
function findMarketplaceTheme(required: {
  themesRoot: string;
  marketplaceId: string;
}): { theme: DiscoveredTheme; tier: ThemeTier } {
  const { themesRoot, marketplaceId } = required;
  if (!SAFE_THEME_ID.test(marketplaceId)) {
    throw new MarketplaceThemeError("INVALID_ID", `theme id '${marketplaceId}' is not a valid theme id`);
  }

  const marketplaceRoot = join(themesRoot, MARKETPLACE_CATALOG_DIR);
  for (const tier of ENGINE_SUBFOLDERS) {
    const dir = join(marketplaceRoot, tier, marketplaceId);
    if (existsSync(dir)) {
      return { theme: loadTheme({ themeDir: dir, id: marketplaceId, source: "built-in" }), tier };
    }
  }
  throw new MarketplaceThemeError("NOT_FOUND", `marketplace theme '${marketplaceId}' was not found`);
}

/**
 * Read `theme.json` in `themeDir`, then overwrite it with `id` replaced and `extra` merged in. Used to
 * stamp each copy {@link downloadMarketplaceTheme} makes with its own assigned id (and, for the
 * editable copy only, its `lineage`). Every other authored field — `name` above all — passes through
 * untouched: only the folder-identity field changes, never the human-facing one, per the product rule
 * that a collision suffix belongs on the id/folder and never on the displayed name.
 *
 * @complexity O(s) in the manifest's own (small, bounded) size.
 */
function rewriteThemeManifestId(required: { themeDir: string; id: string; extra?: Record<string, unknown> }): void {
  const { themeDir, id, extra } = required;
  const manifestPath = join(themeDir, "theme.json");
  const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  const updated = { ...raw, id, ...(extra ?? {}) };
  writeFileSync(manifestPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
}

/**
 * Refuses `preview/` — `build-preview.mjs`'s generated output (a full second copy of every page and
 * script, once per color mode: 36 of `novice`'s 79 files were this before it was deleted). Worthless
 * the moment it's copied: nothing reads a copy's `preview/` (a fresh `build-preview.mjs` run
 * regenerates it from the theme's own real files) and the Explore file list already hides it
 * (`GENERATED_DIRS`, `explore.ts`) for whichever copy is being browsed.
 *
 * `screenshots/` is deliberately NOT filtered here, in either copy. Excluding it from the EDITABLE
 * copy would break Explore, which lists it for the working copy on purpose. Excluding it from the
 * CATALOG copy would look like the same win but isn't one: the catalog is what "reset to original"
 * restores from, so a screenshot excluded there would become permanently non-resettable the moment a
 * user edited or deleted their working copy's. Real marketing asset, not a build artifact — the size
 * cost is accepted, not overlooked.
 *
 * @param fixtureDir - The marketplace fixture's own root, the same first argument passed to `cpSync`.
 * @param candidate - One absolute path `cpSync`'s walk is currently considering, passed to its
 * `filter` callback.
 * @returns `true` for `fixtureDir/preview` itself or anything under it; `false` for every other path,
 * including a merely `preview`-prefixed sibling (`preview-notes/`), which the trailing separator
 * check exists specifically to not match.
 * @throws Never — `path.relative`/`String.startsWith` do not throw for arbitrary string inputs.
 * Pure: no filesystem access, no side effects.
 *
 * @complexity Time: O(k), where k is `candidate`'s path length (one `relative` + one `startsWith`).
 * @complexity Space: O(k) for the computed relative-path string; no allocation scales with the
 * fixture's file count.
 */
export function isGeneratedPreviewPath(fixtureDir: string, candidate: string): boolean {
  const rel = relative(fixtureDir, candidate);
  return rel === "preview" || rel.startsWith(`preview${sep}`);
}

/**
 * Where a downloaded theme came from — written into the EDITABLE copy's `theme.json` only (never the
 * catalog copy, which stays byte-identical to what shipped). A local folder id (`assignedId`) is
 * meaningless on another machine, and meaningless again after a second, independent download of the
 * same upstream theme (each gets its own suffixed id) — so this carries the marketplace's OWN stable
 * identity alongside the locally-assigned one.
 */
export interface ThemeLineage {
  /** Where this copy was installed from. Only one source exists today (the local fixture); a real
   * backend would add more values here rather than replacing this one. */
  from: "marketplace";
  tier: ThemeTier;
  /** The marketplace fixture's `theme.json` version at download time. */
  version: string;
  /** This copy's paired catalog original, as a `{@link THEME_CATALOG_DIR}/<tier>/<id>` path relative
   * to the themes root — what "reset to original" would restore from. */
  catalog: string;
  /** The marketplace fixture's own folder id — stable across machines and across repeat downloads,
   * unlike `assignedId`. */
  marketplaceId: string;
  /** The marketplace fixture's own display name at download time. */
  name: string;
}

/** What {@link downloadMarketplaceTheme} reports back to its caller. */
export interface DownloadMarketplaceThemeResult {
  /** The id this download was actually installed under, after collision suffixing (if any). */
  assignedId: string;
  /** Whether `assignedId` differs from the marketplace fixture's own id — i.e. whether a collision was
   * resolved by suffixing. */
  suffixed: boolean;
  tier: ThemeTier;
  lineage: ThemeLineage;
  /** The `rescanThemes` result from making the new theme immediately visible without a restart. */
  rescan: { added: string[]; removed: string[]; total: number };
}

/**
 * Download one marketplace fixture: copy it into both the originals catalog and a live tier folder
 * under a freshly assigned id, stamp both copies' `theme.json` with that id (the editable copy also
 * gets `lineage`), then rescan so the new theme is usable without a server restart.
 *
 * The two copies are independent files on disk from the moment `cpSync` returns for each — rewriting
 * one copy's manifest cannot affect the other. That independence is the whole point of writing both
 * rather than one plus a symlink: the catalog copy must stay byte-identical to what shipped even after
 * the editable copy is later modified by the user.
 *
 * @param required.themesRoot - The themes root both the tier folder and the catalog live under
 * (`RouteDeps.themesDir`).
 * @param required.themes - The live discovered-themes array to refresh via `rescanThemes` — mutated in
 * place, matching `rescanThemes`'s own contract.
 * @param required.marketplaceId - The marketplace fixture's folder id to download.
 * @throws {MarketplaceThemeError} `INVALID_ID` for a malformed id, `NOT_FOUND` if no fixture matches.
 * @complexity O(f) in the fixture's own file count (two recursive copies), plus `rescanThemes`'s O(t)
 * in the themes root's total theme count.
 */
export function downloadMarketplaceTheme(
  required: { themesRoot: string; themes: DiscoveredTheme[]; marketplaceId: string },
  _optional: Record<string, never> = {}
): DownloadMarketplaceThemeResult {
  const { themesRoot, themes, marketplaceId } = required;
  const { theme: fixture, tier } = findMarketplaceTheme({ themesRoot, marketplaceId });

  const assignedId = nextAvailableThemeId({ desiredId: fixture.manifest.id, themesRoot, tier });
  const suffixed = assignedId !== fixture.manifest.id;

  const catalogDir = join(themesRoot, THEME_CATALOG_DIR, tier, assignedId);
  const installedDir = join(themesRoot, tier, assignedId);

  const filter = (source: string) => !isGeneratedPreviewPath(fixture.dir, source);
  cpSync(fixture.dir, catalogDir, { recursive: true, filter });
  cpSync(fixture.dir, installedDir, { recursive: true, filter });

  rewriteThemeManifestId({ themeDir: catalogDir, id: assignedId });

  const lineage: ThemeLineage = {
    from: "marketplace",
    tier,
    version: fixture.manifest.version,
    catalog: `${THEME_CATALOG_DIR}/${tier}/${assignedId}`,
    marketplaceId,
    name: fixture.manifest.name,
  };
  rewriteThemeManifestId({ themeDir: installedDir, id: assignedId, extra: { lineage } });

  const rescan = rescanThemes({ themes, dir: themesRoot });

  return { assignedId, suffixed, tier, lineage, rescan };
}
