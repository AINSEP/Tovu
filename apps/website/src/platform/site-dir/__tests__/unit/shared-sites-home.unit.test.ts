import { isolatedCatalogHome } from "../helpers/isolated-catalog-home.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSitesWorkspace } from "../../sites-home.js";
import { createSite, listSites, describeSiteBinding, switcherBaseForBinding, siteCreationBaseForBinding } from "../../site-registry.js";
import { resolveSiteRoot, pinDefaultSiteRoot } from "../../site-root.js";
import { createLocalSiteSupervisor } from "../../local-site-supervisor.js";
import { claimSiteRunning } from "../../site-running.js";
function writeSite(dir: string, siteId: string, name = "Example") {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name, domain: null, port: null }));
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId, templateId: "blank", templateVersion: "1", schemaVersion: 0, schemaTag: "test", createdAt: "2026-10-09T00:00:00.000Z" }));
}

test("Web creation uses the home, shared external registrations appear, and legacy fallback stays available", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-shared-home-")));
  try {
    const cwd = path.join(root, "repo"); fs.mkdirSync(cwd); fs.mkdirSync(path.join(root, "Documents"));
    const options = { cwd, homeDir: root, env: {} };
    const workspace = createSitesWorkspace({}, options);
    assert.equal(resolveSiteRoot(options), path.join(cwd, "sites", "tovu-dev"));
    const created = await createSite({ name: "alpha" }, { ...options, initSite: async ({ dir, name }) => {
      writeSite(dir, "11111111-1111-4111-8111-111111111111", name); return { dir, siteId: "11111111-1111-4111-8111-111111111111" };
    } });
    assert.equal(created.dir, path.join(root, "Documents", "Tovu", "alpha"));
    assert.equal(fs.existsSync(path.join(cwd, "sites")), false);
    assert.equal(workspace.registry({}).list({})[0]?.createdBy, "Web");
    assert.equal(resolveSiteRoot(options), path.join(cwd, "sites", "tovu-dev"));
    const binding = describeSiteBinding(options);
    assert.equal(binding.switcherCompatible, true); assert.equal(switcherBaseForBinding(binding), cwd);
    const external = path.join(root, "external", "Client Website");
    writeSite(external, "22222222-2222-4222-8222-222222222222", "Outside");
    workspace.registry({}).merge({ entries: [{ id: "22222222-2222-4222-8222-222222222222", name: "Outside", path: external, createdBy: "Desktop", lastOpened: null }] });
    const rows = listSites(options);
    assert.equal(rows.length, 2); assert.equal(rows.find((row) => row.dir === external)?.name, "22222222-2222-4222-8222-222222222222");
    assert.equal(resolveSiteRoot({ ...options, env: { TOVU_SITE: "22222222-2222-4222-8222-222222222222" } }), external);
    assert.equal(workspace.registry({}).list({}).find((entry) => entry.path === external)?.createdBy, "Desktop");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test("a second boot refuses admission before touching database content", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-running-home-")));
  const workspace = createSitesWorkspace({}, { homeDir: root, env: {} });
  const dir = path.join(root, "website"); writeSite(dir, "id"); fs.writeFileSync(path.join(dir, "content.db"), "keep bytes");
  const lease = claimSiteRunning({ dir, app: "Desktop" }, { workspace });
  try {
    lease.ready({ port: 3456 });
    assert.throws(() => claimSiteRunning({ dir, app: "Web" }, { workspace }), /Running in Desktop \(port 3456\)/);
    assert.equal(fs.readFileSync(path.join(dir, "content.db"), "utf8"), "keep bytes");
  } finally { lease.release(); fs.rmSync(root, { recursive: true, force: true }); }
});
test("supervisor reuses a foreign URL and refuses stopped-site mutations while another app serves", async () => {
  let launches = 0;
  const state = { name: "alpha", status: "running" as const, pid: 10, port: 3456, daemonPort: null, adminUrl: "http://localhost:3456/admin/", app: "Desktop", external: true };
  const supervisor = createLocalSiteSupervisor({ servingName: "owner", scheme: "http", processPort: {
    existing: () => state, listExisting: () => [state], isPortFree: async () => true,
    launch: async () => { launches++; throw new Error("Must not launch"); }, schedule: () => () => {},
  } });
  assert.deepEqual(await supervisor.start({ name: "alpha" }), state); assert.equal(launches, 0);
  assert.deepEqual(supervisor.list(), [state]);
  await assert.rejects(supervisor.stop({ name: "alpha" }), /SITE_RUNNING_ELSEWHERE/);
  await assert.rejects(supervisor.withStoppedSite({ name: "alpha", task: async () => "unsafe" }), /SITE_RUNNING/);
  await supervisor.shutdown();
});


test("home settings enforce workspace/capability/permission boundaries before filesystem changes", async () => {
  const { registerSitesHomeRoutes } = await import("../../../../server/inbound/admin-http/routes/sites/sites-home.js");
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-home-setting-")));
  try {
    const workspace = createSitesWorkspace({}, { homeDir: root, env: {} });
    let enabled = false, allowed = false, checks = 0;
    let handler: import("express").RequestHandler | undefined;
    const app = { post() {}, get() {}, put(_url: string, callback: import("express").RequestHandler) { handler = callback; } } as unknown as import("express").Express;
    registerSitesHomeRoutes({ app, workspace, deps: { workspaceId: "workspace", isSiteSwitcherEnabled: () => enabled,
      authorize: async ({ permission }) => { checks++; assert.equal(permission, "system.write"); return { allowed, reason: "policy" }; },
    } });
    const selected = path.join(root, "chosen");
    const invoke = async (workspaceId = "workspace", selectedPath = selected) => {
      let status = 200; let body: unknown;
      const response = { locals: { principal: { id: "owner" } }, status(value: number) { status = value; return this; }, json(value: unknown) { body = value; return this; } };
      await handler!({ params: { workspaceId }, body: { path: selectedPath } } as unknown as import("express").Request, response as unknown as import("express").Response, () => {});
      return { status, body };
    };
    assert.equal((await invoke("wrong")).status, 404); assert.equal(checks, 0);
    assert.equal((await invoke()).status, 403); assert.equal(checks, 0);
    enabled = true;
    assert.equal((await invoke()).status, 403); assert.equal(checks, 1); assert.equal(fs.existsSync(selected), false);
    allowed = true;
    assert.equal((await invoke("workspace", "relative")).status, 400); assert.equal(fs.existsSync(selected), false);
    assert.deepEqual(await invoke(), { status: 200, body: { home: selected } });
    assert.equal(createSitesWorkspace({}, { homeDir: root, env: {} }).home({}), selected);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Web boot pins its site while later MRU and home changes affect only future boots", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-pin-home-")));
  try {
    const cwd = path.join(root, "repo"), env: NodeJS.ProcessEnv = { TOVU_SITE: "alpha" }, options = { cwd, homeDir: root, env };
    fs.mkdirSync(cwd);
    const alpha = path.join(root, "Documents", "Tovu", "alpha"), beta = path.join(root, "Documents", "Tovu", "beta");
    writeSite(alpha, "alpha-id"); writeSite(beta, "beta-id");
    assert.equal(pinDefaultSiteRoot({}, options), alpha);
    createSitesWorkspace({}, options).registry({}).merge({ entries: [{ id: "alpha-id", name: "Alpha", path: alpha, createdBy: "Web", lastOpened: null }] });
    env.TOVU_SITE = "beta";
    createSitesWorkspace({}, options).setHome({ path: path.join(root, "new-home") });
    assert.equal(resolveSiteRoot(options), alpha);
    assert.equal(describeSiteBinding(options).dirOverridden, false);
    assert.equal(describeSiteBinding(options).switcherCompatible, true);
    assert.equal(resolveSiteRoot({ ...options, env: { TOVU_SITE_DIR: beta } }), beta);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("a foreign winner during launch remains protected from Stop after the losing entry is reaped", async () => {
  const state = { name: "alpha", status: "running" as const, pid: 10, port: 3456, daemonPort: null, adminUrl: "http://localhost:3456/admin/", app: "Desktop", external: true };
  let foreign: typeof state | null = null;
  const supervisor = createLocalSiteSupervisor({ servingName: "owner", scheme: "http", processPort: {
    existing: () => foreign, listExisting: () => foreign ? [foreign] : [], isPortFree: async () => true,
    launch: async () => { foreign = state; throw new Error("Running in Desktop (port 3456)."); }, schedule: () => () => {},
  } });
  assert.deepEqual(await supervisor.start({ name: "alpha" }), state);
  await assert.rejects(supervisor.stop({ name: "alpha" }), /SITE_RUNNING_ELSEWHERE/);
  await supervisor.shutdown();
});

test("Web creation refuses an unavailable home volume before initialization", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "web-home-volume-")));
  try {
    const options = { cwd: root, homeDir: root, env: {}, platform: "linux" as const }, home = path.join(root, "missing-volume", "Sites");
    createSitesWorkspace({}, options).setHome({ path: home }); let inits = 0;
    await assert.rejects(createSite({ name: "alpha" }, { ...options, initSite: async () => { inits++; throw new Error("must not initialize"); } }), {
      message: `Sites home volume is unavailable: ${home}. Mount it or choose a local folder in Sites settings.`,
    });
    assert.equal(inits, 0); assert.equal(fs.existsSync(path.dirname(home)), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});


