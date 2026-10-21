/** Reverses 59a036e49 (0.1.14): one Documents/Tovu home, automatic stopped-site relocation. */
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { createNodeDurableJsonPorts, type DurableJsonPorts } from "@jini-ai/platform/fs";
import { createSitesWorkspace as createDesktopWorkspace } from "./shared-sites.ts";
import { createSitesWorkspace } from "../../website/src/platform/site-dir/sites-home.ts";
import { resolveSiteRoot } from "../../website/src/platform/site-dir/site-root.ts";
// Runtime-only import: the mover's site-dir type graph reaches website DB code outside this strict desktop typecheck.
const moverModule = new URL("../../website/src/platform/site-dir/move-sites-home.ts", import.meta.url).href;
const { moveLegacySite } = await import(moverModule) as { moveLegacySite: (required: { dir: string }, options: { workspace: unknown; repoRoot: string; projectsPaths: string[] }) => Promise<string> };
import { migrateNestedSitesHome } from "./nested-sites-migration.ts";
import { trackSite, readTrackedSites, SITE_ORIGIN } from "./tracked-sites.ts";
import { discoverSiteDirs } from "./tracked-sites.ts";
const sqliteModule = createRequire(import.meta.url).resolve("better-sqlite3");

function fixture(t: TestContext, platform: "darwin" | "win32") {
  const homeDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-flat-home-")));
  t.after(() => fs.rmSync(homeDir, { recursive: true, force: true }));
  const native = (value: string) => process.platform === "win32" ? value : value.replaceAll("\\", "/");
  // Windows known-folder/config paths are translated at the filesystem port, so both policies
  // use real temporary bytes on any host; Windows resolution still uses win32 path semantics.
  const ports = createNodeDurableJsonPorts({});
  const pathMethods = new Set(["readFileSync", "mkdirSync", "openSync", "writeFileSync", "statSync", "lstatSync", "chmodSync", "rmSync"]);
  const filesystem = new Proxy(ports.filesystem, { get(target, key: keyof DurableJsonPorts["filesystem"]) {
    const method = target[key];
    if (key === "renameSync") return (from: string, to: string) => fs.renameSync(native(from), native(to));
    if (pathMethods.has(key)) return (file: string | number, ...args: unknown[]) => Reflect.apply(method, target, [typeof file === "string" ? native(file) : file, ...args]);
    return method;
  } });
  const documents = path.join(homeDir, platform === "win32" ? "Redirected" : "", "Documents");
  fs.mkdirSync(documents, { recursive: true });
  const options = { homeDir, platform, cwd: homeDir, env: { OneDrive: path.join(homeDir, "unrelated-cloud") }, sourceRoots: [], appDataDir: path.join(homeDir, "profile"),
    windowsDocuments: () => path.win32.normalize(documents), ports: { ...ports, filesystem },
    canonicalPath: ({ path: value }: { path: string }) => path.resolve(native(value)),
  };
  // Jini's lock parent creation uses host path.dirname, which cannot split a win32 path on POSIX hosts.
  fs.mkdirSync(options.appDataDir);
  const workspace = createSitesWorkspace({}, options);
  const home = path.join(documents, "Tovu"), nested = path.join(home, "sites");
  const projectsPath = path.join(homeDir, "desktop-projects.json");
  let calls = 0;
  const migrate = () => {
    const current = createSitesWorkspace({}, options);
    // Electron main admits candidates with its own workspace copy; the CLI mover re-admits with the website's.
    return migrateNestedSitesHome({ workspace: createDesktopWorkspace({}, options), projectsPath, repoRoot: homeDir, cliMode: "source" }, {
      move: async ({ dir }) => { calls++; return moveLegacySite({ dir }, { workspace: current, repoRoot: homeDir, projectsPaths: [projectsPath] }); },
      report: () => {},
    });
  };
  const site = (name: string, root = nested) => {
    const dir = path.join(root, name); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name, domain: null, port: null }));
    fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId: name, templateId: "blank", templateVersion: "1", schemaVersion: 0, schemaTag: "test", createdAt: "date" }));
    const db = new Database(path.join(dir, "content.db"));
    db.exec("CREATE TABLE content (value TEXT); INSERT INTO content VALUES ('keep');"); db.close();
    workspace.registry({}).merge({ entries: [{ id: name, name, path: dir, createdBy: "test", lastOpened: "2026-10-12T00:00:00Z" }] });
    trackSite(projectsPath, dir, SITE_ORIGIN.adopted);
    return dir;
  };
  const listed = () => discoverSiteDirs({ scanRoots: workspace.roots({}), knownDirs: workspace.registry({}).list({}).map((row) => row.path),
    classifySiteDir: (dir) => fs.existsSync(path.join(dir, ".site-meta.json")) ? "site" : "empty",
  }, { homeDir, sitesHome: home });
  return { homeDir, options, workspace, home, nested, projectsPath, site, migrate, listed, calls: () => calls };
}

