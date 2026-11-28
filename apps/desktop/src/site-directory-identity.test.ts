import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSitesWorkspace } from "./shared-sites.ts";
import { ensureIndependentSiteIdentity } from "./site-directory-identity.ts";

test("a copied directory gets its own site identity without losing its explicit key identity", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "desktop-copied-identity-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const original = path.join(root, "original");
  const copy = path.join(root, "copy");
  const marker = ".site-meta.json";
  const originalMeta = { siteId: "original-id", siteKeyId: "older-key-id", schemaVersion: 58, extra: { kept: true } };
  fs.mkdirSync(original);
  fs.writeFileSync(path.join(original, marker), JSON.stringify(originalMeta));
  fs.cpSync(original, copy, { recursive: true });

  const workspace = createSitesWorkspace({}, { env: {}, homeDir: root, sourceRoots: [] });
  workspace.registry({}).merge({ entries: [{ id: "original-id", path: original, name: "Original", createdBy: "Desktop", lastOpened: null }] });
  let minted = 0;
  const options = { workspace, newIdentity: () => { minted++; return "copy-id"; } };
  ensureIndependentSiteIdentity({ siteDir: copy }, options);
  ensureIndependentSiteIdentity({ siteDir: copy }, options);

  assert.equal(minted, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(copy, marker), "utf8")), { ...originalMeta, siteId: "copy-id" });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(original, marker), "utf8")), originalMeta);
  assert.equal(workspace.registry({}).list({}).find(({ id }) => id === "original-id")?.path, original);
});

function copiedSite(t: import("node:test").TestContext) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "desktop-copied-identity-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const original = path.join(root, "original"), copy = path.join(root, "copy");
  const originalMeta = { siteId: "original-id", schemaVersion: 58 };
  fs.mkdirSync(original);
  fs.writeFileSync(path.join(original, ".site-meta.json"), JSON.stringify(originalMeta));
  fs.cpSync(original, copy, { recursive: true });
  const workspace = createSitesWorkspace({}, { env: {}, homeDir: root, sourceRoots: [] });
  workspace.registry({}).merge({ entries: [{ id: "original-id", path: original, name: "Original", createdBy: "Desktop", lastOpened: null }] });
  return { root, original, copy, originalMeta, workspace };
}

test("a copy whose identity cannot be replaced fails with a plain sentence and keeps its marker untouched", (t) => {
  const s = copiedSite(t);
  const cause = new Error("identity source unavailable");
  assert.throws(() => ensureIndependentSiteIdentity({ siteDir: s.copy }, { workspace: s.workspace, newIdentity: () => { throw cause; } }), (error: Error) => {
    assert.equal(error.message, "This copied website could not start because Tovu could not give its folder a separate identity.");
    assert.equal(error.cause, cause);
    return true;
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(s.copy, ".site-meta.json"), "utf8")), s.originalMeta);
});

test("a copy whose databases live outside its folder gets its own snapshot of them, and the original stays put", async (t) => {
  const s = copiedSite(t);
  // Finder copies the data link, so the copy still resolves the source's externally held database.
  const external = path.join(s.root, "external-data");
  fs.mkdirSync(external);
  fs.symlinkSync(external, path.join(s.copy, "data.nosync"));
  const from = path.join(external, "content.db");
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(from);
  db.exec("CREATE TABLE pages (title TEXT); INSERT INTO pages VALUES ('home');");
  db.close();
  assert.equal(fs.realpathSync(s.workspace.databasePath({ dir: s.copy, id: "original-id", filename: "content.db" })), from);
  ensureIndependentSiteIdentity({ siteDir: s.copy }, { workspace: s.workspace, newIdentity: () => "copy-id" });
  const to = s.workspace.databasePath({ dir: s.copy, id: "copy-id", filename: "content.db", placement: "appData" });
  assert.notEqual(to, from);
  const read = (file: string) => { const d = new DatabaseSync(file, { readOnly: true }); try { return d.prepare("SELECT title FROM pages").all(); } finally { d.close(); } };
  assert.deepEqual(read(to).map(row => row.title), ["home"]);
  assert.deepEqual(read(from).map(row => row.title), ["home"]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(s.copy, ".site-meta.json"), "utf8")).siteId, "copy-id");
});

test("only a copy of a registered, still-present site is given a new identity", (t) => {
  const s = copiedSite(t);
  const mint = () => assert.fail("no new identity may be minted");
  ensureIndependentSiteIdentity({ siteDir: s.original }, { workspace: s.workspace, newIdentity: mint });
  const stranger = path.join(s.root, "stranger");
  fs.mkdirSync(stranger);
  fs.writeFileSync(path.join(stranger, ".site-meta.json"), JSON.stringify({ siteId: "unregistered-id" }));
  ensureIndependentSiteIdentity({ siteDir: stranger }, { workspace: s.workspace, newIdentity: mint });
  fs.rmSync(s.original, { recursive: true });
  ensureIndependentSiteIdentity({ siteDir: s.copy }, { workspace: s.workspace, newIdentity: mint });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(s.copy, ".site-meta.json"), "utf8")), s.originalMeta);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(stranger, ".site-meta.json"), "utf8")), { siteId: "unregistered-id" });
});
