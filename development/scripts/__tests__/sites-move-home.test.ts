import "../../../apps/website/src/platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createSitesWorkspace } from "../../../apps/website/src/platform/site-dir/sites-home.js";
import { resolveSiteDatabasePaths } from "../../../apps/website/src/platform/site-dir/site-databases.js";
import { moveSitesHome, planSitesMove, inspectStoppedDatabase, parseSitesMoveArgs } from "../sites-move-home.js";
import { moveLegacySite } from "../../../apps/website/src/platform/site-dir/move-sites-home.js";
import { createNodeDurableJsonPorts, directoryFingerprint, moveDirectoryVerified } from "@jini-ai/platform/fs";
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-move-home2-"))), repoRoot = path.join(root, "repo"), dir = path.join(root, "Documents", "Tovu", "sites", "alpha");
  const workspace = createSitesWorkspace({}, { homeDir: root, cwd: repoRoot, env: {}, platform: "linux" });
  fs.mkdirSync(path.join(root, "Documents"));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: "Alpha", domain: null, port: null }));
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId: "alpha-id", templateId: "blank", templateVersion: "1", schemaVersion: 0, schemaTag: "test", createdAt: "2026-10-09" }));
  for (const filename of ["content.db", "chat.db"]) {
    const db = new Database(path.join(dir, filename));
    db.exec('CREATE TABLE "quoted""name" (id INTEGER); INSERT INTO "quoted""name" VALUES (1), (2);'); db.close();
  }
  return { root, repoRoot, dir, workspace, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
test("dry run never opens a DB, cleans a stale lease, creates config/catalog or stops a process", async () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.dir, ".tovu-running.json"), JSON.stringify({ pid: 2147483647, port: 3000, app: "Web", started: "2026-10-09", token: "stale", scheme: "http" }));
    const before = directoryFingerprint({ dir: f.dir });
    const plans = await moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, verifyDatabase: () => { throw new Error("Must not open a DB during dry run"); }, stop: async () => { throw new Error("Must not stop"); } });
    assert.equal(plans[0]?.to, path.join(f.root, "Documents", "Tovu", "alpha")); assert.equal(plans[0]?.databases.length, 2);
    assert.equal(directoryFingerprint({ dir: f.dir }), before); assert.equal(fs.existsSync(f.workspace.config({}).appData), false);
    assert.equal(fs.existsSync(path.join(f.workspace.home({}), "alpha")), false);
  } finally { f.cleanup(); }
});
test("planning skips dot-folder caches and stray folders without changing the former home", () => {
  const f = fixture();
  try {
    const cache = path.join(path.dirname(f.dir), ".tovu"), stray = path.join(path.dirname(f.dir), "stray"), hidden = path.join(path.dirname(f.dir), ".hidden");
    fs.mkdirSync(cache); fs.mkdirSync(stray); fs.mkdirSync(hidden);
    fs.writeFileSync(path.join(hidden, "config.json"), "cache bytes, not site config");
    fs.writeFileSync(path.join(cache, "preview.png"), "cached preview");
    const before = directoryFingerprint({ dir: path.dirname(f.dir) });
    const skipped: string[] = [];
    const plans = planSitesMove({ repoRoot: f.repoRoot }, { workspace: f.workspace, onSkipped: ({ dir }) => { skipped.push(dir); } });
    assert.deepEqual(plans.map((plan) => plan.from), [f.dir]);
    assert.deepEqual(skipped.sort(), [cache, stray, hidden].sort());
    assert.equal(directoryFingerprint({ dir: path.dirname(f.dir) }), before);
    assert.equal(fs.existsSync(path.join(f.workspace.home({}), "alpha")), false);
  } finally { f.cleanup(); }
});
test("--site limits planning and dry runs, and repeated names never duplicate a move", async () => {
  const f = fixture();
  try {
    const beta = path.join(path.dirname(f.dir), "beta");
    fs.cpSync(f.dir, beta, { recursive: true });
    const meta = JSON.parse(fs.readFileSync(path.join(beta, ".site-meta.json"), "utf8"));
    fs.writeFileSync(path.join(beta, ".site-meta.json"), JSON.stringify({ ...meta, siteId: "beta-id" }));
    const selected = parseSitesMoveArgs({ argv: ["--site", "beta"] });
    assert.deepEqual(planSitesMove({ repoRoot: f.repoRoot }, { workspace: f.workspace, sites: selected.sites }).map((plan) => plan.from), [beta]);
    assert.deepEqual((await moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, ...selected })).map((plan) => plan.from), [beta]);
    const repeated = parseSitesMoveArgs({ argv: ["--site", "alpha", "--site", "beta", "--site", "alpha"] });
    assert.deepEqual(planSitesMove({ repoRoot: f.repoRoot }, { workspace: f.workspace, sites: repeated.sites }).map((plan) => plan.from).sort(), [f.dir, beta].sort());
    assert.equal(planSitesMove({ repoRoot: f.repoRoot }, { workspace: f.workspace }).length, 2);
    // An unselected real site still cannot block the selected site with a collision or bad metadata.
    fs.mkdirSync(path.join(f.workspace.home({}), "alpha"), { recursive: true });
    fs.writeFileSync(path.join(f.dir, ".site-meta.json"), "broken");
    assert.equal(planSitesMove({ repoRoot: f.repoRoot }, { workspace: f.workspace, sites: selected.sites }).length, 1);
    assert.throws(() => planSitesMove({ repoRoot: f.repoRoot }, { workspace: f.workspace }), /not valid JSON/);
  } finally { f.cleanup(); }
});
test("move CLI defaults to all sites and dry run, supports help/apply, and rejects malformed flags", () => {
  assert.deepEqual(parseSitesMoveArgs({ argv: [] }), { apply: false, help: false, sites: [] });
  assert.deepEqual(parseSitesMoveArgs({ argv: ["--help"] }), { apply: false, help: true, sites: [] });
  assert.deepEqual(parseSitesMoveArgs({ argv: ["--apply", "--site=alpha"] }), { apply: true, help: false, sites: ["alpha"] });
  for (const argv of [["--site"], ["--site", "--apply"], ["--unknown"], ["alpha"]]) {
    assert.throws(() => parseSitesMoveArgs({ argv }), TypeError);
  }
});
test("--help prints usage and flags without planning against an invalid sites home", () => {
  const script = fileURLToPath(new URL("../sites-move-home.ts", import.meta.url));
  const repoRoot = path.resolve(path.dirname(script), "../..");
  const output = execFileSync(process.execPath, ["--import", "tsx", script, "--help"], {
    cwd: repoRoot, encoding: "utf8", env: { ...process.env, TOVU_SITES_HOME: path.join(repoRoot, "sites") },
  });
  assert.match(output, /Usage: npm run sites:move-home/);
  assert.match(output, /--site <name>/); assert.match(output, /--apply/); assert.match(output, /--help/);
  assert.match(output, /Default: all sites, dry run only/);
  assert.doesNotMatch(output, /Would move:|Moved:/);
});
for (const databases of ["inSite", "appData"] as const) test(`apply verifies both DBs, backs up only database-placement moves and updates the registry with ${databases}`, async () => {
  const f = fixture();
  try {
    f.workspace.updateConfig({ patch: { databases } });
    const before = new Map(["content.db", "chat.db"].map((name) => [name, inspectStoppedDatabase({ path: path.join(f.dir, name) })]));
    await moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, apply: true });
    const target = path.join(f.workspace.home({}), "alpha"), paths = resolveSiteDatabasePaths({ dir: target }, { workspace: f.workspace });
    for (const file of [paths.contentDbPath, paths.chatDbPath]) {
      assert.equal(inspectStoppedDatabase({ path: file }), before.get(path.basename(file)));
      if (databases === "appData") {
        const backups = fs.readdirSync(target).filter((name) => name.startsWith(path.basename(file) + ".relocation-") && name.endsWith("-backup"));
        assert.equal(backups.length, 1);
        assert.equal(inspectStoppedDatabase({ path: path.join(target, backups[0]!) }), before.get(path.basename(file)));
        assert.equal(fs.existsSync(path.join(target, path.basename(file))), false);
      } else {
        assert.equal(file, path.join(target, path.basename(file)));
        assert.equal(fs.readdirSync(target).some((name) => name.endsWith("-backup")), false);
      }
    }
    assert.equal(fs.existsSync(f.dir), false); assert.equal(f.workspace.registry({}).list({})[0]?.path, target);
    assert.equal(f.workspace.running({ path: target }).peek({}), null); assert.equal(f.workspace.running({ path: f.dir }).peek({}), null);
  } finally { f.cleanup(); }
});
test("apply refuses every running site before changing any batch item, and never uses its stop port", async () => {
  const f = fixture();
  try {
    const live = f.workspace.claim({ path: f.dir, app: "Web", port: 3456 });
    const before = directoryFingerprint({ dir: f.dir }); let stopped = 0;
    await assert.rejects(moveSitesHome({ repoRoot: f.repoRoot }, { apply: true, workspace: f.workspace, stop: async () => { stopped++; } }), { message: `Site is running in Web: ${f.dir}. Stop it before moving it.` });
    assert.equal(stopped, 0); assert.equal(directoryFingerprint({ dir: f.dir }), before);
    assert.equal(f.workspace.running({ path: f.dir }).peek({})?.token, live.record.token);
    f.workspace.running({ path: f.dir }).release({ token: live.record.token });
  } finally { f.cleanup(); }
});
test("corrupt DB refuses apply, rolls back the folder and leaves the source catalog usable", async () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.dir, "chat.db"), "corrupt database");
    const before = directoryFingerprint({ dir: f.dir });
    await assert.rejects(moveSitesHome({ repoRoot: f.repoRoot }, { apply: true, workspace: f.workspace }));
    assert.equal(fs.existsSync(f.dir), true); assert.equal(directoryFingerprint({ dir: f.dir }), before);
    assert.deepEqual(f.workspace.registry({}).list({}), []);
    assert.equal(fs.existsSync(path.join(f.workspace.home({}), "alpha")), false);
  } finally { f.cleanup(); }
});
test("dry run refuses a colliding site destination without overwriting it", () => {
  const f = fixture();
  try {
    const target = path.join(f.workspace.home({}), "alpha"); fs.mkdirSync(target, { recursive: true }); fs.writeFileSync(path.join(target, "owner.txt"), "keep");
    assert.throws(() => planSitesMove({ repoRoot: f.repoRoot }, { workspace: f.workspace }), { message: `Move target already exists: ${target}` });
    assert.equal(fs.readFileSync(path.join(target, "owner.txt"), "utf8"), "keep");
  } finally { f.cleanup(); }
});

