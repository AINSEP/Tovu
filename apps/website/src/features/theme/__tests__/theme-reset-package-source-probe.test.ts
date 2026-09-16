import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resetThemeFileToOriginal, themeOriginalResetRefusal } from "../theme-files.js";

/**
 * @file Design C go/no-go probe (`ADS-memory/.local-artifacts/agent-reports/2026-09-16-w4-theme-
 * lifecycle-designs.md` §9, Slice 1) — written and run BEFORE any Design C source edit exists. Proves
 * the hard part: can `resetThemeFileToOriginal` resolve its original from a PACKAGE catalog instead
 * of a site's own, per theme, byte-exactly, without touching the live tree — and does
 * `themeOriginalResetRefusal` still refuse correctly across that seam? Both functions already take
 * `originalDir`/`originalsRoot` as plain parameters (`theme-files.ts:699`, `:772`), so this file
 * builds a package-shaped fixture (a themes root with its own `<tier>/<id>` original folder,
 * structurally identical to a site's own catalog, just a separate directory tree entirely) and calls
 * the existing functions with it. Zero source edits — only existing exported helpers.
 *
 * Assertion (c) is the go/no-go for Design C: if a package-sourced original could silently reset a
 * site theme onto a different layout `apiVersion`, C is unsafe as designed and must not be built.
 */

/** A themes root shaped like the real package catalog would be resolved TO: `<root>/<tier>/<id>` per
 *  theme. This fixture IS the catalog root itself (no wrapping `__original-themes__` segment) —
 *  `isRecognizedThemeRoot` (`theme-files.ts`) only requires `originalDir`'s parent to be
 *  `originalsRoot` or one of its `ENGINE_SUBFOLDERS` entries, never a particular folder name, so a
 *  bare tmp root satisfies the identical containment shape `content/themes/__original-themes__`
 *  would. */
function makePackageOriginalsRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-pkg-originals-"));
}

/** A themes root shaped like a real SITE's live themes tree: `<root>/<tier>/<id>` for the live theme
 *  folder. Deliberately carries no `__original-themes__` anywhere — stands in for the `basic-2`
 *  shape, a site that has never had a stored original for this theme at all (w4 report §0a). */
function makeSiteThemesRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-site-themes-"));
}

function write(dir: string, relativePath: string, content: string | Buffer): string {
  const target = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

test("(a) a package-sourced reset succeeds byte-exact and the live file matches the package original", () => {
  const siteThemesRoot = makeSiteThemesRoot();
  const themeDir = path.join(siteThemesRoot, "static", "tailark-dusk");
  write(themeDir, "css/site.css", "body{color:red}");

  const packageOriginalsRoot = makePackageOriginalsRoot();
  const originalDir = path.join(packageOriginalsRoot, "static", "tailark-dusk");
  const canonicalBytes = Buffer.from("body{color:blue;font-family:sans-serif}");
  write(originalDir, "css/site.css", canonicalBytes);

  const result = resetThemeFileToOriginal({
    themeDir,
    themesRoot: siteThemesRoot,
    originalDir,
    originalsRoot: packageOriginalsRoot,
    relativePath: "css/site.css",
  });

  assert.deepEqual(result, { wasModified: true, bytes: canonicalBytes.length });
  assert.ok(fs.readFileSync(path.join(themeDir, "css/site.css")).equals(canonicalBytes));
});

test("(b) a theme with no site-level original (basic-2 shape) becomes resettable via the package slot", () => {
  const siteThemesRoot = makeSiteThemesRoot();
  const themeDir = path.join(siteThemesRoot, "static", "basic-2");
  write(themeDir, "theme.json", JSON.stringify({ id: "basic-2", tier: "static" }));

  // The whole coverage claim starts here: this site has NEVER had a catalog original for this theme
  // — no `__original-themes__` anywhere under its themes root at all, matching `basic-2`'s real state
  // on disk today.
  assert.equal(fs.existsSync(path.join(siteThemesRoot, "__original-themes__")), false);

  // Confirms today's gap first: resolving against the site's own (absent) catalog answers `null`,
  // exactly as `resetThemeFileToOriginal`'s documented "no file in the catalog at the path" contract
  // (see `theme-file-reset-to-original.test.ts`'s first case).
  const siteOriginalsRoot = path.join(siteThemesRoot, "__original-themes__");
  const siteOriginalDir = path.join(siteOriginalsRoot, "static", "basic-2");
  assert.equal(
    resetThemeFileToOriginal({
      themeDir,
      themesRoot: siteThemesRoot,
      originalDir: siteOriginalDir,
      originalsRoot: siteOriginalsRoot,
      relativePath: "theme.json",
    }),
    null
  );

  // The package slot, resolved independently: same theme id/tier, a completely separate directory
  // tree the site has no knowledge of and never wrote into.
  const packageOriginalsRoot = makePackageOriginalsRoot();
  const packageOriginalDir = path.join(packageOriginalsRoot, "static", "basic-2");
  const canonicalManifest = Buffer.from(JSON.stringify({ id: "basic-2", tier: "static", version: "0.1.0" }));
  write(packageOriginalDir, "theme.json", canonicalManifest);

  const result = resetThemeFileToOriginal({
    themeDir,
    themesRoot: siteThemesRoot,
    originalDir: packageOriginalDir,
    originalsRoot: packageOriginalsRoot,
    relativePath: "theme.json",
  });

  assert.deepEqual(result, { wasModified: true, bytes: canonicalManifest.length });
  assert.ok(fs.readFileSync(path.join(themeDir, "theme.json")).equals(canonicalManifest));
});

// (c) — the go/no-go. `themeOriginalResetRefusal` takes a bare `{ themeDir, originalDir }` with no
// containment check at all (`theme-files.ts:772`) — it only reads each side's own `theme.json` off
// whatever absolute directory it is given, so a package-rooted `originalDir` is not a special case
// for it at all. Table form to lock in both mismatch directions and the matching-layout
// non-refusal, mirroring `theme-original-reset-refusal.test.ts`'s own shape.
const V1_MANIFEST = { id: "t", tier: "static" };
const V2_MANIFEST = { apiVersion: 2, id: "t", tier: "static" };

function writeManifest(dir: string, manifest: unknown): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify(manifest), "utf8");
}

