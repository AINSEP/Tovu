/**
 * @file Tier-specific v2 migration plans — pure functions that decide WHERE a v1 theme's files move
 * to under schema v2's invariant folder shape, without touching disk. Kept separate from
 * `migrate-theme.ts`'s orchestrator so each tier's move logic is independently testable and so a
 * tier not yet supported here fails loudly (`planV2Migration` throws) rather than the orchestrator
 * silently doing nothing.
 *
 * `declarative`/`templated`/`handlebars` share one planner (`planNonStaticTierMigration`) — all three
 * keep the identical v1 shape (an optional root `styles.css`, a `templates/` folder of one extension),
 * verified directly against real themes in both tiers before generalizing (`basic-declarative`,
 * `storefront`). `static` has a materially different v1 shape (`pages/`, root partials, `js/`, per-page
 * asset-path references) and gets its own planner once a static-tier theme is migrated — building
 * untested move logic for a theme not yet reached would be speculative, per the Programmer workflow's
 * "implement by requirement slice" rule.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { ThemeTier } from "../theme";

/** One file relocation, both paths relative to the theme's own root. */
export interface MigrationFileMove {
  readonly from: string;
  readonly to: string;
}

export interface ThemeMigrationPlan {
  readonly moves: readonly MigrationFileMove[];
  /** Root-level entries this plan found but has no move rule for — surfaced so the orchestrator can
   * refuse rather than silently drop an author's file the planner didn't anticipate. */
  readonly unrecognized: readonly string[];
}

/** Root-level entries every tier's plan treats as already-correct (copied byte-identical, never
 * moved) — `theme.json` gets its own manifest rewrite, not a raw copy. */
const CARRY_OVER_UNCHANGED: ReadonlySet<string> = new Set(["tokens.json"]);

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

  for (const name of readdirSync(themeDir)) {
    if (name === "theme.json" || name === "styles.css" || name === "templates") continue;
    if (CARRY_OVER_UNCHANGED.has(name) || TOKENS_MODE_FILE_PATTERN.test(name)) continue;
    unrecognized.push(name);
  }

  return { moves, unrecognized };
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
