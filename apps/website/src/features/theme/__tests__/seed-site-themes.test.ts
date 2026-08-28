import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { seedSiteThemes } from "../seed-site-themes.js";

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

/** A throwaway stock themes tree shaped like the real one: tiers, catalog, marketplace. */
function makeStockTree(): string {
  const root = mkdtempSync(join(tmpdir(), "tovu-stock-themes-"));
  tempRoots.push(root);
  mkdirSync(join(root, "static", "basic", "css"), { recursive: true });
  writeFileSync(join(root, "static", "basic", "css", "theme.css"), "body{color:stock}");
  mkdirSync(join(root, "templated", "storefront"), { recursive: true });
  writeFileSync(join(root, "templated", "storefront", "theme.json"), "{}");
  mkdirSync(join(root, "__original-themes__", "static", "basic", "css"), { recursive: true });
  writeFileSync(join(root, "__original-themes__", "static", "basic", "css", "theme.css"), "body{color:stock}");
  mkdirSync(join(root, "__marketplace__", "static", "basic"), { recursive: true });
  writeFileSync(join(root, "__marketplace__", "static", "basic", "theme.json"), "{}");
  return root;
}

/** A throwaway site root whose `themes/` subdirectory does NOT yet exist. */
function makeEmptySiteRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tovu-site-"));
  tempRoots.push(root);
  return root;
}

test("seeds the whole stock tree into a site that has no themes/ yet", () => {
  const stockDir = makeStockTree();
  const siteThemesDir = join(makeEmptySiteRoot(), "themes");

  const result = seedSiteThemes({ stockDir, siteThemesDir });

  assert.equal(result.status, "seeded");
  assert.equal(result.siteThemesDir, siteThemesDir);
  assert.equal(readFileSync(join(siteThemesDir, "static", "basic", "css", "theme.css"), "utf8"), "body{color:stock}");
  assert.ok(existsSync(join(siteThemesDir, "templated", "storefront", "theme.json")));
});

test("copies __original-themes__ — without it the site loses every theme's 'reset to original' source", () => {
  const stockDir = makeStockTree();
  const siteThemesDir = join(makeEmptySiteRoot(), "themes");

  seedSiteThemes({ stockDir, siteThemesDir });

  assert.equal(
    readFileSync(join(siteThemesDir, "__original-themes__", "static", "basic", "css", "theme.css"), "utf8"),
    "body{color:stock}"
  );
});

test("copies __marketplace__ — `listMarketplaceThemes` resolves it under the site's own themes root", () => {
  // `marketplace.ts` computes `join(themesRoot, MARKETPLACE_CATALOG_DIR)` off `RouteDeps.themesDir`,
  // which is now the SITE's themes root. Omit it here and the admin Marketplace screen goes empty.
  const stockDir = makeStockTree();
  const siteThemesDir = join(makeEmptySiteRoot(), "themes");

  seedSiteThemes({ stockDir, siteThemesDir });

  assert.ok(existsSync(join(siteThemesDir, "__marketplace__", "static", "basic", "theme.json")));
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
  writeFileSync(join(siteThemesDir, "static", "basic", "css", "theme.css"), "body{color:EDITED}");

  assert.equal(seedSiteThemes({ stockDir, siteThemesDir }).status, "already-present");
  assert.equal(readFileSync(join(siteThemesDir, "static", "basic", "css", "theme.css"), "utf8"), "body{color:EDITED}");
});

test("creates missing parent directories of the site themes dir", () => {
  const stockDir = makeStockTree();
  const siteThemesDir = join(makeEmptySiteRoot(), "nested", "deeper", "themes");

  assert.equal(seedSiteThemes({ stockDir, siteThemesDir }).status, "seeded");
  assert.ok(existsSync(join(siteThemesDir, "static", "basic", "css", "theme.css")));
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

test("a leftover staging directory from an interrupted boot does not block the next seed", () => {
  const stockDir = makeStockTree();
  const siteRoot = makeEmptySiteRoot();
  const siteThemesDir = join(siteRoot, "themes");
  mkdirSync(join(siteRoot, ".themes-seed-staging", "junk"), { recursive: true });

  assert.equal(seedSiteThemes({ stockDir, siteThemesDir }).status, "seeded");
  assert.ok(existsSync(join(siteThemesDir, "static", "basic", "css", "theme.css")));
  assert.equal(existsSync(join(siteRoot, ".themes-seed-staging")), false);
});
