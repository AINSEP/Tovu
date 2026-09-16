import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { diffThemeFolders, writeGeneratedThemeOriginal } from "../sync-originals.js";
import { ENGINE_SUBFOLDERS, THEME_CATALOG_DIR } from "../theme.js";

/**
 * @file Canary: every SHIPPED theme's committed original matches what the generator produces from
 * its live folder, right now.
 *
 * ---------------------------------------------------------------------------
 * The bug this exists to catch
 * ---------------------------------------------------------------------------
 * `content/themes/__original-themes__/<tier>/<id>/` is the pristine copy the product restores from.
 * `theme-files.ts`'s `restoreBuiltThemeGeneratedTree` and `explore.ts`'s per-file reset both read it,
 * and `marketplace.ts` reports a theme as resettable purely on that folder existing. For a theme that
 * SHIPS IN THE PACKAGE, the original and the live copy are the same artifact — nobody edits a stock
 * theme through the admin UI, `content/themes/` is the read-only seed source (`deps.ts`'s
 * `builtInThemesDir()`), so any difference between the two is drift, not customization.
 *
 * Drift happened, undetected, for four weeks (2026-08-18 to 2026-09-14, `497c9d35` to `c7ef123d`) back
 * when the original was a folder someone had to remember to update by hand. `c7ef123d` repaired that
 * one theme's DATA; `sync-originals.ts` (2026-09-16) removed the CAUSE by making the original a
 * GENERATED artifact (`tovu theme sync-originals`) instead of a hand-kept one.
 *
 * ---------------------------------------------------------------------------
 * Why this is regenerate-and-diff, not tree-vs-tree
 * ---------------------------------------------------------------------------
 * The original version of this canary (2026-09-14, commit `1abfbec6`) compared the committed catalog
 * against the committed live tree directly. Once the catalog became a GENERATED artifact, that
 * comparison would have gone tautological: "does `content/themes/` equal a copy of itself" can never
 * fail, so drift would stop being detectable rather than stopping from happening — exactly the
 * regression this file exists to prevent.
 *
 * This version regenerates each theme's original into a throwaway temp directory through the SAME
 * production code path `tovu theme sync-originals` runs
 * ({@link writeGeneratedThemeOriginal} — never a second, hand-rolled copy-and-filter), and diffs THAT
 * against the committed catalog. A real difference now means one of two things, both real bugs: the
 * committed catalog was hand-edited (or left stale) since the last `sync-originals` run, or the
 * generator itself broke. Either way, the fix is the same: run `tovu theme sync-originals
 * content/themes` and commit the result — never edit `__original-themes__` by hand.
 *
 * ---------------------------------------------------------------------------
 * Scope: every shipped theme, not just already-cataloged ones
 * ---------------------------------------------------------------------------
 * `content/themes/` and NOT `<site>/themes/`. A site's copy is meant to diverge from its original —
 * that divergence IS the user's work, and the original is what it gets compared against. Sweeping a
 * site tree would assert the opposite of the feature.
 *
 * The sweep is driven from the SHIPPED-THEME side (every tier folder under `content/themes/`), not
 * from `__original-themes__`'s own contents (as the pre-2026-09-16 version was) — deliberately, for
 * two reasons. First, D's whole premise is that every shipped theme gets an original from now on with
 * nobody able to forget one, so a shipped theme with no committed original is no longer a supported
 * state; this canary is the thing that would catch that regression, and a catalog-driven sweep cannot,
 * by construction, notice a theme the catalog doesn't know about. Second, it means deleting
 * `__original-themes__` entirely does not turn this file green — every per-theme test below would
 * instead fail loudly on the missing committed folder, which is a stronger non-vacuity guarantee than
 * the explicit empty-list check the old version needed (kept below anyway, since it costs nothing and
 * still catches deleting `content/themes/` itself, which a shipped-theme sweep alone would not).
 */

const THEMES_DIR = path.resolve(import.meta.dirname, "../../../../../../content/themes");
const ORIGINALS_DIR = path.join(THEMES_DIR, THEME_CATALOG_DIR);

/** A `<tier>/<id>` pair discovered as a shipped theme's live folder. */
interface ShippedTheme {
  readonly tier: string;
  readonly id: string;
}

function directoriesIn(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Every shipped theme, discovered from the live tier folders rather than from
 * `__original-themes__`'s own contents — see this file's header for why that side is load-bearing.
 *
 * @returns Shipped `<tier>/<id>` pairs, tier-then-id sorted.
 * @complexity O(t + n) in tiers and shipped themes — one shallow directory read per tier.
 */
function shippedThemes(): ShippedTheme[] {
  return ENGINE_SUBFOLDERS.flatMap((tier) =>
    directoriesIn(path.join(THEMES_DIR, tier)).map((id) => ({ tier, id }))
  );
}

/** Bounds a failure message to something readable while still stating the true total. */
function summarize(paths: string[]): string {
  const shown = paths.slice(0, 10).join(", ");
  return paths.length > 10 ? `${shown}, … (${paths.length} total)` : shown;
}

const SHIPPED = shippedThemes();

test("canary: the shipped-theme sweep is not vacuous", () => {
  // Without this, `content/themes/` moving or every `ENGINE_SUBFOLDERS` tier emptying out turns every
  // check below into a pass over an empty list, and this file goes green while there is nothing left
  // for "reset to original" to serve at all.
  assert.ok(SHIPPED.length > 0, `no shipped themes found under ${THEMES_DIR}; the theme tree may have moved`);
});

for (const { tier, id } of SHIPPED) {
  test(`canary: shipped theme ${tier}/${id}'s committed original matches what the generator produces from it`, () => {
    const liveDir = path.join(THEMES_DIR, tier, id);
    const committedOriginalDir = path.join(ORIGINALS_DIR, tier, id);

    assert.ok(
      fs.existsSync(committedOriginalDir),
      `content/themes/${tier}/${id} has no committed original at __original-themes__/${tier}/${id} — ` +
        `run 'tovu theme sync-originals content/themes' and commit the result; every shipped theme is ` +
        `expected to have one since D (2026-09-16), so a missing one is a regression, not a supported state.`
    );

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "theme-original-drift-canary-"));
    try {
      const generatedDir = path.join(tmpRoot, tier, id);
      writeGeneratedThemeOriginal({ liveDir, targetDir: generatedDir });

      const diff = diffThemeFolders(generatedDir, committedOriginalDir);
      assert.deepEqual(
        diff,
        { added: [], removed: [], changed: [] },
        `content/themes/__original-themes__/${tier}/${id} no longer matches what 'tovu theme sync-originals' ` +
          `generates from content/themes/${tier}/${id}.\n` +
          `  generated but not committed: ${summarize(diff.added) || "(none)"}\n` +
          `  committed but not generated: ${summarize(diff.removed) || "(none)"}\n` +
          `  byte-different: ${summarize(diff.changed) || "(none)"}\n` +
          `Run 'tovu theme sync-originals content/themes' and commit the result — the catalog is a ` +
          `generated artifact now, never hand-edited.`
      );
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
}
