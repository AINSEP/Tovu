import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryDatabaseIntrospectionAdapter, InMemoryDatabaseLedgerRepo, InMemoryDbOpsAdapter, InMemoryMigrationRunsRepo,
  InMemoryRestorePointsRepo, InMemorySiteStatusRepo,
} from "../../repo.memory.js";
import type { LedgerRow } from "../../timeline.js";

/** @file The zero-infrastructure database adapters: same observable contract as the SQLite ones. */

const row = (id: string, createdAt: string, extra: Partial<LedgerRow> = {}): LedgerRow =>
  ({ id, kind: "migration.applied", createdAt, restorePointId: null, outcome: "succeeded", ...extra } as LedgerRow);

test("ledger query filters by kind/outcome/date window and pages newest-first with an id tie-break", async () => {
  const repo = new InMemoryDatabaseLedgerRepo([
    row("a", "2026-10-01T00:00:00.000Z"), row("b", "2026-10-02T00:00:00.000Z"), row("c", "2026-10-02T00:00:00.000Z"),
    row("d", "2026-10-03T00:00:00.000Z", { kind: "restore.applied", outcome: "failed" } as Partial<LedgerRow>),
  ]);
  const first = await repo.query({ limit: 2 });
  assert.deepEqual(first.items.map((r) => r.id), ["d", "c"]);
  assert.equal(first.nextCursor, "c");
  const second = await repo.query({ limit: 2, cursor: first.nextCursor });
  assert.deepEqual(second.items.map((r) => r.id), ["b", "a"]);
  assert.equal(second.nextCursor, null);
  assert.deepEqual((await repo.query({ limit: 10, kind: "restore.applied" })).items.map((r) => r.id), ["d"]);
  assert.deepEqual((await repo.query({ limit: 10, outcome: "succeeded" })).items.map((r) => r.id), ["c", "b", "a"]);
  assert.deepEqual((await repo.query({ limit: 10, fromDate: "2026-10-02T00:00:00.000Z", toDate: "2026-10-02T23:59:59.999Z" })).items.map((r) => r.id), ["c", "b"]);
});

test("an interrupted migration is appended once per run, stamped by the injected clock", async () => {
  const repo = new InMemoryDatabaseLedgerRepo([], { now: () => "2026-10-20T12:00:00.000Z" });
  await repo.appendInterruptedRow({ siteId: "site", migrationRunId: "run-1" });
  await repo.appendInterruptedRow({ siteId: "site", migrationRunId: "run-1" });
  assert.deepEqual((await repo.query({ limit: 10 })).items, [
    { id: "interrupted-run-1", kind: "migration.interrupted", createdAt: "2026-10-20T12:00:00.000Z", restorePointId: null, outcome: "blocked_pending_recovery" },
  ]);
});

test("the default ledger clock stamps a real ISO time", async () => {
  const repo = new InMemoryDatabaseLedgerRepo();
  await repo.appendInterruptedRow({ siteId: "site", migrationRunId: "run-2" });
  const [only] = (await repo.query({ limit: 1 })).items;
  assert.equal(new Date(only?.createdAt ?? "").toISOString(), only?.createdAt);
});

test("restore points dedupe by idempotency key and list newest-first with cheap file-snapshot defaults", async () => {
  const repo = new InMemoryRestorePointsRepo();
  await repo.save({ restorePointId: "rp-1", idempotencyKey: "k1", trigger: "manual", createdAt: "2026-10-01T00:00:00.000Z", createdBy: "owner" });
  await repo.save({ restorePointId: "rp-2", idempotencyKey: "k2", trigger: "migration", createdAt: "2026-10-02T00:00:00.000Z", createdBy: "system",
    costClass: "expensive", kind: "logical-dump", watermarkAtCapture: 7, artifactRef: "file:///dumps/rp-2" });
  assert.deepEqual(await repo.findByIdempotencyKey("k1"), { restorePointId: "rp-1", idempotencyKey: "k1" });
  assert.equal(await repo.findByIdempotencyKey("missing"), null);
  assert.deepEqual(await repo.list(), [
    { id: "rp-2", trigger: "migration", costClass: "expensive", kind: "logical-dump", watermarkAtCapture: 7, createdAt: "2026-10-02T00:00:00.000Z", artifactRef: "file:///dumps/rp-2" },
    { id: "rp-1", trigger: "manual", costClass: "cheap", kind: "file-snapshot", watermarkAtCapture: null, createdAt: "2026-10-01T00:00:00.000Z", artifactRef: "memory://restore-point/rp-1" },
  ]);
});