for (const suffix of ["-wal", "-shm"]) test(`apply refuses surviving ${suffix} without changing either database`, async () => {
  const f = fixture();
  const file = path.join(f.dir, "content.db");
  const writer = new Database(file);
  try {
    // b693fbcf0 recovers a stopped database's leftover journals. A live writer must
    // still be refused before its WAL/SHM or committed content can be changed.
    writer.pragma("journal_mode = WAL");
    writer.exec('INSERT INTO "quoted""name" VALUES (3); BEGIN IMMEDIATE');
    assert.equal(fs.existsSync(file + suffix), true);
    const before = directoryFingerprint({ dir: f.dir });
    await assert.rejects(moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, apply: true }), {
      message: `Database is open in another process: ${file}. Stop it before moving it.`,
    });
    assert.equal(directoryFingerprint({ dir: f.dir }), before);
    assert.equal(fs.existsSync(path.join(f.workspace.home({}), "alpha")), false);
  } finally { writer.exec("ROLLBACK"); writer.close(); f.cleanup(); }
});
test("a released host with no lease but an exclusive SQLite transaction refuses the entire move", async () => {
  const f = fixture(), file = path.join(f.dir, "content.db"), writer = new Database(file);
  try {
    writer.exec("BEGIN EXCLUSIVE");
    await assert.rejects(moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, apply: true }), {
      message: `Database is open in another process: ${file}. Stop it before moving it.`,
    });
    assert.equal(fs.existsSync(f.dir), true); assert.equal(fs.existsSync(path.join(f.workspace.home({}), "alpha")), false);
    assert.equal(f.workspace.running({ path: f.dir }).peek({}), null);
  } finally { writer.exec("ROLLBACK"); writer.close(); f.cleanup(); }
});

