import { isolatedCatalogHome } from "../helpers/isolated-catalog-home.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { moveDirectoryVerified } from "@jini-ai/platform/fs";
import type { DbIntegrityReport } from "@jini-ai/db/sqlite";
import { createSitesWorkspace, type SitesWorkspace } from "../../sites-home.js";
import { assertDatabaseStopped, inspectStoppedDatabase, moveLegacySite, moveSitesHome, planSitesMove } from "../../move-sites-home.js";

/** One stopped nested-default site (Documents/Tovu/sites/<name>) with both SQLite databases. */
function writeSite({ dir, siteId }: { dir: string; siteId: string }): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: siteId, domain: null, port: null }));
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId, templateId: "blank", templateVersion: "1", schemaVersion: 0, schemaTag: "test", createdAt: "2026-10-09" }));
  for (const filename of ["content.db", "chat.db"]) {
    const db = new Database(path.join(dir, filename));
    db.exec("CREATE TABLE notes (id INTEGER); INSERT INTO notes VALUES (1);"); db.close();
  }
}
function fixture({ base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-move-sites-home-"))) }: { base?: string } = {}) {
  const root = base, repoRoot = path.join(root, "repo"), nested = path.join(root, "Documents", "Tovu", "sites"), dir = path.join(nested, "alpha");
  fs.mkdirSync(path.join(root, "Documents"), { recursive: true });
  writeSite({ dir, siteId: "alpha-id" });
  const workspace = createSitesWorkspace({}, { homeDir: root, cwd: repoRoot, env: {}, platform: "linux" });
  return { root, repoRoot, nested, dir, workspace, to: path.join(workspace.home({}), "alpha"), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test("planning without a nested-default sites folder finds nothing to move", () => {
  const f = fixture();
  try {
    fs.rmSync(f.nested, { recursive: true });
    assert.deepEqual(planSitesMove({ repoRoot: f.repoRoot }, { workspace: f.workspace }), []);
  } finally { f.cleanup(); }
});

test("planning refuses a source root outside the former default sites folder", () => {
  const f = fixture();
  try {
    const local = path.join(f.root, "Tovu");
    assert.throws(() => planSitesMove({ repoRoot: f.repoRoot }, { workspace: f.workspace, sourceRoots: [local] }), {
      message: "Only sites inside the former default sites/ folder can be moved to Documents/Tovu.",
    });
  } finally { f.cleanup(); }
});

test("planning skips a nested root that vanished after discovery", () => {
  const f = fixture();
  try {
    const gone = path.join(f.root, "gone", "sites");
    const workspace: SitesWorkspace = { ...f.workspace, nestedSitesRoot: () => gone };
    assert.deepEqual(planSitesMove({ repoRoot: f.repoRoot }, { workspace }), []);
  } finally { f.cleanup(); }
});

test("planning refuses a symlinked nested sites folder", () => {
  const f = fixture();
  try {
    const link = path.join(f.root, "linked-sites");
    fs.symlinkSync(f.nested, link);
    const workspace: SitesWorkspace = { ...f.workspace, nestedSitesRoot: () => link };
    assert.throws(() => planSitesMove({ repoRoot: f.repoRoot }, { workspace }), { message: "The source sites folder must not be a symlink." });
  } finally { f.cleanup(); }
});

test("planning skips a source root that already is the sites home", () => {
  const f = fixture();
  try {
    const workspace: SitesWorkspace = { ...f.workspace, home: () => f.nested };
    assert.deepEqual(planSitesMove({ repoRoot: f.repoRoot }, { workspace, sourceRoots: [f.nested] }), []);
  } finally { f.cleanup(); }
});

test("planning refuses a checkout sites folder that contains the sites home", () => {
  const f = fixture();
  try {
    const checkoutSites = path.join(f.repoRoot, "sites");
    fs.mkdirSync(checkoutSites, { recursive: true });
    const workspace: SitesWorkspace = { ...f.workspace, nestedSitesRoot: () => checkoutSites, home: () => path.join(checkoutSites, "home") };
    assert.throws(() => planSitesMove({ repoRoot: f.repoRoot }, { workspace }), { message: "Sites home must be outside the checkout sites folder." });
  } finally { f.cleanup(); }
});

test("planning refuses a checkout sites folder that is the sites home", () => {
  const f = fixture();
  try {
    const checkoutSites = path.join(f.repoRoot, "sites");
    fs.mkdirSync(checkoutSites, { recursive: true });
    const workspace: SitesWorkspace = { ...f.workspace, nestedSitesRoot: () => checkoutSites, home: () => checkoutSites };
    assert.throws(() => planSitesMove({ repoRoot: f.repoRoot }, { workspace }), { message: "Sites home must be outside the checkout sites folder." });
  } finally { f.cleanup(); }
});

test("planning moves sites from a checkout sites folder kept outside the sites home", () => {
  const f = fixture();
  try {
    const checkoutSites = path.join(f.repoRoot, "sites");
    writeSite({ dir: path.join(checkoutSites, "beta"), siteId: "beta-id" });
    const workspace: SitesWorkspace = { ...f.workspace, nestedSitesRoot: () => checkoutSites };
    assert.deepEqual(planSitesMove({ repoRoot: f.repoRoot }, { workspace }).map((plan) => plan.to), [path.join(f.workspace.home({}), "beta")]);
  } finally { f.cleanup(); }
});

test("planning ignores loose files beside nested sites", () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.nested, "notes.txt"), "not a site");
    const skipped: string[] = [];
    assert.deepEqual(planSitesMove({ repoRoot: f.repoRoot }, { workspace: f.workspace, onSkipped: ({ dir }) => { skipped.push(dir); } }).map((plan) => plan.from), [f.dir]);
    assert.deepEqual(skipped, []);
  } finally { f.cleanup(); }
});

