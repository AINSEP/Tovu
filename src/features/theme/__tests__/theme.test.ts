import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadTheme } from "../theme.js";

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
  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });
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
  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });
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
  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });
  assert.equal(theme.status, "invalid");
  const entryError = theme.errors.find((e) => e.startsWith("templates/entry.liquid:"));
  assert.ok(entryError, `expected a templates/entry.liquid error, got: ${JSON.stringify(theme.errors)}`);
  assert.match(entryError!, /disallowed filter "sha256"/);
});

test("the live themes/dispatch demonstrator theme loads as valid end-to-end", () => {
  const dispatchDir = path.join(process.cwd(), "src", "theme-archive", "dispatch");
  const theme = loadTheme({ themeDir: dispatchDir, id: "dispatch", source: "built-in" });
  assert.equal(theme.status, "valid");
  assert.deepEqual(theme.errors, []);
  assert.equal(theme.manifest.tier, "templated");
  assert.ok(theme.liquidTemplates.home);
  assert.ok(theme.liquidTemplates.entry);
});

// ---------------------------------------------------------------------------
// ADR-020 §3 (C6), Handlebars tier — the same lint-before-publish wiring, for
// `.hbs`/`.handlebars` files against `handlebars-allowlist.ts`.
// ---------------------------------------------------------------------------

const handlebarsManifest = JSON.stringify({ id: "h", name: "H", version: "1.0.0", tier: "handlebars", engine: 1 });

test("a clean handlebars theme (only allowed helpers/expressions) loads as valid", () => {
  const dir = makeThemeDir({
    "theme.json": handlebarsManifest,
    "home.hbs": "{{#each posts}}{{title}}{{/each}}",
    "entry.hbs": "{{post.title}}{{{post.content}}}",
  });
  const theme = loadTheme({ themeDir: dir, id: "h", source: "site" });
  assert.equal(theme.status, "valid", `expected valid, got: ${JSON.stringify(theme.errors)}`);
  assert.deepEqual(theme.errors, []);
  assert.ok(theme.handlebarsTemplates.home);
  assert.ok(theme.handlebarsTemplates.entry);
});

test("the .handlebars extension is accepted alongside .hbs and maps to the same template ids", () => {
  const dir = makeThemeDir({
    "theme.json": handlebarsManifest,
    "home.handlebars": "{{site.title}}",
    "entry.handlebars": "{{post.title}}",
  });
  const theme = loadTheme({ themeDir: dir, id: "h", source: "site" });
  assert.equal(theme.status, "valid", `expected valid, got: ${JSON.stringify(theme.errors)}`);
  assert.ok(theme.handlebarsTemplates.home);
  assert.ok(theme.handlebarsTemplates.entry);
});

test("a disallowed partial in home.hbs fails the theme as invalid, naming the file and the partial", () => {
  const dir = makeThemeDir({
    "theme.json": handlebarsManifest,
    "home.hbs": "{{> leak}}",
    "entry.hbs": "{{post.title}}",
  });
  const theme = loadTheme({ themeDir: dir, id: "h", source: "site" });
  assert.equal(theme.status, "invalid");
  const homeError = theme.errors.find((e) => e.startsWith("templates/home.hbs:"));
  assert.ok(homeError, `expected a templates/home.hbs error, got: ${JSON.stringify(theme.errors)}`);
  assert.match(homeError!, /disallowed partial "leak"/);
  // Rejected content never enters the trusted map (fail closed).
  assert.equal(theme.handlebarsTemplates.home, undefined);
});

test("a disallowed raw {{{triple-stash}}} in entry.hbs fails the theme as invalid, naming the file and the expression", () => {
  const dir = makeThemeDir({
    "theme.json": handlebarsManifest,
    "home.hbs": "{{site.title}}",
    "entry.hbs": "{{{post.title}}}",
  });
  const theme = loadTheme({ themeDir: dir, id: "h", source: "site" });
  assert.equal(theme.status, "invalid");
  const entryError = theme.errors.find((e) => e.startsWith("templates/entry.hbs:"));
  assert.ok(entryError, `expected a templates/entry.hbs error, got: ${JSON.stringify(theme.errors)}`);
  assert.match(entryError!, /disallowed raw output/);
});

test("a handlebars theme missing home/entry reports the .hbs extension in its required-template errors", () => {
  const dir = makeThemeDir({ "theme.json": handlebarsManifest });
  const theme = loadTheme({ themeDir: dir, id: "h", source: "site" });
  assert.equal(theme.status, "invalid");
  assert.ok(theme.errors.includes("templates/home.hbs is required"));
  assert.ok(theme.errors.includes("templates/entry.hbs is required"));
});

