/**
 * @file P5-T4.T authority at the real host binding: real disk, real SQLite, temp roots. Pins the
 * state → witness → SQL write fence, fail-closed refusal once indexed, workspace identity, and the
 * pre-write quarantine of a suspect DB with its WAL/SHM leftovers.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import type { ImportHistoryPolicy, SiteImportRecord } from "@jini-ai/core/contracts/site/site-import-history";
import type { SqliteSyncClient } from "@jini-ai/core/contracts/storage";
import { createImportIndexIntegrityMemo, openImportIndex } from "@jini-ai/devops/backup/site/import-index/open";
import { indexStatePaths } from "@jini-ai/devops/backup/site/import-index/mode";
import { openNativeSqlite } from "#src/platform/db/kernel/drivers/sqlite";
import { bindSiteImportBackfill } from "#src/server/runtime/composition/site-import-backfill";
import { createSiteImportPayloadFs } from "#src/server/runtime/composition/site-import-payload-fs";
import { bindSiteImportIndexState, type SiteImportIndexStateFs } from "#src/server/runtime/composition/site-import-index-state";
import { runImportLocalCommand } from "#src/cli/commands/import-local";
import { ValidationError } from "#src/platform/site-dir/index";
import { createSiteImportBackend } from "../import-backend.js";
import { hostBoundBackend, seedIndexState, seedWitness } from "./import-history-index.fixture.js";
import { importFixture, OWNER_PASSWORD } from "./import.fixture.js";

const NOW = Date.UTC(2026, 10, 1);
const DB = "site-imports.db";
type Open = (required: { file: string; options: { readonly?: boolean; fileMustExist?: boolean } }, optional?: Record<string, never>) => SqliteSyncClient;
const nativeOpen: Open = ({ file, options }, _optional = {}) => openNativeSqlite(file, options) as SqliteSyncClient;

function tempRoot({ t }: { t: TestContext }): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "import-mode-"));
  fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function bind({ root, cutoverPolicy = "enable", fs: filesystem = fs, open = nativeOpen, clock = { nowMs: () => NOW } }: { root: string; cutoverPolicy?: ImportHistoryPolicy["cutoverPolicy"]; fs?: SiteImportIndexStateFs; open?: Open; clock?: { nowMs(): number } }) {
  const policy: ImportHistoryPolicy = { cutoverPolicy, historyVisibleMs: 2_592_000_000, replayFenceMs: 31_536_000_000, legacyRetireMs: 2_592_000_000, sweepOnClockRollback: false };
  const checkIntegrity = ({ db }: { db: SqliteSyncClient; file: string }, _optional: Record<string, never> = {}) => {
    if (db.pragma("quick_check(1)", { simple: true }) !== "ok") throw Object.assign(new Error("corrupt"), { code: "SQLITE_CORRUPT" });
  };
  const integrityMemo = createImportIndexIntegrityMemo({});
  const file = path.join(root, DB);
  const backfill = bindSiteImportBackfill({ directory: root, fs: createSiteImportPayloadFs({}), clock, policy, log: () => {},
    openCandidate: (_required, _optional = {}) => {
      if (!fs.existsSync(file)) fs.closeSync(fs.openSync(file, "wx", 0o600));
      return openImportIndex({ file, open: (file, options) => open({ file, options }), clock, policy, integrityMemo, checkIntegrity });
    } });
  return bindSiteImportIndexState({ directory: root, policy, clock, fs: filesystem, open, checkIntegrity, backfill, log: () => {} });
}

const row = (importId = randomUUID()): SiteImportRecord => ({ importId, principalId: "owner", source: { uploadId: importId }, displayName: "Old site", newSiteId: null, newSiteName: null, status: "verifying", createdAt: new Date(NOW).toISOString(), expiresAt: NOW + 86_400_000 });
const readState = (root: string) => JSON.parse(fs.readFileSync(indexStatePaths({ root }).state, "utf8")) as { mode: string; dbId: string | null };
const exists = (file: string) => fs.existsSync(file);

/** Cuts over (enable) without writing; returns the cutover db id. */
async function toCutover({ root }: { root: string }): Promise<string> {
  await bind({ root }).history.locked({ run: async () => undefined });
  assert.equal(readState(root).mode, "cutover");
  return readState(root).dbId!;
}

