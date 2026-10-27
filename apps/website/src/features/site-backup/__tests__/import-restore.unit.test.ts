/**
 * Pins the staged-import restore: which files reach the live site, which go to the unserved
 * `.import-quarantine/` tree, and the active-theme fallback. Real temp folders and a real SQLite
 * file; every folder is removed after its test.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { readTemplate } from "../../../platform/site-dir/read-template.js";
import { restoreStagedImport, stageVerifiedImport } from "../import-restore.js";
import { writeExclusive } from "../import-restore-placement.js";

const FALLBACK = readTemplate({ templateId: "starter" }).seed.presentation.activeThemeId;
const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

interface Harness { root: string; dir: string; dbPath: string }
function harness(t: TestContext): Harness {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-restore-unit-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const dir = path.join(base, "site");
  fs.mkdirSync(dir);
  return { root: path.join(base, "stage"), dir, dbPath: path.join(dir, "content.db") };
}
function databaseBytes(activeThemes: readonly string[]): Buffer {
  const db = new Database(":memory:");
  try {
    db.exec("CREATE TABLE presentation_settings (workspace_id TEXT, active_theme_id TEXT)");
    for (const [index, theme] of activeThemes.entries()) db.prepare("INSERT INTO presentation_settings VALUES (?, ?)").run("ws-" + index, theme);
    return db.serialize();
  } finally { db.close(); }
}
function activeThemes(dbPath: string): string[] {
  const db = new Database(dbPath);
  try { return db.prepare("SELECT active_theme_id FROM presentation_settings ORDER BY workspace_id").all().map(row => (row as { active_theme_id: string }).active_theme_id); }
  finally { db.close(); }
}
async function restore(t: TestContext, files: Record<string, string>, options: { themes?: readonly string[]; before?: (h: Harness) => void } = {}): Promise<Harness> {
  const h = harness(t);
  stageVerifiedImport({ root: h.root, verified: { warnings: [], modified: new Set(), plugins: [], trustedPlugins: [], name: "Copy", database: databaseBytes(options.themes ?? []), files: new Map(Object.entries(files).map(([file, text]) => [file, Buffer.from(text)])) } });
  options.before?.(h);
  await restoreStagedImport({ root: h.root, dir: h.dir, dbPath: h.dbPath });
  return h;
}
const live = (h: Harness, file: string): string | null => fs.existsSync(path.join(h.dir, file)) ? fs.readFileSync(path.join(h.dir, file), "utf8") : null;
const quarantined = (h: Harness, file: string): string | null => live(h, ".import-quarantine/" + file);
/** A compiled static theme `loadTheme` accepts: output files hashed in `artifactHashes`. */
function compiledTheme(name: string, build: Record<string, unknown> = {}): Record<string, string> {
  const output = { "pages/index.html": '<!doctype html><html><head><link rel="stylesheet" href="../css/styles.css" /></head><body>compiled</body></html>', "css/styles.css": "body{margin:0}", "tokens.json": "{}" };
  const manifest = { id: name, name: "Compiled", version: "1.0.0", tier: "static", build: { source: "compiled", sourceDir: "src", artifactHashes: Object.fromEntries(Object.entries(output).map(([file, text]) => [file, sha(text)])), ...build } };
  return { [`themes/static/${name}/theme.json`]: JSON.stringify(manifest), ...Object.fromEntries(Object.entries(output).map(([file, text]) => [`themes/static/${name}/${file}`, text])), [`themes/static/${name}/src/Widget.tsx`]: "export {}" };
}

// Staging -----------------------------------------------------------------------------------

