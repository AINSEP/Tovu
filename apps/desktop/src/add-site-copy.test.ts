/** Finder copies must become independent sites before the directory registry sees them. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createNodeAtomicFilesystem } from "@jini-ai/platform/fs";
import { addSitePointer } from "./add-site-pointer.ts";
import { createSitesWorkspace, shareSiteDirectories } from "./shared-sites.ts";
import { handleAddSite, handleStart } from "./project-ipc.ts";
import { createKeyedSerializer } from "./keyed-serializer.ts";
import { readTrackedSites, trackSite } from "./tracked-sites.ts";

const ORIGINAL_ID = "11111111-1111-4111-8111-111111111111";

function fixture({ t, legacyKey = false }: { t: test.TestContext; legacyKey?: boolean }, _options = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "desktop-site-copy-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = createSitesWorkspace({}, { homeDir: root, env: {}, cwd: root, platform: "linux", appDataDir: path.join(root, "profile") });
  const original = path.join(root, "original"), copy = path.join(root, "copy");
  fs.mkdirSync(original);
  fs.writeFileSync(path.join(original, "config.json"), JSON.stringify({ name: "Harbor Florist" }));
  const meta = { siteId: ORIGINAL_ID, schemaVersion: 58, schemaTag: "unchanged", futureField: { retain: true },
    ...(legacyKey ? {} : { siteKeyId: "existing-encryption-key" }) };
  fs.writeFileSync(path.join(original, ".site-meta.json"), JSON.stringify(meta));
  fs.writeFileSync(path.join(original, "content.db"), "fixture database bytes");
  shareSiteDirectories({ workspace, dirs: [original], createdBy: "Desktop" });
  const projectsPath = path.join(root, "projects.json");
  return { root, workspace, original, copy, projectsPath, meta };
}

function readMeta({ siteDir }: { siteDir: string }, _options = {}): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(siteDir, ".site-meta.json"), "utf8"));
}

test("adding a copied folder gives it a fresh identity and leaves the original unchanged", (t) => {
  const f = fixture({ t });
  fs.cpSync(f.original, f.copy, { recursive: true });
  const originalBytes = fs.readFileSync(path.join(f.original, ".site-meta.json"));

  addSitePointer({ siteDir: f.copy, projectsPath: f.projectsPath }, { workspace: f.workspace });

  const copiedMeta = readMeta({ siteDir: f.copy });
  assert.notEqual(copiedMeta.siteId, ORIGINAL_ID);
  assert.match(String(copiedMeta.siteId), /^[0-9a-f-]{36}$/i);
  assert.deepEqual(copiedMeta, { ...f.meta, siteId: copiedMeta.siteId });
  assert.deepEqual(fs.readFileSync(path.join(f.original, ".site-meta.json")), originalBytes);
  assert.equal(fs.readFileSync(path.join(f.copy, "content.db"), "utf8"), "fixture database bytes");
  // Exercise the real registry that rejected this pair before the fix.
  const rows = shareSiteDirectories({ workspace: f.workspace, dirs: [f.original, f.copy], createdBy: "Desktop" });
  assert.deepEqual(new Set(rows.map((row) => row.id)), new Set([ORIGINAL_ID, copiedMeta.siteId]));
  assert.equal(rows.find((row) => row.id === ORIGINAL_ID)?.path, f.original);
});

test("adding a moved folder keeps its identity and uses the existing relocation owner", async (t) => {
  const f = fixture({ t });
  const before = fs.readFileSync(path.join(f.original, ".site-meta.json"));
  fs.renameSync(f.original, f.copy);
  // App-data reservations also require the existing explicit relocation path.
  fs.rmSync(path.join(f.copy, "content.db"));
  f.workspace.updateConfig({ patch: { databases: "appData" } });
  const record = await handleAddSite({
    sharedSites: f.workspace, projectsPath: f.projectsPath, repoRoot: f.root, openSites: new Map(),
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [f.copy] }) },
    addSitePointer, readSiteName: () => "Harbor Florist", readPreviewVersion: () => null,
  });

  assert.equal(record?.installDir, f.copy);
  assert.deepEqual(fs.readFileSync(path.join(f.copy, ".site-meta.json")), before);
  assert.equal(f.workspace.registry({}).list({}).find((row) => row.id === ORIGINAL_ID)?.path, f.copy);
});

test("adding the same copied folder twice is idempotent", (t) => {
  const f = fixture({ t });
  fs.cpSync(f.original, f.copy, { recursive: true });
  const first = addSitePointer({ siteDir: f.copy, projectsPath: f.projectsPath }, { workspace: f.workspace });
  const before = fs.readFileSync(path.join(f.copy, ".site-meta.json"));
  const rows = readTrackedSites(f.projectsPath);
  const second = addSitePointer({ siteDir: f.copy, projectsPath: f.projectsPath }, { workspace: f.workspace });

  assert.equal(first.alreadyTracked, false);
  assert.equal(second.alreadyTracked, true);
  assert.notEqual(readMeta({ siteDir: f.copy }).siteId, ORIGINAL_ID);
  assert.deepEqual(fs.readFileSync(path.join(f.copy, ".site-meta.json")), before);
  assert.deepEqual(readTrackedSites(f.projectsPath), rows);
});

test("adding a symlink alias keeps the original directory identity", (t) => {
  const f = fixture({ t });
  fs.symlinkSync(f.original, f.copy, "junction");
  addSitePointer({ siteDir: f.copy, projectsPath: f.projectsPath }, { workspace: f.workspace });
  assert.deepEqual(readMeta({ siteDir: f.original }), f.meta);
});

test("re-identifying a legacy copy preserves its implicit encryption key identity", (t) => {
  const f = fixture({ t, legacyKey: true });
  fs.cpSync(f.original, f.copy, { recursive: true });
  addSitePointer({ siteDir: f.copy, projectsPath: f.projectsPath }, { workspace: f.workspace });
  const meta = readMeta({ siteDir: f.copy });
  assert.notEqual(meta.siteId, ORIGINAL_ID);
  assert.equal(meta.siteKeyId, ORIGINAL_ID);
  assert.deepEqual(readMeta({ siteDir: f.original }), f.meta);
});

test("a failed atomic identity replacement leaves both folders untouched and reports a plain sentence", (t) => {
  const f = fixture({ t });
  fs.cpSync(f.original, f.copy, { recursive: true });
  let attemptedRename = false;
  const filesystem = { ...createNodeAtomicFilesystem({}), rename: () => {
    attemptedRename = true;
    throw Object.assign(new Error("read-only folder"), { code: "EACCES" });
  } };

  assert.throws(() => addSitePointer({ siteDir: f.copy, projectsPath: f.projectsPath }, { workspace: f.workspace, filesystem }),
    { message: "This copied website could not start because Tovu could not give its folder a separate identity." });
  assert.equal(attemptedRename, true, "the failure must come from the real atomic replacement");
  assert.deepEqual(readMeta({ siteDir: f.original }), f.meta);
  assert.deepEqual(readMeta({ siteDir: f.copy }), f.meta);
  assert.deepEqual(fs.readdirSync(f.copy).sort(), fs.readdirSync(f.original).sort(), "temporary file was removed");
  assert.deepEqual(readTrackedSites(f.projectsPath), []);
});

test("Start automatically re-identifies a copy already tracked by an older desktop", async (t) => {
  const f = fixture({ t });
  fs.cpSync(f.original, f.copy, { recursive: true });
  trackSite(f.projectsPath, f.copy);
  trackSite(f.projectsPath, f.original);
  const started: string[] = [];
  const deps = {
    sharedSites: f.workspace, projectsPath: f.projectsPath, repoRoot: f.root,
    openSites: new Map(), serializer: createKeyedSerializer(), ctx: {},
    readSiteName: () => "Harbor Florist", readPreviewVersion: () => null,
    openSiteServer: async (siteDir: string) => {
      const id = readMeta({ siteDir }).siteId;
      if (siteDir === f.copy) assert.notEqual(id, ORIGINAL_ID, "identity must be repaired before spawning");
      else assert.equal(id, ORIGINAL_ID);
      f.workspace.registry({}).merge({ entries: [{ id: String(id), name: "Harbor Florist", path: siteDir, createdBy: "Desktop", lastOpened: null }] });
      started.push(siteDir);
    },
  };
  await handleStart(f.copy, deps);
  await handleStart(f.original, deps);
  assert.deepEqual(started, [f.copy, f.original]);
  assert.deepEqual(readMeta({ siteDir: f.original }), f.meta);
});

test("Start keeps a moved folder's identity and relocates its existing reservation", async (t) => {
  const f = fixture({ t });
  fs.renameSync(f.original, f.copy);
  fs.rmSync(path.join(f.copy, "content.db"));
  f.workspace.updateConfig({ patch: { databases: "appData" } });
  trackSite(f.projectsPath, f.copy);
  await handleStart(f.copy, {
    sharedSites: f.workspace, projectsPath: f.projectsPath, repoRoot: f.root,
    openSites: new Map(), serializer: createKeyedSerializer(), ctx: {},
    readSiteName: () => "Harbor Florist", readPreviewVersion: () => null,
    openSiteServer: async (siteDir) => {
      assert.equal(readMeta({ siteDir }).siteId, ORIGINAL_ID);
      assert.equal(f.workspace.registry({}).list({}).find((row) => row.id === ORIGINAL_ID)?.path, f.copy);
    },
  });
  assert.deepEqual(readMeta({ siteDir: f.copy }), f.meta);
});

test("Start reports a plain sentence when a linked marker cannot safely be re-identified", async (t) => {
  const f = fixture({ t });
  fs.cpSync(f.original, f.copy, { recursive: true });
  fs.rmSync(path.join(f.copy, ".site-meta.json"));
  fs.symlinkSync(path.join(f.original, ".site-meta.json"), path.join(f.copy, ".site-meta.json"));
  trackSite(f.projectsPath, f.copy);
  let spawned = false;
  await assert.rejects(handleStart(f.copy, {
    sharedSites: f.workspace, projectsPath: f.projectsPath, repoRoot: f.root,
    openSites: new Map(), serializer: createKeyedSerializer(), ctx: {},
    readSiteName: () => "Harbor Florist", readPreviewVersion: () => null,
    openSiteServer: async () => { spawned = true; },
  }), { message: "This copied website could not start because Tovu could not give its folder a separate identity." });
  assert.equal(spawned, false);
  assert.deepEqual(readMeta({ siteDir: f.original }), f.meta);
});