/** Cuts over and commits one indexed row; returns its import id. */
async function toIndexed({ root }: { root: string }): Promise<string> {
  const id = randomUUID();
  await bind({ root }).history.locked({ run: async (session) => {
    assert.equal(session.kind, "index");
    if (session.kind === "index") session.store.put({ row: row(id), beforeWrite: session.beforeWrite });
  } });
  assert.equal(readState(root).mode, "indexed");
  return id;
}

/** Top-level names, bytes and mtimes: what "touched nothing" means for a root. */
function snapshotRoot({ root }: { root: string }): string {
  return JSON.stringify(fs.readdirSync(root).sort().map((name) => {
    const stat = fs.lstatSync(path.join(root, name));
    return [name, stat.mtimeMs, stat.isFile() ? fs.readFileSync(path.join(root, name)).toString("base64") : "dir"];
  }));
}

async function assertRefused({ root, code }: { root: string; code: string }) {
  assert.throws(() => bind({ root }).history.read({ run: () => "served" }), { code });
  await assert.rejects(bind({ root }).history.locked({ run: async () => "served" }), { code });
}

test("missing DB after an indexed write fails closed", async (t) => {
  const root = tempRoot({ t });
  await toIndexed({ root });
  const stale = path.join(root, `${randomUUID()}.json`);
  fs.writeFileSync(stale, JSON.stringify(row()), { mode: 0o600 });
  for (const name of [DB, `${DB}-wal`, `${DB}-shm`]) fs.rmSync(path.join(root, name), { force: true });
  // A leftover sidecar makes the opener run: it must not create a fresh, empty main DB.
  fs.writeFileSync(path.join(root, `${DB}-wal`), "");
  const before = snapshotRoot({ root });
  await assertRefused({ root, code: "IMPORT_HISTORY_MISSING" });
  assert.equal(exists(path.join(root, DB)), false);
  assert.equal(snapshotRoot({ root }), before);
});

test("index-state says indexed before the first post-cutover row is committed", async (t) => {
  const root = tempRoot({ t });
  await toCutover({ root });
  const seen: { mode: string; witness: boolean }[] = [];
  let armed = false;
  const observe = (sql: string) => { if (armed && /^\s*(INSERT|UPDATE|DELETE|REPLACE)/i.test(sql)) seen.push({ mode: readState(root).mode, witness: exists(indexStatePaths({ root }).witness) }); };
  const open: Open = (required, _optional = {}) => {
    const db = nativeOpen(required);
    return new Proxy(db, { get(target, key) {
      const value = Reflect.get(target, key) as unknown;
      if (key === "prepare") return (sql: string) => {
        const statement = target.prepare(sql);
        return new Proxy(statement, { get(inner, name) {
          const member = Reflect.get(inner, name) as unknown;
          if (name === "run") return (...args: unknown[]) => { observe(sql); return (member as (...a: unknown[]) => unknown).apply(inner, args); };
          return typeof member === "function" ? member.bind(inner) : member;
        } });
      };
      if (key === "exec") return (sql: string) => { observe(sql); return target.exec(sql); };
      return typeof value === "function" ? value.bind(target) : value;
    } });
  };
  await bind({ root, open }).history.locked({ run: async (session) => {
    assert.equal(session.kind, "index");
    armed = true;
    if (session.kind === "index") session.store.put({ row: row(), beforeWrite: session.beforeWrite });
  } });
  assert.ok(seen.length > 0, "the put ran mutating SQL");
  assert.deepEqual(seen[0], { mode: "indexed", witness: true });
});

test("DB from another workspace is refused", async (t) => {
  const home = tempRoot({ t });
  const other = tempRoot({ t });
  await toIndexed({ root: home });
  await toIndexed({ root: other });
  fs.copyFileSync(path.join(other, DB), path.join(home, DB));
  const copied = fs.readFileSync(path.join(home, DB));
  await assertRefused({ root: home, code: "IMPORT_HISTORY_MISSING" });
  assert.deepEqual(fs.readFileSync(path.join(home, DB)), copied);
});