test("planning skips a folder that has only the site metadata marker", () => {
  const f = fixture();
  try {
    const partial = path.join(f.nested, "partial");
    fs.mkdirSync(partial); fs.writeFileSync(path.join(partial, ".site-meta.json"), "{}");
    const skipped: string[] = [];
    planSitesMove({ repoRoot: f.repoRoot }, { workspace: f.workspace, onSkipped: ({ dir }) => { skipped.push(dir); } });
    assert.deepEqual(skipped, [partial]);
  } finally { f.cleanup(); }
});

test("planning skips a stray folder when nobody listens for skips", () => {
  const f = fixture();
  try {
    fs.mkdirSync(path.join(f.nested, "stray"));
    assert.deepEqual(planSitesMove({ repoRoot: f.repoRoot }, { workspace: f.workspace }).map((plan) => plan.from), [f.dir]);
  } finally { f.cleanup(); }
});

test("planning skips a dot-folder even when it carries both site markers", () => {
  const f = fixture();
  try {
    const hidden = path.join(f.nested, ".hidden");
    writeSite({ dir: hidden, siteId: "hidden-id" });
    const skipped: string[] = [];
    assert.deepEqual(planSitesMove({ repoRoot: f.repoRoot }, { workspace: f.workspace, onSkipped: ({ dir }) => { skipped.push(dir); } }).map((plan) => plan.from), [f.dir]);
    assert.deepEqual(skipped, [hidden]);
  } finally { f.cleanup(); }
});

test("planning limits the batch to the selected folder names", () => {
  const f = fixture();
  try {
    const beta = path.join(f.nested, "beta");
    writeSite({ dir: beta, siteId: "beta-id" });
    assert.deepEqual(planSitesMove({ repoRoot: f.repoRoot }, { workspace: f.workspace, sites: ["beta"] }).map((plan) => plan.from), [beta]);
  } finally { f.cleanup(); }
});

test("planning refuses a site whose target already exists", () => {
  const f = fixture();
  try {
    fs.mkdirSync(f.to, { recursive: true });
    assert.throws(() => planSitesMove({ repoRoot: f.repoRoot }, { workspace: f.workspace }), { message: `Move target already exists: ${f.to}` });
  } finally { f.cleanup(); }
});

