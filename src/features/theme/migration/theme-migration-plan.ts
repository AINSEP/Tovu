/**
 * @file Tier-specific v2 migration plans — pure functions that decide WHERE a v1 theme's files move
 * to under schema v2's invariant folder shape, without touching disk. Kept separate from
 * `migrate-theme.ts`'s orchestrator so each tier's move logic is independently testable and so a
 * tier not yet supported here fails loudly (`planV2Migration` throws) rather than the orchestrator
 * silently doing nothing.
 *
 * Only `declarative` is implemented for the first migration slice (Milestone 3, `basic-declarative` —
 * the approved lowest-risk starting theme). `templated`/`static` planners are added as later slices
 * migrate real themes of those tiers, per the Programmer workflow's "implement by requirement slice"
 * rule — building untested move logic for a theme not yet reached would be speculative.
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

/**
 * `declarative` tier: theme root has a single `styles.css` (-> `css/theme.css`) and a `templates/`
 * folder of `*.json` block trees (-> `render/pages/`). No partials, no scripts, no per-page asset-path
 * rewriting — declarative content is JSON props (route hrefs like `/pricing`, never a relative asset
 * path), verified directly against `basic-declarative`'s real files before writing this planner.
 *
 * @complexity O(f) in the theme root's own (small) entry count.
 */
function planDeclarativeMigration(themeDir: string): ThemeMigrationPlan {
  const moves: MigrationFileMove[] = [];
  const unrecognized: string[] = [];

  if (existsSync(join(themeDir, "styles.css"))) {
    moves.push({ from: "styles.css", to: "css/theme.css" });
  }

  const templatesDir = join(themeDir, "templates");
  if (existsSync(templatesDir)) {
    for (const file of readdirSync(templatesDir)) {
      if (file.endsWith(".json")) {
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
  if (tier === "declarative") return planDeclarativeMigration(themeDir);
  throw new Error(`planV2Migration: no v2 migration plan implemented yet for tier '${tier}'`);
}