test("lost state with evidence of indexed writes fails closed", async (t) => {
  const root = tempRoot({ t });
  await toIndexed({ root });
  fs.rmSync(indexStatePaths({ root }).state);
  await assertRefused({ root, code: "IMPORT_HISTORY_MISSING" });
  // Only the witness survives: still refused, and nothing (state, DB) is recreated.
  for (const name of [DB, `${DB}-wal`, `${DB}-shm`]) fs.rmSync(path.join(root, name), { force: true });
  await assertRefused({ root, code: "IMPORT_HISTORY_MISSING" });
  assert.equal(exists(indexStatePaths({ root }).state), false);
  assert.equal(exists(path.join(root, DB)), false);
});

test("missing or malformed state with a surviving witness or DB is refused", async (t) => {
  const malformed = tempRoot({ t });
  await toIndexed({ root: malformed });
  fs.writeFileSync(indexStatePaths({ root: malformed }).state, JSON.stringify({ schema: "site-import-index-state/1", mode: "indexed" }));
  await assertRefused({ root: malformed, code: "IMPORT_HISTORY_MISSING" });
  const garbled = tempRoot({ t });
  seedWitness({ root: garbled });
  fs.writeFileSync(indexStatePaths({ root: garbled }).state, "{not json");
  await assertRefused({ root: garbled, code: "IMPORT_HISTORY_MISSING" });
  // Unreadable state is refused, never quarantined or rewritten.
  assert.equal(fs.readFileSync(indexStatePaths({ root: garbled }).state, "utf8"), "{not json");
  const bare = tempRoot({ t });
  seedIndexState({ root: bare, mode: "indexed", dbId: randomUUID(), cutoverAt: NOW });
  fs.writeFileSync(indexStatePaths({ root: bare }).state, "[]");
  await assertRefused({ root: bare, code: "IMPORT_HISTORY_MISSING" });
  const witnessOnly = tempRoot({ t });
  seedWitness({ root: witnessOnly });
  await assertRefused({ root: witnessOnly, code: "IMPORT_HISTORY_MISSING" });
});

test("a refused read or locked entry touches nothing on disk", async (t) => {
  const root = tempRoot({ t });
  await toIndexed({ root });
  fs.writeFileSync(path.join(root, `${randomUUID()}.json`), JSON.stringify(row()), { mode: 0o600 });
  fs.rmSync(path.join(root, DB));
  fs.writeFileSync(path.join(root, `${DB}-shm`), "leftover");
  const before = snapshotRoot({ root });
  const binding = bind({ root });
  assert.throws(() => binding.history.read({ run: () => "served" }), { code: "IMPORT_HISTORY_MISSING" });
  // Latched: later entries refuse with the same error without another disk probe.
  await assert.rejects(binding.history.locked({ run: async () => "served" }), { code: "IMPORT_HISTORY_MISSING" });
  assert.throws(() => binding.retire({}), { code: "IMPORT_HISTORY_MISSING" });
  assert.equal(binding.refusal({})?.code, "IMPORT_HISTORY_MISSING");
  assert.equal(snapshotRoot({ root }), before);
});

test("newer sidecar is not quarantined", async (t) => {
  const root = tempRoot({ t });
  const dbId = await toCutover({ root });
  const db = openNativeSqlite(path.join(root, DB), { fileMustExist: true });
  db.pragma("user_version = 2");
  db.close();
  const bytes = fs.readFileSync(path.join(root, DB));
  await assertRefused({ root, code: "IMPORT_HISTORY_NEWER" });
  assert.deepEqual(fs.readFileSync(path.join(root, DB)), bytes);
  assert.equal(exists(path.join(root, `site-imports.quarantine-${dbId}`)), false);
  assert.equal(readState(root).mode, "cutover");
});

for (const damage of ["corrupt", "missing"] as const) {
  test(`pre-write cutover with a ${damage} DB and WAL/SHM leftovers is quarantined and legacy takes over`, async (t) => {
    const root = tempRoot({ t });
    const dbId = await toCutover({ root });
    if (damage === "corrupt") fs.writeFileSync(path.join(root, DB), Buffer.alloc(8192, 0x78));
    else fs.rmSync(path.join(root, DB));
    fs.writeFileSync(path.join(root, `${DB}-wal`), "wal leftover");
    fs.writeFileSync(path.join(root, `${DB}-shm`), "shm leftover");
    const sessions: string[] = [];
    await bind({ root, cutoverPolicy: "rollback" }).history.locked({ run: async (session) => { sessions.push(session.kind); } });
    assert.deepEqual(sessions, ["legacy"]);
    assert.equal(readState(root).mode, "legacy");
    const quarantine = path.join(root, `site-imports.quarantine-${dbId}`);
    assert.equal(fs.statSync(quarantine).mode & 0o777, 0o700);
    const moved = damage === "corrupt" ? [DB, `${DB}-wal`, `${DB}-shm`] : [`${DB}-wal`, `${DB}-shm`];
    assert.deepEqual(fs.readdirSync(quarantine).sort(), moved.sort());
    for (const name of [DB, `${DB}-wal`, `${DB}-shm`]) assert.equal(exists(path.join(root, name)), false, `${name} left the root`);
    if (damage === "corrupt") assert.deepEqual(fs.readFileSync(path.join(quarantine, DB)), Buffer.alloc(8192, 0x78));
  });
}