test("dry-run appData planning reserves no identity, and corrupt user settings are never quarantined by discovery", async () => {
  const f = fixture();
  try {
    f.workspace.updateConfig({ patch: { databases: "appData" } });
    const target = path.join(f.workspace.config({}).appData, "databases", "alpha-id"); fs.mkdirSync(target, { recursive: true });
    for (const filename of ["content.db", "chat.db"]) fs.renameSync(path.join(f.dir, filename), path.join(target, filename));
    await moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace });
    assert.equal(fs.existsSync(path.join(f.workspace.config({}).appData, "sites.json")), false);
    const config = f.workspace.config({}).configPath; fs.writeFileSync(config, "{broken");
    await moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace });
    assert.equal(fs.readFileSync(config, "utf8"), "{broken");
    assert.equal(fs.readdirSync(path.dirname(config)).some((name) => name.startsWith("config.json.corrupt-")), false);
  } finally { f.cleanup(); }
});

test("apply refuses an unavailable home before a lock can create its volume directories", async () => {
  const f = fixture();
  try {
    const home = path.join(f.root, "unmounted", "Sites"); f.workspace.setHome({ path: home });
    await assert.rejects(moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, apply: true }), {
      message: `Sites home volume is unavailable: ${home}. Mount it or choose a local folder in Sites settings.`,
    });
    assert.equal(fs.existsSync(path.dirname(home)), false); assert.equal(fs.existsSync(f.dir), true);
    assert.equal(fs.existsSync(home + ".move.lock"), false);
  } finally { f.cleanup(); }
});


