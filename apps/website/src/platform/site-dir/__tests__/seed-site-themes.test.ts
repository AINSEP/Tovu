import assert from "node:assert/strict";
import fs from "node:fs";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { DEFAULT_THEME_ID } from "#src/features/theme/active-theme";

import { SEEDED_STOCK_THEME_IDS, seedSiteThemes } from "../seed-site-themes.js";

/**
 * @file `seedSiteThemes()` — the first-boot copy that gets a site's themes OUT of the package.
 *
 * This is the regression surface for the bug the `infra/` -> `sites/` move exists to fix: themes,
 * and their own `__original-themes__/` "reset to original" backups, used to live inside `src/themes/`
 * — which a Tovu upgrade replaces wholesale, destroying every edit the site owner had made.
 *
 * Every case runs against a throwaway stock tree and a throwaway site dir under `os.tmpdir()`,
 * never the real `content/themes/`.
 */

const tempRoots: string[] = [];

after(() => {
  for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true });
});

/**
 * A throwaway stock themes tree shaped like the real one: tiers, catalog, a root README, the seeded
 * `tovu-starter`, and stock themes a new site must NOT get (`basic`, `storefront`, a legacy top-level
 * `meridian`).
 */
function makeStockTree(): string {
  const root = mkdtempSync(join(tmpdir(), "tovu-stock-themes-"));
  tempRoots.push(root);
  writeFileSync(join(root, "README.md"), "stock");
  mkdirSync(join(root, "static", "tovu-starter", "css"), { recursive: true });
  writeFileSync(join(root, "static", "tovu-starter", "theme.json"), "{}");
  writeFileSync(join(root, "static", "tovu-starter", "css", "theme.css"), "body{color:stock}");
  mkdirSync(join(root, "static", "basic", "css"), { recursive: true });
  writeFileSync(join(root, "static", "basic", "css", "theme.css"), "body{color:other}");
  mkdirSync(join(root, "templated", "storefront"), { recursive: true });
  writeFileSync(join(root, "templated", "storefront", "theme.json"), "{}");
  mkdirSync(join(root, "meridian"), { recursive: true });
  writeFileSync(join(root, "meridian", "theme.json"), "{}");
  mkdirSync(join(root, "__original-themes__", "static", "tovu-starter", "css"), { recursive: true });
  writeFileSync(join(root, "__original-themes__", "static", "tovu-starter", "css", "theme.css"), "body{color:stock}");
  mkdirSync(join(root, "__original-themes__", "static", "basic", "css"), { recursive: true });
  writeFileSync(join(root, "__original-themes__", "static", "basic", "css", "theme.css"), "body{color:other}");
  return root;
}

/** Every path a seeded site must hold for {@link makeStockTree}: the starter, its original, and the folders around them. */
const EXPECTED_SEEDED_ENTRIES = [
  "README.md",
  "__original-themes__",
  join("__original-themes__", "static"),
  join("__original-themes__", "static", "tovu-starter"),
  join("__original-themes__", "static", "tovu-starter", "css"),
  join("__original-themes__", "static", "tovu-starter", "css", "theme.css"),
  "static",
  join("static", "tovu-starter"),
  join("static", "tovu-starter", "css"),
  join("static", "tovu-starter", "css", "theme.css"),
  join("static", "tovu-starter", "theme.json"),
  "templated",
].sort();

/** A throwaway site root whose `themes/` subdirectory does NOT yet exist. */
function makeEmptySiteRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tovu-site-"));
  tempRoots.push(root);
  return root;
}

test("seeds tovu-starter into a site that has no themes/ yet", () => {
  const stockDir = makeStockTree();
  const siteThemesDir = join(makeEmptySiteRoot(), "themes");

  const result = seedSiteThemes({ stockDir, siteThemesDir });

  assert.equal(result.status, "seeded");
  assert.equal(result.siteThemesDir, siteThemesDir);
  assert.equal(readFileSync(join(siteThemesDir, "static", "tovu-starter", "css", "theme.css"), "utf8"), "body{color:stock}");
});

test("a new site gets ONLY tovu-starter — every other stock theme, and its original, stays in the package (owner 2026-10-08)", () => {
  const stockDir = makeStockTree();
  const siteThemesDir = join(makeEmptySiteRoot(), "themes");

  assert.equal(seedSiteThemes({ stockDir, siteThemesDir }).status, "seeded");

  assert.deepEqual(readdirSync(siteThemesDir, { recursive: true }).map(String).sort(), EXPECTED_SEEDED_ENTRIES);
  assert.ok(existsSync(join(stockDir, "static", "basic", "css", "theme.css")), "the package's own stock tree is never touched");
});

test("seeds exactly the default theme — the seeded list and the render fallback cannot disagree", () => {
  assert.deepEqual(SEEDED_STOCK_THEME_IDS, [DEFAULT_THEME_ID]);
});

test("copies __original-themes__ — without it the site loses every theme's 'reset to original' source", () => {
  const stockDir = makeStockTree();
  const siteThemesDir = join(makeEmptySiteRoot(), "themes");

  seedSiteThemes({ stockDir, siteThemesDir });

  assert.equal(
    readFileSync(join(siteThemesDir, "__original-themes__", "static", "tovu-starter", "css", "theme.css"), "utf8"),
    "body{color:stock}"
  );
});