test("a state-write failure before admission writes no SQL row and no witness", async (t) => {
  const root = tempRoot({ t });
  await toCutover({ root });
  const failing: SiteImportIndexStateFs = { ...fs, openSync: ((file: fs.PathLike, ...rest: unknown[]) => {
    if (String(file).includes("import-index.state.json")) throw Object.assign(new Error("I/O error"), { code: "EIO" });
    return (fs.openSync as (...a: unknown[]) => number)(file, ...rest);
  }) as typeof fs.openSync };
  const id = randomUUID();
  await assert.rejects(bind({ root, fs: failing }).history.locked({ run: async (session) => {
    if (session.kind === "index") session.store.put({ row: row(id), beforeWrite: session.beforeWrite });
  } }), { code: "EIO" });
  assert.equal(exists(indexStatePaths({ root }).witness), false);
  assert.equal(readState(root).mode, "cutover");
  assert.equal(bind({ root }).history.read({ run: (session) => session.kind === "index" ? session.store.get({ importId: id, principalId: "owner" }) ?? null : "legacy" }), null);
});

const MISSING = "Import history is missing, so imports are paused to avoid creating the same site twice. Nothing was changed. Contact support with this error ID.";
const DAY = 86_400_000;
const isMissing = (error: unknown) => (error as { code?: string }).code === "IMPORT_HISTORY_MISSING";

/** An indexed state and witness whose DB is gone: the workspace must refuse, not reopen stale JSON. */
async function refusedWorkspace({ t }: { t: TestContext }) {
  const h = await importFixture(t);
  const bound = hostBoundBackend({ h });
  seedIndexState({ root: bound.directory, mode: "indexed", dbId: randomUUID(), cutoverAt: NOW });
  seedWitness({ root: bound.directory });
  // The import fixture pre-creates payloads/; a pre-P5 workspace has none, and a refused process must not make it.
  fs.rmSync(path.join(bound.directory, "payloads"), { recursive: true, force: true });
  // A pre-namespace payload left at the root: a refused process must not move it into payloads/.
  fs.writeFileSync(path.join(bound.directory, `${randomUUID()}.zip`), "zip", { mode: 0o600 });
  return { h, ...bound };
}

test("a refused process creates or moves no payload directory", async (t) => {
  const { h, backend, directory } = await refusedWorkspace({ t });
  const before = snapshotRoot({ root: directory });
  await assert.rejects(backend.upload({ principalId: "recipient", archive: h.archive }), isMissing);
  assert.equal(exists(path.join(directory, "payloads")), false);
  assert.equal(snapshotRoot({ root: directory }), before);
});

test("once refused, every backend method and CLI tidy fail with the typed error and touch nothing", async (t) => {
  const { h, backend, directory } = await refusedWorkspace({ t });
  const before = snapshotRoot({ root: directory });
  const importId = randomUUID();
  const calls: Array<[string, () => Promise<unknown>]> = [
    ["importBackup", () => backend.importBackup({ principalId: "recipient", source: { uploadId: randomUUID() }, requestId: "r" })],
    ["completeOwner", () => backend.completeOwner({ principalId: "recipient", importId, adminPassword: OWNER_PASSWORD })],
    ["upload", () => backend.upload({ principalId: "recipient", archive: h.archive })],
    ["list", () => backend.list({ principalId: "recipient" })],
    ["listPage", () => backend.listPage({ principalId: "recipient" })],
    ["get", async () => backend.get({ principalId: "recipient", importId })],
  ];
  for (const [name, call] of calls) await assert.rejects(call(), isMissing, name);
  // The CLI keeps the error's own plain sentence, not a stack.
  await assert.rejects(runImportLocalCommand({}, { readRequest: async () => JSON.stringify({ tidy: true }), workspace: h.workspace, backend }),
    (error: unknown) => error instanceof ValidationError && error.message === MISSING);
  assert.equal(snapshotRoot({ root: directory }), before);
});