test("deskfx S6: readonly WAL inspection leaves no sidecars and preserves existing journals", () => {
  const f = fixture();
  try {
    const file = path.join(f.dir, "content.db");
    const db = new Database(file); db.pragma("journal_mode = WAL"); db.close();
    assert.equal(fs.existsSync(file + "-wal"), false); assert.equal(fs.existsSync(file + "-shm"), false);
    const before = fs.readFileSync(file); const counts = inspectStoppedDatabase({ path: file });
    assert.equal(JSON.parse(counts).find((table: { name: string; rowCount: number }) => table.name === 'quoted"name')?.rowCount, 2); assert.deepEqual(fs.readFileSync(file), before);
    assert.equal(fs.existsSync(file + "-wal"), false); assert.equal(fs.existsSync(file + "-shm"), false);
    const live = new Database(file); live.pragma("journal_mode = WAL"); live.exec('INSERT INTO "quoted""name" VALUES (3)');
    try {
      assert.equal(fs.existsSync(file + "-wal"), true);
      inspectStoppedDatabase({ path: file });
      assert.equal(fs.existsSync(file + "-wal"), true); assert.equal(fs.existsSync(file + "-shm"), true);
    } finally { live.close(); }
  } finally { f.cleanup(); }
});

test("deskfx S6: moving a stopped WAL-mode site needs no DB copies or backups", async () => {
  const f = fixture();
  try {
    for (const name of ["content.db", "chat.db"]) { const db = new Database(path.join(f.dir, name)); db.pragma("journal_mode = WAL"); db.close(); }
    await moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, apply: true });
    const dir = path.join(f.workspace.home({}), "alpha");
    const files = fs.readdirSync(dir, { recursive: true }).map(String);
    for (const name of ["content.db", "chat.db"]) {
      assert.equal(files.filter((entry) => entry.includes(name) && entry.endsWith("-backup")).length, 0);
      assert.equal(files.some((entry) => entry.endsWith(name + "-wal") || entry.endsWith(name + "-shm")), false);
      assert.equal(JSON.parse(inspectStoppedDatabase({ path: path.join(dir, name) })).find((table: { name: string; rowCount: number }) => table.name === 'quoted"name')?.rowCount, 2);
    }
  } finally { f.cleanup(); }
});

