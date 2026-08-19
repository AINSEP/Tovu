import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadTheme } from "../theme.js";

/**
 * @file Regression coverage for the Milestone 3 loader fix (sibling to Blocker A's request-time
 * rendering fix): `loadTheme()`'s own file-discovery paths (`templatesDir`, `cssPath`,
 * `loadStaticTierAssets`'s `pagesDir`, `loadSlotPartials`'s partials scan) were hardcoded to v1's flat
 * shape with no `apiVersion` awareness — a v2-migrated theme (`render/pages/`, `render/partials/`,
 * `css/theme.css`) would fail to load at all (`status: "invalid"`, missing-file errors), before
 * Blocker A's request-time rewrite fix could even become relevant. `theme.test.ts` already pins the
 * v1 (default) path; this file covers the v2 (`apiVersion: 2`) path those fixtures don't exercise.
 */

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(value), "utf8");
}

test("a v2-shaped templated theme (render/pages/*.liquid, css/theme.css) loads as valid", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-v2-"));
  fs.mkdirSync(path.join(dir, "render/pages"), { recursive: true });
  fs.mkdirSync(path.join(dir, "css"), { recursive: true });
  writeJson(path.join(dir, "theme.json"), { id: "t", name: "T", version: "1.0.0", tier: "templated", engine: 1, apiVersion: 2 });
  writeJson(path.join(dir, "tokens.json"), {});
  fs.writeFileSync(path.join(dir, "render/pages/home.liquid"), "{{ site.title }}", "utf8");
  fs.writeFileSync(path.join(dir, "render/pages/entry.liquid"), "{{ post.title }}", "utf8");
  fs.writeFileSync(path.join(dir, "css/theme.css"), "body { margin: 0; }", "utf8");

  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });
  assert.equal(theme.status, "valid");
  assert.deepEqual(theme.errors, []);
  assert.ok(theme.liquidTemplates.home);
  assert.ok(theme.liquidTemplates.entry);
  assert.equal(theme.css, "body { margin: 0; }");
});

test("a v2-shaped templated theme missing render/pages/home.liquid reports the render/pages/ path, not templates/", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-v2-"));
  fs.mkdirSync(path.join(dir, "render/pages"), { recursive: true });
  writeJson(path.join(dir, "theme.json"), { id: "t", name: "T", version: "1.0.0", tier: "templated", engine: 1, apiVersion: 2 });
  writeJson(path.join(dir, "tokens.json"), {});
  fs.writeFileSync(path.join(dir, "render/pages/entry.liquid"), "{{ post.title }}", "utf8");

  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });
  assert.equal(theme.status, "invalid");
  assert.ok(
    theme.errors.some((e) => e === "render/pages/home.liquid is required"),
    `expected a render/pages/home.liquid error, got: ${JSON.stringify(theme.errors)}`
  );
});

test("a v2-shaped static theme (render/pages/, render/partials/, css/theme.css) loads pages/partials/css correctly", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-v2-"));
  fs.mkdirSync(path.join(dir, "render/pages"), { recursive: true });
  fs.mkdirSync(path.join(dir, "render/partials"), { recursive: true });
  fs.mkdirSync(path.join(dir, "css"), { recursive: true });
  writeJson(path.join(dir, "theme.json"), {
    id: "t",
    name: "T",
    version: "1.0.0",
    tier: "static",
    engine: 1,
    apiVersion: 2,
    slots: { nav: { source: "nav.html" } },
  });
  writeJson(path.join(dir, "tokens.json"), {});
  fs.writeFileSync(
    path.join(dir, "render/pages/index.html"),
    '<div data-embed-config=\'{"type":"partial","id":"nav"}\'></div>',
    "utf8"
  );
  fs.writeFileSync(path.join(dir, "render/partials/nav.html"), "<nav>real nav</nav>", "utf8");
  fs.writeFileSync(path.join(dir, "css/theme.css"), "body { margin: 0; }", "utf8");

  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });
  assert.equal(theme.status, "valid");
  assert.deepEqual(theme.errors, []);
  assert.ok(theme.pages.index);
  assert.equal(theme.partials.nav, "<nav>real nav</nav>");
  assert.equal(theme.css, "body { margin: 0; }");
});

test("a v2-shaped static theme missing render/pages/index.html reports the render/pages/ path, not pages/", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-v2-"));
  fs.mkdirSync(path.join(dir, "render/pages"), { recursive: true });
  writeJson(path.join(dir, "theme.json"), { id: "t", name: "T", version: "1.0.0", tier: "static", engine: 1, apiVersion: 2 });
  writeJson(path.join(dir, "tokens.json"), {});

  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });
  assert.equal(theme.status, "invalid");
  assert.ok(
    theme.errors.some((e) => e === "render/pages/index.html is required"),
    `expected a render/pages/index.html error, got: ${JSON.stringify(theme.errors)}`
  );
});

test("a v2-shaped static theme with no render/partials/ folder at all (empty slots) loads clean, not a crash", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-v2-"));
  fs.mkdirSync(path.join(dir, "render/pages"), { recursive: true });
  fs.mkdirSync(path.join(dir, "css"), { recursive: true });
  writeJson(path.join(dir, "theme.json"), { id: "t", name: "T", version: "1.0.0", tier: "static", engine: 1, apiVersion: 2, slots: {} });
  writeJson(path.join(dir, "tokens.json"), {});
  fs.writeFileSync(path.join(dir, "render/pages/index.html"), "<p>no partials needed</p>", "utf8");
  fs.writeFileSync(path.join(dir, "css/theme.css"), "body {}", "utf8");

  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });
  assert.equal(theme.status, "valid");
  assert.deepEqual(theme.partials, {});
});
