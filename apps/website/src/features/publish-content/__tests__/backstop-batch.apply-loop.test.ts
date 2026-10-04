import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { contentKernel } from "#src/platform/db/content-kernel";
import { createRawRowSqlitePort } from "#src/platform/db/sqlite/publish-backstop-row.sqlite";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { contributeRawRowPublish } from "../raw-row-contributor.js";
import { createPublishContentApplyPort } from "../apply-loop.js";
import { InMemoryPublishContentBundleRepo, stageBundle } from "../bundle-staging.js";
import { InMemoryPublishContentBaselineRepo } from "../baseline-repo.js";
import { InMemoryPublishContentRunRepo, getPublishContentRunStatus } from "../run-repo.js";
import { planImport } from "../planner.js";
import { registerPublishContentContributor, resetPublishContentContributorsForTests } from "../type-registry.js";
import type { PackedEntity, PublishContentDeps } from "../type-registry.js";
import type { BackstopAuditPort, BackstopAuditRecord } from "../backstop-audit.js";

test("the real apply loop joins every raw write in one FK-checked transaction and reports rollback honestly", async (t) => {
  const db = new Database(":memory:");
  t.after(() => db.close());
  resetPublishContentContributorsForTests(); t.after(resetPublishContentContributorsForTests);
  registerPublishContentContributor(contributeRawRowPublish());
  // The source deliberately contains a dangling reference. Disable enforcement only while
  // seeding it; the destination below must enforce FKs and roll back the real apply batch.
  db.exec("PRAGMA foreign_keys=OFF; CREATE TABLE p_widgets(id TEXT PRIMARY KEY, title TEXT); CREATE TABLE p_links(id TEXT PRIMARY KEY, widget_id TEXT REFERENCES p_widgets(id)); INSERT INTO p_widgets VALUES('a','new'); INSERT INTO p_links VALUES('l','missing');");
  const rows = createRawRowSqlitePort({ kernel: contentKernel(db) });
  const outbox = new InMemoryOutbox();
  const clock = { nowMs: () => Date.parse("2026-10-04T00:00:00.000Z") };
  let serial = 0;
  const idGen = { newId: () => `id-${++serial}` };
  const events = new Map<string, BackstopAuditRecord>();
  const audit: BackstopAuditPort = { ready: async () => true, save: async ({ record }) => { events.set(record.id, record); },
    get: async ({ id }) => events.get(id) ?? null, gaps: async () => [] };
  const deps: PublishContentDeps = { workspaceId: "ws", ports: {}, clock, idGen, outbox,
    changeSets: new InMemoryChangeSetRepo([], [], outbox), authorize: async () => ({ allowed: true, reason: "test" }),
    backstop: { rows, audit, inverses: [], coveredTables: [], coveredRoots: [], selection: { rows: [
      { table: "p_widgets", pk: { id: "a" } }, { table: "p_links", pk: { id: "l" } },
    ] } } };
  const entities: PackedEntity[] = [];
  for await (const entity of contributeRawRowPublish().build(deps).pack()) entities.push({ ...entity, backstop: {
    mode: "backstop", sourceActor: "admin", reason: "Emergency footer fix", destinationHost: "live.example", gapLabels: ["table:p_widgets", "table:p_links"],
  } });
  assert.equal(entities.length, 2);
  db.exec("DELETE FROM p_links; DELETE FROM p_widgets; PRAGMA foreign_keys=ON;");
  assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
  const bundle = { artifactFormatVersion: 1, hashVersion: 1, sourceLabel: "source", entities, blobManifest: [] };
  const baselineRepo = new InMemoryPublishContentBaselineRepo();
  const runRepo = new InMemoryPublishContentRunRepo();
  const bundleRepo = new InMemoryPublishContentBundleRepo();
  const staged = await stageBundle({ ...bundle, workspaceId: "ws", sourcePrincipalId: "source" }, { repo: bundleRepo, clock, idGen });
  const report = await planImport(bundle, { publishContentDeps: deps, getBaseline: async () => null, hasBlob: async () => true });
  assert.deepEqual(report.rows.map((r) => r.outcome), ["created", "created"]);
  const apply = createPublishContentApplyPort({ workspaceId: "ws", bundleRepo, baselineRepo, runRepo, publishContentDeps: deps, clock, idGen });
  await assert.rejects(apply.applyReport({ report, principalId: "admin", bundleId: staged.bundleId, restorePointId: "restore" }), /Foreign key check failed/);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM p_widgets").get() as { n: number }).n, 0);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM p_links").get() as { n: number }).n, 0);
  const event = [...events.values()][0]!;
  assert.equal(event.result, "failure");
  assert.deepEqual(event.inverses, []);
  const status = await getPublishContentRunStatus(runRepo, { workspaceId: "ws", runId: event.runId! });
  assert.equal(status?.phase, "failed");
  assert.ok(status?.report?.rows.every((row) => row.outcome === "blocked" && !row.writes));
});

test("a selected row equal to live plans unchanged through the real planner", async (t) => {
  const db = new Database(":memory:"); t.after(() => db.close());
  resetPublishContentContributorsForTests(); t.after(resetPublishContentContributorsForTests);
  registerPublishContentContributor(contributeRawRowPublish());
  db.exec("CREATE TABLE p_widgets(id TEXT PRIMARY KEY, title TEXT); INSERT INTO p_widgets VALUES('a','same');");
  const deps: PublishContentDeps = { workspaceId: "ws", ports: {}, clock: { nowMs: () => Date.parse("2026-10-04T00:00:00.000Z") }, idGen: { newId: () => "id" },
    backstop: { rows: createRawRowSqlitePort({ kernel: contentKernel(db) }), coveredTables: [], coveredRoots: [], selection: { rows: [{ table: "p_widgets", pk: { id: "a" } }] } } };
  const entities = []; for await (const entity of contributeRawRowPublish().build(deps).pack()) entities.push(entity);
  const report = await planImport({ artifactFormatVersion: 1, hashVersion: 1, entities }, { publishContentDeps: deps, getBaseline: async () => null, hasBlob: async () => true });
  assert.equal(report.rows[0]!.outcome, "unchanged");
  assert.equal(report.rows[0]!.writes, false);
});