test("skipLiquidAllowlist in a theme's OWN theme.json has no effect — it is trusted local policy, not publisher-controlled (schema v2, 2026-08-18)", () => {
  const dir = makeThemeDir({
    "theme.json": JSON.stringify({
      id: "t",
      name: "T",
      version: "1.0.0",
      tier: "templated",
      engine: 1,
      skipLiquidAllowlist: true,
    }),
    "home.liquid": '{% include "partial" %}',
    "entry.liquid": "{{ post.title }}",
  });
  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });
  assert.equal(theme.status, "invalid", "a manifest-authored skipLiquidAllowlist must not bypass the lint");
  assert.ok(theme.errors.some((e) => /disallowed tag "include"/.test(e)), `expected the lint to still run: ${JSON.stringify(theme.errors)}`);
});

test("skipLiquidAllowlist does NOT relax the Handlebars lint — the handlebars tier has no opt-out", () => {
  const dir = makeThemeDir({
    "theme.json": JSON.stringify({ id: "h", name: "H", version: "1.0.0", tier: "handlebars", engine: 1, skipLiquidAllowlist: true }),
    "home.hbs": "{{> leak}}",
    "entry.hbs": "{{post.title}}",
  });
  const theme = loadTheme({ themeDir: dir, id: "h", source: "site" });
  assert.equal(theme.status, "invalid");
  assert.ok(theme.errors.some((e) => /disallowed partial "leak"/.test(e)));
});

test("one bad .hbs file never breaks discovery of the rest of the theme (REQ-10 fault isolation)", () => {
  const dir = makeThemeDir({
    "theme.json": handlebarsManifest,
    "home.hbs": "{{site.title}}",
    "entry.hbs": "{{post.title}}",
    "products.hbs": "{{> leak}}",
  });
  const theme = loadTheme({ themeDir: dir, id: "h", source: "site" });
  assert.equal(theme.status, "invalid");
  // The clean templates still loaded; only the offending one was withheld.
  assert.ok(theme.handlebarsTemplates.home);
  assert.ok(theme.handlebarsTemplates.entry);
  assert.equal(theme.handlebarsTemplates.products, undefined);
});

test("loadTheme records the folder it loaded from, so a theme id never has to be re-resolved to a path", () => {
  const dir = makeThemeDir({
    "theme.json": handlebarsManifest,
    "home.hbs": "{{site.title}}",
    "entry.hbs": "{{post.title}}",
  });
  assert.equal(loadTheme({ themeDir: dir, id: "h", source: "site" }).dir, dir);
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
  const theme = loadTheme({ themeDir: dir, id: "d", source: "site" });
  assert.equal(theme.status, "valid");
  assert.deepEqual(theme.manifest.regions, ["header", "footer"]);
});

test("a theme.json with no regions field leaves manifest.regions undefined (back-compat, no migration needed for existing themes)", () => {
  const dir = makeThemeDir({
    "theme.json": JSON.stringify({ id: "d2", name: "D2", version: "1.0.0", tier: "declarative", engine: 1 }),
    "home.json": JSON.stringify({ type: "doc", content: [] }),
    "entry.json": JSON.stringify({ type: "doc", content: [] }),
  });
  const theme = loadTheme({ themeDir: dir, id: "d2", source: "site" });
  assert.equal(theme.status, "valid");
  assert.equal(theme.manifest.regions, undefined);
});

test("the live themes/dispatch demonstrator theme (no regions declared yet) still loads as valid with manifest.regions undefined", () => {
  const dispatchDir = path.join(process.cwd(), "src", "theme-archive", "dispatch");
  const theme = loadTheme({ themeDir: dispatchDir, id: "dispatch", source: "built-in" });
  assert.equal(theme.status, "valid");
  assert.equal(theme.manifest.regions, undefined);
});

// ---------------------------------------------------------------------------
// Declarative tier: malformed `templates/*.json` (characterization test written for the
// loadTheme complexity-reduction refactor, 2026-08-20 — this catch branch, now inside
// loadJsonTemplateFile, had no direct test anywhere in this suite before, confirmed by c8 line
// coverage on theme.ts).
// ---------------------------------------------------------------------------

const declarativeManifest = JSON.stringify({ id: "d", name: "D", version: "1.0.0", tier: "declarative", engine: 1 });

test("a templates/*.json file that fails to parse is reported per-file, not thrown", () => {
  const dir = makeThemeDir({
    "theme.json": declarativeManifest,
    "home.json": "{ not valid json",
    "entry.json": JSON.stringify({ type: "doc", content: [] }),
  });
  const theme = loadTheme({ themeDir: dir, id: "d", source: "site" });

  assert.equal(theme.status, "invalid");
  const homeError = theme.errors.find((e) => e.startsWith("templates/home.json:"));
  assert.ok(homeError, `expected a templates/home.json error, got: ${JSON.stringify(theme.errors)}`);
  // Fault isolation (REQ-10): the one bad file doesn't stop entry.json from loading.
  assert.ok(theme.templates.entry);
  assert.equal(theme.templates.home, undefined);
});
