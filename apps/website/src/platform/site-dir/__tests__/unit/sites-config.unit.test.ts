import "../helpers/isolated-catalog-home.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSitesWorkspace } from "../../sites-home.js";
import { resolveSiteDatabasePaths, resolveSiteDirForDatabase } from "../../site-databases.js";
import { listSites } from "../../site-registry.js";
import { resolveSiteRoot } from "../../site-root.js";
import { initSite, bootSiteDir } from "#src/server/runtime/composition/site-dir";
import { closeSiteDirBoot } from "../../boot-site-dir.js";
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-sites-config-")));
  const options = { homeDir: root, cwd: path.join(root, "repo"), env: {}, platform: "linux" as const, sourceRoots: [] };
  const workspace = createSitesWorkspace({}, options);
  const dir = path.join(root, "alpha"); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: "Alpha" }));
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId: "alpha-id", templateId: "starter", templateVersion: "1", schemaVersion: 0, schemaTag: "test", createdAt: "2026-10-09" }));
  return { root, options, workspace, dir, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
test("content and chat resolve legacy, data.nosync and app-data independently without relocating files", () => {
  const f = fixture();
  try {
    assert.equal(f.workspace.home({}), path.join(f.root, "Documents", "Tovu"));
    let paths = resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace });
    assert.equal(paths.contentDbPath, path.join(f.dir, "data.nosync", "content.db"));
    fs.writeFileSync(path.join(f.dir, "content.db"), "original");
    f.workspace.updateConfig({ patch: { databases: "appData" } });
    paths = resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace });
    assert.equal(paths.contentDbPath, path.join(f.dir, "content.db")); assert.equal(paths.chatDbPath, path.join(f.dir, "chat.db"));
    fs.mkdirSync(path.join(f.dir, "data.nosync")); fs.renameSync(paths.contentDbPath, path.join(f.dir, "data.nosync", "content.db"));
    paths = resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace });
    assert.equal(paths.chatDbPath, path.join(f.dir, "data.nosync", "chat.db"));
    const selected = resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace, placement: "appData" });
    fs.mkdirSync(path.dirname(selected.contentDbPath), { recursive: true }); fs.renameSync(paths.contentDbPath, selected.contentDbPath);
    paths = resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace });
    assert.equal(paths.contentDbPath, path.join(f.workspace.config({}).appData, "databases", "alpha-id", "content.db"));
    assert.equal(paths.chatDbPath, selected.chatDbPath);
    assert.equal(fs.readFileSync(paths.contentDbPath, "utf8"), "original");
    f.workspace.registry({}).merge({ entries: [{ id: "alpha-id", name: "Alpha", path: f.dir, createdBy: "fixture", lastOpened: null }] });
    assert.equal(resolveSiteDirForDatabase({ dbPath: paths.contentDbPath }, { workspace: f.workspace }), f.dir);
  } finally { f.cleanup(); }
});
test("multiple content databases refuse startup rather than choose potentially stale data", () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.dir, "content.db"), "legacy"); fs.mkdirSync(path.join(f.dir, "data.nosync")); fs.writeFileSync(path.join(f.dir, "data.nosync", "content.db"), "other");
    assert.throws(() => resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace }), { message: "Multiple copies of content.db exist for this site. Choose the authoritative database before starting it." });
    assert.equal(fs.readFileSync(path.join(f.dir, "content.db"), "utf8"), "legacy");
  } finally { f.cleanup(); }
});
test("legacy sidecars and recovery backups never compete with the live data.nosync databases", () => {
  const f = fixture();
  try {
    const data = path.join(f.dir, "data.nosync");
    fs.mkdirSync(data);
    for (const filename of ["content.db", "chat.db"]) {
      fs.writeFileSync(path.join(data, filename), `live ${filename}`);
      for (const suffix of ["-shm", "-wal", ".home2-backup"]) {
        fs.writeFileSync(path.join(f.dir, filename + suffix), `recovery ${filename}${suffix}`);
      }
      fs.writeFileSync(path.join(data, filename + ".home2-backup"), "older data.nosync backup");
    }
    const paths = resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace });
    assert.equal(paths.contentDbPath, path.join(data, "content.db"));
    assert.equal(paths.chatDbPath, path.join(data, "chat.db"));
    for (const filename of ["content.db", "chat.db"]) {
      assert.equal(fs.readFileSync(path.join(data, filename), "utf8"), `live ${filename}`);
      assert.equal(fs.existsSync(path.join(f.dir, filename)), false);
      for (const suffix of ["-shm", "-wal", ".home2-backup"]) {
        assert.equal(fs.readFileSync(path.join(f.dir, filename + suffix), "utf8"), `recovery ${filename}${suffix}`);
      }
      assert.equal(fs.readFileSync(path.join(data, filename + ".home2-backup"), "utf8"), "older data.nosync backup");
    }
  } finally { f.cleanup(); }
});
test("extra nested roots are discovered and a root-selected site resolves before registration", () => {
  const f = fixture();
  try {
    const extra = path.join(f.root, "extra"), nested = path.join(extra, "nested"); fs.mkdirSync(nested, { recursive: true });
    const client = path.join(nested, "client"); fs.renameSync(f.dir, client);
    f.workspace.updateConfig({ patch: { siteRoots: [extra, nested] } });
    assert.equal(resolveSiteRoot({ ...f.options, env: { TOVU_SITE: "client" } }), client);
    assert.equal(listSites(f.options).find((row) => row.id === "alpha-id")?.dir, client);
    assert.deepEqual(f.workspace.config({}).siteRoots, [extra, nested]);
  } finally { f.cleanup(); }
});
test("non-iCloud synced sites home offers appData or local home, default appData keeps a safety notice and a local home clears it", () => {
  const f = fixture();
  try {
    const workspace = createSitesWorkspace({}, { ...f.options, env: { OneDrive: path.join(f.root, "Documents") } });
    assert.equal(workspace.config({}).warning?.provider, "OneDrive");
    assert.equal(workspace.config({}).warning?.localHome, path.join(f.root, "Tovu"));
    assert.equal(workspace.config({}).databases, "appData");
    workspace.updateConfig({ patch: { databases: "appData" } }); assert.equal(workspace.config({}).warning?.provider, "OneDrive");
    workspace.updateConfig({ patch: { databases: "inSite", sitesHome: path.join(f.root, "Tovu", "sites") } }); assert.equal(workspace.config({}).warning, null);
  } finally { f.cleanup(); }
});
test("init and CLI boot share the new data.nosync and appData layouts", async () => {
  const f = fixture();
  try {
    for (const placement of ["inSite", "appData"] as const) {
      f.workspace.updateConfig({ patch: { databases: placement } });
      const dir = path.join(f.root, placement);
      const created = await initSite({ dir, name: "Fixture", adminPassword: "Fixture-only-very-long-password" }, { workspace: f.workspace });
      const paths = resolveSiteDatabasePaths({ dir, siteId: created.siteId }, { workspace: f.workspace });
      assert.equal(fs.existsSync(paths.contentDbPath), true); assert.equal(fs.existsSync(path.join(dir, "content.db")), false);
      assert.equal(path.dirname(paths.contentDbPath), placement === "inSite" ? path.join(dir, "data.nosync") : path.join(f.workspace.config({}).appData, "databases", created.siteId));
      const boot = await bootSiteDir({ dir }, { workspace: f.workspace });
      assert.equal(boot.config.name, "Fixture"); await closeSiteDirBoot(boot);
    }
  } finally { f.cleanup(); }
});

