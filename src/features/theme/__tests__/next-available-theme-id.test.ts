import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { nextAvailableThemeId, THEME_CATALOG_DIR } from "../theme.js";

/**
 * @file `nextAvailableThemeId` — the collision-suffixing rule behind the marketplace download flow
 * (`marketplace.ts`'s `downloadMarketplaceTheme`). Theme ids are unique per FOLDER, not globally
 * (`duplicateThemeIds`'s doc comment), so this is the one place that decides what id a NEW folder gets.
 */

/** A scratch themes root with an empty `<tier>/` and `<THEME_CATALOG_DIR>/<tier>/` pair, mirroring the
 * real `src/themes/` layout closely enough for `nextAvailableThemeId` to check against. */
function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-next-theme-id-"));
  fs.mkdirSync(path.join(root, "static"), { recursive: true });
  fs.mkdirSync(path.join(root, THEME_CATALOG_DIR, "static"), { recursive: true });
  return root;
}

/** Mark an id "taken" by creating its folder — installed side, catalog side, or both. */
function occupy(root: string, id: string, where: "installed" | "catalog" | "both" = "both"): void {
  if (where === "installed" || where === "both") {
    fs.mkdirSync(path.join(root, "static", id), { recursive: true });
  }
  if (where === "catalog" || where === "both") {
    fs.mkdirSync(path.join(root, THEME_CATALOG_DIR, "static", id), { recursive: true });
  }
}

test("a free id is returned unchanged", () => {
  const root = makeThemesRoot();
  assert.equal(nextAvailableThemeId({ desiredId: "basic", themesRoot: root, tier: "static" }), "basic");
});

test("one collision suffixes -1", () => {
  const root = makeThemesRoot();
  occupy(root, "basic");
  assert.equal(nextAvailableThemeId({ desiredId: "basic", themesRoot: root, tier: "static" }), "basic-1");
});

test("several collisions walk up to the first free suffix", () => {
  const root = makeThemesRoot();
  occupy(root, "basic");
  occupy(root, "basic-1");
  occupy(root, "basic-2");
  occupy(root, "basic-3");
  assert.equal(nextAvailableThemeId({ desiredId: "basic", themesRoot: root, tier: "static" }), "basic-4");
});

test("an id that already ends in a digit is suffixed, not renumbered", () => {
  const root = makeThemesRoot();
  occupy(root, "basic9");
  // Must produce "basic9-1", never "basic10" — the suffix always means "the Nth copy of this exact
  // id", so it can never be confused with a digit that was part of the original id.
  assert.equal(nextAvailableThemeId({ desiredId: "basic9", themesRoot: root, tier: "static" }), "basic9-1");
});

test("a folder that exists ONLY in the catalog still counts as taken", () => {
  // A download writes both sides in lockstep; a folder present in only one (e.g. a prior run left the
  // pair desynced) must still block the id, or the next download could recreate that exact desync.
  const root = makeThemesRoot();
  occupy(root, "basic", "catalog");
  assert.equal(nextAvailableThemeId({ desiredId: "basic", themesRoot: root, tier: "static" }), "basic-1");
});

test("a folder that exists ONLY in the installed tier still counts as taken", () => {
  const root = makeThemesRoot();
  occupy(root, "basic", "installed");
  assert.equal(nextAvailableThemeId({ desiredId: "basic", themesRoot: root, tier: "static" }), "basic-1");
});