for (const platform of ["darwin", "win32"] as const) {
  test(`${platform}: desktop and CLI defaults share Documents/Tovu without a subfolder`, (t) => {
    const f = fixture(t, platform);
    assert.equal(f.workspace.home({}), f.home);
    assert.equal(createDesktopWorkspace({}, f.options).home({}), f.home);
    assert.deepEqual(f.workspace.legacyHomes({}), []);
    assert.deepEqual(f.workspace.roots({}), [f.home]);
  });
  test(`${platform}: the development server still selects Documents/Tovu/tovu-dev while a nested sibling migrates`, async (t) => {
    const f = fixture(t, platform), dev = f.site("tovu-dev", f.home), nested = f.site("plannie");
    assert.equal(resolveSiteRoot(f.options), dev);
    const lease = f.workspace.claim({ path: dev, app: "Web", port: 3000 });
    try {
      await f.migrate();
      assert.equal(resolveSiteRoot(f.options), dev); assert.equal(fs.existsSync(dev), true);
      assert.equal(f.workspace.running({ path: dev }).peek({})?.token, lease.record.token);
      assert.equal(fs.existsSync(nested), false); assert.equal(fs.existsSync(path.join(f.home, "plannie")), true);
    } finally { f.workspace.running({ path: dev }).release({ token: lease.record.token }); }
  });
  test(`${platform}: stopped site moves, preserves database bytes and identity, relocates both catalogs; next launch is a no-op`, async (t) => {
    const f = fixture(t, platform), from = f.site("alpha"), to = path.join(f.home, "alpha");
    const before = fs.readFileSync(path.join(from, "content.db"));
    // 0.1.14 wrote regenerable sibling thumbnails here; they must not keep sites/ alive.
    fs.mkdirSync(path.join(f.nested, ".tovu", "site-previews"), { recursive: true }); fs.writeFileSync(path.join(f.nested, ".tovu", "site-previews", "alpha.jpg"), "jpg");
    await f.migrate();
    assert.equal(fs.existsSync(from), false); assert.equal(fs.existsSync(f.nested), false);
    assert.deepEqual(fs.readFileSync(path.join(to, "content.db")), before);
    const row = f.workspace.registry({}).list({}).find((entry) => entry.id === "alpha")!;
    assert.equal(row.path, to); assert.equal(row.lastOpened, "2026-10-12T00:00:00Z");
    assert.equal(readTrackedSites(f.projectsPath)[0]?.siteDir, to);
    assert.deepEqual(f.listed(), [to]); assert.deepEqual(f.workspace.roots({}), [f.home]);
    const catalog = fs.readFileSync(path.join(f.options.appDataDir, "sites.json"));
    await f.migrate(); assert.equal(f.calls(), 1);
    assert.deepEqual(fs.readFileSync(path.join(f.options.appDataDir, "sites.json")), catalog);
  });
  test(`${platform}: running sibling remains listed in place while a stopped sibling moves, then migrates after stop`, async (t) => {
    const f = fixture(t, platform), running = f.site("running"), stopped = f.site("stopped");
    const lease = f.workspace.claim({ path: running, app: "Web", port: 3000 }); assert.equal(lease.acquired, true);
    await f.migrate();
    assert.equal(fs.existsSync(running), true); assert.equal(fs.existsSync(stopped), false);
    assert.equal(f.workspace.registry({}).list({}).find((row) => row.id === "running")?.path, running);
    assert.deepEqual(f.listed(), [running, path.join(f.home, "stopped")].sort());
    assert.deepEqual(f.workspace.roots({}), [f.home, f.nested]);
    f.workspace.running({ path: running }).release({ token: lease.record.token });
    await f.migrate(); assert.equal(fs.existsSync(running), false); assert.equal(fs.existsSync(f.nested), false);
  });
  test(`${platform}: target collision (including dangling symlink) never overwrites; other sites still move`, async (t) => {
    const f = fixture(t, platform), from = f.site("clash"), free = f.site("free");
    const to = path.join(f.home, "clash"); fs.mkdirSync(to); fs.writeFileSync(path.join(to, "keep"), "original");
    await f.migrate();
    assert.equal(fs.readFileSync(path.join(to, "keep"), "utf8"), "original"); assert.equal(fs.existsSync(from), true);
    assert.equal(fs.existsSync(free), false); assert.equal(f.workspace.registry({}).list({}).find((row) => row.id === "clash")?.path, from);
    assert.ok(f.listed().includes(from));
    fs.rmSync(to, { recursive: true }); fs.symlinkSync(path.join(f.homeDir, "absent"), to, "junction");
    await f.migrate(); assert.equal(fs.lstatSync(to).isSymbolicLink(), true); assert.equal(fs.existsSync(from), true);
  });
  test(`${platform}: SQLite lock or live WAL holder refuses relocation; an unclean stop's WAL is folded in and the site moves`, async (t) => {
    const f = fixture(t, platform), from = f.site("locked"), file = path.join(from, "content.db"), db = new Database(file);
    try {
      db.exec("BEGIN EXCLUSIVE;");
      await f.migrate(); assert.equal(fs.existsSync(from), true); assert.ok(f.listed().includes(from));
      db.exec("ROLLBACK;");
    } finally { db.close(); }
    // Another process holds the DB in WAL mode with a row committed only to its WAL.
    const holder = spawn(process.execPath, ["-e", `const D = require(${JSON.stringify(sqliteModule)}); const db = new D(${JSON.stringify(file)});
      db.pragma("journal_mode = WAL"); db.exec("INSERT INTO content VALUES ('wal-only')"); console.log("ready"); setInterval(() => {}, 1000);`]);
    t.after(() => holder.kill("SIGKILL"));
    await once(holder.stdout, "data");
    await f.migrate();
    assert.equal(fs.existsSync(from), true); assert.ok(fs.statSync(file + "-wal").size > 0);
    assert.equal(f.workspace.registry({}).list({})[0]?.path, from);
    // SIGKILL leaves WAL+SHM behind with no process holding the DB.
    holder.kill("SIGKILL"); await once(holder, "exit");
    assert.ok(fs.existsSync(file + "-wal") && fs.existsSync(file + "-shm"));
    await f.migrate();
    const to = path.join(f.home, "locked", "content.db");
    assert.equal(fs.existsSync(from), false); assert.equal(f.workspace.registry({}).list({})[0]?.path, path.dirname(to));
    for (const suffix of ["-wal", "-shm"]) assert.equal(fs.existsSync(to + suffix), false);
    const moved = new Database(to, { readonly: true });
    try { assert.deepEqual(moved.prepare("SELECT value FROM content").pluck().all(), ["keep", "wal-only"]); } finally { moved.close(); }
  });
  test(`${platform}: a creation lock skips the site and retries after release; an empty container is removed`, async (t) => {
    const f = fixture(t, platform), from = f.site("alpha"), lock = path.join(f.home, "alpha.creation.lock");
    fs.writeFileSync(lock, "keep lock");
    await f.migrate(); assert.equal(f.calls(), 0); assert.ok(f.listed().includes(from));
    assert.equal(fs.readFileSync(lock, "utf8"), "keep lock");
    fs.unlinkSync(lock); await f.migrate(); assert.equal(fs.existsSync(f.nested), false);
    fs.mkdirSync(f.nested); await f.migrate(); assert.equal(fs.existsSync(f.nested), false);
  });
  test(`${platform}: one failed relocation keeps its source and catalog while a healthy sibling moves; retry succeeds`, async (t) => {
    const f = fixture(t, platform), failed = f.site("failed"), healthy = f.site("healthy");
    const catalog = path.join(f.options.appDataDir, "sites.json");
    const basePorts = f.options.ports;
    let refusal = true;
    const ports = { ...basePorts, filesystem: { ...basePorts.filesystem, renameSync: (from: fs.PathLike, to: fs.PathLike) => {
      if (String(to).replaceAll("\\", "/") === catalog && refusal) { refusal = false; throw new Error("Catalog unavailable"); }
      basePorts.filesystem.renameSync(from, to);
    } } };
    const current = createSitesWorkspace({}, { ...f.options, ports });
    await migrateNestedSitesHome({ workspace: current, projectsPath: f.projectsPath, repoRoot: f.homeDir, cliMode: "source" }, {
      move: ({ dir }) => moveLegacySite({ dir }, { workspace: current, repoRoot: f.homeDir, projectsPaths: [f.projectsPath] }), report: () => {},
    });
    assert.equal(fs.existsSync(failed), true); assert.equal(fs.existsSync(healthy), false);
    assert.equal(f.workspace.registry({}).list({}).find((row) => row.id === "failed")?.path, failed);
    assert.ok(f.listed().includes(failed));
    await f.migrate(); assert.equal(fs.existsSync(failed), false); assert.equal(fs.existsSync(f.nested), false);
  });
  test(`${platform}: saved custom home and environment overrides are left untouched`, async (t) => {
    const f = fixture(t, platform), from = f.site("alpha"), custom = path.join(f.homeDir, "custom");
    f.workspace.setHome({ path: custom });
    const config = fs.readFileSync(path.join(f.options.appDataDir, "config.json"));
    await f.migrate(); assert.equal(f.calls(), 0); assert.equal(fs.existsSync(from), true);
    assert.equal(f.workspace.home({}), custom); assert.deepEqual(fs.readFileSync(path.join(f.options.appDataDir, "config.json")), config);
    const override = createSitesWorkspace({}, { ...f.options, env: { ...f.options.env, TOVU_SITES_HOME: f.home } });
    await migrateNestedSitesHome({ workspace: override, projectsPath: f.projectsPath, repoRoot: f.homeDir, cliMode: "source" }, { move: async () => assert.fail("explicit homes must not migrate"), report: () => {} });
    assert.equal(fs.existsSync(from), true); assert.equal(override.home({}), f.home);
  });
  test(`${platform}: non-site files keep sites/ intact and an unregistered skipped site remains discoverable`, async (t) => {
    const f = fixture(t, platform), from = f.site("alpha");
    f.workspace.registry({}).remove({ path: from });
    const to = path.join(f.home, "alpha"); fs.mkdirSync(to);
    fs.writeFileSync(path.join(f.nested, "keep.txt"), "keep");
    await f.migrate(); assert.ok(f.listed().includes(from));
    assert.equal(fs.readFileSync(path.join(f.nested, "keep.txt"), "utf8"), "keep");
    fs.rmSync(to, { recursive: true }); fs.rmSync(path.join(f.nested, "keep.txt"));
    fs.mkdirSync(path.join(f.nested, ".tovu", "site-keys"), { recursive: true }); fs.writeFileSync(path.join(f.nested, ".tovu", "site-keys", "k.hex"), "key");
    await f.migrate(); assert.equal(fs.readFileSync(path.join(f.nested, ".tovu", "site-keys", "k.hex"), "utf8"), "key");
  });
  test(`${platform}: a saved legacy Tovu Sites home remains honored; ~/.tovu is only a catalog import`, async (t) => {
    const f = fixture(t, platform), legacy = path.join(f.homeDir, "Tovu Sites");
    f.workspace.setHome({ path: legacy });
    assert.equal(createSitesWorkspace({}, f.options).home({}), legacy);
    await f.migrate(); assert.equal(f.calls(), 0);
    const legacySettings = path.join(f.homeDir, ".tovu", "sites-home.json"); fs.mkdirSync(path.dirname(legacySettings));
    fs.writeFileSync(legacySettings, JSON.stringify({ home: path.join(f.homeDir, "catalog-only") }));
    fs.rmSync(path.join(f.options.appDataDir, "config.json"));
    assert.equal(createSitesWorkspace({}, f.options).home({}), f.home);
  });
}

