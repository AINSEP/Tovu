import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadTheme } from "../theme";

/**
 * @file ADR-020 §3 (C6) — certifies `loadTheme()`'s lint-before-publish wiring:
 * a "templated" theme with a disallowed tag/filter in any `.liquid` template
 * must load as `status: "invalid"` with a clear per-file error, and a clean
 * theme (the real `themes/dispatch` demonstrator) must load as `status: "valid"`.
 */

function makeThemeDir(files: { "theme.json": string; "tokens.json"?: string } & Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-"));
  fs.mkdirSync(path.join(dir, "templates"), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    if (name === "theme.json" || name === "tokens.json") {
      fs.writeFileSync(path.join(dir, name), content, "utf8");
    } else {
      fs.writeFileSync(path.join(dir, "templates", name), content, "utf8");
    }
  }
  if (!files["tokens.json"]) fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  return dir;
}

const templatedManifest = JSON.stringify({ id: "t", name: "T", version: "1.0.0", tier: "templated", engine: 1 });

test("a clean templated theme (only allowed tags/filters) loads as valid", () => {
  const dir = makeThemeDir({
    "theme.json": templatedManifest,
    "home.liquid": "{% for p in posts %}{{ p.title | upcase }}{% endfor %}",
    "entry.liquid": "{{ post.title }}",
  });
  const theme = loadTheme(dir, "t", "site");
  assert.equal(theme.status, "valid");
  assert.deepEqual(theme.errors, []);
  assert.ok(theme.liquidTemplates.home);
  assert.ok(theme.liquidTemplates.entry);
});

test("a disallowed tag in home.liquid fails the theme as invalid, naming the file and the tag", () => {
  const dir = makeThemeDir({
    "theme.json": templatedManifest,
    "home.liquid": '{% include "leak" %}',
    "entry.liquid": "{{ post.title }}",
  });
  const theme = loadTheme(dir, "t", "site");
  assert.equal(theme.status, "invalid");
  const homeError = theme.errors.find((e) => e.startsWith("templates/home.liquid:"));
  assert.ok(homeError, `expected a templates/home.liquid error, got: ${JSON.stringify(theme.errors)}`);
  assert.match(homeError!, /disallowed tag "include"/);
  // Rejected content never enters the trusted map (fail closed).
  assert.equal(theme.liquidTemplates.home, undefined);
});

test("a disallowed filter in entry.liquid fails the theme as invalid, naming the file and the filter", () => {
  const dir = makeThemeDir({
    "theme.json": templatedManifest,
    "home.liquid": "{{ site.title }}",
    "entry.liquid": "{{ post.title | sha256 }}",
  });
  const theme = loadTheme(dir, "t", "site");
  assert.equal(theme.status, "invalid");
  const entryError = theme.errors.find((e) => e.startsWith("templates/entry.liquid:"));
  assert.ok(entryError, `expected a templates/entry.liquid error, got: ${JSON.stringify(theme.errors)}`);
  assert.match(entryError!, /disallowed filter "sha256"/);
});

test("the live themes/dispatch demonstrator theme loads as valid end-to-end", () => {
  const dispatchDir = path.join(process.cwd(), "themes", "dispatch");
  const theme = loadTheme(dispatchDir, "dispatch", "built-in");
  assert.equal(theme.status, "valid");
  assert.deepEqual(theme.errors, []);
  assert.equal(theme.manifest.tier, "templated");
  assert.ok(theme.liquidTemplates.home);
  assert.ok(theme.liquidTemplates.entry);
});

// ---------------------------------------------------------------------------
// SPEC-043/ADR-047 §2a — theme-declared `regions` (widgets)
// ---------------------------------------------------------------------------

const declarativeManifestWithRegions = JSON.stringify({
  id: "d",
  name: "D",
  version: "1.0.0",
  tier: "declarative",
  engine: 1,
  regions: ["header", "footer"],
});

test("a theme.json declaring regions parses them onto manifest.regions, in order, as strings", () => {
  const dir = makeThemeDir({
    "theme.json": declarativeManifestWithRegions,
    "home.json": JSON.stringify({ type: "doc", content: [] }),
    "entry.json": JSON.stringify({ type: "doc", content: [] }),
  });
  const theme = loadTheme(dir, "d", "site");
  assert.equal(theme.status, "valid");
  assert.deepEqual(theme.manifest.regions, ["header", "footer"]);
});

test("a theme.json with no regions field leaves manifest.regions undefined (back-compat, no migration needed for existing themes)", () => {
  const dir = makeThemeDir({
    "theme.json": JSON.stringify({ id: "d2", name: "D2", version: "1.0.0", tier: "declarative", engine: 1 }),
    "home.json": JSON.stringify({ type: "doc", content: [] }),
    "entry.json": JSON.stringify({ type: "doc", content: [] }),
  });
  const theme = loadTheme(dir, "d2", "site");
  assert.equal(theme.status, "valid");
  assert.equal(theme.manifest.regions, undefined);
});

test("the live themes/dispatch demonstrator theme (no regions declared yet) still loads as valid with manifest.regions undefined", () => {
  const dispatchDir = path.join(process.cwd(), "themes", "dispatch");
  const theme = loadTheme(dispatchDir, "dispatch", "built-in");
  assert.equal(theme.status, "valid");
  assert.equal(theme.manifest.regions, undefined);
});