/** Select the released 0.1.14 nested fixture without touching any real home. */
function oldLevel(f: ReturnType<typeof fixture>): string {
  const dir = path.join(f.root, "Documents", "Tovu", "sites", "alpha");
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  if (f.dir !== dir) fs.renameSync(f.dir, dir);
  return dir;
}
test("nested-default detection ignores siblings and moves only valid marker-bearing sites", () => {
  const f = fixture();
  try {
    const dir = oldLevel(f), parent = path.dirname(dir);
    fs.mkdirSync(path.join(parent, "plugins")); fs.mkdirSync(path.join(parent, "templates"));
    fs.mkdirSync(path.join(parent, "partial")); fs.writeFileSync(path.join(parent, "partial", "config.json"), "{}");
    const before = directoryFingerprint({ dir: parent });
    const plans = planSitesMove({ repoRoot: f.repoRoot }, { workspace: f.workspace });
    assert.deepEqual(plans.map((plan) => [plan.from, plan.to]), [[dir, path.join(f.workspace.home({}), "alpha")]]);
    assert.equal(directoryFingerprint({ dir: parent }), before);
  } finally { f.cleanup(); }
});
test("nested-default apply updates shared catalog, every desktop profile and saved site roots; re-run is empty", async () => {
  const f = fixture();
  try {
    const dir = oldLevel(f), to = path.join(f.workspace.home({}), "alpha");
    f.workspace.updateConfig({ patch: { siteRoots: [dir, path.join(dir, "uploads"), path.join(f.root, "unrelated")] } });
    f.workspace.registry({}).merge({ entries: [{ id: "alpha-id", name: "Alpha", path: dir, createdBy: "Desktop", lastOpened: "2026-10-09T00:00:00Z" }] });
    const projectsPaths = [...f.workspace.projectsPaths, path.join(f.root, "custom-profile", "desktop-projects.json")];
    const original = { siteDir: dir, createdAt: "2026-10-01", origin: "created", siteId: "alpha-id", displayNameAlias: "My Alpha" };
    for (const file of projectsPaths) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ projects: [original], dismissed: [dir, "/other"], extension: "keep" }));
    }
    const plans = await moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, apply: true, projectsPaths });
    assert.deepEqual(plans.map((plan) => plan.from), [dir]); assert.equal(fs.existsSync(dir), false);
    assert.deepEqual(f.workspace.registry({}).list({}), [{ id: "alpha-id", name: "Alpha", path: to, createdBy: "Desktop", lastOpened: "2026-10-09T00:00:00Z" }]);
    assert.deepEqual(f.workspace.config({}).siteRoots, [to, path.join(to, "uploads"), path.join(f.root, "unrelated")]);
    assert.equal(JSON.parse(fs.readFileSync(f.workspace.config({}).configPath, "utf8")).sitesHome, undefined);
    for (const file of projectsPaths) assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { projects: [{ ...original, siteDir: to }], dismissed: [to, "/other"], extension: "keep" });
    const files = fs.readdirSync(to, { recursive: true }).map(String);
    for (const name of ["content.db", "chat.db"]) assert.equal(files.filter((file) => file.includes(name) && file.endsWith("-backup")).length, 0);
    const before = directoryFingerprint({ dir: f.root });
    assert.deepEqual(await moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, apply: true, projectsPaths }), []);
    assert.equal(directoryFingerprint({ dir: f.root }), before);
  } finally { f.cleanup(); }
});
test("a mixed batch skips and reports a running nested-default site while moving its stopped sibling", async () => {
  const f = fixture();
  try {
    const dir = oldLevel(f), beta = path.join(path.dirname(dir), "beta");
    fs.cpSync(dir, beta, { recursive: true });
    const meta = JSON.parse(fs.readFileSync(path.join(beta, ".site-meta.json"), "utf8"));
    fs.writeFileSync(path.join(beta, ".site-meta.json"), JSON.stringify({ ...meta, siteId: "beta-id" }));
    const lease = f.workspace.claim({ path: dir, app: "Desktop", port: 3456 });
    const before = directoryFingerprint({ dir }); const skipped: string[] = [];
    const plans = await moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, apply: true, onRunning: ({ dir }) => skipped.push(dir) });
    assert.deepEqual(plans.map((plan) => plan.from), [beta]); assert.deepEqual(skipped, [dir]);
    assert.equal(directoryFingerprint({ dir }), before); assert.equal(f.workspace.running({ path: dir }).peek({})?.token, lease.record.token);
    assert.equal(fs.existsSync(path.join(f.workspace.home({}), "beta")), true);
    f.workspace.running({ path: dir }).release({ token: lease.record.token });
  } finally { f.cleanup(); }
});
test("a failed registry replacement restores all paths and the verified move, then retry succeeds", async () => {
  const f = fixture();
  try {
    const dir = oldLevel(f), to = path.join(f.workspace.home({}), "alpha"), projects = path.join(f.root, "profile", "desktop-projects.json");
    f.workspace.updateConfig({ patch: { siteRoots: [dir] } });
    f.workspace.registry({}).merge({ entries: [{ id: "alpha-id", name: "Alpha", path: dir, createdBy: "Desktop", lastOpened: null }] });
    fs.mkdirSync(path.dirname(projects)); fs.writeFileSync(projects, JSON.stringify({ projects: [{ siteDir: dir, createdAt: "date", origin: "adopted" }] }));
    const before = directoryFingerprint({ dir });
    const ports = createNodeDurableJsonPorts({}); let failed = false;
    const catalog = path.join(f.workspace.config({}).appData, "sites.json");
    ports.filesystem = { ...ports.filesystem, renameSync: (from, target) => {
      if (String(target) === catalog && !failed) { failed = true; throw new Error("catalog disk full"); }
      fs.renameSync(from, target);
    } };
    const workspace = createSitesWorkspace({}, { homeDir: f.root, cwd: f.repoRoot, env: {}, platform: "linux", ports });
    await assert.rejects(moveSitesHome({ repoRoot: f.repoRoot }, { workspace, apply: true, projectsPaths: [projects] }), /catalog disk full/);
    assert.equal(directoryFingerprint({ dir }), before); assert.equal(fs.existsSync(to), false);
    assert.equal(f.workspace.registry({}).list({})[0]?.path, dir); assert.deepEqual(f.workspace.config({}).siteRoots, [dir]);
    assert.equal(JSON.parse(fs.readFileSync(projects, "utf8")).projects[0].siteDir, dir);
    await moveSitesHome({ repoRoot: f.repoRoot }, { workspace, apply: true, projectsPaths: [projects] });
    assert.equal(JSON.parse(fs.readFileSync(projects, "utf8")).projects[0].siteDir, to);
  } finally { f.cleanup(); }
});
test("invalid desktop catalogs abort the move and keep their original bytes", async () => {
  const f = fixture();
  try {
    const dir = oldLevel(f), file = path.join(f.root, "desktop-projects.json"), before = directoryFingerprint({ dir });
    fs.writeFileSync(file, JSON.stringify({ projects: "unknown records" }));
    await assert.rejects(moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, apply: true, projectsPaths: [file] }), /Desktop projects catalog is invalid/);
    assert.equal(directoryFingerprint({ dir }), before); assert.equal(fs.readFileSync(file, "utf8"), JSON.stringify({ projects: "unknown records" }));
    assert.deepEqual(f.workspace.registry({}).list({}), []);
  } finally { f.cleanup(); }
});


