import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validateThemePackage } from "../validate-theme-package.js";

/**
 * @file Certifies `validateThemePackage`'s two branches (v1 fallback via `loadTheme()`, v2-strict via
 * `manifest-v2.ts`/`structure.ts`/`references.ts`) plus the schema-version-agnostic markup checks.
 * Fixtures are synthetic — no real theme on disk declares `apiVersion: 2` yet (nothing has migrated),
 * so the v2-strict path here is exercised only against hand-built fixtures, matching this module's own
 * documented limitation.
 */

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function findError(result: ReturnType<typeof validateThemePackage>, ruleId: string) {
  return result.errors.find((e) => e.ruleId === ruleId);
}
function findWarning(result: ReturnType<typeof validateThemePackage>, ruleId: string) {
  return result.warnings.find((w) => w.ruleId === ruleId);
}

// ---------------------------------------------------------------------------
// v1 fallback
// ---------------------------------------------------------------------------

test("v1 fallback: a real, valid declarative theme passes with schemaVersion 1", () => {
  const dir = tmpDir("tovu-validate-v1-ok-");
  fs.mkdirSync(path.join(dir, "templates"), { recursive: true });
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify({ id: "t", name: "T", version: "1.0.0", tier: "declarative", engine: 1 }), "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "templates", "home.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "templates", "entry.json"), "{}", "utf8");

  const result = validateThemePackage({ themeDir: dir, id: "t", profile: "author" });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.valid, true, `expected valid, got errors: ${JSON.stringify(result.errors)}`);
});

test("v1 fallback: loadTheme()'s own errors (e.g. id/folder mismatch) surface as validator errors", () => {
  const dir = tmpDir("tovu-validate-v1-bad-");
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify({ id: "wrong-id", name: "T", version: "1.0.0", tier: "declarative", engine: 1 }), "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");

  const result = validateThemePackage({ themeDir: dir, id: "t", profile: "author" });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.valid, false);
  const err = findError(result, "loadtheme-error");
  assert.ok(err, `expected a loadtheme-error, got: ${JSON.stringify(result.errors)}`);
  assert.match(err!.message, /must equal folder name/);
});

// ---------------------------------------------------------------------------
// manifest loading — theme.json missing, not an object, or not valid JSON at all
// ---------------------------------------------------------------------------

test("a theme directory with no theme.json is reported (manifest-missing), and falls back to schemaVersion 1", () => {
  const dir = tmpDir("tovu-validate-manifest-missing-");

  const result = validateThemePackage({ themeDir: dir, id: "t", profile: "author" });
  assert.equal(result.schemaVersion, 1);
  assert.ok(findError(result, "manifest-missing"), JSON.stringify(result.errors));
});

test("a theme.json that parses to a non-object (e.g. a JSON array) is reported (manifest-not-object)", () => {
  const dir = tmpDir("tovu-validate-manifest-not-object-");
  fs.writeFileSync(path.join(dir, "theme.json"), "[1, 2, 3]", "utf8");

  const result = validateThemePackage({ themeDir: dir, id: "t", profile: "author" });
  assert.ok(findError(result, "manifest-not-object"), JSON.stringify(result.errors));
});

test("a theme.json that is not valid JSON at all is reported (manifest-invalid-json)", () => {
  const dir = tmpDir("tovu-validate-manifest-invalid-json-");
  fs.writeFileSync(path.join(dir, "theme.json"), "{ this is not json", "utf8");

  const result = validateThemePackage({ themeDir: dir, id: "t", profile: "author" });
  const err = findError(result, "manifest-invalid-json");
  assert.ok(err, JSON.stringify(result.errors));
  assert.match(err!.message, /theme\.json is not valid JSON/);
});

// ---------------------------------------------------------------------------
// v2-strict: manifest schema
// ---------------------------------------------------------------------------