test("planning rethrows a target probe failure other than a missing path", () => {
  const f = fixture();
  try {
    const fileHome = path.join(f.root, "home-is-a-file");
    fs.writeFileSync(fileHome, "");
    const workspace: SitesWorkspace = { ...f.workspace, home: () => fileHome };
    assert.throws(() => planSitesMove({ repoRoot: f.repoRoot }, { workspace }), { code: "ENOTDIR" });
  } finally { f.cleanup(); }
});

test("planning refuses app-data databases that would live inside the site being moved", () => {
  const f = fixture();
  try {
    const workspace = createSitesWorkspace({}, { homeDir: f.root, cwd: f.repoRoot, env: {}, platform: "linux", appDataDir: path.join(f.dir, "app-data") });
    workspace.updateConfig({ patch: { databases: "appData" } });
    assert.throws(() => planSitesMove({ repoRoot: f.repoRoot }, { workspace }), { message: "App-data databases must be outside the site being moved." });
  } finally { f.cleanup(); }
});

test("planning refuses a database sidecar that is not a regular file", () => {
  const f = fixture();
  try {
    const sidecar = path.join(f.dir, "content.db-wal");
    fs.mkdirSync(sidecar);
    assert.throws(() => planSitesMove({ repoRoot: f.repoRoot }, { workspace: f.workspace }), { message: `Database move requires a regular file: ${sidecar}` });
  } finally { f.cleanup(); }
});

test("planning refuses an app-data database target that already exists", () => {
  const f = fixture();
  try {
    f.workspace.updateConfig({ patch: { databases: "appData" } });
    const target = path.join(f.workspace.config({}).appData, "databases", "alpha-id", "chat.db-shm");
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, "");
    assert.throws(() => planSitesMove({ repoRoot: f.repoRoot }, { workspace: f.workspace }), { message: `Database move target already exists: ${target}` });
  } finally { f.cleanup(); }
});

test("planning in-site placement brings app-data databases into the moved site folder", () => {
  const f = fixture();
  try {
    f.workspace.updateConfig({ patch: { databases: "appData" } });
    const appData = path.join(f.workspace.config({}).appData, "databases", "alpha-id");
    fs.mkdirSync(appData, { recursive: true });
    for (const name of ["content.db", "chat.db"]) fs.renameSync(path.join(f.dir, name), path.join(appData, name));
    f.workspace.updateConfig({ patch: { databases: "inSite" } });
    const [plan] = planSitesMove({ repoRoot: f.repoRoot }, { workspace: f.workspace });
    assert.deepEqual(plan?.databases, [
      { from: path.join(appData, "content.db"), to: path.join(f.to, "data.nosync", "content.db") },
      { from: path.join(appData, "chat.db"), to: path.join(f.to, "data.nosync", "chat.db") },
    ]);
  } finally { f.cleanup(); }
});

test("planning a site without databases plans no database moves", () => {
  const f = fixture();
  try {
    for (const name of ["content.db", "chat.db"]) fs.rmSync(path.join(f.dir, name));
    assert.deepEqual(planSitesMove({ repoRoot: f.repoRoot }, { workspace: f.workspace })[0]?.databases, []);
  } finally { f.cleanup(); }
});

test("planning defaults to the ambient sites workspace for the checkout", () => {
  const repoRoot = fs.mkdtempSync(path.join(isolatedCatalogHome, "repo-"));
  try {
    assert.deepEqual(planSitesMove({ repoRoot }), []);
  } finally { fs.rmSync(repoRoot, { recursive: true, force: true }); }
});

test("a dry run defaults to the ambient sites workspace and moves nothing", async () => {
  const repoRoot = fs.mkdtempSync(path.join(isolatedCatalogHome, "repo-"));
  try {
    assert.deepEqual(await moveSitesHome({ repoRoot }), []);
  } finally { fs.rmSync(repoRoot, { recursive: true, force: true }); }
});