test("partial cross-volume copy failure keeps nested-default paths and bytes intact", async () => {
  const f = fixture();
  try {
    const dir = oldLevel(f), to = path.join(f.workspace.home({}), "alpha");
    f.workspace.updateConfig({ patch: { siteRoots: [dir] } });
    f.workspace.registry({}).merge({ entries: [{ id: "alpha-id", name: "Alpha", path: dir, createdBy: "test", lastOpened: null }] });
    const before = directoryFingerprint({ dir });
    const filesystem: typeof fs = { ...fs, renameSync: (from, target) => {
      if (String(from) === dir && String(target) === to) throw Object.assign(new Error("cross-volume"), { code: "EXDEV" });
      fs.renameSync(from, target);
    // Jini 03c49210 copies per top-level entry (target = <to>/<entry>), so the partial bytes land beside it in the reserved root.
    }, cpSync: (_source, target) => { fs.writeFileSync(path.join(path.dirname(String(target)), "partial"), "bytes"); throw new Error("copy failed"); } };
    await assert.rejects(moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, apply: true,
      relocateDirectory: (required, options) => moveDirectoryVerified(required, { ...options, filesystem }),
    }), /copy failed/);
    assert.equal(directoryFingerprint({ dir }), before); assert.equal(fs.existsSync(to), false);
    assert.equal(f.workspace.registry({}).list({})[0]?.path, dir); assert.deepEqual(f.workspace.config({}).siteRoots, [dir]);
  } finally { f.cleanup(); }
});