function writeMinimalV2Static(dir: string, overrides: Record<string, unknown> = {}): void {
  fs.mkdirSync(path.join(dir, "render", "pages"), { recursive: true });
  fs.mkdirSync(path.join(dir, "render", "partials"), { recursive: true });
  fs.mkdirSync(path.join(dir, "css"), { recursive: true });
  fs.mkdirSync(path.join(dir, "assets", "previews"), { recursive: true });
  fs.writeFileSync(path.join(dir, "render", "pages", "index.html"), "<html></html>", "utf8");
  fs.writeFileSync(path.join(dir, "render", "partials", "nav.html"), "<nav></nav>", "utf8");
  fs.writeFileSync(path.join(dir, "css", "theme.css"), "body{}", "utf8");
  fs.writeFileSync(path.join(dir, "assets", "previews", "card.webp"), "fake-webp-bytes", "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  const manifest = {
    apiVersion: 2,
    id: "my-theme",
    name: "My Theme",
    version: "0.1.0",
    tier: "static",
    description: "A theme.",
    license: { spdx: "MIT" },
    partials: { nav: { source: "render/partials/nav.html" } },
    ...overrides,
  };
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify(manifest), "utf8");
}

test("v2-strict: a minimal, well-formed static-tier package (guide §17.1 shape) passes clean", () => {
  const dir = tmpDir("tovu-validate-v2-ok-");
  writeMinimalV2Static(dir);

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.valid, true, `expected valid, got errors: ${JSON.stringify(result.errors)}`);
});

test("v2-strict: an unrecognized top-level field is rejected (additionalProperties: false)", () => {
  const dir = tmpDir("tovu-validate-v2-unknown-field-");
  writeMinimalV2Static(dir, { totallyMadeUpField: true });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findError(result, "v2-unknown-field"), JSON.stringify(result.errors));
});

test("v2-strict: id must equal folder name", () => {
  const dir = tmpDir("tovu-validate-v2-id-mismatch-");
  writeMinimalV2Static(dir);

  const result = validateThemePackage({ themeDir: dir, id: "different-folder-name", profile: "author" });
  assert.ok(findError(result, "manifest-id-mismatch"), JSON.stringify(result.errors));
});

test("v2-strict: version must be valid semver", () => {
  const dir = tmpDir("tovu-validate-v2-semver-");
  writeMinimalV2Static(dir, { version: "not-a-version" });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findError(result, "v2-version-semver"), JSON.stringify(result.errors));
});

test("v2-strict: an unrecognized tier is rejected (fail-closed)", () => {
  const dir = tmpDir("tovu-validate-v2-tier-");
  writeMinimalV2Static(dir, { tier: "made-up-tier" });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findError(result, "v2-tier"), JSON.stringify(result.errors));
});

test("v2-strict: an absent tier is accepted — schema v2 tier is optional (loadTheme() defaults to declarative)", () => {
  const dir = tmpDir("tovu-validate-v2-tier-absent-");
  writeMinimalV2Static(dir, { tier: undefined });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.equal(findError(result, "v2-tier"), undefined, JSON.stringify(result.errors));
});

test("v2-strict: an empty/missing manifest id is rejected (v2-id, independent of the folder-name-match check)", () => {
  const dir = tmpDir("tovu-validate-v2-id-empty-");
  writeMinimalV2Static(dir, { id: "" });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findError(result, "v2-id"), JSON.stringify(result.errors));
});

test("v2-strict: an empty/missing name is rejected (v2-name)", () => {
  const dir = tmpDir("tovu-validate-v2-name-empty-");
  writeMinimalV2Static(dir, { name: "" });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findError(result, "v2-name"), JSON.stringify(result.errors));
});

test("v2-strict: engine as a bare number (v1 shape) is rejected — v2 requires the { name, version } object", () => {
  const dir = tmpDir("tovu-validate-v2-engine-number-");
  writeMinimalV2Static(dir, { engine: 1 });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findError(result, "v2-engine-shape"), JSON.stringify(result.errors));
});

test("v2-strict: engine.name must be a known template engine", () => {
  const dir = tmpDir("tovu-validate-v2-engine-name-");
  writeMinimalV2Static(dir, { engine: { name: "jsx-templates", version: "1" } });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findError(result, "v2-engine-name"), JSON.stringify(result.errors));
});

test("v2-strict: engine.version must be a string when present (v2-engine-version)", () => {
  const dir = tmpDir("tovu-validate-v2-engine-version-");
  writeMinimalV2Static(dir, { engine: { name: "liquid", version: 1 } });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findError(result, "v2-engine-version"), JSON.stringify(result.errors));
});

