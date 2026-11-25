import { leaveSavedKeysOut } from "@jini-ai/devops/backup/site/saved-keys";
import { createImportIndexIntegrityMemo, openImportIndex } from "@jini-ai/devops/backup/site/import-index/open";
import { openNativeSqlite } from "#src/platform/db/kernel/drivers/sqlite";
import { bindSiteImportBackfill } from "#src/server/runtime/composition/site-import-backfill";
/**
 * @file Q4 acceptance (r62t-rsy-6 "Q4 · cloud combine sheet"; owner decision: 30 days of visible
 * import history, a 1-year replay record). Cases 1 and 2 of the sheet's five. Written before the
 * indexed store exists: case 2 is expected red until terminal history expires at 30 days while
 * the replay record survives to 365 days from acceptance.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SiteImportRegistry } from "@jini-ai/devops/backup/site/import-registry";
import { requireStagingBudget } from "@jini-ai/devops/backup/site/import-backend-steps";
import test from "node:test";
import { importHistoryIndexFixture } from "./import-history-index.fixture.js";
import { admitImport, lookupFence } from "@jini-ai/devops/backup/site/import-index/admission";
import type { SiteImportRecord } from "@jini-ai/core/contracts/site/site-import-history";
import { createSiteImportBackend, createSiteImportHost } from "../import-backend.js";
import { THEME_PLACEMENT_CHECKS } from "#src/server/runtime/composition/theme-placement-checks";
import { importFixture, OWNER_PASSWORD } from "./import.fixture.js";

const DAY = 86_400_000;
const START = Date.parse("2026-11-21T00:00:00.000Z");
const URL_SOURCE = { url: "https://public.example/site.tovu.zip" };

/** One finished import under `requestId`, accepted at START. */
async function finishedImport(t: test.TestContext, requestId: string) {
  t.mock.timers.enable({ apis: ["Date"], now: START });
  const h = await importHistoryIndexFixture({ t });
  const upload = await h.backend.upload({ principalId: "owner", archive: h.archive });
  const pending = await h.backend.importBackup({ principalId: "owner", source: upload, requestId });
  const ready = await h.backend.completeOwner({ principalId: "owner", importId: pending.importId, adminPassword: OWNER_PASSWORD });
  assert.equal(ready.state, "ready", "the fixture import finishes");
  return { h, upload, ready };
}

test("Q4 durable replay: after a restart at day 31 the same request returns the stored outcome; a changed source conflicts before any effect", async t => {
  const { h, upload, ready } = await finishedImport(t, "replay-31");
  const startedBefore = h.started.length;
  t.mock.timers.setTime(START + 31 * DAY);
  const restarted = createSiteImportBackend(h.backendPorts);
  const replay = await restarted.importBackup({ principalId: "owner", source: upload, requestId: "replay-31" });
  assert.equal(replay.importId, ready.importId, "a retry of the same request returns the original import");
  assert.equal(replay.state, "ready", "the stored outcome is returned, not a new attempt");
  assert.equal(h.started.length, startedBefore, "a replay never creates or starts a second site");
  await assert.rejects(restarted.importBackup({ principalId: "owner", source: URL_SOURCE, requestId: "replay-31" }),
    { code: "REQUEST_CONFLICT" }, "a changed source under the same request id conflicts before downloading");
  const other = await restarted.list({ principalId: "other" });
  assert.equal(other.some(row => row.importId === ready.importId), false, "another principal never sees this import");
});

test("Q4 expiry: terminal history leaves the list after 30 days, replay still works, replaying does not extend it, and the key is reusable after 365 days", async t => {
  const { h, upload, ready } = await finishedImport(t, "retention");
  t.mock.timers.setTime(START + 29 * DAY);
  await h.backend.importBackup({ principalId: "owner", source: upload, requestId: "retention" });
  t.mock.timers.setTime(START + 30 * DAY + 1);
  const listed = await h.backend.list({ principalId: "owner" });
  assert.equal(listed.some(row => row.importId === ready.importId), false, "terminal detail is gone from history after 30 days, even though it was replayed at day 29");
  const replay = await h.backend.importBackup({ principalId: "owner", source: upload, requestId: "retention" });
  assert.equal(replay.importId, ready.importId, "replay still returns the stored outcome after the history detail expires");
  t.mock.timers.setTime(START + 365 * DAY + 1);
  await assert.rejects(h.backend.importBackup({ principalId: "owner", source: URL_SOURCE, requestId: "retention" }),
    (error: { code?: string }) => error.code !== "REQUEST_CONFLICT", "after 365 days the request id no longer fences a different source");
});


