import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { discoverThemes, loadTheme } from "../theme";

function writeDeclarativeTheme(root: string, id: string, tier?: unknown): string {
  const dir = path.join(root, id);
  fs.mkdirSync(path.join(dir, "templates"), { recursive: true });
  const manifest: Record<string, unknown> = { id, name: id, version: "1.0.0", engine: 1 };
  if (tier !== undefined) manifest.tier = tier;
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify(manifest), "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "templates", "home.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "templates", "entry.json"), "{}", "utf8");
  return dir;
}

test("an absent or empty tier retains the declarative default", () => {
  for (const tier of [undefined, ""] as const) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-tier-"));
    const themeDir = writeDeclarativeTheme(root, "defaulted", tier);
    const theme = loadTheme({ themeDir, id: "defaulted", source: "site" });

    assert.equal(theme.status, "valid");
    assert.equal(theme.manifest.tier, "declarative");
  }
});

test("a present unrecognized tier is invalid instead of loading as declarative", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-tier-"));
  const themeDir = writeDeclarativeTheme(root, "misspelled", "cdoe");
  const theme = loadTheme({ themeDir, id: "misspelled", source: "site" });

  assert.equal(theme.status, "invalid");
  assert.ok(
    theme.errors.includes("theme.json: unrecognized theme tier 'cdoe'"),
    `expected an unrecognized-tier diagnostic, got ${JSON.stringify(theme.errors)}`
  );
});

test("one theme with an unrecognized tier does not prevent sibling discovery", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-tier-"));
  writeDeclarativeTheme(root, "good-theme");
  writeDeclarativeTheme(root, "bad-theme", "future-tier");

  const themes = discoverThemes({ dir: root, source: "site" });

  assert.equal(themes.length, 2);
  assert.equal(themes.find((theme) => theme.manifest.id === "good-theme")?.status, "valid");
  const badTheme = themes.find((theme) => theme.manifest.id === "bad-theme");
  assert.equal(badTheme?.status, "invalid");
  assert.ok(badTheme?.errors.includes("theme.json: unrecognized theme tier 'future-tier'"));
});