test("v2-strict: a non-object build is rejected (v2-build-shape)", () => {
  const dir = tmpDir("tovu-validate-v2-build-shape-");
  writeMinimalV2Static(dir, { build: "compiled" });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findError(result, "v2-build-shape"), JSON.stringify(result.errors));
});

test("v2-strict: a compiled build missing sourceDir/artifactHashes is rejected", () => {
  const dir = tmpDir("tovu-validate-v2-compiled-incomplete-");
  writeMinimalV2Static(dir, { build: { source: "compiled" } });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findError(result, "v2-build-sourcedir-required"), JSON.stringify(result.errors));
  assert.ok(findError(result, "v2-build-artifacthashes-required"), JSON.stringify(result.errors));
});

test("v2-strict: build.sourceDir colliding with an approved invariant root (css) is rejected", () => {
  const dir = tmpDir("tovu-validate-v2-sourcedir-css-");
  writeMinimalV2Static(dir, {
    build: { source: "compiled", sourceDir: "css", artifactHashes: { "render/pages/index.html": "sha256:x" } },
  });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findError(result, "structure-sourcedir-root-conflict"), JSON.stringify(result.errors));
});

test("v2-strict: build.sourceDir naming the reserved preview/ directory is rejected", () => {
  const dir = tmpDir("tovu-validate-v2-sourcedir-preview-");
  writeMinimalV2Static(dir, {
    build: { source: "compiled", sourceDir: "preview", artifactHashes: { "render/pages/index.html": "sha256:x" } },
  });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(
    findError(result, "v2-build-sourcedir-conflict") || findError(result, "structure-sourcedir-generated-conflict"),
    JSON.stringify(result.errors)
  );
});

test("v2-strict: an unrecognized build.source is rejected", () => {
  const dir = tmpDir("tovu-validate-v2-build-source-");
  writeMinimalV2Static(dir, { build: { source: "downloaded" } });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findError(result, "v2-build-source"), JSON.stringify(result.errors));
});

test("v2-strict: an unrecognized build.framework is rejected", () => {
  const dir = tmpDir("tovu-validate-v2-build-framework-");
  writeMinimalV2Static(dir, { build: { framework: "ember" } });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findError(result, "v2-build-framework"), JSON.stringify(result.errors));
});

test("v2-strict: license must be an object when present (v2-license-shape)", () => {
  const dir = tmpDir("tovu-validate-v2-license-shape-");
  writeMinimalV2Static(dir, { license: "MIT" });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findError(result, "v2-license-shape"), JSON.stringify(result.errors));
});

test("v2-strict: authors must be an array when present (v2-authors-shape)", () => {
  const dir = tmpDir("tovu-validate-v2-authors-shape-");
  writeMinimalV2Static(dir, { authors: { name: "Someone" } });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findError(result, "v2-authors-shape"), JSON.stringify(result.errors));
});

test("v2-strict: attributions must be an array when present (v2-attributions-shape)", () => {
  const dir = tmpDir("tovu-validate-v2-attributions-shape-");
  writeMinimalV2Static(dir, { attributions: { work: "Some Work" } });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findError(result, "v2-attributions-shape"), JSON.stringify(result.errors));
});

test("v2-strict: regions must be an array when present (v2-regions-shape)", () => {
  const dir = tmpDir("tovu-validate-v2-regions-shape-");
  writeMinimalV2Static(dir, { regions: "header" });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findError(result, "v2-regions-shape"), JSON.stringify(result.errors));
});

test("v2-strict: partials must be an object keyed by partial id (v2-partials-shape)", () => {
  const dir = tmpDir("tovu-validate-v2-partials-shape-");
  writeMinimalV2Static(dir, { partials: ["nav"] });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findError(result, "v2-partials-shape"), JSON.stringify(result.errors));
});

test("v2-strict: tokens.defaultMode not listed in tokens.modes is rejected (v2-tokens-default-mode)", () => {
  const dir = tmpDir("tovu-validate-v2-tokens-default-mode-");
  writeMinimalV2Static(dir, { tokens: { defaultMode: "sepia", modes: { dark: "tokens.json", light: "tokens.light.json" } } });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findError(result, "v2-tokens-default-mode"), JSON.stringify(result.errors));
});