test("the desktop CLI command invokes verified migration and returns its destination contract", () => {
  const f = fixture();
  try {
    const dir = oldLevel(f), to = path.join(f.workspace.home({}), "alpha"), projects = path.join(f.root, "profile", "desktop-projects.json");
    fs.mkdirSync(path.dirname(projects)); fs.writeFileSync(projects, JSON.stringify({ projects: [{ siteDir: dir, createdAt: "date", origin: "adopted" }] }));
    const cli = fileURLToPath(new URL("../../../apps/website/src/cli/main.ts", import.meta.url));
    const output = execFileSync(process.execPath, ["--import", "tsx", cli, "sites", "move-home", dir, "--projects-path", projects], {
      cwd: path.resolve(path.dirname(cli), "../../../.."), timeout: 120000, encoding: "utf8",
      env: { ...process.env, HOME: f.root, USERPROFILE: f.root, XDG_DATA_HOME: path.join(f.root, ".local", "share"),
        XDG_CONFIG_HOME: path.join(f.root, ".config"), APPDATA: path.join(f.root, "AppData", "Roaming"),
        TOVU_SITE_DIR: dir, TOVU_SITES_HOME: undefined, TOVU_ADMIN_PASSWORD: undefined },
    });
    assert.deepEqual(JSON.parse(output.trim().split(/\r?\n/).at(-1)!), { to });
    assert.equal(fs.existsSync(dir), false); assert.equal(JSON.parse(fs.readFileSync(projects, "utf8")).projects[0].siteDir, to);
  } finally { f.cleanup(); }
});


