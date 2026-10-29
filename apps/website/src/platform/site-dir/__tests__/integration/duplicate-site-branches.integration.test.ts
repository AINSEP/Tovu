import "../helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { duplicateSite } from "../../duplicate-site.js";
import { initSite } from "#src/server/runtime/composition/site-dir";
import { createSitesWorkspace } from "../../sites-home.js";

/**
 * @file `duplicateSite` branch pins beyond the SPEC-003 sibling suite: app-data database
 * placement and its cleanup, a pre-A4 source's key identity, an unlistable source, and the
 * ambient workspace default.
 */

/** A temp parent holding one freshly initialized source site; the duplicate target is absent. */
async function fixture() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-duplicate-branches-"));
  const sourceDir = path.join(parent, "source");
  const { siteId } = await initSite({ dir: sourceDir, name: "Source" });
  return { parent, sourceDir, sourceId: siteId, targetDir: path.join(parent, "copy"), cleanup: () => fs.rmSync(parent, { recursive: true, force: true }) };
}

/** A workspace that keeps databases in app-data, outside the site folder. */
function appDataWorkspace({ parent }: { parent: string }) {
  const workspace = createSitesWorkspace({}, { homeDir: parent, cwd: parent, env: {}, platform: "linux", appDataDir: path.join(parent, "app-data") });
  workspace.updateConfig({ patch: { databases: "appData" } });
  return workspace;
}

/** Pin the next randomUUID (the minted siteId) while later ids stay random. */
function pinNextSiteId(t: TestContext, { siteId }: { siteId: string }): void {
  const original = crypto.randomUUID.bind(crypto);
  let first = true;
  t.mock.method(crypto, "randomUUID", () => {
    if (!first) return original();
    first = false;
    return siteId as ReturnType<typeof crypto.randomUUID>;
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
}

test("app-data placement writes the duplicate's database outside its folder", async () => {
  const f = await fixture();
  try {
    const result = await duplicateSite({ sourceDir: f.sourceDir, targetDir: f.targetDir }, { workspace: appDataWorkspace(f) });
    assert.equal(fs.existsSync(path.join(f.parent, "app-data", "databases", result.siteId, "content.db")), true);
    assert.equal(fs.existsSync(path.join(f.targetDir, "data.nosync")), false);
  } finally { f.cleanup(); }
});

test("app-data placement refuses an existing database folder for the minted site and keeps it", async (t) => {
  const f = await fixture();
  try {
    const workspace = appDataWorkspace(f);
    const siteId = "00000000-0000-4000-8000-000000000002";
    const existing = path.join(f.parent, "app-data", "databases", siteId);
    fs.mkdirSync(existing, { recursive: true });
    pinNextSiteId(t, { siteId });
    await assert.rejects(duplicateSite({ sourceDir: f.sourceDir, targetDir: f.targetDir }, { workspace }), {
      name: "InternalError", message: `duplicateSite: database target already exists at ${existing}`,
    });
    assert.equal(fs.existsSync(existing), true); assert.equal(fs.existsSync(f.targetDir), false);
  } finally { f.cleanup(); }
});

test("a failed database copy under app-data placement removes the database folder it created", async (t) => {
  const f = await fixture();
  try {
    const workspace = appDataWorkspace(f);
    const siteId = "00000000-0000-4000-8000-000000000003";
    pinNextSiteId(t, { siteId });
    fs.writeFileSync(path.join(f.sourceDir, "data.nosync", "content.db"), "not a database, just text long enough to fill the SQLite header bytes......".repeat(4));
    await assert.rejects(duplicateSite({ sourceDir: f.sourceDir, targetDir: f.targetDir }, { workspace }), {
      name: "InternalError", message: `duplicateContentDb: copying to ${path.join(f.parent, "app-data", "databases", siteId, "content.db")} failed: file is not a database`,
    });
    assert.equal(fs.existsSync(path.join(f.parent, "app-data", "databases", siteId)), false); assert.equal(fs.existsSync(f.targetDir), false);
  } finally { f.cleanup(); }
});

test("a source written before siteKeyId existed hands its siteId to the duplicate as the key identity", async () => {
  const f = await fixture();
  try {
    const metaPath = path.join(f.sourceDir, ".site-meta.json");
    const { siteKeyId: _dropped, ...preA4 } = JSON.parse(fs.readFileSync(metaPath, "utf8")) as Record<string, unknown>;
    fs.writeFileSync(metaPath, JSON.stringify(preA4));
    await duplicateSite({ sourceDir: f.sourceDir, targetDir: f.targetDir });
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.targetDir, ".site-meta.json"), "utf8")).siteKeyId, f.sourceId);
  } finally { f.cleanup(); }
});

test("an unlistable source directory is surfaced, not copied as empty", async (t) => {
  const f = await fixture();
  try {
    const readdirSync = fs.readdirSync;
    t.mock.method(fs, "readdirSync", ((dir: fs.PathLike, options?: unknown) => {
      if (String(dir) === f.sourceDir) throw new Error("listing denied");
      return (readdirSync as (dir: fs.PathLike, options?: unknown) => unknown)(dir, options);
    }) as typeof fs.readdirSync);
    await assert.rejects(duplicateSite({ sourceDir: f.sourceDir, targetDir: f.targetDir }), {
      name: "InternalError", message: `duplicateSite: failed to read source directory ${f.sourceDir}: listing denied`,
    });
    t.mock.restoreAll();
    assert.equal(fs.existsSync(f.targetDir), false);
  } finally { f.cleanup(); }
});