test("staging writes the projected database, every verified file and the inventory, all private", async t => {
  const h = harness(t), database = databaseBytes([]);
  stageVerifiedImport({ root: h.root, verified: { warnings: [], modified: new Set(), plugins: [], trustedPlugins: [], name: "Copy", database, files: new Map([["uploads/a", Buffer.from("a")]]) } });
  assert.deepEqual(fs.readFileSync(path.join(h.root, "database/content.db")), database);
  assert.equal(fs.readFileSync(path.join(h.root, "uploads/a"), "utf8"), "a");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(h.root, ".inventory.json"), "utf8")), ["uploads/a"]);
  assert.equal(fs.statSync(h.root).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(h.root, "uploads/a")).mode & 0o777, 0o600);
});
test("staging refuses a stage folder that already exists", async t => {
  const h = harness(t);
  fs.mkdirSync(h.root);
  assert.throws(() => stageVerifiedImport({ root: h.root, verified: { warnings: [], modified: new Set(), plugins: [], trustedPlugins: [], name: "Copy", database: Buffer.alloc(0), files: new Map() } }), { code: "EEXIST" });
});
test("staging refuses an unsafe file path before writing it", async t => {
  const h = harness(t);
  assert.throws(() => stageVerifiedImport({ root: h.root, verified: { warnings: [], modified: new Set(), plugins: [], trustedPlugins: [], name: "Copy", database: Buffer.alloc(0), files: new Map([["uploads/CON.txt", Buffer.from("x")]]) } }), { code: "UNSAFE_PATH", message: "Share path 'uploads/CON.txt' is unsafe." });
  assert.equal(fs.existsSync(path.join(h.root, "uploads")), false);
});

// Placement ---------------------------------------------------------------------------------

test("uploads are restored into the live site", async t => {
  assert.equal(live(await restore(t, { "uploads/blob": "media" }), "uploads/blob"), "media");
});
test("settings files are never restored, live or quarantined", async t => {
  const h = await restore(t, { "settings.json": "{}" });
  assert.equal(live(h, "settings.json"), null);
  assert.equal(quarantined(h, "settings.json"), null);
});
for (const file of ["plugins/custom/plugin.json", "overrides/custom.html", "skills/s/SKILL.md", "agent-plugins/ws/w/activations.json", "themes/code/site/index.ts"]) {
  test(`${file} is quarantined, never placed live`, async t => {
    const h = await restore(t, { [file]: "x" });
    assert.equal(live(h, file), null);
    assert.equal(quarantined(h, file), "x");
  });
}
test("a static theme of supported assets is placed live and replaces the existing tree", async t => {
  const h = await restore(t, { "themes/static/safe/theme.json": '{"tier":"static"}', "themes/static/safe/site.js": "js" }, {
    before: h => { fs.mkdirSync(path.join(h.dir, "themes/static/safe"), { recursive: true }); fs.writeFileSync(path.join(h.dir, "themes/static/safe/stale.html"), "stale"); },
  });
  assert.equal(live(h, "themes/static/safe/site.js"), "js");
  assert.equal(live(h, "themes/static/safe/stale.html"), null);
});
test("a declarative theme tree without a theme.json is still placed live", async t => {
  assert.equal(live(await restore(t, { "themes/declarative/plain/tokens.json": "{}" }), "themes/declarative/plain/tokens.json"), "{}");
});
test("an unsupported file extension quarantines the whole theme tree", async t => {
  const h = await restore(t, { "themes/static/mixed/index.html": "html", "themes/static/mixed/build.tsx": "tsx" });
  assert.equal(live(h, "themes/static/mixed/index.html"), null);
  assert.equal(quarantined(h, "themes/static/mixed/index.html"), "html");
  assert.equal(quarantined(h, "themes/static/mixed/build.tsx"), "tsx");
});
test("a quarantined theme's existing live tree is left in place", async t => {
  const h = await restore(t, { "themes/static/mixed/build.tsx": "tsx" }, {
    before: h => { fs.mkdirSync(path.join(h.dir, "themes/static/mixed"), { recursive: true }); fs.writeFileSync(path.join(h.dir, "themes/static/mixed/seed.html"), "seed"); },
  });
  assert.equal(live(h, "themes/static/mixed/seed.html"), "seed");
});

// Theme manifests ---------------------------------------------------------------------------