// The "allowed" live fixtures deliberately differ in BYTES from their package original (an
// `edited` marker) while keeping the same `apiVersion`-derived layout — proving the byte-exact
// overwrite actually happens, not just that the gate says yes. Using byte-identical fixtures here
// would make `wasModified: false` the correct (no-op) answer and assert nothing about the seam.
const LAYOUT_CASES: ReadonlyArray<{ name: string; packageOriginal: unknown; live: unknown; refused: boolean }> = [
  {
    name: "package original v1, live v1: allowed",
    packageOriginal: V1_MANIFEST,
    live: { ...V1_MANIFEST, edited: true },
    refused: false,
  },
  {
    name: "package original v2, live v2: allowed",
    packageOriginal: V2_MANIFEST,
    live: { ...V2_MANIFEST, edited: true },
    refused: false,
  },
  {
    name: "package original v1, live v2: REFUSED, not silently reset across layouts",
    packageOriginal: V1_MANIFEST,
    live: V2_MANIFEST,
    refused: true,
  },
  {
    name: "package original v2, live v1: REFUSED, not silently reset across layouts",
    packageOriginal: V2_MANIFEST,
    live: V1_MANIFEST,
    refused: true,
  },
];

for (const { name, packageOriginal, live, refused } of LAYOUT_CASES) {
  test(`(c) go/no-go: ${name}`, () => {
    const packageOriginalsRoot = makePackageOriginalsRoot();
    const originalDir = path.join(packageOriginalsRoot, "static", "t");
    writeManifest(originalDir, packageOriginal);

    const siteThemesRoot = makeSiteThemesRoot();
    const themeDir = path.join(siteThemesRoot, "static", "t");
    writeManifest(themeDir, live);

    const refusal = themeOriginalResetRefusal({ themeDir, originalDir });
    assert.equal(refusal !== null, refused);

    if (refused) {
      // The load-bearing behavior, not just the refusal object: mirroring `explore.ts`'s own
      // composition (`resetFileFromOriginal` — the refusal is checked BEFORE any reset call), a
      // caller that honors the refusal never reaches `resetThemeFileToOriginal` at all, so a
      // mismatched package original can never overwrite a live file of the other layout. Confirming
      // the live bytes are still exactly what this test wrote is the same "nothing touched" proof
      // `theme-file-reset-to-original.test.ts` uses throughout — deliberately NOT calling
      // `resetThemeFileToOriginal` here, since the refusal's whole job is that a compliant caller
      // never gets that far.
      const stillLive = fs.readFileSync(path.join(themeDir, "theme.json"), "utf8");
      assert.equal(stillLive, JSON.stringify(live));
    } else {
      // Allowed case: prove the reset actually proceeds end to end through the package source too,
      // not just that the gate says yes.
      const result = resetThemeFileToOriginal({
        themeDir,
        themesRoot: siteThemesRoot,
        originalDir,
        originalsRoot: packageOriginalsRoot,
        relativePath: "theme.json",
      });
      assert.equal(result?.wasModified, true);
      assert.equal(fs.readFileSync(path.join(themeDir, "theme.json"), "utf8"), JSON.stringify(packageOriginal));
    }
  });
}