test("a legacy put is refused when another process moved authority to the index", async (t) => {
  const h = await importFixture(t);
  const { registry, directory } = hostBoundBackend({ h });
  const id = randomUUID();
  await assert.rejects(registry.exclusive({ run: async () => {
    assert.equal(registry.session.kind, "legacy");
    seedIndexState({ root: directory, mode: "indexed", dbId: randomUUID(), cutoverAt: NOW });
    registry.put({ row: row(id) });
  } }), isMissing);
  assert.equal(exists(path.join(directory, `${id}.json`)), false);
});

/** Writes a legacy `<uuid>.json` snapshot file with an explicit mtime. */
function legacyFile({ root, mtimeMs, name = `${randomUUID()}.json` }: { root: string; mtimeMs: number; name?: string }): string {
  const file = path.join(root, name);
  fs.writeFileSync(file, "{}", { mode: 0o600 });
  fs.utimesSync(file, new Date(mtimeMs), new Date(mtimeMs));
  return file;
}

test("tidy retires the legacy snapshot once the index is authoritative", async (t) => {
  const h = await importFixture(t);
  let now = NOW;
  const { authority, backend, directory } = hostBoundBackend({ h, cutoverPolicy: "enable", clock: { nowMs: () => now } });
  await authority.history.locked({ run: async (session) => { if (session.kind === "index") session.store.put({ row: row(), beforeWrite: session.beforeWrite }); } });
  const old = legacyFile({ root: directory, mtimeMs: NOW - DAY });
  now = NOW + 30 * DAY;
  await backend.tidy({});
  assert.equal(exists(old), false);
});

test("pre-write rollback reads the legacy snapshot", async (t) => {
  const h = await importFixture(t);
  const legacy = hostBoundBackend({ h });
  const id = randomUUID();
  await legacy.registry.exclusive({ run: async () => legacy.registry.put({ row: row(id) }) });
  await hostBoundBackend({ h, cutoverPolicy: "enable" }).registry.exclusive({ run: async () => undefined });
  assert.equal(readState(legacy.directory).mode, "cutover");
  fs.rmSync(path.join(legacy.directory, DB));
  const rollback = hostBoundBackend({ h });
  assert.equal(rollback.backend.get({ principalId: "owner", importId: id }).importId, id);
  assert.deepEqual((await rollback.backend.list({ principalId: "owner" })).map(view => view.importId), [id]);
});

test("permitted pre-write rollback can still complete owner setup", async (t) => {
  const h = await importFixture(t);
  const legacy = hostBoundBackend({ h });
  const upload = await legacy.backend.upload({ principalId: "recipient", archive: h.archive });
  const pending = await legacy.backend.importBackup({ principalId: "recipient", source: { uploadId: upload.uploadId } });
  assert.equal(pending.status, "needs-owner");
  await hostBoundBackend({ h, cutoverPolicy: "enable" }).registry.exclusive({ run: async () => undefined });
  assert.equal(readState(legacy.directory).mode, "cutover");
  fs.rmSync(path.join(legacy.directory, DB));
  // The pending stage survives the cutover and the rollback in the payload namespace.
  assert.equal(exists(legacy.registry.stagePath({ importId: pending.importId })), true);
  const created = await hostBoundBackend({ h }).backend.completeOwner({ principalId: "recipient", importId: pending.importId, adminPassword: OWNER_PASSWORD });
  assert.equal(created.status, "ready");
  assert.equal(h.started.length, 1);
  assert.equal(readState(legacy.directory).mode, "legacy");
});