test('web config endpoint checks capability and permission, validates atomically, and persists for desktop', async () => {
  const { registerSitesHomeRoutes } = await import('../../../../server/inbound/admin-http/routes/sites/sites-home.js');
  const f = fixture();
  try {
    const handlers = new Map<string, import('express').RequestHandler>();
    const app = { get(url: string, handler: import('express').RequestHandler) { handlers.set(`get:${url}`, handler); },
      post(url: string, handler: import('express').RequestHandler) { handlers.set(`post:${url}`, handler); },
      put(url: string, handler: import('express').RequestHandler) { handlers.set(`put:${url}`, handler); } } as unknown as import('express').Express;
    let enabled = false, allowed = false; const permissions: string[] = [];
    registerSitesHomeRoutes({ app, workspace: f.workspace, deps: { workspaceId: 'workspace', isSiteSwitcherEnabled: () => enabled,
      authorize: async ({ permission }) => { permissions.push(permission); return { allowed, reason: 'policy' }; },
    } });
    const invoke = async (method: 'get' | 'put', body: unknown = {}, workspaceId = 'workspace') => {
      let status = 200, responseBody: unknown;
      const response = { locals: { principal: { id: 'owner' } }, status(value: number) { status = value; return this; }, json(value: unknown) { responseBody = value; return this; } };
      await handlers.get(`${method}:/api/admin/v1/workspaces/:workspaceId/system/sites/config`)!(
        { params: { workspaceId }, body } as unknown as import('express').Request,
        response as unknown as import('express').Response, () => {});
      return { status, body: responseBody };
    };
    assert.equal((await invoke('put', {}, 'other')).status, 404);
    assert.equal((await invoke('put')).status, 403); assert.deepEqual(permissions, []);
    enabled = true; assert.equal((await invoke('get')).status, 403); assert.deepEqual(permissions, ['system.read']);
    assert.equal(fs.existsSync(f.workspace.config({}).configPath), false);
    allowed = true;
    const patch = { sitesHome: path.join(f.root, 'new'), siteRoots: [path.join(f.root, 'extra')], databases: 'appData' as const };
    fs.mkdirSync(patch.siteRoots[0]!);
    assert.equal((await invoke('put', patch)).status, 200); assert.equal(permissions.at(-1), 'system.write');
    assert.deepEqual(createSitesWorkspace({}, f.options).config({}), f.workspace.config({}));
    const before = fs.readFileSync(f.workspace.config({}).configPath, 'utf8');
    assert.deepEqual(await invoke('put', { databases: 'invalid' }), { status: 400, body: { error: 'databases must be "inSite" or "appData".' } });
    assert.equal(fs.readFileSync(f.workspace.config({}).configPath, 'utf8'), before);
    assert.equal((await invoke('get')).status, 200); assert.equal(permissions.at(-1), 'system.read');
  } finally { f.cleanup(); }
});

