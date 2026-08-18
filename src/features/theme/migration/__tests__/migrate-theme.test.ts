import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { migrateThemeToV2 } from "../migrate-theme";

function makeDeclarativeThemeDir(
  options: { extraRootFile?: string; skipEntry?: boolean } = {}
): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-migrate-declarative-"));
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({ id: "t", name: "T", version: "1.0.0", tier: "declarative", description: "test theme" }),
    "utf8"
  );
  fs.writeFileSync(path.join(dir, "tokens.json"), '{"--bg":"#000"}', "utf8");
  fs.writeFileSync(path.join(dir, "styles.css"), "body { margin: 0; }", "utf8");
  fs.mkdirSync(path.join(dir, "templates"), { recursive: true });
  fs.writeFileSync(path.join(dir, "templates/home.json"), '{"type":"doc","content":[]}', "utf8");
  if (!options.skipEntry) {
    fs.writeFileSync(path.join(dir, "templates/entry.json"), '{"type":"doc","content":[]}', "utf8");
  }
  if (options.extraRootFile) fs.writeFileSync(path.join(dir, options.extraRootFile), "unexpected", "utf8");
  return dir;
}

test("migrateThemeToV2 migrates a v1 declarative theme in place, with a v1 backup kept alongside", () => {
  const dir = makeDeclarativeThemeDir();
  const result = migrateThemeToV2({ themeDir: dir, id: "t" });

  assert.equal(result.status, "migrated");
  assert.equal(result.validation?.valid, true);
  assert.deepEqual(result.loadErrors, []);
  assert.equal(result.outputDir, dir);
  assert.ok(result.backupDir && fs.existsSync(result.backupDir));

  // The real directory now has v2 shape.
  assert.ok(fs.existsSync(path.join(dir, "css/theme.css")));
  assert.ok(fs.existsSync(path.join(dir, "render/pages/home.json")));
  assert.ok(fs.existsSync(path.join(dir, "render/pages/entry.json")));
  assert.ok(!fs.existsSync(path.join(dir, "styles.css")));
  assert.ok(!fs.existsSync(path.join(dir, "templates")));
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "theme.json"), "utf8"));
  assert.equal(manifest.apiVersion, 2);
  assert.equal(manifest.id, "t"); // every other field carried forward unchanged
  assert.equal(manifest.description, "test theme");

  // The backup is the untouched v1 original.
  assert.ok(fs.existsSync(path.join(result.backupDir!, "styles.css")));
  assert.ok(fs.existsSync(path.join(result.backupDir!, "templates/home.json")));
});

test("migrateThemeToV2 is idempotent — running it again on an already-migrated theme is a no-op", () => {
  const dir = makeDeclarativeThemeDir();
  migrateThemeToV2({ themeDir: dir, id: "t" });
  const second = migrateThemeToV2({ themeDir: dir, id: "t" });
  assert.equal(second.status, "already-migrated");
});

test("migrateThemeToV2 dryRun stages the v2 output without touching the real theme directory", () => {
  const dir = makeDeclarativeThemeDir();
  const result = migrateThemeToV2({ themeDir: dir, id: "t" }, { dryRun: true });

  assert.equal(result.status, "staged-dry-run");
  assert.ok(result.outputDir && result.outputDir !== dir);
  assert.ok(fs.existsSync(path.join(result.outputDir!, "css/theme.css")));

  // The real directory is completely untouched — still v1-shaped.
  assert.ok(fs.existsSync(path.join(dir, "styles.css")));
  assert.ok(fs.existsSync(path.join(dir, "templates/home.json")));
  assert.ok(!fs.existsSync(path.join(dir, "css")));
});

test("migrateThemeToV2 refuses (fails) rather than silently dropping an unrecognized root-level file, real dir untouched", () => {
  const dir = makeDeclarativeThemeDir({ extraRootFile: "README.md" });
  const result = migrateThemeToV2({ themeDir: dir, id: "t" });

  assert.equal(result.status, "failed");
  assert.match(result.reason ?? "", /README\.md/);
  // Real directory untouched — still has its original file, no staging artifacts leaked into it.
  assert.ok(fs.existsSync(path.join(dir, "README.md")));
  assert.ok(fs.existsSync(path.join(dir, "styles.css")));
  assert.ok(!fs.existsSync(path.join(dir, "css")));
});

function makeTemplatedThemeDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-migrate-templated-"));
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({ id: "t", name: "T", version: "1.0.0", tier: "templated", engine: 1, description: "test theme" }),
    "utf8"
  );
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.mkdirSync(path.join(dir, "templates"), { recursive: true });
  fs.writeFileSync(path.join(dir, "templates/home.liquid"), "{{ site.title }}", "utf8");
  fs.writeFileSync(path.join(dir, "templates/entry.liquid"), "{{ post.title }}", "utf8");
  return dir;
}

