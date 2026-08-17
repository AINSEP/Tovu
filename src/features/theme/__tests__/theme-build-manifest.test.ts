import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadTheme } from "../theme";

/**
 * @file ADR-020 §5 (2026-08-12) — `theme.json`'s new `author` and `build` fields: parsing, and the
 * cross-field validation that makes `build.source: "compiled"` fail closed rather than silently
 * accepting a manifest missing what the install-time gate (`build-conformance.ts`) needs to run at
 * all. Content-level conformance (sentinel/asset-path/island checks) is covered separately in
 * `theme-compiled-load-gate.test.ts`; this file is the manifest SHAPE only.
 */

function writeStaticTheme(
  root: string,
  id: string,
  overrides: Record<string, unknown> = {},
  options: { pageHtml?: string } = {}
): string {
  const dir = path.join(root, id);
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.mkdirSync(path.join(dir, "css"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({ id, name: id, version: "1.0.0", tier: "static", engine: 1, ...overrides })
  );
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(
    path.join(dir, "pages", "index.html"),
    options.pageHtml ??
      '<!doctype html><html><head><link rel="stylesheet" href="../css/styles.css" /></head><body>hi</body></html>'
  );
  fs.writeFileSync(path.join(dir, "css", "styles.css"), "body{margin:0}", "utf8");
  return dir;
}

test("author is undefined for every theme on disk today (no back-compat migration needed)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-build-manifest-"));
  const dir = writeStaticTheme(root, "plain");
  const theme = loadTheme({ themeDir: dir, id: "plain", source: "site" });

  assert.equal(theme.status, "valid");
  assert.equal(theme.manifest.author, undefined);
  assert.equal(theme.manifest.build, undefined);
});

test("a declared author is parsed onto the manifest verbatim", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-build-manifest-"));
  const dir = writeStaticTheme(root, "credited", { author: "Aurora Themes Co." });
  const theme = loadTheme({ themeDir: dir, id: "credited", source: "site" });

  assert.equal(theme.status, "valid");
  assert.equal(theme.manifest.author, "Aurora Themes Co.");
});

test("build absent, or build present with no recognized source, both default to authored", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-build-manifest-"));

  const noBuild = writeStaticTheme(root, "no-build");
  assert.equal(loadTheme({ themeDir: noBuild, id: "no-build", source: "site" }).manifest.build, undefined);

  const emptyBuild = writeStaticTheme(root, "empty-build", { build: {} });
  const loaded = loadTheme({ themeDir: emptyBuild, id: "empty-build", source: "site" });
  assert.equal(loaded.status, "valid");
  assert.equal(loaded.manifest.build?.source, "authored");
});

test("a well-formed compiled build parses framework/sourceDir/builderVersion/lockfileHash/artifactHashes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-build-manifest-"));
  const dir = writeStaticTheme(
    root,
    "aurora-react",
    {
      author: "Aurora Themes Co.",
      build: {
        source: "compiled",
        framework: "react",
        sourceDir: "src",
        builderVersion: "astro@4.15.2",
        lockfileHash: "sha256-deadbeef",
        artifactHashes: { "css/styles.css": "0".repeat(64) },
      },
    }
  );
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "Header.tsx"), "export const Header = () => null;", "utf8");

  const theme = loadTheme({ themeDir: dir, id: "aurora-react", source: "site" });

  // artifactHashes deliberately does not match the real file's digest here — this test is about
  // SHAPE parsing, not content conformance (see theme-compiled-load-gate.test.ts for that), so the
  // theme is expected to be invalid on the hash mismatch alone while still proving every field parsed.
  assert.equal(theme.manifest.author, "Aurora Themes Co.");
  assert.deepEqual(theme.manifest.build, {
    source: "compiled",
    framework: "react",
    sourceDir: "src",
    builderVersion: "astro@4.15.2",
    lockfileHash: "sha256-deadbeef",
    artifactHashes: { "css/styles.css": "0".repeat(64) },
  });
});

test("build.source 'compiled' on a non-static tier is invalid, naming the required pairing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-build-manifest-"));
  const dir = path.join(root, "wrong-tier");
  fs.mkdirSync(path.join(dir, "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({
      id: "wrong-tier",
      name: "Wrong Tier",
      version: "1.0.0",
      tier: "declarative",
      engine: 1,
      build: { source: "compiled", sourceDir: "src", artifactHashes: { "x.json": "a".repeat(64) } },
    })
  );
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "templates", "home.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "templates", "entry.json"), "{}", "utf8");

  const theme = loadTheme({ themeDir: dir, id: "wrong-tier", source: "site" });

  assert.equal(theme.status, "invalid");
  assert.ok(theme.errors.includes("theme.json build.source 'compiled' requires tier 'static'"));
});

test("build.source 'compiled' with no sourceDir is invalid", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-build-manifest-"));
  const dir = writeStaticTheme(root, "no-source-dir", {
    build: { source: "compiled", artifactHashes: { "x.json": "a".repeat(64) } },
  });
  const theme = loadTheme({ themeDir: dir, id: "no-source-dir", source: "site" });

  assert.equal(theme.status, "invalid");
  assert.ok(theme.errors.includes("theme.json build.sourceDir is required when build.source is 'compiled'"));
});

