import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildStaticPortabilityIndex, generateStaticPortabilityIndex } from "../static-portability-index.js";
import { loadTheme, type DiscoveredTheme } from "../theme.js";

/**
 * @file Certifies Milestone 5's generated root `index.html`: the two embed-marker categories
 * (`partial` splice, everything-else placeholder), the two-pass nested-marker resolution (a `menu`
 * marker living INSIDE a just-spliced partial), root-relative asset-path rewriting robust to real
 * migrated themes' current v1-shaped residue (`../css/styles.css`, `../js/*.js` — see this module's
 * own file header), and token/color-mode injection.
 */

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** A minimal static-tier v2 theme on disk, deliberately using the REAL migrated shape's current
 * residue (`../css/styles.css`, `../js/main.js` — v1 filenames the migration engine moves the FILES
 * for but does not yet rewrite the referencing HTML to match, a real gap this fixture pins against
 * rather than assumes away) so the generator is proven against what a real migrated theme actually
 * contains, not an idealized v2-clean page. */
function writeStaticFixture(dir: string, overrides: { defaultMode?: string } = {}): void {
  fs.mkdirSync(path.join(dir, "render", "pages"), { recursive: true });
  fs.mkdirSync(path.join(dir, "render", "partials"), { recursive: true });
  fs.mkdirSync(path.join(dir, "css"), { recursive: true });
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });

  fs.writeFileSync(
    path.join(dir, "render", "pages", "index.html"),
    `<!doctype html>
<html lang="en">
<head>
<link rel="stylesheet" href="../css/styles.css" />
<script src="../js/main.js"></script>
</head>
<body>
<div data-embed-config='{"type":"partial","id":"nav"}'></div>
<main>
<div data-embed-config='{"type":"content"}'>fallback text</div>
</main>
<div data-embed-config='{"type":"partial","id":"footer"}'></div>
</body>
</html>`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(dir, "render", "partials", "nav.html"),
    `<nav class="main-nav" data-embed-config='{"type":"menu","id":"main-nav"}'><a href="#">Fallback link</a></nav>`,
    "utf8"
  );
  fs.writeFileSync(path.join(dir, "render", "partials", "footer.html"), `<footer>Static footer copy</footer>`, "utf8");
  fs.writeFileSync(path.join(dir, "css", "theme.css"), "body{color:var(--fg)}", "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), JSON.stringify({ "--fg": "#111", "--bg": "#fff" }), "utf8");
  fs.writeFileSync(path.join(dir, "tokens.light.json"), JSON.stringify({ "--fg": "#fff", "--bg": "#111" }), "utf8");

  const manifest = {
    apiVersion: 2,
    id: "fixture-static",
    name: "Fixture Static",
    version: "0.1.0",
    tier: "static",
    modes: ["dark", "light"],
    defaultMode: overrides.defaultMode ?? "dark",
    slots: {
      nav: { source: "nav.html" },
      footer: { source: "footer.html" },
    },
  };
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify(manifest), "utf8");
}

function loadFixture(dir: string): DiscoveredTheme {
  const loaded = loadTheme({ themeDir: dir, id: "fixture-static", source: "built-in" });
  assert.equal(loaded.status, "valid", `fixture failed to load: ${JSON.stringify(loaded.errors)}`);
  return loaded;
}

/**
 * A minimal static-tier v1 theme (`apiVersion` absent) — the flat layout `writeStaticFixture`'s v2
 * shape replaced. 2026-08-19 architecture audit finding 5: `buildStaticPortabilityIndex` always
 * emitted v2's `css/theme.css`/`scripts/` regardless of the source theme's own `apiVersion`, so
 * running it against a real v1 theme produced a "valid" portability page whose stylesheet/script
 * URLs both pointed at files that do not exist for a v1 theme (`css/styles.css`, `js/*.js`).
 */