test("v2-strict: a non-object tokens is rejected (v2-tokens-shape)", () => {
  const dir = tmpDir("tovu-validate-v2-tokens-shape-");
  writeMinimalV2Static(dir, { tokens: "dark" });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findError(result, "v2-tokens-shape"), JSON.stringify(result.errors));
});

test("v2-strict: tokens missing a modes object is rejected (v2-tokens-modes)", () => {
  const dir = tmpDir("tovu-validate-v2-tokens-modes-");
  writeMinimalV2Static(dir, { tokens: { defaultMode: "dark" } });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findError(result, "v2-tokens-modes"), JSON.stringify(result.errors));
});

// ---------------------------------------------------------------------------
// v2-strict: structure
// ---------------------------------------------------------------------------

test("v2-strict: an unapproved root-level file/folder is rejected", () => {
  const dir = tmpDir("tovu-validate-v2-unapproved-root-");
  writeMinimalV2Static(dir);
  fs.mkdirSync(path.join(dir, "js"), { recursive: true });
  fs.writeFileSync(path.join(dir, "js", "main.js"), "// v1-shaped stray folder", "utf8");

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  const err = findError(result, "structure-unapproved-root");
  assert.ok(err, JSON.stringify(result.errors));
  assert.equal(err!.path, "js");
});

test("v2-strict: modes/defaultMode/pages/slots are accepted top-level fields, not flagged unknown (real v1 fields loadTheme() reads flat and unconditionally, apiVersion-agnostic -- theme.ts:673-676)", () => {
  const dir = tmpDir("tovu-validate-v2-static-manifest-fields-");
  writeMinimalV2Static(dir, {
    modes: ["light"],
    defaultMode: "light",
    pages: ["index", "about"],
    slots: { nav: { source: "render/partials/nav.html" } },
  });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.equal(findError(result, "v2-unknown-field"), undefined, JSON.stringify(result.errors));
});

test("v2-strict: a root-level screenshots/ folder is an approved root, not flagged (every real theme on disk ships one)", () => {
  const dir = tmpDir("tovu-validate-v2-screenshots-");
  writeMinimalV2Static(dir);
  fs.mkdirSync(path.join(dir, "screenshots"), { recursive: true });
  fs.writeFileSync(path.join(dir, "screenshots", "index.jpg"), "fake-jpg-bytes", "utf8");

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.equal(findError(result, "structure-unapproved-root"), undefined, JSON.stringify(result.errors));
});

test("v2-strict: a root-level index.html (Milestone 5's generated portability snapshot) is an approved root, not flagged", () => {
  const dir = tmpDir("tovu-validate-v2-index-html-");
  writeMinimalV2Static(dir);
  fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><html><body></body></html>", "utf8");

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.equal(findError(result, "structure-unapproved-root"), undefined, JSON.stringify(result.errors));
});

// ---------------------------------------------------------------------------
// v2-strict: references
// ---------------------------------------------------------------------------

test("v2-strict: a partials entry referencing a missing file is rejected", () => {
  const dir = tmpDir("tovu-validate-v2-ref-missing-");
  writeMinimalV2Static(dir, { partials: { nav: { source: "render/partials/does-not-exist.html" } } });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findError(result, "references-missing-file"), JSON.stringify(result.errors));
});

test("v2-strict: two partials entries pointing at the identical source file are flagged", () => {
  const dir = tmpDir("tovu-validate-v2-ref-dup-");
  writeMinimalV2Static(dir, {
    partials: {
      nav: { source: "render/partials/nav.html" },
      "nav-again": { source: "render/partials/nav.html" },
    },
  });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findError(result, "references-duplicate-source"), JSON.stringify(result.errors));
});

// ---------------------------------------------------------------------------
// markup — schema-version-agnostic
// ---------------------------------------------------------------------------