test("copied appData folders cannot acquire the incumbent database, and markerless boot cannot create one", () => {
  const f = fixture();
  try {
    f.workspace.updateConfig({ patch: { databases: "appData" } });
    const original = resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace });
    f.workspace.registry({}).merge({ entries: [{ id: "alpha-id", path: f.dir, name: "Keep this name", createdBy: "Web", lastOpened: null }] });
    resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace });
    assert.equal(f.workspace.registry({}).list({})[0]?.name, "Keep this name");
    const copy = path.join(f.root, "copy"); fs.cpSync(f.dir, copy, { recursive: true });
    assert.throws(() => resolveSiteDatabasePaths({ dir: copy }, { workspace: f.workspace }), {
      message: `This app-data database belongs to ${f.dir}. A copied folder must get a new siteId and its own database before starting.`,
    });
    const markerless = path.join(f.root, "markerless"); fs.mkdirSync(markerless);
    assert.throws(() => resolveSiteDatabasePaths({ dir: markerless }, { workspace: f.workspace }), {
      message: "App-data databases require .site-meta.json with a stable siteId. Initialize this folder before starting it.",
    });
    assert.equal(fs.existsSync(original.contentDbPath), false);
    assert.equal(f.workspace.registry({}).list({}).length, 1);
  } finally { f.cleanup(); }
});
test("interrupted relocation uses its known authoritative DB and explains recovery", () => {
  const f = fixture();
  try {
    const source = path.join(f.dir, "content.db"), target = path.join(f.dir, "data.nosync", "content.db");
    fs.mkdirSync(path.dirname(target)); fs.writeFileSync(source, "original"); fs.writeFileSync(target, "partial copy");
    fs.writeFileSync(source + ".home2-relocation.json", JSON.stringify({ to: target }));
    assert.equal(resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace }).contentDbPath, source);
    fs.writeFileSync(target, "verified copy"); fs.renameSync(source, source + ".home2-backup");
    const resolved = resolveSiteDatabasePaths({ dir: f.dir }, { workspace: f.workspace });
    assert.equal(resolved.contentDbPath, target); assert.equal(resolved.chatDbPath, path.join(f.dir, "data.nosync", "chat.db"));
    assert.equal(fs.readFileSync(source + ".home2-backup", "utf8"), "original");
  } finally { f.cleanup(); }
});
