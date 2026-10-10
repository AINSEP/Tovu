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
import { directoryFingerprint } from "@jini-ai/platform/fs";
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-move-home2-"))), repoRoot = path.join(root, "repo"), dir = path.join(repoRoot, "sites", "alpha");
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
    assert.equal(fs.existsSync(f.workspace.home({})), false);
  } finally { f.cleanup(); }
});
test("planning skips dot-folder caches and stray folders without changing the checkout", () => {
  const f = fixture();
  try {
    const cache = path.join(f.repoRoot, "sites", ".tovu"), stray = path.join(f.repoRoot, "sites", "stray"), hidden = path.join(f.repoRoot, "sites", ".hidden");
    fs.mkdirSync(cache); fs.mkdirSync(stray); fs.mkdirSync(hidden);
    fs.writeFileSync(path.join(hidden, "config.json"), "cache bytes, not site config");
    fs.writeFileSync(path.join(cache, "preview.png"), "cached preview");
    const before = directoryFingerprint({ dir: f.repoRoot });
    const skipped: string[] = [];
    const plans = planSitesMove({ repoRoot: f.repoRoot }, { workspace: f.workspace, onSkipped: ({ dir }) => { skipped.push(dir); } });
    assert.deepEqual(plans.map((plan) => plan.from), [f.dir]);
    assert.deepEqual(skipped.sort(), [cache, stray, hidden].sort());
    assert.equal(directoryFingerprint({ dir: f.repoRoot }), before);
    assert.equal(fs.existsSync(f.workspace.home({})), false);
  } finally { f.cleanup(); }
});
test("--site limits planning and dry runs, and repeated names never duplicate a move", async () => {
  const f = fixture();
  try {
    const beta = path.join(f.repoRoot, "sites", "beta");
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
for (const databases of ["inSite", "appData"] as const) test(`apply verifies both DBs, keeps backups and updates the registry with ${databases}`, async () => {
  const f = fixture();
  try {
    f.workspace.updateConfig({ patch: { databases } });
    const before = new Map(["content.db", "chat.db"].map((name) => [name, inspectStoppedDatabase({ path: path.join(f.dir, name) })]));
    await moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, apply: true });
    const target = path.join(f.workspace.home({}), "alpha"), paths = resolveSiteDatabasePaths({ dir: target }, { workspace: f.workspace });
    for (const file of [paths.contentDbPath, paths.chatDbPath]) {
      assert.equal(inspectStoppedDatabase({ path: file }), before.get(path.basename(file)));
      assert.equal(fs.existsSync(file + ".home2-backup"), true); assert.equal(fs.existsSync(path.join(target, path.basename(file))), false);
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
  try {
    const file = path.join(f.dir, "content.db"); fs.writeFileSync(file + suffix, "uncheckpointed bytes");
    const before = directoryFingerprint({ dir: f.dir });
    await assert.rejects(moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, apply: true }), {
      message: `Database journal exists: ${file + suffix}. Stop the site and close/checkpoint its database before moving it.`,
    });
    assert.equal(directoryFingerprint({ dir: f.dir }), before);
    assert.equal(fs.existsSync(path.join(f.workspace.home({}), "alpha")), false);
  } finally { f.cleanup(); }
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