test("markup: data-agent-element in theme markup is rejected on both schema versions", () => {
  const v1Dir = tmpDir("tovu-validate-markup-v1-");
  fs.mkdirSync(path.join(v1Dir, "pages"), { recursive: true });
  fs.writeFileSync(path.join(v1Dir, "theme.json"), JSON.stringify({ id: "t", name: "T", version: "1.0.0", tier: "static", engine: 1 }), "utf8");
  fs.writeFileSync(path.join(v1Dir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(v1Dir, "pages", "index.html"), '<div data-agent-element="foo"></div>', "utf8");
  const v1Result = validateThemePackage({ themeDir: v1Dir, id: "t", profile: "author" });
  assert.ok(findError(v1Result, "markup-data-agent-element-forbidden"), JSON.stringify(v1Result.errors));

  const v2Dir = tmpDir("tovu-validate-markup-v2-");
  writeMinimalV2Static(v2Dir);
  fs.writeFileSync(path.join(v2Dir, "render", "pages", "index.html"), '<div data-agent-element="foo"></div>', "utf8");
  const v2Result = validateThemePackage({ themeDir: v2Dir, id: "my-theme", profile: "author" });
  assert.ok(findError(v2Result, "markup-data-agent-element-forbidden"), JSON.stringify(v2Result.errors));
});

test("markup: an unknown data-embed-config type is rejected, and 'form' names the widget replacement", () => {
  const dir = tmpDir("tovu-validate-markup-form-");
  writeMinimalV2Static(dir);
  fs.writeFileSync(
    path.join(dir, "render", "pages", "index.html"),
    `<div data-embed-config='{"type":"form","id":"contact"}'></div>`,
    "utf8"
  );

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  const err = findError(result, "markup-embed-config-unknown-type");
  assert.ok(err, JSON.stringify(result.errors));
  assert.match(err!.message, /'form' was removed/);
});

test("markup: every real current embed type (widget/media/post/content/menu/partial) is accepted", () => {
  const dir = tmpDir("tovu-validate-markup-vocab-");
  writeMinimalV2Static(dir);
  const markers = ["widget", "media", "post", "content", "menu", "partial"]
    .map((type) => `<div data-embed-config='{"type":"${type}","id":"x"}'></div>`)
    .join("\n");
  fs.writeFileSync(path.join(dir, "render", "pages", "index.html"), markers, "utf8");

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.equal(findError(result, "markup-embed-config-unknown-type"), undefined, JSON.stringify(result.errors));
});

test("markup: the theme-owned post-previews embed type is accepted", () => {
  const dir = tmpDir("tovu-validate-markup-post-previews-");
  writeMinimalV2Static(dir);
  fs.writeFileSync(
    path.join(dir, "render", "pages", "index.html"),
    `<div data-embed-config='{"type":"post-previews","id":"latest"}'></div>`,
    "utf8"
  );

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.equal(findError(result, "markup-embed-config-unknown-type"), undefined, JSON.stringify(result.errors));
});

test("markup: the theme-owned collection embed type is accepted", () => {
  const dir = tmpDir("tovu-validate-markup-collection-");
  writeMinimalV2Static(dir);
  fs.writeFileSync(
    path.join(dir, "render", "pages", "index.html"),
    `<div data-embed-config='{"type":"collection","typeKey":"recipe"}'></div>`,
    "utf8"
  );

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.equal(findError(result, "markup-embed-config-unknown-type"), undefined, JSON.stringify(result.errors));
});

test("markup: a data-embed-config attribute written with double quotes is flagged as unrecognized-at-runtime", () => {
  const dir = tmpDir("tovu-validate-markup-doublequote-");
  writeMinimalV2Static(dir);
  fs.writeFileSync(
    path.join(dir, "render", "pages", "index.html"),
    `<div data-embed-config="{&quot;type&quot;:&quot;partial&quot;,&quot;id&quot;:&quot;nav&quot;}"></div>`,
    "utf8"
  );

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findError(result, "markup-embed-config-not-single-quoted"), JSON.stringify(result.errors));
});

test("markup: an extension-less file (a root LICENSE, an approved v2 root) is walked but skipped by the markup scan, not misread as markup", () => {
  const dir = tmpDir("tovu-validate-markup-extensionless-");
  writeMinimalV2Static(dir);
  fs.writeFileSync(path.join(dir, "LICENSE"), "MIT License\n\nCopyright (c) ...", "utf8");

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(findError(result, "structure-unapproved-root"), undefined, JSON.stringify(result.errors));
});

