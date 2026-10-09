import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertManagedSiteDirectory, listSiteTrash, trashSite, restoreSite, permanentlyDeleteTrashedSite } from "../../site-trash.js";

function fixture(t: { after: (fn: () => void) => void }) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "site-trash-")));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const dir = path.join(base, "sites/alpha"); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: "Alpha" }));
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId: "id", templateId: "starter", templateVersion: "1.0.0", schemaVersion: 0, schemaTag: "test", createdAt: "2026-10-08T00:00:00Z" }));
  fs.writeFileSync(path.join(dir, "content.db"), "precious content");
  return { base, dir };
}
test("Trash preserves the site, lists it, refuses occupied restore, and recovers its data", (t) => {
  const { base, dir } = fixture(t);
  const row = trashSite({ base, name: "alpha" });
  assert.equal(fs.existsSync(dir), false);
  assert.deepEqual(listSiteTrash({ base }), [row]);
  fs.mkdirSync(dir);
  assert.throws(() => restoreSite({ base, id: row.id }), /SITE_ALREADY_EXISTS/);
  fs.rmdirSync(dir); restoreSite({ base, id: row.id });
  assert.equal(fs.readFileSync(path.join(dir, "content.db"), "utf8"), "precious content");
});
test("only confirmed checked Trash entries may be permanently removed; paths and symlinks refuse", (t) => {
  const { base } = fixture(t);
  assert.throws(() => trashSite({ base, name: "../alpha" }), /VALIDATION_ERROR/);
  fs.symlinkSync(path.join(base, "sites/alpha"), path.join(base, "sites/link"));
  assert.throws(() => assertManagedSiteDirectory({ base, name: "link" }), /SITE_PATH_UNSAFE/);
  const row = trashSite({ base, name: "alpha" });
  assert.throws(() => permanentlyDeleteTrashedSite({ base, id: row.id, checked: false, confirmed: true }), /SITE_CONFIRM_REQUIRED/);
  assert.equal(listSiteTrash({ base }).length, 1);
  permanentlyDeleteTrashedSite({ base, id: row.id, checked: true, confirmed: true });
  assert.deepEqual(listSiteTrash({ base }), []);
});