test("never overwrites an existing site themes dir — the owner's edits survive the next boot", () => {
  const stockDir = makeStockTree();
  const siteThemesDir = join(makeEmptySiteRoot(), "themes");
  mkdirSync(join(siteThemesDir, "static", "basic", "css"), { recursive: true });
  writeFileSync(join(siteThemesDir, "static", "basic", "css", "theme.css"), "body{color:MINE}");

  const result = seedSiteThemes({ stockDir, siteThemesDir });

  assert.equal(result.status, "already-present");
  assert.equal(readFileSync(join(siteThemesDir, "static", "basic", "css", "theme.css"), "utf8"), "body{color:MINE}");
});

test("an existing but EMPTY site themes dir still counts as present — an operator's deliberate empty root is not refilled", () => {
  const stockDir = makeStockTree();
  const siteThemesDir = join(makeEmptySiteRoot(), "themes");
  mkdirSync(siteThemesDir, { recursive: true });

  const result = seedSiteThemes({ stockDir, siteThemesDir });

  assert.equal(result.status, "already-present");
  assert.deepEqual(readdirSync(siteThemesDir), []);
});

test("reports no-stock-source instead of throwing when the package has no themes tree", () => {
  // Boot must not die here. A stock tree can genuinely be absent — `TOVU_STOCK_THEMES_DIR` pointed
  // somewhere wrong, or a trimmed deployment — and the site's own themes dir may already be
  // mounted from elsewhere.
  const siteThemesDir = join(makeEmptySiteRoot(), "themes");

  const result = seedSiteThemes({ stockDir: join(tmpdir(), "tovu-stock-that-does-not-exist"), siteThemesDir });

  assert.equal(result.status, "no-stock-source");
  assert.equal(existsSync(siteThemesDir), false);
});

test("is idempotent: a second call after a successful seed is a no-op", () => {
  const stockDir = makeStockTree();
  const siteThemesDir = join(makeEmptySiteRoot(), "themes");

  assert.equal(seedSiteThemes({ stockDir, siteThemesDir }).status, "seeded");
  writeFileSync(join(siteThemesDir, "static", "tovu-starter", "css", "theme.css"), "body{color:EDITED}");

  assert.equal(seedSiteThemes({ stockDir, siteThemesDir }).status, "already-present");
  assert.equal(readFileSync(join(siteThemesDir, "static", "tovu-starter", "css", "theme.css"), "utf8"), "body{color:EDITED}");
});

test("creates missing parent directories of the site themes dir", () => {
  const stockDir = makeStockTree();
  const siteThemesDir = join(makeEmptySiteRoot(), "nested", "deeper", "themes");

  assert.equal(seedSiteThemes({ stockDir, siteThemesDir }).status, "seeded");
  assert.ok(existsSync(join(siteThemesDir, "static", "tovu-starter", "css", "theme.css")));
});

test("leaves no staging directory behind after a successful seed", () => {
  // The copy lands in a sibling staging dir and is renamed into place, so an interrupted boot can
  // never leave a HALF-copied `themes/` that the next boot then reads as `already-present`.
  const stockDir = makeStockTree();
  const siteRoot = makeEmptySiteRoot();

  seedSiteThemes({ stockDir, siteThemesDir: join(siteRoot, "themes") });

  assert.deepEqual(
    readdirSync(siteRoot).filter((entry) => entry !== "themes"),
    []
  );
});

test("a mid-copy failure leaves themes absent, and a retry copies the complete seeded tree", (t) => {
  const stockDir = makeStockTree();
  const siteRoot = makeEmptySiteRoot();
  const siteThemesDir = join(siteRoot, "themes");
  const originalCopy = fs.cpSync;
  const failure = new Error("stock copy interrupted after the first theme");
  let partialCopyObserved = false;
  const copyMock = t.mock.method(fs, "cpSync", (from: string | URL, to: string | URL) => {
    assert.equal(from, stockDir);
    originalCopy(join(stockDir, "static"), join(String(to), "static"), { recursive: true });
    assert.equal(readFileSync(join(String(to), "static", "tovu-starter", "css", "theme.css"), "utf8"), "body{color:stock}");
    partialCopyObserved = true;
    throw failure;
  });
  // The source uses node:fs's named cpSync export; keep that binding in sync with the mock.
  syncBuiltinESMExports();
  try {
    assert.throws(() => seedSiteThemes({ stockDir, siteThemesDir }), (error) => error === failure);
    assert.equal(partialCopyObserved, true);
    assert.equal(existsSync(siteThemesDir), false, "an interrupted copy must not publish partial themes");
  } finally {
    copyMock.mock.restore();
    syncBuiltinESMExports();
  }

  assert.equal(seedSiteThemes({ stockDir, siteThemesDir }).status, "seeded");
  assert.equal(existsSync(join(siteRoot, ".themes-seed-staging")), false);
  assert.deepEqual(readdirSync(siteThemesDir, { recursive: true }).map(String).sort(), EXPECTED_SEEDED_ENTRIES);
  for (const relative of EXPECTED_SEEDED_ENTRIES) {
    if (fs.statSync(join(stockDir, String(relative))).isFile()) {
      assert.deepEqual(readFileSync(join(siteThemesDir, String(relative))), readFileSync(join(stockDir, String(relative))));
    }
  }
});

test("a leftover staging directory from an interrupted boot does not block the next seed", () => {
  const stockDir = makeStockTree();
  const siteRoot = makeEmptySiteRoot();
  const siteThemesDir = join(siteRoot, "themes");
  mkdirSync(join(siteRoot, ".themes-seed-staging", "junk"), { recursive: true });

  assert.equal(seedSiteThemes({ stockDir, siteThemesDir }).status, "seeded");
  assert.ok(existsSync(join(siteThemesDir, "static", "tovu-starter", "css", "theme.css")));
  assert.equal(existsSync(join(siteRoot, ".themes-seed-staging")), false);
});