test("relocation never plans a local old-home site into the Documents home", async () => {
  const f = fixture();
  try {
    const dir = oldLevel(f), local = path.join(f.root, "Tovu", "local-site");
    fs.mkdirSync(path.dirname(local)); fs.cpSync(dir, local, { recursive: true });
    const before = directoryFingerprint({ dir: local });
    assert.deepEqual(planSitesMove({ repoRoot: f.repoRoot }, { workspace: f.workspace }).map((plan) => plan.from), [dir]);
    assert.throws(() => planSitesMove({ repoRoot: f.repoRoot }, { workspace: f.workspace, sourceRoots: [path.dirname(local)] }), /Only sites inside the former default sites/);
    assert.throws(() => planSitesMove({ repoRoot: f.repoRoot }, { workspace: f.workspace, sourceRoots: [path.join(f.repoRoot, "sites")] }), /Only sites inside the former default sites/);
    await assert.rejects(moveLegacySite({ dir: local }, { workspace: f.workspace, repoRoot: f.repoRoot }), /Only sites inside the former default sites/);
    assert.equal(directoryFingerprint({ dir: local }), before);
  } finally { f.cleanup(); }
});

for (const oldHome of ["documents", "local"]) test(`an explicit ${oldHome} old-home override refuses automatic relocation`, async () => {
  const f = fixture();
  try {
    const dir = oldLevel(f);
    const home = oldHome === "local" ? path.join(f.root, "Tovu") : path.dirname(dir);
    const source = path.join(home, "alpha");
    if (source !== dir) { fs.mkdirSync(home, { recursive: true }); fs.renameSync(dir, source); }
    const workspace = createSitesWorkspace({}, { homeDir: f.root, cwd: f.repoRoot, platform: "linux", env: { TOVU_SITES_HOME: home } });
    const before = directoryFingerprint({ dir: source });
    await assert.rejects(moveLegacySite({ dir: source }, { workspace, repoRoot: f.repoRoot }), /Only sites inside the former default sites/);
    assert.equal(directoryFingerprint({ dir: source }), before);
  } finally { f.cleanup(); }
});

for (const layout of ["root", "data.nosync"] as const) test(`same-disk relocation of ${layout} DBs preserves earlier backups without making DB copies`, async () => {
  const f = fixture();
  try {
    const dir = oldLevel(f), to = path.join(f.workspace.home({}), "alpha");
    fs.mkdirSync(path.join(dir, "data.nosync"));
    const backupBytes = new Map<string, string>();
    for (const name of ["content.db", "chat.db"]) {
      if (layout === "data.nosync") fs.renameSync(path.join(dir, name), path.join(dir, "data.nosync", name));
      for (const relative of [name + ".home2-backup", path.join("data.nosync", name + ".home2-backup")]) {
        const bytes = `earlier recovery ${relative}`; backupBytes.set(relative, bytes);
        fs.writeFileSync(path.join(dir, relative), bytes);
      }
    }
    const before = directoryFingerprint({ dir }); let copies = 0;
    const filesystem: typeof fs = { ...fs, copyFileSync: (...args) => { copies++; fs.copyFileSync(...args); } };
    await moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, apply: true,
      relocateDirectory: (required, options) => moveDirectoryVerified(required, { ...options, filesystem }),
    });
    assert.equal(copies, 0); assert.equal(directoryFingerprint({ dir: to }), before);
    for (const [relative, bytes] of backupBytes) assert.equal(fs.readFileSync(path.join(to, relative), "utf8"), bytes);
    assert.equal(fs.readdirSync(to, { recursive: true }).map(String).filter((file) => file.endsWith("-backup")).length, 4);
    const paths = resolveSiteDatabasePaths({ dir: to }, { workspace: f.workspace });
    const selected = layout === "root" ? to : path.join(to, layout);
    assert.equal(paths.contentDbPath, path.join(selected, "content.db"));
    assert.equal(paths.chatDbPath, path.join(selected, "chat.db"));
    assert.deepEqual(await moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, apply: true }), []);
  } finally { f.cleanup(); }
});


test("a selected nested-default folder without site markers reports selection failure rather than a stop remedy", async () => {
  const f = fixture();
  try {
    const dir = oldLevel(f); fs.rmSync(path.join(dir, ".site-meta.json"));
    await assert.rejects(moveLegacySite({ dir }, { workspace: f.workspace, repoRoot: f.repoRoot }), /No site matched this move/);
    assert.equal(fs.existsSync(dir), true);
  } finally { f.cleanup(); }
});