test("apply refuses an unavailable sites home before taking any lock", async () => {
  const f = fixture();
  try {
    const home = path.join(f.root, "unmounted", "Sites");
    f.workspace.setHome({ path: home });
    await assert.rejects(moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, apply: true }), {
      message: `Sites home volume is unavailable: ${home}. Mount it or choose a local folder in Sites settings.`,
    });
    assert.equal(fs.existsSync(home + ".move.lock"), false);
  } finally { f.cleanup(); }
});

test("apply with nothing to move takes the lock and returns no moves", async () => {
  const f = fixture();
  try {
    fs.rmSync(f.dir, { recursive: true });
    assert.deepEqual(await moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, apply: true }), []);
  } finally { f.cleanup(); }
});

test("apply warns about a running site by default and keeps it in place", async (t) => {
  const f = fixture();
  try {
    writeSite({ dir: path.join(f.nested, "beta"), siteId: "beta-id" });
    const lease = f.workspace.claim({ path: f.dir, app: "Desktop", port: 3456 });
    const warn = t.mock.method(console, "warn", () => {});
    const moved = await moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, apply: true });
    assert.deepEqual(moved.map((plan) => plan.id), ["beta-id"]);
    assert.deepEqual(warn.mock.calls.map((call) => call.arguments), [[`Skipped running site in Desktop: ${f.dir}. Stop it before moving it.`]]);
    f.workspace.running({ path: f.dir }).release({ token: lease.record.token });
  } finally { f.cleanup(); }
});

test("apply refuses a batch whose every site is running", async () => {
  const f = fixture();
  try {
    const lease = f.workspace.claim({ path: f.dir, app: "Desktop", port: 3456 });
    await assert.rejects(moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, apply: true, onRunning: () => {} }), {
      message: `Site is running in Desktop: ${f.dir}. Stop it before moving it.`,
    });
    assert.equal(fs.existsSync(f.dir), true);
    f.workspace.running({ path: f.dir }).release({ token: lease.record.token });
  } finally { f.cleanup(); }
});

test("apply refuses a site that starts running after the batch was planned", async () => {
  const f = fixture();
  try {
    const beta = path.join(f.nested, "beta");
    writeSite({ dir: beta, siteId: "beta-id" });
    let token: string | undefined;
    const relocateDirectory: typeof moveDirectoryVerified = (required, options) => {
      if (!token) token = f.workspace.claim({ path: beta, app: "Web", port: 3000 }).record.token;
      return moveDirectoryVerified(required, options);
    };
    await assert.rejects(moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, apply: true, relocateDirectory }), {
      message: `Site is running in Web: ${beta}. Stop it before moving it.`,
    });
    assert.equal(fs.existsSync(beta), true); assert.equal(fs.existsSync(f.to), true);
    f.workspace.running({ path: beta }).release({ token: token! });
  } finally { f.cleanup(); }
});

test("apply refuses when another app claims the site between the check and the reservation", async () => {
  const f = fixture();
  try {
    const record = { pid: 1, port: 3000, app: "Web", scheme: "http" as const, started: "2026-10-09", token: "other" };
    const workspace: SitesWorkspace = { ...f.workspace, claim: (required) => required.path === f.dir ? { acquired: false, record } : f.workspace.claim(required) };
    await assert.rejects(moveSitesHome({ repoRoot: f.repoRoot }, { workspace, apply: true }), { message: `Another app started this site: ${f.dir}` });
    assert.equal(fs.existsSync(f.dir), true);
  } finally { f.cleanup(); }
});

test("apply refuses a move target another app has claimed and releases the source reservation", async () => {
  const f = fixture();
  try {
    const lease = f.workspace.claim({ path: f.to, app: "Web", port: 3000 });
    await assert.rejects(moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, apply: true }), { message: `Another app started the move target: ${f.to}` });
    assert.equal(f.workspace.running({ path: f.dir }).peek({}), null); assert.equal(fs.existsSync(f.dir), true);
    f.workspace.running({ path: f.to }).release({ token: lease.record.token });
  } finally { f.cleanup(); }
});

