import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

/**
 * @file Closes the one statSync call `theme-files.test.ts`'s own circular-symlink coverage cannot
 * reach: `writeFileAtomically`'s own `statOrThemePathError(target, relativePathForError)` call
 * (`theme-files.ts`, near the top of that function).
 *
 * `writeThemeFile` — like `writeFileAtomically`'s other caller, `resetThemeFileToOriginal` — runs
 * an IDENTICAL stat on the same
 * `target` one line earlier (its own pre-existing-file check) and, once THAT call is wrapped in
 * `statOrThemePathError`, throws `ThemePathError` on a circular symlink before `writeFileAtomically`
 * ever runs — confirmed by reading both call sites in sequence, not assumed: nothing between the two
 * calls (`mkdirSync(dirname(target))`) touches `target` itself, so a same-process, single-threaded
 * circular-symlink TARGET can never reach `writeFileAtomically`'s own stat at all. The only way this
 * catch branch is reachable in real operation is a genuine TOCTOU race: an external process replacing
 * `target` with a circular symlink pair in the brief synchronous window between the two stat calls.
 * That race cannot be forced open by ordinary single-process test code, so this test substitutes a
 * fake FIRST `statSync` call (as if `writeThemeFile`'s own pre-check ran before the race window
 * opened) while letting the REAL, second call hit an ACTUAL circular symlink on disk — proving
 * `writeFileAtomically`'s own wrapper converts the resulting ELOOP correctly, independent of whether
 * `writeThemeFile`'s earlier check happens to catch it first (mirrors this repo's own
 * `members/__tests__/disable.unit.test.ts` "currently dead, defensive" technique for the identical
 * shape of problem — a catch branch shadowed by an earlier, identical check).
 *
 * The original module mock required a standalone file and import after registration: it could not
 * retroactively change the real fs binding already loaded by `theme-files.test.ts`. A per-write stat
 * dependency now opens the same race window without experimental module replacement.
 */

function makeThemesRoot(): { root: string; themeDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-themes-root-wfa-"));
  const themeDir = path.join(root, "plain");
  fs.mkdirSync(themeDir, { recursive: true });
  fs.writeFileSync(path.join(themeDir, "theme.json"), "{}", "utf8");
  return { root, themeDir };
}

test("writeFileAtomically's own existing-target stat converts a circular-symlink ELOOP to ThemePathError, independent of writeThemeFile's earlier identical check", async () => {
  const { root, themeDir } = makeThemesRoot();
  const a = path.join(themeDir, "a");
  const b = path.join(themeDir, "b");
  fs.symlinkSync(b, a);
  fs.symlinkSync(a, b);

  const realFs = await import("node:fs");
  let statCalls = 0;
  const stat = ((...args: Parameters<typeof realFs.statSync>) => {
    statCalls += 1;
    // Call 1 = writeThemeFile's own pre-existing-file check, standing in for it having run
    // BEFORE an external process created the circular symlink loop at `target` (the TOCTOU
    // window this test simulates). Every later call is the REAL statSync against the REAL
    // fixture, which by then genuinely is the circular pair created above.
    if (statCalls === 1) return undefined;
    return realFs.statSync(...args);
  }) as typeof realFs.statSync;

  try {
    const { writeThemeFile, ThemePathError } = await import("../theme-files.js");
    assert.throws(
      () => writeThemeFile({ themeDir, themesRoot: root, relativePath: "a", content: "x" }, { stat }),
      ThemePathError
    );
    assert.equal(
      statCalls,
      2,
      "expected exactly two statSync calls: writeThemeFile's own pre-check, then writeFileAtomically's"
    );
  } finally {
    fs.unlinkSync(a);
    fs.unlinkSync(b);
  }
});