test("staging budget and orphan sweep never enumerate the history directory", async t => {
  const h = await importFixture(t);
  await h.registry.exclusive({ run: async () => {} });
  const importId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  h.registry.put({ row: { importId, principalId: "owner", source: { uploadId: importId }, displayName: "pending", newSiteId: null, newSiteName: null, status: "needs-owner", createdAt: new Date().toISOString(), expiresAt: Date.now() - 1 } });
  fs.mkdirSync(h.registry.stagePath({ importId }));
  const original = fs.readdirSync;
  t.mock.method(fs, "readdirSync", (directory: fs.PathLike, ...args: unknown[]) => {
    assert.notEqual(String(directory), h.registry.directory, "payload maintenance must not scan history");
    return Reflect.apply(original, fs, [directory, ...args]);
  });
  await h.registry.exclusive({ run: async () => {
    h.registry.expirePayloads({});
    requireStagingBudget({ registry: h.registry, host: createSiteImportHost({ themeChecks: THEME_PLACEMENT_CHECKS }) });
    assert.equal(h.registry.get({ principalId: "owner", importId }).status, "needs-owner", "budget does not expire legacy owner history");
    assert.equal(fs.existsSync(h.registry.stagePath({ importId })), true);
  } });
});

test("interrupted move (ZIP moved, metadata not) then restart keeps the upload claimable and owner setup completes", async t => {
  const h = await importFixture(t);
  const uploadId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const directory = h.registry.directory;

  fs.writeFileSync(path.join(directory, "payloads", `${uploadId}.upload.zip`), h.archive);
  fs.writeFileSync(path.join(directory, `${uploadId}.upload.json`), JSON.stringify({ uploadId, principalId: "owner", createdAt: Date.now() }));
  const registry = new SiteImportRegistry({ directory, payload: h.payload });
  const backend = createSiteImportBackend({ ...h.backendPorts, registry });
  const pending = await backend.importBackup({ principalId: "owner", source: { uploadId } });
  assert.equal(pending.state, "needs-owner");
  const ready = await backend.completeOwner({ principalId: "owner", importId: pending.importId, adminPassword: OWNER_PASSWORD });
  assert.equal(ready.state, "ready");
  assert.equal(h.workspace.registry({}).list({}).length, 1);
  assert.equal(fs.existsSync(path.join(directory, "payloads", ".namespace-v1")), true);
});


test("history boundary: listed at 30d − 1 ms, hidden at exactly 30d", async t => {
  const { h, ready } = await finishedImport(t, "boundary");
  t.mock.timers.setTime(START + 30 * DAY - 1);
  assert.equal((await h.backend.list({ principalId: "owner" })).some(row => row.importId === ready.importId), true);
  t.mock.timers.setTime(START + 30 * DAY);
  assert.deepEqual(await h.backend.list({ principalId: "owner" }), []);
});

test("replay at day 200 returns the stored outcome but the row is not listed", async t => {
  const { h, upload, ready } = await finishedImport(t, "day200");
  t.mock.timers.setTime(START + 200 * DAY);
  assert.deepEqual(await h.backend.listPage({ principalId: "owner" }), { imports: [] });
  assert.equal((await h.backend.importBackup({ principalId: "owner", source: upload, requestId: "day200" })).importId, ready.importId);
  assert.equal(h.started.length, 1);
});

test("fence still conflicts at 365d − 1 ms", async t => {
  const { h } = await finishedImport(t, "fence");
  t.mock.timers.setTime(START + 365 * DAY - 1);
  await assert.rejects(h.backend.importBackup({ principalId: "owner", source: URL_SOURCE, requestId: "fence" }), { code: "REQUEST_CONFLICT" });
  assert.ok(lookupFence({ db: h.db, policy: h.policy, principalId: "owner", requestId: "fence", now: START + 365 * DAY - 1 }));
  assert.equal(lookupFence({ db: h.db, policy: h.policy, principalId: "owner", requestId: "fence", now: START + 365 * DAY }), undefined);
});

