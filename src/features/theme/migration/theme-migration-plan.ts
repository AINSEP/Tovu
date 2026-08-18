/**
 * @file Tier-specific v2 migration plans — pure functions that decide WHERE a v1 theme's files move
 * to under schema v2's invariant folder shape, without touching disk. Kept separate from
 * `migrate-theme.ts`'s orchestrator so each tier's move logic is independently testable and so a
 * tier not yet supported here fails loudly (`planV2Migration` throws) rather than the orchestrator
 * silently doing nothing.
 *
 * `declarative`/`templated`/`handlebars` share one planner (`planNonStaticTierMigration`) — all three
 * keep the identical v1 shape (an optional root `styles.css`, a `templates/` folder of one extension,
 * an optional flat root `assets/` bag), verified directly against real themes in both tiers before
 * generalizing (`basic-declarative`, `storefront`, `fashion-modern`). `static` has a materially
 * different v1 shape (`pages/`, root partials, `js/`, a much larger `images/` set) and gets its own
 * planner once a static-tier theme is migrated — building untested move logic for a theme not yet
 * reached would be speculative, per the Programmer workflow's "implement by requirement slice" rule.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { ThemeTier } from "../theme";

/** One file relocation, both paths relative to the theme's own root. */
export interface MigrationFileMove {
  readonly from: string;
  readonly to: string;
}

/** A moved folder's old/new URL prefix under `/theme-assets/<id>/...` — a file move alone leaves any
 * hardcoded absolute reference to the old location pointing at a 404 (`theme-static-assets.ts` serves
 * a theme's folder with zero path remapping), so the orchestrator uses this to rewrite the moved
 * page/partial files' own content, not just relocate bytes. */
export interface AssetPathRewriteRule {
  readonly v1Prefix: string;
  readonly v2Prefix: string;
}

export interface ThemeMigrationPlan {
  readonly moves: readonly MigrationFileMove[];
  /** Root-level entries this plan found but has no move rule for — surfaced so the orchestrator can
   * refuse rather than silently drop an author's file the planner didn't anticipate. */
  readonly unrecognized: readonly string[];
  /** Present only when a moved folder's absolute `/theme-assets/<id>/...` URL prefix changed. */
  readonly assetPathRewrites?: readonly AssetPathRewriteRule[];
}

/** Root-level entries every tier's plan treats as already-correct (copied byte-identical, never
 * moved) — `theme.json` gets its own manifest rewrite, not a raw copy. `screenshots` is real
 * author-owned marketing content the v2 schema now approves at the same root location (see
 * `structure.ts`'s `V2_APPROVED_ROOTS`) — every real theme on disk ships one. */
const CARRY_OVER_UNCHANGED: ReadonlySet<string> = new Set(["tokens.json", "screenshots"]);

const TOKENS_MODE_FILE_PATTERN = /^tokens\.[a-z0-9-]+\.json$/;

/** The `templates/` file extension(s) each non-static tier ships, matching `loadTheme()`'s own
 * per-extension dispatch (`theme.ts`'s inline templates-dir scan) — a file in `templates/` with any
 * OTHER extension is a real authoring surprise this planner refuses to guess about. */
const NON_STATIC_TIER_EXTENSIONS: Readonly<Record<"declarative" | "templated" | "handlebars", readonly string[]>> = {
  declarative: [".json"],
  templated: [".liquid"],
  handlebars: [".hbs", ".handlebars"],
};

/**
 * `declarative`/`templated`/`handlebars` tiers: theme root has an OPTIONAL single `styles.css`
 * (-> `css/theme.css` — `storefront`, a real templated theme, ships none at all, relying entirely on
 * core `render_block` component styling) and a `templates/` folder of the tier's own route-file
 * extension (-> `render/pages/`). No partials, no scripts, no per-page asset-path rewriting — neither
 * declarative JSON props nor a templated theme's `render_block`/product-data Liquid syntax carry a
 * relative asset path the way static HTML's `../css/`/`../js/` does. Verified directly against
 * `basic-declarative` and `storefront`'s real files before writing this planner.
 *
 * @complexity O(f) in the theme root's own (small) entry count.
 */
function planNonStaticTierMigration(
  themeDir: string,
  tier: "declarative" | "templated" | "handlebars"
): ThemeMigrationPlan {
  const moves: MigrationFileMove[] = [];
  const unrecognized: string[] = [];
  const assetPathRewrites: AssetPathRewriteRule[] = [];
  const extensions = NON_STATIC_TIER_EXTENSIONS[tier];

  if (existsSync(join(themeDir, "styles.css"))) {
    moves.push({ from: "styles.css", to: "css/theme.css" });
  }

  const templatesDir = join(themeDir, "templates");
  if (existsSync(templatesDir)) {
    for (const file of readdirSync(templatesDir)) {
      if (extensions.some((ext) => file.endsWith(ext))) {
        moves.push({ from: `templates/${file}`, to: `render/pages/${file}` });
      } else {
        unrecognized.push(`templates/${file}`);
      }
    }
  }

  // A flat root `assets/` bag (fashion-modern's real shape: one hero photo, no images/video/audio/
  // fonts/files subfolders yet) nests under v2's `assets/images/` — any moved page's own absolute
  // `/theme-assets/<id>/assets/...` reference has to move with it (see AssetPathRewriteRule's header).
  const assetsDir = join(themeDir, "assets");
  if (existsSync(assetsDir)) {
    for (const file of readdirSync(assetsDir)) {
      moves.push({ from: `assets/${file}`, to: `assets/images/${file}` });
    }
    assetPathRewrites.push({ v1Prefix: "assets/", v2Prefix: "assets/images/" });
  }

  for (const name of readdirSync(themeDir)) {
    if (name === "theme.json" || name === "styles.css" || name === "templates" || name === "assets") continue;
    if (CARRY_OVER_UNCHANGED.has(name) || TOKENS_MODE_FILE_PATTERN.test(name)) continue;
    unrecognized.push(name);
  }

  return { moves, unrecognized, ...(assetPathRewrites.length > 0 ? { assetPathRewrites } : {}) };
}

/**
 * Dispatch to the tier-specific planner. Throws for a tier with no planner yet — a loud, immediate
 * failure (never a silent no-op plan) for a theme this migration slice hasn't reached.
 */
export function planV2Migration(required: { themeDir: string; tier: ThemeTier }): ThemeMigrationPlan {
  const { themeDir, tier } = required;
  if (tier === "declarative" || tier === "templated" || tier === "handlebars") {
    return planNonStaticTierMigration(themeDir, tier);
  }
  throw new Error(`planV2Migration: no v2 migration plan implemented yet for tier '${tier}'`);
}
