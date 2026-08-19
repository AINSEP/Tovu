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

test("profiles: install is at least as strict as author — a containment violation still fails install", () => {
  const dir = tmpDir("tovu-validate-profile-install-");
  writeMinimalV2Static(dir, { totallyMadeUpField: true });

  const result = validateThemePackage({ themeDir: dir, id: "my-theme", profile: "install" });
  assert.equal(result.valid, false);
  assert.ok(findError(result, "v2-unknown-field"), JSON.stringify(result.errors));
});