test("apply refuses to commit a moved site whose identity changed", async () => {
  const f = fixture();
  try {
    const relocateDirectory: typeof moveDirectoryVerified = (required, options) => moveDirectoryVerified({ ...required, commit: () => {
      const meta = path.join(required.to, ".site-meta.json");
      fs.writeFileSync(meta, JSON.stringify({ ...JSON.parse(fs.readFileSync(meta, "utf8")), siteId: "swapped-id" }));
      required.commit?.();
    } }, options);
    await assert.rejects(moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, apply: true, relocateDirectory }), { message: "Moved site's identity did not match." });
    assert.deepEqual(f.workspace.registry({}).list({}), []);
  } finally { f.cleanup(); }
});

test("apply moves app-data databases next to the relocated site folder", async () => {
  const f = fixture();
  try {
    f.workspace.updateConfig({ patch: { databases: "appData" } });
    const [plan] = await moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, apply: true });
    assert.deepEqual(plan?.databases.map((db) => fs.existsSync(db.to)), [true, true]);
    assert.equal(fs.existsSync(path.join(f.to, "content.db")), false);
  } finally { f.cleanup(); }
});

test("apply relocates app-data databases into the moved site under in-site placement", async () => {
  const f = fixture();
  try {
    f.workspace.updateConfig({ patch: { databases: "appData" } });
    const appData = path.join(f.workspace.config({}).appData, "databases", "alpha-id");
    fs.mkdirSync(appData, { recursive: true });
    for (const name of ["content.db", "chat.db"]) fs.renameSync(path.join(f.dir, name), path.join(appData, name));
    f.workspace.updateConfig({ patch: { databases: "inSite" } });
    await moveSitesHome({ repoRoot: f.repoRoot }, { workspace: f.workspace, apply: true });
    assert.equal(JSON.parse(inspectStoppedDatabase({ path: path.join(f.to, "data.nosync", "content.db") }))[0]?.rowCount, 1);
    assert.equal(fs.existsSync(path.join(appData, "content.db")), false);
  } finally { f.cleanup(); }
});

test("moveLegacySite returns the verified destination of one nested-default site", async () => {
  const f = fixture();
  try {
    assert.equal(await moveLegacySite({ dir: f.dir }, { workspace: f.workspace, repoRoot: f.repoRoot }), f.to);
    assert.equal(fs.existsSync(path.join(f.to, ".site-meta.json")), true);
  } finally { f.cleanup(); }
});

test("moveLegacySite defaults to the ambient sites workspace", async () => {
  const f = fixture({ base: isolatedCatalogHome });
  const to = path.join(f.workspace.home({}), "alpha");
  try {
    assert.equal(await moveLegacySite({ dir: f.dir }), to);
  } finally { fs.rmSync(path.join(isolatedCatalogHome, "Documents", "Tovu"), { recursive: true, force: true }); }
});

test("moveLegacySite refuses a site outside the former default sites folder", async () => {
  const f = fixture();
  try {
    const local = path.join(f.root, "Tovu", "local-site");
    writeSite({ dir: local, siteId: "local-id" });
    await assert.rejects(moveLegacySite({ dir: local }, { workspace: f.workspace, repoRoot: f.repoRoot }), {
      message: "Only sites inside the former default sites/ folder can be moved to Documents/Tovu.",
    });
  } finally { f.cleanup(); }
});

test("moveLegacySite reports a selected folder without site markers as no match", async () => {
  const f = fixture();
  try {
    fs.rmSync(path.join(f.dir, ".site-meta.json"));
    await assert.rejects(moveLegacySite({ dir: f.dir }, { workspace: f.workspace, repoRoot: f.repoRoot }), {
      message: "No site matched this move. Check its folder and the default Documents/Tovu home.",
    });
  } finally { f.cleanup(); }
});

test("moveLegacySite refuses a symlinked source site", async () => {
  const f = fixture();
  try {
    const link = path.join(f.nested, "linked");
    fs.symlinkSync(f.dir, link);
    await assert.rejects(moveLegacySite({ dir: link }, { workspace: f.workspace, repoRoot: f.repoRoot }), { message: "The source site must not be a symlink." });
  } finally { f.cleanup(); }
});

