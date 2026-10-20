import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSitesWorkspace } from "../../sites-home.js";
import { assertManagedSiteDirectory as assertManagedSiteDirectoryReal, listSiteTrash as listSiteTrashReal, trashSite as trashSiteReal, restoreSite as restoreSiteReal, permanentlyDeleteTrashedSite as permanentlyDeleteTrashedSiteReal } from "../../site-trash.js";

// An explicit fixture home prevents these filesystem tests from writing the owner's catalog.
const fixtureOptions = (base: string) => ({ homeDir: base, env: { TOVU_SITES_HOME: path.join(base, "sites") } });
const assertManagedSiteDirectory = (required: Parameters<typeof assertManagedSiteDirectoryReal>[0]) => assertManagedSiteDirectoryReal(required, fixtureOptions(required.base));
const listSiteTrash = (required: Parameters<typeof listSiteTrashReal>[0]) => listSiteTrashReal(required, fixtureOptions(required.base));
const trashSite = (required: Parameters<typeof trashSiteReal>[0]) => trashSiteReal(required, fixtureOptions(required.base));
const restoreSite = (required: Parameters<typeof restoreSiteReal>[0]) => restoreSiteReal(required, fixtureOptions(required.base));
const permanentlyDeleteTrashedSite = (required: Parameters<typeof permanentlyDeleteTrashedSiteReal>[0]) => permanentlyDeleteTrashedSiteReal(required, fixtureOptions(required.base));

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

test("home sites use existing Trash; restore registers the directory in the current home", (t) => {
  const { base, dir } = fixture(t);
  const options = { homeDir: base, env: { TOVU_SITES_HOME: path.join(base, "sites") } };
  const row = trashSiteReal({ base, name: "alpha" }, options);
  // Change the configured home after Trash; restore must use the current destination.
  options.env.TOVU_SITES_HOME = path.join(base, "new-home");
  restoreSiteReal({ base, id: row.id }, options);
  const target = path.join(base, "new-home", "alpha");
  assert.equal(fs.existsSync(dir), false);
  assert.equal(fs.readFileSync(path.join(target, "content.db"), "utf8"), "precious content");
  // home2 moved the shared catalog into app-data; the restored site's destination is still
  // the current home. Read through the same registry owner both apps use.
  const workspace = createSitesWorkspace({}, { ...options, cwd: base });
  assert.equal(workspace.registry({}).list({}).find(entry => entry.id === "id")?.path, target);
  const registry = JSON.parse(fs.readFileSync(path.join(workspace.config({}).appData, "sites.json"), "utf8"));
  assert.equal(registry.entries.find((entry: { id: string }) => entry.id === "id")?.path, target);
});

test("restore refuses a sites home replaced by a symlink after canonicalization", (t) => {
  const { base } = fixture(t);
  const row = trashSite({ base, name: "alpha" });
  const home = path.join(base, "new-home");
  const outside = path.join(base, "outside");
  fs.mkdirSync(outside);
  const original = fs.realpathSync;
  let swapped = false;
  const probe = t.mock.method(fs, "realpathSync", (...args: Parameters<typeof original>) => {
    const result = original(...args);
    if (args[0] === home && !swapped) {
      swapped = true;
      fs.renameSync(home, `${home}-original`);
      fs.symlinkSync(outside, home);
    }
    return result;
  });
  try {
    assert.throws(() => restoreSiteReal({ base, id: row.id }, {
      homeDir: base, env: { TOVU_SITES_HOME: home },
    }), /SITE_PATH_UNSAFE/);
    assert.equal(swapped, true);
    assert.equal(fs.existsSync(path.join(outside, "alpha")), false);
    assert.equal(fs.existsSync(path.join(base, "site-trash", row.id)), true);
  } finally {
    probe.mock.restore();
  }
});