/** A hand-written workspace for the failure paths: a fixed nested root and home, nothing running, no locks. */
function failureFixture(t: TestContext) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-nested-failures-")));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, "Tovu", "sites"), home = path.join(base, "Tovu");
  fs.mkdirSync(root, { recursive: true });
  const reports: string[] = [];
  const moved: string[] = [];
  const workspace = (overrides: { root?: string; home?: string } = {}) => ({
    nestedSitesRoot: () => overrides.root ?? root,
    home: () => overrides.home ?? home,
    running: () => ({ peek: () => null }),
    config: () => ({ configPath: path.join(base, "profile", "sites-home.json") }),
  });
  const migrate = (
    ws: ReturnType<typeof workspace>,
    options: Partial<Parameters<typeof migrateNestedSitesHome>[1] & object> = {},
  ) => migrateNestedSitesHome({ workspace: ws, repoRoot: base, cliMode: "source", projectsPath: path.join(base, "projects.json") }, {
    move: async ({ dir }) => { moved.push(dir); return dir; }, report: (message) => reports.push(message), ...options,
  });
  return { base, root, home, reports, moved, workspace, migrate };
}

test("a former sites folder that cannot be read is reported once, and startup carries on", async (t) => {
  const f = failureFixture(t);
  await f.migrate(f.workspace({ root: path.join(f.base, "gone") }));
  assert.deepEqual(f.reports, ["Tovu could not inspect the former sites folder; existing website paths remain available."]);
  assert.deepEqual(f.moved, []);
});