test("markup: a markup file that becomes unreadable after the walk is skipped rather than thrown", () => {
  const dir = tmpDir("tovu-validate-markup-unreadable-");
  writeMinimalV2Static(dir);
  const unreadable = path.join(dir, "render", "pages", "broken.html");
  fs.writeFileSync(unreadable, "<html><body>content</body></html>", "utf8");
  fs.chmodSync(unreadable, 0o000);

  try {
    if (process.getuid && process.getuid() === 0) {
      // Running as root (some CI containers): permission bits don't block reads, so this environment
      // cannot exercise the branch this test targets. Skip rather than assert a false negative.
      return;
    }
    const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
    // No throw, and no finding attributable to a file the scan could never actually read.
    assert.equal(result.schemaVersion, 2);
  } finally {
    fs.chmodSync(unreadable, 0o644);
  }
});

// ---------------------------------------------------------------------------
// profiles — same package, different strictness
// ---------------------------------------------------------------------------

test("profiles: a missing license is a WARNING under author but an ERROR under publish", () => {
  const dir = tmpDir("tovu-validate-profile-license-");
  writeMinimalV2Static(dir, { license: undefined });

  const authorResult = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findWarning(authorResult, "license-missing"), JSON.stringify(authorResult.warnings));
  assert.equal(findError(authorResult, "license-missing"), undefined);
  assert.equal(authorResult.valid, true, "a missing license alone must not fail the author profile");

  const publishResult = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "publish" });
  assert.ok(findError(publishResult, "license-missing"), JSON.stringify(publishResult.errors));
  assert.equal(publishResult.valid, false);
});

test("profiles: an empty/missing description is a WARNING under author but an ERROR under publish", () => {
  const dir = tmpDir("tovu-validate-profile-description-");
  writeMinimalV2Static(dir, { description: "" });

  const authorResult = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findWarning(authorResult, "description-missing"), JSON.stringify(authorResult.warnings));
  assert.equal(findError(authorResult, "description-missing"), undefined);

  const publishResult = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "publish" });
  assert.ok(findError(publishResult, "description-missing"), JSON.stringify(publishResult.errors));
});

test("profiles: a missing marketplace preview thumbnail is a WARNING under author but an ERROR under publish", () => {
  const dir = tmpDir("tovu-validate-profile-preview-thumbnail-");
  writeMinimalV2Static(dir);
  fs.rmSync(path.join(dir, "assets", "previews", "card.webp"));

  const authorResult = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findWarning(authorResult, "preview-thumbnail-missing"), JSON.stringify(authorResult.warnings));
  assert.equal(findError(authorResult, "preview-thumbnail-missing"), undefined);

  const publishResult = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "publish" });
  assert.ok(findError(publishResult, "preview-thumbnail-missing"), JSON.stringify(publishResult.errors));
});

test("profiles: install is at least as strict as author — a containment violation still fails install", () => {
  const dir = tmpDir("tovu-validate-profile-install-");
  writeMinimalV2Static(dir, { totallyMadeUpField: true });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "install" });
  assert.equal(result.valid, false);
  assert.ok(findError(result, "v2-unknown-field"), JSON.stringify(result.errors));
});

// ---------------------------------------------------------------------------
// v2-strict: fields the runtime loader does not implement yet (2026-08-19 architecture audit
// finding 3) — `partials`, `renderer`, nested `tokens`, an object-valued `engine`. Each is still
// schema-checked (the existing `v2-partials-shape`/`v2-engine-shape`/etc tests above are unaffected)
// but now ALSO carries an "unimplemented" finding: a WARNING under `author` (a theme author may draft
// ahead of the loader catching up — theme-authoring-guide-v2.md's own stated intent for [TARGET]
// fields) and a hard ERROR under `install`/`publish` (the last chance to refuse a package that will
// silently mis-render before it becomes local files — same profiles.ts reasoning `license-missing`
// already uses for `publish`, extended to a THIRD severity shape rather than reusing that one, since
// install must ALSO refuse it).
// ---------------------------------------------------------------------------