test("site status starts SERVING and remembers the last status set", async () => {
  const repo = new InMemorySiteStatusRepo();
  assert.equal(await repo.get("site"), "SERVING");
  await repo.set("site", "BLOCKED_PENDING_RECOVERY" as Parameters<InMemorySiteStatusRepo["set"]>[1]);
  assert.equal(await repo.get("site"), "BLOCKED_PENDING_RECOVERY");
});

test("migration runs resolve only the matching non-terminal run", async () => {
  const repo = new InMemoryMigrationRunsRepo();
  assert.equal(await repo.findNonTerminalForSite("site"), null);
  repo.setNonTerminal({ id: "run-1", status: "running" });
  await repo.markResolved({ id: "other" });
  assert.deepEqual(await repo.findNonTerminalForSite("site"), { id: "run-1", status: "running" });
  await repo.markResolved({ id: "run-1" });
  assert.equal(await repo.findNonTerminalForSite("site"), null);
});

test("db ops capture monotonically numbered in-memory restore points and restore without a restart", async () => {
  const ops = new InMemoryDbOpsAdapter();
  assert.deepEqual(await ops.getCapabilities(), { restorePoint: { costClass: "cheap", kind: "file-snapshot" } });
  assert.deepEqual(await ops.captureRestorePoint({ scopeId: "site" }), { artifactRef: "memory://restore-point/site/1", watermarkAtCapture: 1 });
  assert.deepEqual(await ops.captureRestorePoint({ scopeId: "site" }), { artifactRef: "memory://restore-point/site/2", watermarkAtCapture: 2 });
  assert.deepEqual(await ops.restoreFromArtifact({ artifactRef: "memory://restore-point/site/1" }), { restartRequired: false });
});

test("introspection reports a healthy in-sync memory schema with no pending migrations", async () => {
  const introspection = new InMemoryDatabaseIntrospectionAdapter();
  assert.deepEqual(await introspection.getHealth(), { canOpenDb: true, migrationsTableReadable: true, driftStatus: "in-sync" });
  assert.deepEqual(await introspection.getSchemaState(), { status: "in-sync", siteMeta: { version: 0, tag: "memory" }, runtime: { version: 0, tag: "memory" } });
  assert.deepEqual(await introspection.listPendingMigrations(), { items: [] });
});

test("ledger ordering is independent of insertion order, and a zero-size page has no cursor", async () => {
  const rows = [row("c", "2026-10-02T00:00:00.000Z"), row("a", "2026-10-01T00:00:00.000Z"), row("e", "2026-10-03T00:00:00.000Z"), row("b", "2026-10-02T00:00:00.000Z"), row("d", "2026-10-02T00:00:00.000Z")];
  for (const initial of [rows, [...rows].reverse()]) {
    const repo = new InMemoryDatabaseLedgerRepo(initial);
    assert.deepEqual((await repo.query({ limit: 10 })).items.map((r) => r.id), ["e", "d", "c", "b", "a"]);
    assert.deepEqual(await repo.query({ limit: 0 }), { items: [], nextCursor: null });
  }
});

test("restore points list newest-first regardless of save order", async () => {
  for (const order of [["1", "2", "3"], ["3", "1", "2"], ["2", "3", "1"]]) {
    const repo = new InMemoryRestorePointsRepo();
    for (const day of order) await repo.save({ restorePointId: `rp-${day}`, idempotencyKey: `k${day}`, trigger: "manual", createdAt: `2026-10-0${day}T00:00:00.000Z`, createdBy: "owner" });
    assert.deepEqual((await repo.list()).map((point) => point.id), ["rp-3", "rp-2", "rp-1"], order.join(","));
  }
});