test("a target name that cannot be inspected keeps that site in place with the reason, and nothing is moved", async (t) => {
  const f = failureFixture(t);
  fs.mkdirSync(path.join(f.root, "alpha"));
  // A home that is a FILE makes lstat(home/alpha) fail with ENOTDIR, not ENOENT: unknown is never "free".
  const fileHome = path.join(f.base, "not-a-folder");
  fs.writeFileSync(fileHome, "");
  await f.migrate(f.workspace({ home: fileHome }));
  assert.deepEqual(f.moved, []);
  assert.equal(f.reports.length, 1);
  assert.match(f.reports[0]!, new RegExp(`^Tovu kept ${path.join(f.root, "alpha").replaceAll("\\", "\\\\")} in place; automatic relocation will retry next launch\\. .*ENOTDIR`));
  assert.equal(fs.existsSync(path.join(f.root, "alpha")), true);
});

test("a mover that rejects with a non-Error value is reported with that value", async (t) => {
  const f = failureFixture(t);
  fs.mkdirSync(path.join(f.root, "alpha"));
  await f.migrate(f.workspace(), { move: () => Promise.reject("site busy") });
  assert.deepEqual(f.reports, [`Tovu kept ${path.join(f.root, "alpha")} in place; automatic relocation will retry next launch. site busy`]);
});