function writeStaticFixtureV1(dir: string, overrides: { defaultMode?: string } = {}): void {
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.mkdirSync(path.join(dir, "css"), { recursive: true });
  fs.mkdirSync(path.join(dir, "js"), { recursive: true });

  fs.writeFileSync(
    path.join(dir, "pages", "index.html"),
    `<!doctype html>
<html lang="en">
<head>
<link rel="stylesheet" href="../css/styles.css" />
<script src="../js/main.js"></script>
</head>
<body>
<div data-embed-config='{"type":"partial","id":"nav"}'></div>
<main>
<div data-embed-config='{"type":"content"}'>fallback text</div>
</main>
<div data-embed-config='{"type":"partial","id":"footer"}'></div>
</body>
</html>`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(dir, "nav.html"),
    `<nav class="main-nav" data-embed-config='{"type":"menu","id":"main-nav"}'><a href="#">Fallback link</a></nav>`,
    "utf8"
  );
  fs.writeFileSync(path.join(dir, "footer.html"), `<footer>Static footer copy</footer>`, "utf8");
  fs.writeFileSync(path.join(dir, "css", "styles.css"), "body{color:var(--fg)}", "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), JSON.stringify({ "--fg": "#111", "--bg": "#fff" }), "utf8");
  fs.writeFileSync(path.join(dir, "tokens.light.json"), JSON.stringify({ "--fg": "#fff", "--bg": "#111" }), "utf8");

  const manifest = {
    id: "fixture-static-v1",
    name: "Fixture Static V1",
    version: "0.1.0",
    tier: "static",
    engine: 1,
    modes: ["dark", "light"],
    defaultMode: overrides.defaultMode ?? "dark",
    slots: {
      nav: { source: "nav.html" },
      footer: { source: "footer.html" },
    },
  };
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify(manifest), "utf8");
}

function loadV1Fixture(dir: string): DiscoveredTheme {
  const loaded = loadTheme({ themeDir: dir, id: "fixture-static-v1", source: "built-in" });
  assert.equal(loaded.status, "valid", `v1 fixture failed to load: ${JSON.stringify(loaded.errors)}`);
  return loaded;
}

// ---------------------------------------------------------------------------
// buildStaticPortabilityIndex — guard clauses
// ---------------------------------------------------------------------------

test("returns undefined for a non-static tier theme", () => {
  const theme: DiscoveredTheme = {
    manifest: { id: "t", name: "T", version: "1.0.0", tier: "declarative", engine: 1 },
    dir: "/nonexistent",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: { index: "<html></html>" },
    partials: {},
    css: "",
    source: "built-in",
    status: "valid",
    errors: [],
  };
  assert.equal(buildStaticPortabilityIndex(theme), undefined);
});

test("returns undefined when the theme ships no index page", () => {
  const theme: DiscoveredTheme = {
    manifest: { id: "t", name: "T", version: "1.0.0", tier: "static", engine: 1 },
    dir: "/nonexistent",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: { about: "<html></html>" },
    partials: {},
    css: "",
    source: "built-in",
    status: "valid",
    errors: [],
  };
  assert.equal(buildStaticPortabilityIndex(theme), undefined);
});

// ---------------------------------------------------------------------------
// buildStaticPortabilityIndex — real fixture, marker splice + asset paths + tokens
// ---------------------------------------------------------------------------

test("rewrites v1-shaped ../css/ and ../js/ references to root-relative css/theme.css and scripts/", () => {
  const dir = tmpDir("tovu-portability-assets-");
  writeStaticFixture(dir);
  const html = buildStaticPortabilityIndex(loadFixture(dir));
  assert.ok(html);
  assert.match(html!, /<link rel="stylesheet" href="css\/theme\.css" \/>/);
  assert.match(html!, /<script src="scripts\/main\.js">/);
  assert.equal(html!.includes('href="../css/'), false);
  assert.equal(html!.includes('src="../js/'), false);
});

// 2026-08-19 architecture audit finding 5: `buildStaticPortabilityIndex` must branch on the source
// theme's OWN `apiVersion`, not always emit v2's asset shape. A v1 theme's real stylesheet is
// `css/styles.css` and its real script folder is `js/` — different filenames/folders than v2's
// `css/theme.css`/`scripts/`, and neither exists on disk for the other schema version.
test("v1 fixture: rewrites ../css/ and ../js/ references to root-relative css/styles.css and js/ (v1's OWN real filenames, not v2's)", () => {
  const dir = tmpDir("tovu-portability-v1-assets-");
  writeStaticFixtureV1(dir);
  const html = buildStaticPortabilityIndex(loadV1Fixture(dir));
  assert.ok(html);
  assert.match(html!, /<link rel="stylesheet" href="css\/styles\.css" \/>/, `expected v1's css/styles.css, got: ${html}`);
  assert.match(html!, /<script src="js\/main\.js">/, `expected v1's js/ folder, got: ${html}`);
  assert.equal(html!.includes("theme.css"), false, "must not emit v2's theme.css filename for a v1 theme");
  assert.equal(html!.includes("scripts/"), false, "must not emit v2's scripts/ folder for a v1 theme");
});