test("post-cutover replay after restart returns the stored site, not a second one", async (t) => {
  const h = await importFixture(t);
  const first = hostBoundBackend({ h, cutoverPolicy: "enable" });
  const upload = await first.backend.upload({ principalId: "recipient", archive: h.archive });
  const pending = await first.backend.importBackup({ principalId: "recipient", source: { uploadId: upload.uploadId }, requestId: "replay-me" });
  const created = await first.backend.completeOwner({ principalId: "recipient", importId: pending.importId, adminPassword: OWNER_PASSWORD });
  assert.equal(readState(first.directory).mode, "indexed");
  const sites = fs.readdirSync(h.workspace.home({})).length;
  const restarted = hostBoundBackend({ h, cutoverPolicy: "enable" });
  const again = await restarted.backend.importBackup({ principalId: "recipient", source: { uploadId: upload.uploadId }, requestId: "replay-me" });
  assert.equal(again.importId, created.importId);
  assert.equal(again.newSiteId, created.newSiteId);
  assert.equal(h.started.length, 1);
  assert.equal(fs.readdirSync(h.workspace.home({})).length, sites);
});

test("snapshot retained at 30d − 1 ms, removed at 30d, never in cutover mode", async (t) => {
  const cutoverRoot = tempRoot({ t });
  await toCutover({ root: cutoverRoot });
  const kept = legacyFile({ root: cutoverRoot, mtimeMs: NOW - DAY });
  assert.deepEqual(bind({ root: cutoverRoot, clock: { nowMs: () => NOW + 60 * DAY } }).retire({}), { removed: 0, finished: false });
  assert.equal(exists(kept), true);
  const root = tempRoot({ t });
  await toIndexed({ root });
  const old = legacyFile({ root, mtimeMs: NOW - DAY });
  assert.equal(bind({ root, clock: { nowMs: () => NOW + 30 * DAY - 1 } }).retire({}).removed, 0);
  assert.equal(exists(old), true);
  assert.deepEqual(bind({ root, clock: { nowMs: () => NOW + 30 * DAY } }).retire({}), { removed: 1, finished: true });
  assert.equal(exists(old), false);
});

test("retirement keeps a history file written after cutover", async (t) => {
  const root = tempRoot({ t });
  await toIndexed({ root });
  const old = legacyFile({ root, mtimeMs: NOW - DAY });
  const newer = legacyFile({ root, mtimeMs: NOW + 60_000 });
  assert.equal(bind({ root, clock: { nowMs: () => NOW + 30 * DAY } }).retire({}).removed, 1);
  assert.equal(exists(old), false);
  assert.equal(exists(newer), true);
});

test("retirement resumes after a partial pass and keeps non-history files", async (t) => {
  const root = tempRoot({ t });
  await toIndexed({ root });
  const history = Array.from({ length: 205 }, () => legacyFile({ root, mtimeMs: NOW - DAY }));
  const others = ["notes.json", "abc.json", "upload.zip"].map((name) => legacyFile({ root, name, mtimeMs: NOW - DAY }));
  const later = bind({ root, clock: { nowMs: () => NOW + 30 * DAY } });
  assert.deepEqual(later.retire({}), { removed: 200, finished: false });
  assert.equal(JSON.parse(fs.readFileSync(indexStatePaths({ root }).state, "utf8")).legacyRetiredAt, 0);
  assert.deepEqual(later.retire({}), { removed: 5, finished: true });
  assert.equal(history.some(exists), false);
  assert.deepEqual(others.map(exists), [true, true, true]);
  assert.equal(exists(indexStatePaths({ root }).witness), true);
  assert.equal(exists(path.join(root, DB)), true);
  assert.ok(JSON.parse(fs.readFileSync(indexStatePaths({ root }).state, "utf8")).legacyRetiredAt > 0);
});

test("a latched refusal stops every backend method before it reaches the registry", async (t) => {
  const h = await importFixture(t);
  const refused = Object.assign(new Error(MISSING), { code: "IMPORT_HISTORY_MISSING" }) as never;
  const backend = createSiteImportBackend({ ...h.backendPorts, authority: { refusal: () => refused, retire: () => assert.fail("retire after refusal") } });
  const importId = randomUUID();
  for (const call of [() => backend.list({ principalId: "recipient" }), () => backend.listPage({ principalId: "recipient" }), async () => backend.get({ principalId: "recipient", importId }),
    () => backend.upload({ principalId: "recipient", archive: h.archive }), () => backend.tidy({}),
    () => backend.importBackup({ principalId: "recipient", source: { uploadId: randomUUID() } }), () => backend.completeOwner({ principalId: "recipient", importId, adminPassword: OWNER_PASSWORD })]) {
    await assert.rejects(call(), (error: unknown) => error === refused);
  }
  assert.deepEqual(fs.readdirSync(h.registry.payloadDirectory), []);
});