test("v2-strict: declaring 'partials' (unimplemented — loader still reads flat 'slots') warns under author, but is a hard error under install", () => {
  const dir = tmpDir("tovu-validate-v2-partials-unimplemented-");
  // The default fixture already declares `partials`; that's the point of this test's own fixture,
  // not incidental — see the field's own audit-finding-3 repro.
  writeMinimalV2Static(dir);

  const authorResult = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findWarning(authorResult, "v2-partials-unimplemented"), JSON.stringify(authorResult.warnings));
  assert.equal(findError(authorResult, "v2-partials-unimplemented"), undefined);
  assert.equal(authorResult.valid, true, "an unimplemented-but-syntactically-valid field alone must not fail author");

  const installResult = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "install" });
  assert.ok(findError(installResult, "v2-partials-unimplemented"), JSON.stringify(installResult.errors));
  assert.equal(installResult.valid, false, "install must refuse a package declaring a field the loader will silently ignore");
});

test("v2-strict: declaring 'renderer' (unimplemented — no renderer branch exists anywhere) warns under author, errors under install", () => {
  const dir = tmpDir("tovu-validate-v2-renderer-unimplemented-");
  writeMinimalV2Static(dir, { renderer: { adapter: "html@1", pages: { home: { source: "render/pages/index.html" } } } });

  const authorResult = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findWarning(authorResult, "v2-renderer-unimplemented"), JSON.stringify(authorResult.warnings));

  const installResult = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "install" });
  assert.ok(findError(installResult, "v2-renderer-unimplemented"), JSON.stringify(installResult.errors));
  assert.equal(installResult.valid, false);
});

test("v2-strict: declaring nested 'tokens' (unimplemented — loader reads flat modes/defaultMode, hardcodes tokens.light.json) warns under author, errors under install", () => {
  const dir = tmpDir("tovu-validate-v2-tokens-unimplemented-");
  writeMinimalV2Static(dir, { tokens: { defaultMode: "dark", modes: { dark: "tokens.json", light: "tokens.light.json" } } });

  const authorResult = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findWarning(authorResult, "v2-tokens-unimplemented"), JSON.stringify(authorResult.warnings));

  const installResult = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "install" });
  assert.ok(findError(installResult, "v2-tokens-unimplemented"), JSON.stringify(installResult.errors));
  assert.equal(installResult.valid, false);
});

test("v2-strict: declaring an object-valued 'engine' (unimplemented — loadTheme coerces any non-number engine to 1, discarding it) warns under author, errors under install", () => {
  const dir = tmpDir("tovu-validate-v2-engine-object-unimplemented-");
  writeMinimalV2Static(dir, { engine: { name: "liquid", version: "1" } });

  const authorResult = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findWarning(authorResult, "v2-engine-object-unimplemented"), JSON.stringify(authorResult.warnings));

  const installResult = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "install" });
  assert.ok(findError(installResult, "v2-engine-object-unimplemented"), JSON.stringify(installResult.errors));
  assert.equal(installResult.valid, false);
});

test("v2-strict: a manifest using only IMPLEMENTED fields (flat 'slots', no partials/renderer/tokens/engine-object/scripts/assets/ai/pages) carries none of the unimplemented findings, at any profile", () => {
  const dir = tmpDir("tovu-validate-v2-implemented-only-");
  writeMinimalV2Static(dir, { partials: undefined, slots: { nav: { source: "render/partials/nav.html" } } });

  for (const profile of ["author", "install", "publish"] as const) {
    const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile });
    for (const ruleId of [
      "v2-partials-unimplemented",
      "v2-renderer-unimplemented",
      "v2-tokens-unimplemented",
      "v2-engine-object-unimplemented",
      "v2-scripts-unimplemented",
      "v2-assets-unimplemented",
      "v2-ai-unimplemented",
      "v2-pages-unimplemented",
    ]) {
      assert.equal(findError(result, ruleId), undefined, `${profile}: unexpected error ${ruleId}`);
      assert.equal(findWarning(result, ruleId), undefined, `${profile}: unexpected warning ${ruleId}`);
    }
  }
});

// ---------------------------------------------------------------------------
// v2-strict: fields the runtime loader does not implement yet, RE-AUDIT (2026-08-19, `gpt-5.6-sol`
// and `gpt-5.6-terra` independently) — the four-field policy above was itself incomplete.
// `manifest-v2.ts`'s own prior header claimed `scripts`/`assets`/`ai` were "accepted as loosely-typed
// optional objects," but nothing actually checked or flagged them, and dead `pages` had no finding at
// all. These four now go through the SAME generic, self-maintaining sweep as the bespoke fields above
// (see `manifest-v2.ts`'s `V2_FIELDS_READ_BY_LOADER`/`V2_RESERVED_METADATA_FIELDS`).
// ---------------------------------------------------------------------------