const MANIFEST_QUARANTINES: readonly [string, string, string][] = [
  ["a tier that differs from its folder", "static", '{"tier":"code"}'],
  ["malformed JSON", "static", "{"],
  ["a null manifest", "static", "null"],
  ["a compiled declarative build", "declarative", '{"tier":"declarative","build":{"source":"compiled","sourceDir":"src"}}'],
  ["a compiled build without a source folder", "static", '{"tier":"static","build":{"source":"compiled"}}'],
  ["a source folder outside the theme", "static", '{"tier":"static","build":{"source":"compiled","sourceDir":"../outside"}}'],
  ["an unsafe source folder", "static", '{"tier":"static","build":{"source":"compiled","sourceDir":"CON"}}'],
  ["compiled output the theme owner rejects", "static", '{"tier":"static","build":{"source":"compiled","sourceDir":"src","artifactHashes":{}}}'],
];
for (const [label, tier, manifest] of MANIFEST_QUARANTINES) {
  test(`a theme manifest with ${label} quarantines the theme`, async t => {
    const h = await restore(t, { [`themes/${tier}/t/theme.json`]: manifest, [`themes/${tier}/t/index.html`]: "html" });
    assert.equal(live(h, `themes/${tier}/t/index.html`), null);
    assert.equal(quarantined(h, `themes/${tier}/t/index.html`), "html");
  });
}
test("a build that is not compiled is treated as a plain asset theme", async t => {
  const h = await restore(t, { "themes/static/t/theme.json": '{"tier":"static","build":{"source":"authored"}}', "themes/static/t/index.html": "html" });
  assert.equal(live(h, "themes/static/t/index.html"), "html");
});
test("compiled output goes live while its authored source stays quarantined", async t => {
  const h = await restore(t, compiledTheme("site"));
  assert.equal(live(h, "themes/static/site/css/styles.css"), "body{margin:0}");
  assert.equal(live(h, "themes/static/site/src/Widget.tsx"), null);
  assert.equal(quarantined(h, "themes/static/site/src/Widget.tsx"), "export {}");
});
test("a compiled source folder written with a trailing slash fails the share path policy and quarantines the theme", async t => {
  const h = await restore(t, compiledTheme("site", { sourceDir: "src/" }));
  assert.equal(live(h, "themes/static/site/css/styles.css"), null);
  assert.equal(quarantined(h, "themes/static/site/css/styles.css"), "body{margin:0}");
});

// Database ----------------------------------------------------------------------------------

test("an active theme that was not placed live falls back to the starter theme", async t => {
  const h = await restore(t, { "themes/static/safe/index.html": "html", "themes/static/bad/x.tsx": "tsx" }, { themes: ["static/safe", "static/bad", "static/absent"] });
  assert.deepEqual(activeThemes(h.dbPath), ["static/safe", FALLBACK, FALLBACK]);
});
test("restore refuses to overwrite an existing database file", async t => {
  const h = harness(t);
  stageVerifiedImport({ root: h.root, verified: { warnings: [], modified: new Set(), plugins: [], trustedPlugins: [], name: "Copy", database: databaseBytes([]), files: new Map() } });
  fs.writeFileSync(h.dbPath, "existing");
  await assert.rejects(restoreStagedImport({ root: h.root, dir: h.dir, dbPath: h.dbPath }), { code: "EEXIST" });
  assert.equal(fs.readFileSync(h.dbPath, "utf8"), "existing");
});
test("restore refuses to overwrite an existing site file", async t => {
  await assert.rejects(restore(t, { "uploads/blob": "media" }, { before: h => { fs.mkdirSync(path.join(h.dir, "uploads")); fs.writeFileSync(path.join(h.dir, "uploads/blob"), "existing"); } }), { code: "EEXIST" });
});
test("a database without presentation settings fails the restore after closing the database", async t => {
  const h = harness(t), empty = new Database(":memory:"), bytes = empty.serialize();
  empty.close();
  stageVerifiedImport({ root: h.root, verified: { warnings: [], modified: new Set(), plugins: [], trustedPlugins: [], name: "Copy", database: bytes, files: new Map() } });
  await assert.rejects(restoreStagedImport({ root: h.root, dir: h.dir, dbPath: h.dbPath }), { message: /no such table: presentation_settings/ });
  fs.rmSync(h.dbPath);
});

// Exclusive writes ---------------------------------------------------------------------------

test("the containment guard refuses a path that escapes the root even if the path policy let it through", async t => {
  const h = harness(t), noPolicy = (_required: { path: string }): void => undefined;
  assert.throws(() => writeExclusive({ root: h.dir, relative: "../escaped", bytes: Buffer.from("x") }, { validatePath: noPolicy }), { message: "Import path escaped staging" });
  assert.equal(fs.existsSync(path.join(h.dir, "../escaped")), false);
});