test("a .tovu that is a file, not the regenerable cache folder, is kept and so is the container — silently", async (t) => {
  const f = failureFixture(t);
  fs.writeFileSync(path.join(f.root, ".tovu"), "not a cache");
  await f.migrate(f.workspace());
  assert.equal(fs.readFileSync(path.join(f.root, ".tovu"), "utf8"), "not a cache");
  assert.deepEqual(f.reports, [], "a non-empty container is an expected keep, not a failure");
});

test("a container that cannot be removed for any reason but non-empty/gone is reported, even with no error code", async (t) => {
  for (const failure of [Object.assign(new Error("operation not permitted"), { code: "EPERM" }), new Error("no code at all")]) {
    const f = failureFixture(t);
    const removed: string[] = [];
    await f.migrate(f.workspace(), { removeDir: (dir) => { removed.push(dir); throw failure; } });
    assert.deepEqual(removed, [f.root]);
    assert.deepEqual(f.reports, ["Tovu kept the former sites folder because it could not be removed safely."]);
  }
  for (const code of ["ENOTEMPTY", "EEXIST", "ENOENT"]) {
    const f = failureFixture(t);
    await f.migrate(f.workspace(), { removeDir: () => { throw Object.assign(new Error(code), { code }); } });
    assert.deepEqual(f.reports, [], `${code} is an expected keep`);
  }
});