test("day 365 + 1 ms frees the key", async t => {
  const { h } = await finishedImport(t, "free");
  t.mock.timers.setTime(START + 365 * DAY + 1);
  assert.equal(lookupFence({ db: h.db, policy: h.policy, principalId: "owner", requestId: "free", now: Date.now() }), undefined);
  const upload = await h.backend.upload({ principalId: "owner", archive: h.archive });
  assert.equal((await h.backend.importBackup({ principalId: "owner", source: upload, requestId: "free" })).state, "needs-owner");
});

test("REQUEST_CONFLICT leaves the upload unconsumed and makes no HTTP call", async t => {
  const { h } = await finishedImport(t, "conflict");
  const upload = await h.backend.upload({ principalId: "owner", archive: h.archive });
  t.mock.method(h.registry, "countStagedPayloads", () => assert.fail("conflict must precede budget"));
  t.mock.method(h.backendPorts.http, "send", async () => assert.fail("conflict must precede HTTP"));
  const before = h.db.prepare("SELECT COUNT(*) AS n FROM imports").get();
  await assert.rejects(h.backend.importBackup({ principalId: "owner", source: upload, requestId: "conflict" }), { code: "REQUEST_CONFLICT" });
  assert.equal(h.registry.getUpload({ ...upload, principalId: "owner" }).consumedBy, undefined);
  assert.equal(fs.existsSync(h.registry.uploadPath(upload)), true);
  assert.deepEqual(h.db.prepare("SELECT COUNT(*) AS n FROM imports").get(), before);
});

test("admission insert failure leaves no fence", async t => {
  const h = await importHistoryIndexFixture({ t });
  const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const row: SiteImportRecord = { importId: id, principalId: "owner", requestId: "atomic", source: { uploadId: id }, status: "verifying", createdAt: new Date().toISOString(), expiresAt: Date.now() + 3_600_000, displayName: "test", newSiteId: null, newSiteName: null };
  h.db.exec("CREATE TRIGGER refuse_import BEFORE INSERT ON imports BEGIN SELECT RAISE(ABORT,'interrupted'); END");
  assert.throws(() => admitImport({ db: h.db, clock: h.clock, policy: h.policy, principalId: "owner", requestId: "atomic", source: row.source, digestSource: () => undefined, requireBudget: () => {}, makeRow: () => row, beforeWrite: () => {} }), /interrupted/);
  assert.deepEqual(h.db.prepare("SELECT * FROM replay").all(), []);
});

test("tied timestamps page with no duplicates, skips or cross-principal rows", async t => {
  const h = await importHistoryIndexFixture({ t });
  const expected: SiteImportRecord[] = [];
  for (let i = 0; i < 120; i++) {
    const row: SiteImportRecord = { importId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, principalId: i < 80 ? "owner" : i < 100 ? "second" : "third", source: { uploadId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }, status: "verifying", createdAt: new Date(START + i % 7).toISOString(), expiresAt: START + 3_600_000, displayName: "test", newSiteId: null, newSiteName: null };
    h.store.put({ row, beforeWrite: () => {} });
    if (row.principalId === "owner") expected.push(row);
  }
  expected.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.importId < b.importId ? 1 : -1));
  const first = await h.backend.listPage({ principalId: "owner", limit: 50 });
  assert.equal(first.imports.length, 50);
  assert.ok(first.nextCursor);
  const second = await h.backend.listPage({ principalId: "owner", cursor: first.nextCursor });
  assert.equal(second.nextCursor, undefined);
  assert.deepEqual([...first.imports, ...second.imports].map(row => row.importId), expected.map(row => row.importId));
});

test("invalid cursor (bad base64, v2, unsafe int, non-uuid) → INVALID_CURSOR", async t => {
  const h = await importHistoryIndexFixture({ t });
  for (const cursor of ["!", ...["v2.1.aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "v1.9007199254740992.aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "v1.1.invalid"].map(text => Buffer.from(text).toString("base64url"))]) {
    await assert.rejects(h.backend.listPage({ principalId: "owner", cursor }), { code: "INVALID_CURSOR" });
  }
});

test("recovery issues one indexed active-row query", async t => {
  const h = await importHistoryIndexFixture({ t });
  const queries: string[] = [];
  const prepare = h.db.prepare.bind(h.db);
  t.mock.method(h.db, "prepare", (sql: string) => { if (/SELECT row_json FROM imports/.test(sql)) queries.push(sql); return prepare(sql); });
  await h.backend.tidy({});
  assert.equal(queries.filter(sql => sql.includes("status IN ('verifying','creating')")).length, 1);
  assert.equal(queries.some(sql => !sql.includes("WHERE")), false);
});