test("v1 fixture: injects design tokens as real CSS before the (v1-shaped) stylesheet link", () => {
  const dir = tmpDir("tovu-portability-v1-tokens-");
  writeStaticFixtureV1(dir, { defaultMode: "light" });
  const html = buildStaticPortabilityIndex(loadV1Fixture(dir));
  assert.ok(html);
  assert.match(html!, /:root \{\n {2}--fg: #111;\n {2}--bg: #fff;\n\}/);
  const styleIndex = html!.indexOf("<style>");
  const linkIndex = html!.indexOf('<link rel="stylesheet"');
  assert.ok(
    styleIndex >= 0 && styleIndex < linkIndex,
    "the token <style> block must come before the v1 stylesheet link too, not only the v2 one"
  );
});

test("splices the real partial content in place of a partial marker, leaving no marker syntax behind", () => {
  const dir = tmpDir("tovu-portability-partial-");
  writeStaticFixture(dir);
  const html = buildStaticPortabilityIndex(loadFixture(dir));
  assert.ok(html);
  assert.match(html!, /Static footer copy/);
  assert.equal(html!.includes('"type":"partial"'), false);
});

test("placeholders a genuinely dynamic marker (content type) rather than leaving authored fallback text", () => {
  const dir = tmpDir("tovu-portability-content-");
  writeStaticFixture(dir);
  const html = buildStaticPortabilityIndex(loadFixture(dir));
  assert.ok(html);
  assert.match(html!, /<!-- live content when connected to Tovu -->/);
  assert.equal(html!.includes("fallback text"), false);
});

test("placeholders a menu marker nested INSIDE a just-spliced partial (nav.html's own menu marker)", () => {
  const dir = tmpDir("tovu-portability-nested-menu-");
  writeStaticFixture(dir);
  const html = buildStaticPortabilityIndex(loadFixture(dir));
  assert.ok(html);
  assert.equal(html!.includes("Fallback link"), false, "the theme author's own guessed fallback link text must not survive");
  assert.equal(html!.includes('"type":"menu"'), false, "the marker vocabulary itself is Tovu-internal wiring debris in a file meant to stand alone, not real theme markup");
  assert.equal(html!.includes("data-embed-config"), false, "the generated file is a one-shot final snapshot, never re-scanned, so no marker attribute should survive");
  assert.match(html!, /<nav class="main-nav">/, "a real authored styling hook (class) must survive even though the marker attribute is stripped");
  const occurrences = html!.split("<!-- live content when connected to Tovu -->").length - 1;
  assert.equal(occurrences, 2, "one for the page's own content marker, one for nav.html's nested menu marker");
});

test("injects design tokens as real CSS before the stylesheet link, and stamps defaultMode", () => {
  const dir = tmpDir("tovu-portability-tokens-");
  writeStaticFixture(dir, { defaultMode: "light" });
  const html = buildStaticPortabilityIndex(loadFixture(dir));
  assert.ok(html);
  assert.match(html!, /<html lang="en" data-theme="light">/);
  assert.match(html!, /:root \{\n {2}--fg: #111;\n {2}--bg: #fff;\n\}/);
  assert.match(html!, /:root\[data-theme="light"\] \{\n {2}--fg: #fff;\n {2}--bg: #111;\n\}/);
  const styleIndex = html!.indexOf("<style>");
  const linkIndex = html!.indexOf('<link rel="stylesheet"');
  assert.ok(styleIndex >= 0 && styleIndex < linkIndex, "the token <style> block must come before the stylesheet link");
});

// ---------------------------------------------------------------------------
// generateStaticPortabilityIndex — the write wrapper
// ---------------------------------------------------------------------------

test("generateStaticPortabilityIndex writes the generated file to disk, and always regenerates on a repeat call", () => {
  const dir = tmpDir("tovu-portability-write-");
  writeStaticFixture(dir);
  const result = generateStaticPortabilityIndex({ themeDir: dir, id: "fixture-static" });
  assert.deepEqual(result, { status: "written", path: path.join(dir, "index.html") });
  assert.equal(fs.existsSync(path.join(dir, "index.html")), true);

  const second = generateStaticPortabilityIndex({ themeDir: dir, id: "fixture-static" });
  assert.equal(second.status, "written", "generated output is never left stale — every call is a full regenerate, matching the preview/ precedent");
});

test("generateStaticPortabilityIndex skips (does not write) a non-static-tier theme", () => {
  const dir = tmpDir("tovu-portability-skip-declarative-");
  fs.mkdirSync(path.join(dir, "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({ id: "t", name: "T", version: "1.0.0", tier: "declarative", engine: 1 }),
    "utf8"
  );
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");

  const result = generateStaticPortabilityIndex({ themeDir: dir, id: "t" });
  assert.equal(result.status, "skipped");
  assert.equal(fs.existsSync(path.join(dir, "index.html")), false);
});
