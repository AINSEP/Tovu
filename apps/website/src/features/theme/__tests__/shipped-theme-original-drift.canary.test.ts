import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * @file Canary: every SHIPPED theme that has a stored original must still be byte-identical to it.
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
 * Drift happened, undetected, for four weeks. `497c9d35` (2026-08-18) migrated `basic` to the v2
 * folder layout and did not carry the change into `__original-themes__`; 16 further product commits
 * landed on `content/themes/static/basic` after it (WCAG contrast fixes, the observer-threshold fix
 * that un-blanked long pages, Geist vendoring, the PWA icon set) and none of them touched the stored
 * original either. Pressing "Reset" would have restored a user to the pre-fix design — the exact
 * opposite of what the button promises. `c7ef123d` (2026-09-14) repaired the DATA by hand.
 *
 * Nothing repaired the CAUSE, which is that there is no step anywhere — no script, no gate, no test —
 * connecting an edit to a shipped theme with its stored original. The only writer of
 * `__original-themes__` in product code is `downloadMarketplaceTheme`, which writes both sides in
 * lockstep for marketplace themes only; `development/scripts/theme-tool.ts` treats originals as
 * read-only by design. A shipped theme's original is maintained by hand and by memory. This canary is
 * the missing step: it does not sync anything, it makes the omission fail loudly the next time.
 *
 * ---------------------------------------------------------------------------
 * Scope: the package stock tree only
 * ---------------------------------------------------------------------------
 * `content/themes/` and NOT `<site>/themes/`. A site's copy is meant to diverge from its original —
 * that divergence IS the user's work, and the original is what it gets compared against. Sweeping a
 * site tree would assert the opposite of the feature.
 *
 * A shipped theme with NO stored original is a supported state, not a failure: the product reports it
 * as "not resettable" (`marketplace.ts`'s `resettable` flag) and `restoreBuiltThemeGeneratedTree`
 * throws a named error for it. Only 1 of the 8 themes in `content/themes/` has an original today. So
 * the sweep is driven from the ORIGINALS side — every original must have a matching live theme and
 * match it exactly — rather than demanding an original for every theme.
 */

const THEMES_DIR = path.resolve(import.meta.dirname, "../../../../../../content/themes");
const ORIGINALS_DIR = path.join(THEMES_DIR, "__original-themes__");

/** A `<tier>/<id>` pair that has a stored original under {@link ORIGINALS_DIR}. */
interface CatalogedTheme {
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
 * Every theme with a stored original, discovered from disk rather than listed by hand so a theme that
 * gains an original later is swept without anyone remembering to add it here.
 *
 * @returns Cataloged `<tier>/<id>` pairs, tier-then-id sorted.
 * @complexity O(t + n) in tiers and cataloged themes — two shallow directory reads per tier.
 */
function catalogedThemes(): CatalogedTheme[] {
  return directoriesIn(ORIGINALS_DIR).flatMap((tier) =>
    directoriesIn(path.join(ORIGINALS_DIR, tier)).map((id) => ({ tier, id }))
  );
}

/**
 * Every file in a theme folder, as paths relative to that folder.
 *
 * Anything that is neither a regular file nor a directory (symlink, socket, device) is returned as a
 * path too, so it shows up as a difference instead of being silently dropped from one side of a
 * comparison — a skipped entry on one side only is exactly how a "no differences" result lies.
 *
 * @param themeDir - Absolute path to a theme folder.
 * @returns Sorted relative paths, POSIX-separated.
 * @complexity O(f) in the folder's entry count; one `readdir` per directory, no file reads.
 */
function relativeFilePaths(themeDir: string): string[] {
  const walk = (dir: string, prefix: string): string[] =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((entry) => {
        const relativePath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
        return entry.isDirectory() ? walk(path.join(dir, entry.name), relativePath) : [relativePath];
      });
  return walk(themeDir, "").sort();
}

/** Bounds a failure message to something readable while still stating the true total. */
function summarize(paths: string[]): string {
  const shown = paths.slice(0, 10).join(", ");
  return paths.length > 10 ? `${shown}, … (${paths.length} total)` : shown;
}

const CATALOGED = catalogedThemes();

test("canary: the originals sweep is not vacuous", () => {
  // Without this, deleting `__original-themes__` — or moving it, or renaming a tier — turns every
  // check below into a pass over an empty list, and this file goes green while the feature it guards
  // has no data left at all.
  assert.ok(
    CATALOGED.length > 0,
    `no stored originals found under ${ORIGINALS_DIR}; either the catalog moved or "reset to original" has nothing to restore from`
  );
});

for (const { tier, id } of CATALOGED) {
  test(`canary: shipped theme ${tier}/${id} is byte-identical to its stored original`, () => {
    const liveDir = path.join(THEMES_DIR, tier, id);
    const originalDir = path.join(ORIGINALS_DIR, tier, id);

    assert.ok(
      fs.existsSync(liveDir),
      `__original-themes__/${tier}/${id} has no shipped theme at content/themes/${tier}/${id} — an orphan original is restorable-looking dead weight; delete it or restore the theme`
    );

    const livePaths = relativeFilePaths(liveDir);
    const originalPaths = relativeFilePaths(originalDir);
    const liveSet = new Set(livePaths);
    const originalSet = new Set(originalPaths);

    const onlyLive = livePaths.filter((p) => !originalSet.has(p));
    const onlyOriginal = originalPaths.filter((p) => !liveSet.has(p));
    assert.deepEqual(
      { added: onlyLive, removed: onlyOriginal },
      { added: [], removed: [] },
      `content/themes/${tier}/${id} and its stored original no longer hold the same files.\n` +
        `  in the shipped theme but not the original: ${summarize(onlyLive) || "(none)"}\n` +
        `  in the original but not the shipped theme: ${summarize(onlyOriginal) || "(none)"}\n` +
        `A shipped theme's original is NOT maintained by any automated step. If you changed the theme, copy the change into content/themes/__original-themes__/${tier}/${id}/ (and keep sites/*/themes/__original-themes__ in mind for already-seeded sites) — otherwise "Reset to original" restores the old design.`
    );

    const drifted = livePaths.filter(
      (relativePath) =>
        !fs.readFileSync(path.join(liveDir, relativePath)).equals(fs.readFileSync(path.join(originalDir, relativePath)))
    );
    assert.deepEqual(
      drifted,
      [],
      `content/themes/${tier}/${id} has drifted from its stored original in: ${summarize(drifted)}.\n` +
        `Every one of those files would be REVERTED by "Reset to original". Copy the current shipped bytes into content/themes/__original-themes__/${tier}/${id}/, or explain in the commit why the original should stay behind.`
    );
  });
}