test("assertDatabaseStopped refuses a database another connection holds open", () => {
  const f = fixture();
  const file = path.join(f.dir, "content.db"), writer = new Database(file);
  try {
    writer.exec("BEGIN EXCLUSIVE");
    assert.throws(() => assertDatabaseStopped({ path: file }), { message: `Database is open in another process: ${file}. Stop it before moving it.` });
  } finally { writer.exec("ROLLBACK"); writer.close(); f.cleanup(); }
});

test("assertDatabaseStopped rethrows a non-busy SQLite failure", () => {
  const f = fixture();
  try {
    const file = path.join(f.dir, "content.db");
    fs.writeFileSync(file, "not a database, just text long enough to fill the SQLite header bytes......".repeat(4));
    assert.throws(() => assertDatabaseStopped({ path: file }), { code: "SQLITE_NOTADB" });
  } finally { f.cleanup(); }
});

test("assertDatabaseStopped refuses a journal that survives the exclusive probe", () => {
  const f = fixture();
  try {
    const file = path.join(f.dir, "content.db");
    // A rollback-journal database never reads or deletes a stray WAL, so it outlives the probe.
    fs.writeFileSync(file + "-wal", "");
    assert.throws(() => assertDatabaseStopped({ path: file }), {
      message: `Database journal exists: ${file}-wal. Stop the site and close/checkpoint its database before moving it.`,
    });
  } finally { f.cleanup(); }
});

test("assertDatabaseStopped checkpoints a stopped database and leaves no sidecars", () => {
  const f = fixture();
  try {
    const file = path.join(f.dir, "content.db");
    assertDatabaseStopped({ path: file });
    assert.equal(fs.existsSync(file + "-wal"), false); assert.equal(fs.existsSync(file + "-shm"), false);
  } finally { f.cleanup(); }
});

test("inspectStoppedDatabase reports a missing database without creating sidecars", () => {
  const f = fixture();
  try {
    const file = path.join(f.dir, "missing.db");
    assert.throws(() => inspectStoppedDatabase({ path: file }), { code: "SQLITE_CANTOPEN" });
    assert.equal(fs.existsSync(file + "-wal"), false);
  } finally { f.cleanup(); }
});

/** Integrity report stub for the inspector port; fields not under test are fixed. */
function integrityReport(overrides: Partial<DbIntegrityReport>): DbIntegrityReport {
  return { ok: true, mode: "integrity_check", issues: [], elapsedMs: 0, generatedAt: 0, ...overrides };
}

test("inspectStoppedDatabase refuses a database whose integrity check fails", () => {
  const f = fixture();
  try {
    const file = path.join(f.dir, "content.db");
    const verifyIntegrity = () => integrityReport({ ok: false, issues: [{ kind: "integrity", message: "page 2 broken" }, { kind: "integrity", message: "index stale" }] });
    assert.throws(() => inspectStoppedDatabase({ path: file }, { verifyIntegrity }), { message: "SQLite integrity_check failed for content.db: page 2 broken; index stale" });
  } finally { f.cleanup(); }
});

test("inspectStoppedDatabase refuses an inspector build without strict row counts", () => {
  const f = fixture();
  try {
    const verifyIntegrity = () => integrityReport({ rowCounts: undefined });
    assert.throws(() => inspectStoppedDatabase({ path: path.join(f.dir, "content.db") }, { verifyIntegrity }), { message: "Build @jini-ai/db before running the stopped-site database mover." });
  } finally { f.cleanup(); }
});

test("inspectStoppedDatabase returns the strict row counts as JSON", () => {
  const f = fixture();
  try {
    const counts = JSON.parse(inspectStoppedDatabase({ path: path.join(f.dir, "content.db") })) as { name: string; rowCount: number }[];
    assert.equal(counts.find((table) => table.name === "notes")?.rowCount, 1);
  } finally { f.cleanup(); }
});