test("v2-strict: declaring 'scripts' (unimplemented -- no loader field reads it, theme.ts:661-684) warns under author, errors under install", () => {
  const dir = tmpDir("tovu-validate-v2-scripts-unimplemented-");
  writeMinimalV2Static(dir, { scripts: { entries: ["scripts/analytics.js"] } });

  const authorResult = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findWarning(authorResult, "v2-scripts-unimplemented"), JSON.stringify(authorResult.warnings));
  assert.equal(findError(authorResult, "v2-scripts-unimplemented"), undefined);
  assert.equal(authorResult.valid, true, "an unimplemented-but-syntactically-present field alone must not fail author");

  const installResult = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "install" });
  assert.ok(findError(installResult, "v2-scripts-unimplemented"), JSON.stringify(installResult.errors));
  assert.equal(installResult.valid, false, "install must refuse a package declaring a field the loader will silently ignore");
});

test("v2-strict: declaring 'assets' (unimplemented -- no loader field reads it, theme.ts:661-684) warns under author, errors under install", () => {
  const dir = tmpDir("tovu-validate-v2-assets-unimplemented-");
  writeMinimalV2Static(dir, { assets: { previewGallery: ["screenshots/hero.png"] } });

  const authorResult = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findWarning(authorResult, "v2-assets-unimplemented"), JSON.stringify(authorResult.warnings));
  assert.equal(findError(authorResult, "v2-assets-unimplemented"), undefined);

  const installResult = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "install" });
  assert.ok(findError(installResult, "v2-assets-unimplemented"), JSON.stringify(installResult.errors));
  assert.equal(installResult.valid, false);
});

test("v2-strict: declaring 'ai' (unimplemented -- design doc marks it NOT YET IMPLEMENTED anywhere, §12) warns under author, errors under install", () => {
  const dir = tmpDir("tovu-validate-v2-ai-unimplemented-");
  writeMinimalV2Static(dir, { ai: { prompt: "generate a hero section" } });

  const authorResult = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findWarning(authorResult, "v2-ai-unimplemented"), JSON.stringify(authorResult.warnings));
  assert.equal(findError(authorResult, "v2-ai-unimplemented"), undefined);

  const installResult = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "install" });
  assert.ok(findError(installResult, "v2-ai-unimplemented"), JSON.stringify(installResult.errors));
  assert.equal(installResult.valid, false);
});

test("v2-strict: declaring 'pages' (confirmed dead -- loadTheme() never parses it into ThemeManifest) warns under author, errors under install", () => {
  const dir = tmpDir("tovu-validate-v2-pages-unimplemented-");
  writeMinimalV2Static(dir, { pages: ["index", "about"] });

  const authorResult = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "author" });
  assert.ok(findWarning(authorResult, "v2-pages-unimplemented"), JSON.stringify(authorResult.warnings));
  assert.equal(findError(authorResult, "v2-pages-unimplemented"), undefined);

  const installResult = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "install" });
  assert.ok(findError(installResult, "v2-pages-unimplemented"), JSON.stringify(installResult.errors));
  assert.equal(installResult.valid, false);
});

test("v2-strict: descriptive/discovery metadata fields (authors, attributions, category, tags, compatibility -- plus the default fixture's own license) are never flagged unimplemented, at any profile", () => {
  const dir = tmpDir("tovu-validate-v2-reserved-metadata-");
  writeMinimalV2Static(dir, {
    authors: [{ name: "Aurora Themes Co." }],
    attributions: ["Icons by Foo"],
    category: "blog",
    tags: ["minimal", "dark"],
    compatibility: { tovu: ">=1.0.0" },
  });

  for (const profile of ["author", "install", "publish"] as const) {
    const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile });
    for (const field of ["license", "authors", "attributions", "category", "tags", "compatibility"]) {
      const ruleId = `v2-${field}-unimplemented`;
      assert.equal(findError(result, ruleId), undefined, `${profile}: unexpected error ${ruleId}`);
      assert.equal(findWarning(result, ruleId), undefined, `${profile}: unexpected warning ${ruleId}`);
    }
  }
});