test("migrateThemeToV2 converts a v1 bare-number engine into v2's { name, version } object shape (real gap: storefront's theme.json ships engine: 1)", () => {
  const dir = makeTemplatedThemeDir();
  const result = migrateThemeToV2({ themeDir: dir, id: "t" });

  assert.equal(result.status, "migrated", `expected migrated, got ${result.status}: ${JSON.stringify(result.validation ?? result.reason)}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "theme.json"), "utf8"));
  assert.deepEqual(manifest.engine, { name: "liquid", version: "1" });
});

test("migrateThemeToV2 carries a root screenshots/ folder forward unchanged (every real theme on disk ships one)", () => {
  const dir = makeDeclarativeThemeDir();
  fs.mkdirSync(path.join(dir, "screenshots"), { recursive: true });
  fs.writeFileSync(path.join(dir, "screenshots", "index.jpg"), "fake-jpg-bytes", "utf8");

  const result = migrateThemeToV2({ themeDir: dir, id: "t" });

  assert.equal(result.status, "migrated", `expected migrated, got ${result.status}: ${JSON.stringify(result.validation ?? result.reason)}`);
  assert.equal(fs.readFileSync(path.join(dir, "screenshots", "index.jpg"), "utf8"), "fake-jpg-bytes");
});

test("migrateThemeToV2 rewrites a moved page's own hardcoded /theme-assets/<id>/assets/... reference when the assets/ folder it points at moved (fashion-modern's real shape)", () => {
  const dir = makeTemplatedThemeDir();
  const id = "t"; // matches makeTemplatedThemeDir()'s own manifest id
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(dir, "assets", "hero.jpg"), "fake-jpg-bytes", "utf8");
  fs.writeFileSync(
    path.join(dir, "templates", "home.liquid"),
    `<section style="background-image:url('/theme-assets/${id}/assets/hero.jpg')">{{ site.title }}</section>`,
    "utf8"
  );

  const result = migrateThemeToV2({ themeDir: dir, id });

  assert.equal(result.status, "migrated", `expected migrated, got ${result.status}: ${JSON.stringify(result.validation ?? result.reason)}`);
  assert.ok(fs.existsSync(path.join(dir, "assets/images/hero.jpg")));
  const rewritten = fs.readFileSync(path.join(dir, "render/pages/home.liquid"), "utf8");
  assert.equal(rewritten, `<section style="background-image:url('/theme-assets/${id}/assets/images/hero.jpg')">{{ site.title }}</section>`);
});

test("migrateThemeToV2 fails verification (missing required entry.json) and leaves the real directory untouched", () => {
  const dir = makeDeclarativeThemeDir({ skipEntry: true });
  const result = migrateThemeToV2({ themeDir: dir, id: "t" });

  assert.equal(result.status, "failed");
  assert.ok(
    result.loadErrors?.some((e) => e.includes("render/pages/entry.json is required")),
    `expected a render/pages/entry.json error, got: ${JSON.stringify(result.loadErrors)}`
  );
  // Real directory untouched — migration never promoted a broken staged theme into place.
  assert.ok(fs.existsSync(path.join(dir, "styles.css")));
  assert.ok(!fs.existsSync(path.join(dir, "css")));
  // The broken staged output is left behind for inspection, not silently deleted.
  assert.ok(result.outputDir && fs.existsSync(result.outputDir));
});

function makeStaticThemeDirWithAssetRefs(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-migrate-static-"));
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({ id: "s", name: "S", version: "1.0.0", tier: "static", description: "test theme" }),
    "utf8"
  );
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.mkdirSync(path.join(dir, "css"), { recursive: true });
  fs.writeFileSync(path.join(dir, "css/styles.css"), "body{}", "utf8");
  fs.mkdirSync(path.join(dir, "js/vendor"), { recursive: true });
  fs.writeFileSync(path.join(dir, "js/nav-toggle.js"), "//js", "utf8");
  fs.writeFileSync(path.join(dir, "js/vendor/motion.js"), "//vendor", "utf8");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "pages/index.html"),
    '<html><head><link rel="stylesheet" href="../css/styles.css" /></head><body>' +
      "<script src=\"../js/nav-toggle.js\"></script><script src='../js/vendor/motion.js'></script>" +
      "</body></html>",
    "utf8"
  );
  fs.writeFileSync(
    path.join(dir, "nav.html"),
    '<nav><link rel="stylesheet" href="../css/styles.css" /></nav>',
    "utf8"
  );
  return dir;
}

test("migrateThemeToV2 (static) rewrites a moved page's/partial's own ../css/styles.css and ../js/ references to the v2 filename/folder (fuel's real bug: the file MOVED to css/theme.css and scripts/ but the page's own <link>/<script> text still said the v1 name, so the request-time rewrite in static-asset-contract.ts pointed at a file that no longer exists)", () => {
  const dir = makeStaticThemeDirWithAssetRefs();
  const result = migrateThemeToV2({ themeDir: dir, id: "s" }, { dryRun: true });

  assert.ok(result.outputDir && fs.existsSync(result.outputDir), "staged output must exist for inspection");
  const page = fs.readFileSync(path.join(result.outputDir!, "render/pages/index.html"), "utf8");
  assert.equal(
    page,
    '<html><head><link rel="stylesheet" href="../css/theme.css" /></head><body>' +
      "<script src=\"../scripts/nav-toggle.js\"></script><script src='../scripts/vendor/motion.js'></script>" +
      "</body></html>"
  );
  assert.ok(!page.includes("../css/styles.css"), "old v1 stylesheet filename must not survive migration");
  assert.ok(!page.includes("../js/"), "old v1 js folder reference must not survive migration");

  const partial = fs.readFileSync(path.join(result.outputDir!, "render/partials/nav.html"), "utf8");
  assert.equal(partial, '<nav><link rel="stylesheet" href="../css/theme.css" /></nav>');
});