test('needs-owner past deadline fails with "Owner setup expired" and its stage is removed', async t => {
  t.mock.timers.enable({ apis: ["Date"], now: START });
  const h = await importHistoryIndexFixture({ t });
  const upload = await h.backend.upload({ principalId: "owner", archive: h.archive });
  const pending = await h.backend.importBackup({ principalId: "owner", source: upload });
  t.mock.timers.setTime(START + 3_600_000);
  await h.backend.tidy({});
  assert.equal(h.backend.get({ principalId: "owner", importId: pending.importId }).state, "needs-owner");
  t.mock.timers.setTime(START + 3_600_001);
  await h.backend.tidy({});
  assert.equal(h.backend.get({ principalId: "owner", importId: pending.importId }).error, "Owner setup expired");
  assert.equal(fs.existsSync(h.registry.stagePath(pending)), false);
});

test("list, retry and expiry work with history-dir enumeration failing", async t => {
  const { h, upload, ready } = await finishedImport(t, "no-scan");
  const readdir = fs.readdirSync;
  t.mock.method(fs, "readdirSync", (directory: fs.PathLike, ...args: unknown[]) => {
    assert.notEqual(String(directory), h.registry.directory);
    return Reflect.apply(readdir, fs, [directory, ...args]);
  });
  await h.backend.tidy({});
  assert.equal((await h.backend.list({ principalId: "owner" }))[0]!.importId, ready.importId);
  assert.equal((await h.backend.importBackup({ principalId: "owner", source: upload, requestId: "no-scan" })).importId, ready.importId);
});


test("two workspaces under one appData never see each other's rows or fences", async t => {
  const h = await importFixture(t);
  const captures: (Parameters<typeof createSiteImportBackend>[0] & { backfill: ReturnType<typeof bindSiteImportBackfill> })[] = [];
  const real = await import("../import-backend.js");
  t.mock.module(new URL("../import-backend.ts", import.meta.url).href, { namedExports: {
    ...real,
    createSiteImportBackend: (required: Parameters<typeof createSiteImportBackend>[0] & { backfill: ReturnType<typeof bindSiteImportBackfill> }, optional: Parameters<typeof createSiteImportBackend>[1]) => {
      captures.push(required);
      return createSiteImportBackend(required, optional);
    },
  } });
  const { composeSiteImportBackend } = await import("#src/server/runtime/composition/site-import-backend");
  for (const workspaceId of ["first", "second"]) composeSiteImportBackend({ workspaceId, workspace: h.workspace, savedKeys: { restore: leaveSavedKeysOut }, startSite: async () => ({ adminUrl: null, status: "stopped" }) });
  const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const first = captures[0]!, second = captures[1]!;
  fs.writeFileSync(path.join(first.registry.directory, `${id}.json`), JSON.stringify({ importId: id, principalId: "owner", requestId: "same", status: "ready", source: { uploadId: id }, displayName: "test", newSiteId: null, newSiteName: null, createdAt: new Date().toISOString(), expiresAt: Date.now() }));
  for (const input of captures) await input.registry.exclusive({ run: async () => { assert.equal(input.backfill({}).state, "cutover"); } });
  assert.notEqual(first.registry.directory, second.registry.directory);
  const policy = { cutoverPolicy: "rollback" as const, historyVisibleMs: 2_592_000_000 as const, replayFenceMs: 31_536_000_000 as const, legacyRetireMs: 2_592_000_000 as const, sweepOnClockRollback: false as const };
  for (const [index, input] of captures.entries()) {
    const file = path.join(input.registry.directory, "site-imports.db");
    const handle = openImportIndex({ file, open: openNativeSqlite, clock: h.payload.clock, policy, checkIntegrity: () => {}, integrityMemo: createImportIndexIntegrityMemo({}) }, { readonly: true, mustExist: true });
    try {
      assert.equal(handle.store.get({ importId: id, principalId: "owner" }) !== undefined, index === 0);
      assert.equal(lookupFence({ db: handle.db, policy, principalId: "owner", requestId: "same", now: Date.now() }) !== undefined, index === 0);
    } finally { handle.close({}); }
  }
});

