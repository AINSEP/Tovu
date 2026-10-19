/** Approved round17/18 B. Baseline RED: verifier, import backend and restore seam absent.
 * Authored without execution, as required by the build dispatch.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { buildShareZip } from "../share-zip.js";
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
  assert.equal(fs.existsSync(path.join(entry.path, ".import-quarantine/themes/code/site/index.ts")), true);
  assert.equal(fs.existsSync(path.join(entry.path, "plugins/custom/plugin.json")), false);
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
