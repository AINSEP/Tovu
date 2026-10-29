/** Approved round17/18 B. Baseline RED: verifier, import backend and restore seam absent.
 * Authored without execution, as required by the build dispatch.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { buildFixtureShareZip as buildShareZip } from "./archive.fixture.js";
import { loadTheme } from "../../theme/theme.js";
import { importFixture, OWNER_PASSWORD, MEDIA, STORAGE_KEY } from "./import.fixture.js";

for (const placement of ["inSite", "appData"] as const) test("B valid archive and recipient-only owner: " + placement, async t => {
  const inheritedPassword = process.env.TOVU_ADMIN_PASSWORD;
  process.env.TOVU_ADMIN_PASSWORD = "deployment-password";
  t.after(() => { if (inheritedPassword === undefined) delete process.env.TOVU_ADMIN_PASSWORD; else process.env.TOVU_ADMIN_PASSWORD = inheritedPassword; });
  const h = await importFixture(t, placement);
  const upload = await h.backend.upload({ principalId: "recipient", archive: h.archive });
  const pending = await h.backend.importBackup({ principalId: "recipient", source: { uploadId: upload.uploadId }, requestId: "same-request" });
  assert.equal(pending.state, "needs-owner");
  assert.match(pending.setupUrl!, /site-imports\/.+\/owner/);
  assert.deepEqual(h.workspace.registry({}).list({}), []);
  assert.deepEqual(h.started, []);
  await assert.rejects(h.backend.completeOwner({ principalId: "recipient", importId: pending.importId, adminPassword: "tovu-dev" }), /default/i);
  await assert.rejects(h.backend.completeOwner({ principalId: "recipient", importId: pending.importId, adminPassword: undefined }), /password/i);
  assert.deepEqual(h.workspace.registry({}).list({}), []);
  await assert.rejects(h.backend.completeOwner({ principalId: "other", importId: pending.importId, adminPassword: OWNER_PASSWORD }), /not found/i);
  const created = await h.backend.completeOwner({ principalId: "recipient", importId: pending.importId, adminPassword: OWNER_PASSWORD });
  assert.equal(created.state, "ready");
  const entry = h.workspace.registry({}).list({})[0]!;
  assert.equal(entry.id, created.newSiteId);
  assert.equal(h.started.length, 1);
  assert.deepEqual(fs.readFileSync(path.join(entry.path, "uploads", STORAGE_KEY)), MEDIA);
  assert.equal(fs.existsSync(path.join(entry.path, "themes/static/site/index.html")), true);
  assert.equal(fs.existsSync(path.join(entry.path, "themes/code/site/index.ts")), false);
  assert.equal(fs.existsSync(path.join(entry.path, ".import-quarantine/themes/code/executable/index.ts")), true);
  // A shipped site plugin is kept off: preserved in the unserved quarantine, never in Jini's install dir.
  // Init leaves Jini's install dir empty, so the id's slot stays free to install for real.
  assert.deepEqual(fs.readdirSync(path.join(entry.path, "plugins")), []);
  assert.equal(fs.existsSync(path.join(entry.path, ".import-quarantine/plugins/custom/package/jini.plugin.json")), true);
  for (const rejectedPassword of ["source-password", "tovu-dev", "deployment-password"]) await h.assertOwnerLogin({ dir: entry.path, rejectedPassword });
  const again = await h.backend.importBackup({ principalId: "recipient", source: { uploadId: upload.uploadId }, requestId: "same-request" });
  assert.equal(again.importId, pending.importId);
  assert.equal(h.workspace.registry({}).list({}).length, 1);
  const markerBefore = fs.readFileSync(path.join(entry.path, ".site-meta.json"));
  const anotherUpload = await h.backend.upload({ principalId: "recipient", archive: h.archive });
  const anotherPending = await h.backend.importBackup({ principalId: "recipient", source: { uploadId: anotherUpload.uploadId } });
  const another = await h.backend.completeOwner({ principalId: "recipient", importId: anotherPending.importId, adminPassword: OWNER_PASSWORD });
  assert.notEqual(another.newSiteId, created.newSiteId);
  assert.notEqual(another.newSiteName, created.newSiteName);
  assert.deepEqual(fs.readFileSync(path.join(entry.path, ".site-meta.json")), markerBefore);
  assert.equal(h.workspace.registry({}).list({}).length, 2);
});

test("B compiled static output renders through the theme owner while authored build source remains quarantined", async t => {
  const h = await importFixture(t);
  const sourcePath = "themes/static/site/src/Widget.tsx";
  const content = new Map(h.files);
  content.set(sourcePath, Buffer.from("throw new Error('build source must not execute')"));
  const hashes = Object.fromEntries([...content].filter(([file]) => file.startsWith("themes/static/site/") && !file.endsWith("theme.json") && !file.includes("/src/"))
    .map(([file, bytes]) => [file.slice("themes/static/site/".length), createHash("sha256").update(bytes).digest("hex")]));
  content.set("themes/static/site/theme.json", Buffer.from(JSON.stringify({ id: "site", name: "Portable", version: "1.0.0", tier: "static", build: { source: "compiled", sourceDir: "src", artifactHashes: hashes } })));
  const archive = await buildShareZip({ plan: { ...h.plan, bufferedFiles: [...content].filter(([file]) => file !== "database/content.db").map(([file, bytes]) => ({ path: file, content: bytes })), totalBytes: [...content.values()].reduce((sum, bytes) => sum + bytes.length, 0) }, zip: zipFolderFiles });
  const uploaded = await h.backend.upload({ principalId: "recipient", archive });
  const pending = await h.backend.importBackup({ principalId: "recipient", source: { uploadId: uploaded.uploadId } });
  await h.backend.completeOwner({ principalId: "recipient", importId: pending.importId, adminPassword: OWNER_PASSWORD });
  const site = h.workspace.registry({}).list({})[0]!;
  assert.equal(fs.existsSync(path.join(site.path, sourcePath)), false);
  assert.equal(fs.existsSync(path.join(site.path, ".import-quarantine", sourcePath)), true);
  assert.equal(loadTheme({ themeDir: path.join(site.path, "themes/static/site"), id: "site", source: "site" }).status, "valid");
});

test("restore quarantines malformed, executable and unsafe compiled theme variants while preserving ordinary static assets", async t => {
  const { stageVerifiedImport } = await import("../import-restore.js");
  const { restoreStagedImport } = await import("#src/server/runtime/composition/site-portability");
  const { readTemplate } = await import("../../../platform/site-dir/read-template.js");
  const { default: Database } = await import("better-sqlite3");
  const h = await importFixture(t), files = new Map<string, Buffer>();
  const variants: [string, string, unknown][] = [
    ["static", "tier-mismatch", { tier: "code" }],
    ["static", "malformed", "{"],
    ["declarative", "compiled-declarative", { tier: "declarative", build: { source: "compiled", sourceDir: "src" } }],
    ["static", "no-source-dir", { tier: "static", build: { source: "compiled" } }],
    ["static", "outside-source", { tier: "static", build: { source: "compiled", sourceDir: "../outside" } }],
    ["static", "unsafe-source", { tier: "static", build: { source: "compiled", sourceDir: "src%" } }],
    ["static", "invalid-artifacts", { tier: "static", build: { source: "compiled", sourceDir: "src", artifactHashes: {} } }],
    ["static", "typescript", { tier: "static" }],
  ];
  for (const [tier, name, manifest] of variants) {
    files.set(`themes/${tier}/${name}/theme.json`, Buffer.from(typeof manifest === "string" ? manifest : JSON.stringify(manifest)));
    files.set(`themes/${tier}/${name}/index.html`, Buffer.from("<main>quarantine</main>"));
  }
  files.set("themes/static/typescript/build.tsx", Buffer.from("throw new Error('never execute')"));
  files.set("themes/static/safe/theme.json", Buffer.from('{"tier":"static"}'));
  files.set("themes/static/safe/site.js", Buffer.from("window.safe = true"));
  files.set("themes/declarative/safe/theme.json", Buffer.from('{"tier":"declarative"}'));
  files.set("themes/declarative/safe/tokens.json", Buffer.from("{}"));
  files.set("settings.json", Buffer.from('{"name":"never overwrite host"}'));
  files.set("overrides/custom.html", Buffer.from("quarantined override"));
  files.set("uploads/blob", Buffer.from("binary media"));
  const root = path.join(h.root, "theme-stage"), dir = path.join(h.root, "restored"), dbPath = path.join(dir, "content.db");
  fs.mkdirSync(dir); fs.mkdirSync(path.join(dir, "themes/static/safe"), { recursive: true });
  fs.writeFileSync(path.join(dir, "themes/static/safe/stale.html"), "seed theme must be replaced as a tree");
  fs.writeFileSync(path.join(dir, "config.json"), "host configuration");
  stageVerifiedImport({ root, verified: { warnings: [], modified: new Set(), plugins: [], trustedPlugins: [], name: "Copy", database: h.safe.bytes, files } });
  await restoreStagedImport({ root, dir, dbPath });
  for (const [tier, name] of variants) {
    assert.equal(fs.existsSync(path.join(dir, `themes/${tier}/${name}/index.html`)), false, name);
    assert.equal(fs.readFileSync(path.join(dir, `.import-quarantine/themes/${tier}/${name}/index.html`), "utf8"), "<main>quarantine</main>");
  }
  assert.equal(fs.existsSync(path.join(dir, "themes/static/safe/stale.html")), false);
  assert.equal(fs.readFileSync(path.join(dir, "themes/static/safe/site.js"), "utf8"), "window.safe = true");
  assert.equal(fs.readFileSync(path.join(dir, "themes/declarative/safe/tokens.json"), "utf8"), "{}");
  assert.equal(fs.readFileSync(path.join(dir, "config.json"), "utf8"), "host configuration");
  assert.equal(fs.existsSync(path.join(dir, "settings")), false);
  assert.equal(fs.readFileSync(path.join(dir, ".import-quarantine/overrides/custom.html"), "utf8"), "quarantined override");
  assert.equal(fs.readFileSync(path.join(dir, "uploads/blob"), "utf8"), "binary media");
  const restored = new Database(dbPath);
  try { assert.deepEqual(restored.prepare("SELECT active_theme_id FROM presentation_settings").all(), [{ active_theme_id: readTemplate({ templateId: "starter" }).seed.presentation.activeThemeId }]); }
  finally { restored.close(); }
});