for (const [title, bytes] of [["unreadable row blocks cutover and keeps its file", "{"], ["malformed-but-parseable row blocks cutover", '{"importId":"wrong"}']] as const) test(title, async t => {
  const h = await importHistoryIndexFixture({ t });
  const file = path.join(h.registry.directory, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json");
  fs.writeFileSync(file, bytes);
  const backfill = bindSiteImportBackfill({ directory: h.registry.directory, fs: h.payload.fs, clock: h.clock, policy: h.policy, openCandidate: () => assert.fail("invalid legacy cannot open a candidate"), log: () => {} });
  assert.deepEqual(backfill({}), { state: "blocked" });
  assert.equal(fs.readFileSync(file, "utf8"), bytes);
  assert.deepEqual(h.db.prepare("SELECT * FROM imports").all(), []);
  assert.equal(h.db.prepare("SELECT value FROM meta WHERE key='db_id'").get(), undefined);
});

test("backfill crash before commit leaves no marker and no rows", async t => {
  const h = await importHistoryIndexFixture({ t });
  const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  fs.writeFileSync(path.join(h.registry.directory, `${id}.json`), JSON.stringify({ importId: id, principalId: "owner", status: "needs-owner", source: { uploadId: id }, displayName: "test", newSiteId: null, newSiteName: null, createdAt: new Date().toISOString(), expiresAt: Date.now() + 3600_000 }));
  h.db.exec("CREATE TRIGGER crash_backfill BEFORE INSERT ON imports BEGIN SELECT RAISE(ABORT,'interrupt'); END");
  const backfill = bindSiteImportBackfill({ directory: h.registry.directory, fs: h.payload.fs, clock: h.clock, policy: h.policy, openCandidate: h.openCandidate, log: () => {} });
  assert.throws(() => backfill({}), /interrupt/);
  assert.deepEqual(h.db.prepare("SELECT * FROM imports").all(), []);
  assert.equal(h.db.prepare("SELECT value FROM meta WHERE key='db_id'").get(), undefined);
});

test("interrupt the backfill and restart → exactly one copy of each row and fence", async t => {
  const h = await importHistoryIndexFixture({ t });
  for (let n = 1; n <= 2; n++) {
    const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    fs.writeFileSync(path.join(h.registry.directory, `${id}.json`), JSON.stringify({ importId: id, principalId: "owner", requestId: `request-${n}`, status: "needs-owner", source: { uploadId: id }, displayName: "test", newSiteId: null, newSiteName: null, createdAt: new Date().toISOString(), expiresAt: Date.now() + 3600_000 }));
  }
  const backfill = bindSiteImportBackfill({ directory: h.registry.directory, fs: h.payload.fs, clock: h.clock, policy: h.policy, openCandidate: h.openCandidate, log: () => {} });
  h.db.exec("CREATE TRIGGER crash_midway BEFORE INSERT ON imports WHEN NEW.import_id LIKE '%000000000002' BEGIN SELECT RAISE(ABORT,'mid-rows'); END");
  assert.throws(() => backfill({}), /mid-rows/);
  assert.deepEqual(h.db.prepare("SELECT * FROM imports").all(), []);
  h.db.exec("DROP TRIGGER crash_midway");
  h.db.exec("CREATE TRIGGER crash_marker BEFORE INSERT ON meta WHEN NEW.key='db_id' BEGIN SELECT RAISE(ABORT,'before-commit'); END");
  assert.throws(() => backfill({}), /before-commit/);
  assert.deepEqual(h.db.prepare("SELECT * FROM replay").all(), []);
  h.db.exec("DROP TRIGGER crash_marker");
  assert.equal(backfill({}).state, "cutover");
  const reopened = h.openCandidate({});
  reopened.close({});
  assert.equal(backfill({}).state, "cutover");
  assert.equal(h.db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM imports").get()!.n, 2);
  assert.equal(h.db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM replay").get()!.n, 2);
  assert.equal(fs.existsSync(path.join(h.registry.directory, "import-index.state.json")), false);
});

test("origin-only key still fences a different source", async t => {
  const h = await importHistoryIndexFixture({ t });
  const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  fs.writeFileSync(path.join(h.registry.directory, `${id}.json`), JSON.stringify({ importId: id, principalId: "owner", requestId: "origin", status: "ready", source: { url: "https://old.example/path.zip" }, displayName: "test", newSiteId: "existing", newSiteName: "existing", createdAt: new Date().toISOString(), expiresAt: Date.now() }));
  const backfill = bindSiteImportBackfill({ directory: h.registry.directory, fs: h.payload.fs, clock: h.clock, policy: h.policy, openCandidate: h.openCandidate, log: () => {} });
  assert.equal(backfill({}).state, "cutover");
  await assert.rejects(h.backend.importBackup({ principalId: "owner", source: { url: "https://different.example/archive.zip" }, requestId: "origin" }), { code: "REQUEST_CONFLICT" });
});

test("needs-owner row and its stage survive backfill; owner setup completes after cutover", async t => {
  const h = await importFixture(t);
  const upload = await h.backend.upload({ principalId: "owner", archive: h.archive });
  const pending = await h.backend.importBackup({ principalId: "owner", source: upload });
  const indexed = await importHistoryIndexFixture({ t });
  const row = h.registry.get({ principalId: "owner", importId: pending.importId });
  fs.writeFileSync(path.join(indexed.registry.directory, `${row.importId}.json`), JSON.stringify(row));
  fs.renameSync(h.registry.stagePath(row), indexed.registry.stagePath(row));
  const backfill = bindSiteImportBackfill({ directory: indexed.registry.directory, fs: indexed.payload.fs, clock: indexed.clock, policy: indexed.policy, openCandidate: indexed.openCandidate, log: () => {} });
  assert.equal(backfill({}).state, "cutover");
  assert.equal(fs.existsSync(indexed.registry.stagePath(row)), true);
  const ready = await indexed.backend.completeOwner({ principalId: "owner", importId: row.importId, adminPassword: OWNER_PASSWORD });
  assert.equal(ready.state, "ready");
  assert.equal(indexed.workspace.registry({}).list({}).length, 1);
});

test("active verifying/creating recovery keeps its allocation", async t => {
  const h = await importHistoryIndexFixture({ t });
  const upload = await h.backend.upload({ principalId: "owner", archive: h.archive });
  const pending = await h.backend.importBackup({ principalId: "owner", source: upload });
  const preservedStage = path.join(h.root, "preserved-owner-stage");
  fs.cpSync(h.registry.stagePath(pending), preservedStage, { recursive: true });
  const ready = await h.backend.completeOwner({ principalId: "owner", importId: pending.importId, adminPassword: OWNER_PASSWORD });
  const allocated = h.store.get({ importId: pending.importId, principalId: "owner" })!;
  assert.ok(allocated.creation);
  const verifyingId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  for (const [status, id] of [["verifying", verifyingId], ["creating", allocated.importId]] as const) {
    const row = { ...allocated, importId: id, status, createdAt: new Date(START - 400 * DAY).toISOString(), expiresAt: START };
    fs.writeFileSync(path.join(h.registry.directory, `${id}.json`), JSON.stringify(row));
    fs.cpSync(preservedStage, h.registry.stagePath({ importId: id }), { recursive: true });
  }
  assert.equal(h.backfill({}).state, "cutover");
  assert.deepEqual(h.store.get({ importId: allocated.importId, principalId: "owner" })!.creation, allocated.creation);
  assert.equal(h.store.activeRows({}).length, 2);
  const started = h.started.length;
  await h.backend.tidy({});
  assert.equal(h.backend.get({ importId: allocated.importId, principalId: "owner" }).newSiteId, ready.newSiteId);
  assert.equal(h.workspace.registry({}).list({}).length, 1);
  assert.equal(h.started.length, started);
  assert.equal(fs.existsSync(h.registry.stagePath(allocated)), false);
});

test("two legacy rows with one requestId: newest fences, both histories listed", async t => {
  const h = await importHistoryIndexFixture({ t });
  for (const [index, id] of ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"].entries()) {
    fs.writeFileSync(path.join(h.registry.directory, `${id}.json`), JSON.stringify({ importId: id, principalId: "owner", requestId: "duplicate", status: "ready", source: { uploadId: id }, displayName: "test", newSiteId: null, newSiteName: null, createdAt: new Date(Date.now() - 1000 + index).toISOString(), expiresAt: Date.now() }));
  }
  const backfill = bindSiteImportBackfill({ directory: h.registry.directory, fs: h.payload.fs, clock: h.clock, policy: h.policy, openCandidate: h.openCandidate, log: () => {} });
  assert.equal(backfill({}).state, "cutover");
  assert.equal((await h.backend.list({ principalId: "owner" })).length, 2);
  assert.equal(lookupFence({ db: h.db, policy: h.policy, principalId: "owner", requestId: "duplicate", now: h.clock.nowMs() })!.import_id, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
});