test("deskfx2 MUST-2: ambient catalog resolution stays inside the test home", () => {
  const workspace = createSitesWorkspace({});
  assert.equal(os.homedir(), isolatedCatalogHome);
  for (const file of [workspace.config({}).appData, workspace.config({}).configPath, workspace.home({})]) {
    const relative = path.relative(isolatedCatalogHome, file);
    assert.ok(relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
  }
  const site = path.join(isolatedCatalogHome, "fixture-site");
  workspace.registry({}).merge({ entries: [{ id: "isolated-fixture", name: "Fixture", path: site, createdBy: "test", lastOpened: null }] });
  assert.equal(workspace.registry({}).list({}).some((entry) => entry.path === site), true);
});

test("nested and former-level sites remain discoverable, while non-site siblings are ignored", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sitesnest-discovery-")));
  try {
    const options = { homeDir: root, cwd: root, env: {}, platform: "linux" as const };
    const old = path.join(root, "Documents", "Tovu", "old-site"), nested = path.join(root, "Documents", "Tovu", "sites", "new-site");
    writeSite(old, "old-id"); writeSite(nested, "new-id");
    fs.mkdirSync(path.join(root, "Documents", "Tovu", "plugins"));
    fs.mkdirSync(path.join(root, "Documents", "Tovu", "sites", "partial"));
    const sites = listSites(options);
    assert.deepEqual(sites.map((site) => site.dir).sort(), [old, nested].sort());
    assert.equal(createSitesWorkspace({}, options).home({}), path.dirname(old));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});


for (const layout of ["documents", "local"]) test(`Web keeps sites listed when environment selects the ${layout} old home`, () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sitesnest2-web-override-")));
  try {
    const home = layout === "local" ? path.join(root, "Tovu") : path.join(root, "Documents", "Tovu");
    const dir = path.join(home, "alpha"); writeSite(dir, "alpha-id");
    const sites = listSites({ homeDir: root, cwd: root, env: { TOVU_SITES_HOME: home } });
    assert.equal(sites.find((site) => site.dir === dir)?.dir, dir);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("stalecard: the named default follows its moved site through the configured home, not an unrelated MRU", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "stalecard-default-")));
  try {
    const cwd = path.join(root, "repo"), home = path.join(root, "configured-sites");
    fs.mkdirSync(cwd);
    const moved = path.join(home, "tovu-dev"); writeSite(moved, "moved-id");
    const other = path.join(home, "another-site"); writeSite(other, "other-id");
    const options = { cwd, homeDir: root, env: { TOVU_SITES_HOME: home } as NodeJS.ProcessEnv };
    const workspace = createSitesWorkspace({}, options);
    workspace.registry({}).merge({ entries: [{ id: "other-id", name: "Other", path: other, createdBy: "test", lastOpened: new Date().toISOString() }] });
    assert.equal(resolveSiteRoot(options), moved);
    assert.equal(pinDefaultSiteRoot({}, options), moved);
    assert.equal(options.env.TOVU_SITE_DIR, moved);
    assert.equal(fs.existsSync(path.join(cwd, "sites")), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("import: a pinned boot inside the sites home can create sibling sites without the switcher flag", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-import-base-")));
  try {
    const cwd = path.join(root, "app"), home = path.join(root, "Desktop Sites");
    fs.mkdirSync(cwd);
    const dir = path.join(home, "alpha"); writeSite(dir, "alpha-id");
    const outside = path.join(root, "elsewhere", "beta"); writeSite(outside, "beta-id");
    // Desktop's `tovu serve <home>/<name>`: pinned, never switchable, switcher flag absent.
    const pinned = { dir, name: "alpha", dirOverridden: true, switcherCompatible: false };
    const options = { cwd, homeDir: root, env: { TOVU_SITES_HOME: home } as NodeJS.ProcessEnv };
    assert.equal(switcherBaseForBinding(pinned), null);
    assert.equal(siteCreationBaseForBinding({ binding: pinned }, options), cwd);
    assert.equal(siteCreationBaseForBinding({ binding: { ...pinned, switcherBase: path.join(root, "repo") } }, options), path.join(root, "repo"));
    assert.equal(siteCreationBaseForBinding({ binding: pinned }, { ...options, env: { ...options.env, NODE_ENV: "production" } }), null);
    // A hand-run production server (`npm start` with the shipped TOVU_RUNTIME_MODE, no NODE_ENV) is production too.
    assert.equal(siteCreationBaseForBinding({ binding: pinned }, { ...options, env: { ...options.env, TOVU_RUNTIME_MODE: "production" } }), null);
    assert.equal(siteCreationBaseForBinding({ binding: { ...pinned, dir: outside, name: "beta" } }, options), null);
    // The switcher's own base still wins when it is enabled for a switchable binding.
    const switchable = { ...pinned, switcherCompatible: true, switcherBase: path.join(root, "repo") };
    assert.equal(siteCreationBaseForBinding({ binding: switchable }, { ...options, env: { ...options.env, TOVU_ENABLE_SITE_SWITCHER: "1" } }), path.join(root, "repo"));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