test("build.source 'compiled' with no artifactHashes (absent, or an empty object) is invalid", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-build-manifest-"));

  for (const [id, artifactHashes] of [
    ["absent-hashes", undefined],
    ["empty-hashes", {}],
  ] as const) {
    const dir = writeStaticTheme(root, id, {
      build: { source: "compiled", sourceDir: "src", ...(artifactHashes ? { artifactHashes } : {}) },
    });
    const theme = loadTheme({ themeDir: dir, id, source: "site" });

    assert.equal(theme.status, "invalid", `${id} should be invalid`);
    assert.ok(
      theme.errors.includes("theme.json build.artifactHashes is required when build.source is 'compiled'"),
      `${id}: expected the artifactHashes error, got ${JSON.stringify(theme.errors)}`
    );
  }
});

/**
 * The install-time half of the two-layer `preview/` defense (2026-08-17): a `build.sourceDir` naming,
 * nesting inside, or containing a {@link GENERATED_THEME_DIRS} entry is refused at `loadTheme()`
 * itself, not only at each write route's own `isGeneratedThemePath` call-site refusal (added
 * 2026-08-13, see `theme-files.ts`'s doc). See `theme-files.test.ts` for direct unit coverage of the
 * underlying `isSourceDirGeneratedConflict` predicate; these three cover the shapes that matter for
 * `loadTheme`'s cross-field gate, plus one negative case proving a merely similarly-named sibling
 * folder is untouched.
 */
test("build.source 'compiled' with sourceDir naming a generated directory exactly is invalid", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-build-manifest-"));
  const dir = writeStaticTheme(root, "source-is-preview", {
    build: { source: "compiled", sourceDir: "preview", artifactHashes: { "x.json": "a".repeat(64) } },
  });
  const theme = loadTheme({ themeDir: dir, id: "source-is-preview", source: "site" });

  assert.equal(theme.status, "invalid");
  assert.ok(
    theme.errors.includes(
      "theme.json build.sourceDir 'preview' must not name or contain a generated theme directory (preview)"
    ),
    `expected a sourceDir/generated-dir conflict error, got ${JSON.stringify(theme.errors)}`
  );
});

test("build.source 'compiled' with sourceDir nested inside a generated directory is invalid", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-build-manifest-"));
  const dir = writeStaticTheme(root, "source-inside-preview", {
    build: { source: "compiled", sourceDir: "preview/src", artifactHashes: { "x.json": "a".repeat(64) } },
  });
  const theme = loadTheme({ themeDir: dir, id: "source-inside-preview", source: "site" });

  assert.equal(theme.status, "invalid");
  assert.ok(
    theme.errors.includes(
      "theme.json build.sourceDir 'preview/src' must not name or contain a generated theme directory (preview)"
    ),
    `expected a sourceDir/generated-dir conflict error, got ${JSON.stringify(theme.errors)}`
  );
});

test("build.source 'compiled' with sourceDir naming the theme root ('.') is invalid — it would contain every generated directory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-build-manifest-"));
  const dir = writeStaticTheme(root, "source-is-root", {
    build: { source: "compiled", sourceDir: ".", artifactHashes: { "x.json": "a".repeat(64) } },
  });
  const theme = loadTheme({ themeDir: dir, id: "source-is-root", source: "site" });

  assert.equal(theme.status, "invalid");
  assert.ok(
    theme.errors.includes(
      "theme.json build.sourceDir '.' must not name or contain a generated theme directory (preview)"
    ),
    `expected a sourceDir/generated-dir conflict error, got ${JSON.stringify(theme.errors)}`
  );
});

test("build.source 'compiled' with sourceDir merely PREFIXED with a generated dir's name is NOT flagged", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-build-manifest-"));
  const dir = writeStaticTheme(root, "source-is-preview-notes", {
    build: { source: "compiled", sourceDir: "preview-notes", artifactHashes: { "x.json": "a".repeat(64) } },
  });
  const theme = loadTheme({ themeDir: dir, id: "source-is-preview-notes", source: "site" });

  assert.equal(
    theme.errors.some((e) => e.includes("must not name or contain a generated theme directory")),
    false,
    `'preview-notes' must not be treated as a conflict, got ${JSON.stringify(theme.errors)}`
  );
});

test("a build.artifactHashes entry with a non-string value is dropped rather than crashing the parse", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-build-manifest-"));
  const dir = writeStaticTheme(root, "mixed-hashes", {
    build: {
      source: "compiled",
      sourceDir: "src",
      artifactHashes: { "good.css": "a".repeat(64), "bad.css": 12345 },
    },
  });
  const theme = loadTheme({ themeDir: dir, id: "mixed-hashes", source: "site" });

  assert.deepEqual(theme.manifest.build?.artifactHashes, { "good.css": "a".repeat(64) });
});

test("an unrecognized build.framework is dropped rather than crashing the parse, source still parses", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-build-manifest-"));
  const dir = writeStaticTheme(root, "svelte-attempt", {
    build: { source: "compiled", framework: "svelte", sourceDir: "src", artifactHashes: { "x.css": "a".repeat(64) } },
  });
  const theme = loadTheme({ themeDir: dir, id: "svelte-attempt", source: "site" });

  assert.equal(theme.manifest.build?.framework, undefined);
  assert.equal(theme.manifest.build?.source, "compiled");
});
