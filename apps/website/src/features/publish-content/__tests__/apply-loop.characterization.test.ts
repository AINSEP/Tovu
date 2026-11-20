/**
 * @file Characterization of the apply loop (`createPublishContentApplyPort`) decisions that
 * `apply-loop.test.ts` and the backstop suites leave unpinned, written before `applyOneRow` and
 * `applyReport` were split (publish-engine P0.6). The handler is a script-driven fake of the
 * `PublishContentHandler` interface; the bundle, baseline and run repos are the in-memory ports.
 * Each case names the check it guards; the mutation table (rows AL*, AR*) shows it fails when the
 * check is removed.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { PluginHookFailedError } from "../../../contracts/core/plugin-hook-failed-error.js";
import { PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION } from "@jini-ai/cms/publish/transfer";
import { createPublishContentApplyPort } from "../apply-port.js";
import { InMemoryPublishContentBaselineRepo } from "../baseline-repo.js";
import { InMemoryPublishContentBundleRepo, stageBundle } from "@jini-ai/cms/publish/transfer";
import { CONTENT_HASH_VERSION, contentHash } from "../content-hash.js";
import type { PublishContentOutcomeRow, PublishContentReport } from "../plan-rows.js";
import { InMemoryPublishContentRunRepo, type PublishContentRunRecord } from "../run-repo.js";
import { registerPublishContentContributor, resetPublishContentContributorsForTests, type PackedEntity, type PublishContentDeps, type PublishContentHandler } from "../type-registry.js";

const WS = "ws-1";
const SRC = "source-peer";
const OP = "operator";
const clock = { nowIso: () => "2026-10-01T12:00:00.000Z", nowMs() { return Date.parse(this.nowIso()); } };

test.beforeEach(() => resetPublishContentContributorsForTests());

class SpyRunRepo extends InMemoryPublishContentRunRepo {
  readonly saved: PublishContentRunRecord[] = [];
  override async save({ record }: { record: PublishContentRunRecord }) { this.saved.push(structuredClone(record)); return super.save({ record }); }
}

const pack = (type: string, id: string, extra: Partial<PackedEntity> = {}): PackedEntity => {
  const state = { title: id };
  return { entityType: type, id, schemaVersion: 1, hashVersion: CONTENT_HASH_VERSION, state, contentHash: contentHash({ entityType: type, state }), requiredBlobs: [], ...extra };
};
const row = (type: string, id: string, outcome: PublishContentOutcomeRow["outcome"], extra: Partial<PublishContentOutcomeRow> = {}): PublishContentOutcomeRow =>
  ({ entityType: type, entityId: id, entityLabel: null, outcome, writes: ["created", "applied", "forced"].includes(outcome), reason: null, canOverwrite: false, retires: null, ...extra });
const reportOf = (rows: PublishContentOutcomeRow[]): PublishContentReport => ({ refused: false, refusalReason: null, applyOrder: [...new Set(rows.map((r) => r.entityType))], rows });

interface Script {
  current: Map<string, { version: number; hash: string }>;
  apply: NonNullable<PublishContentHandler["apply"]>;
  extra: Partial<PublishContentHandler>;
  builtWith: PublishContentDeps[];
}

function harness() {
  const bundleRepo = new InMemoryPublishContentBundleRepo();
  const baselineRepo = new InMemoryPublishContentBaselineRepo();
  const runRepo = new SpyRunRepo();
  let n = 0;
  const idGen = { newId: () => `id-${++n}` };
  const publishContentDeps: PublishContentDeps = { workspaceId: WS, clock, idGen, ports: {} };
  const scripts = new Map<string, Script>();
  const register = (type: string, overrides: Partial<Script> = {}): Script => {
    const script: Script = { current: new Map(), apply: async ({ entity }) => ({ changeSetId: `cs-${entity.id}` }), extra: {}, builtWith: [], ...overrides };
    scripts.set(type, script);
    registerPublishContentContributor({
                                        contributor: { entityType: type, dependsOn: [], build: (deps) => {
        script.builtWith.push(deps);
        return { entityType: type, schemaVersion: 1, permission: "content.write", dependsOn: [],
          pack: async function* () {}, inspect: async ({ id }) => script.current.get(id) ?? null, precheck: async () => null,
          apply: (input) => script.apply(input), ...script.extra };
      } }
                                      });
    return script;
  };
  const stage = async (entities: PackedEntity[]) => (await stageBundle(
    {
      input: { workspaceId: WS, sourcePrincipalId: SRC, artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION, hashVersion: CONTENT_HASH_VERSION, entities, blobManifest: [] },
      deps: { repo: bundleRepo, clock, idGen: { newId: () => "bundle-1" } }
    },
  )).bundleId;
  const port = (extra: Partial<Parameters<typeof createPublishContentApplyPort>[0]> = {}) => createPublishContentApplyPort({
    workspaceId: WS, bundleRepo, baselineRepo, runRepo, publishContentDeps, clock, idGen, ...extra,
  });
  const apply = async (entities: PackedEntity[], report: PublishContentReport, extra: Record<string, unknown> = {}) =>
    port().applyReport({ report, principalId: OP, bundleId: await stage(entities), restorePointId: "rp-1", ...extra });
  return { bundleRepo, baselineRepo, runRepo, publishContentDeps, register, stage, port, apply, idGen };
}

const hash = (type: string, id: string) => pack(type, id).contentHash;

test("a missing or expired bundle is refused with the exact words, before any run row", async () => {
  const h = harness();
  await assert.rejects(h.port().applyReport({ report: reportOf([]), principalId: OP, bundleId: "nope", restorePointId: "rp" }),
    (err: Error) => err.message === `publish-content: bundle 'nope' was not found, or has expired, for workspace '${WS}'`);
  assert.equal(h.runRepo.saved.length, 0);
});

test("the caller's authorize and backstop replace the port's own in the bag every handler is built with", async () => {
  const h = harness();
  const script = h.register("thing");
  const authorize = async () => ({ allowed: true, reason: "attenuated" });
  const backstop = { coveredTables: ["x"], coveredRoots: [] };
  await h.apply([pack("thing", "a")], reportOf([row("thing", "a", "created")]), { authorize, backstop });
  const built = script.builtWith.at(-1)!;
  assert.equal((await built.authorize!({} as never)).reason, "attenuated", "the caller's authorize answers for the handlers");
  assert.equal(built.backstop, backstop);
  await h.apply([pack("thing", "a")], reportOf([row("thing", "a", "created")]));
  assert.equal(script.builtWith.at(-1)!.backstop, undefined, "no backstop is invented when the caller gives none");
});

test("the run row is saved as applying with every item pending BEFORE the first write, then as applied with the run's identity", async () => {
  const h = harness();
  const seenAtWrite: PublishContentRunRecord[] = [];
  h.register("thing", { apply: async ({ entity }) => { seenAtWrite.push(...h.runRepo.saved); return { changeSetId: `cs-${entity.id}` }; } });
  const result = await h.apply([pack("thing", "a")], reportOf([row("thing", "a", "created"), row("ghost", "g", "created")]));
  const first = seenAtWrite[0]!;
  assert.deepEqual([first.phase, first.finishedAt, first.changeSetIdsJson], ["applying", null, "[]"]);
  const items = JSON.parse(first.itemsJson!) as Array<{ entityId: string; phase: string; updatedAt: string; idempotencyKey: string }>;
  assert.deepEqual(items.map((i) => [i.entityId, i.phase, i.updatedAt]), [["a", "pending", clock.nowIso()], ["g", "pending", clock.nowIso()]]);
  assert.match(items[0]!.idempotencyKey, /^publish-content:v1:[0-9a-f]{64}$/);
  assert.equal(items[1]!.idempotencyKey, `publish-content:v1:missing:${createHash("sha256").update(`${WS}:${SRC}:ghost:g`).digest("hex")}`);
  const final = h.runRepo.saved.at(-1)!;
  assert.deepEqual([final.id, final.phase, final.direction, final.actorId, final.peerPrincipalId, final.peerLabel, final.restorePointId, final.workspaceId],
    [result.runId, "applied", "import", OP, SRC, null, "rp-1", WS]);
  assert.deepEqual(JSON.parse(final.changeSetIdsJson!), ["cs-a"]);
  assert.deepEqual((JSON.parse(final.itemsJson!) as Array<{ phase: string }>).map((i) => i.phase), ["completed", "completed"]);
});

test("a change set id shared by two rows is reported once", async () => {
  const h = harness();
  h.register("thing", { apply: async () => ({ changeSetId: "shared" }) });
  const result = await h.apply([pack("thing", "a"), pack("thing", "b")], reportOf([row("thing", "a", "created"), row("thing", "b", "created")]));
  assert.deepEqual(result.changeSetIds, ["shared"]);
});

test("a failure that is not an Error is recorded with the fixed summary and rethrown as it was", async () => {
  const h = harness();
  h.register("thing", { apply: async () => { throw "plain string"; } });
  await assert.rejects(h.apply([pack("thing", "a")], reportOf([row("thing", "a", "created")])), (err: unknown) => err === "plain string");
  const failed = h.runRepo.saved.at(-1)!;
  assert.equal(failed.phase, "failed");
  assert.equal((JSON.parse(failed.itemsJson!) as Array<{ errorSummary: string }>)[0]!.errorSummary, "unknown apply failure");
});

test("a plugin hook refusing a row names that item on the error of a row-by-row run", async () => {
  const h = harness();
  h.register("thing", { apply: async () => { throw new PluginHookFailedError("plugin-x", "refused"); } });
  await assert.rejects(h.apply([pack("thing", "a")], reportOf([row("thing", "a", "created")])), (err: unknown) =>
    err instanceof PluginHookFailedError && err.refusedItemRef === "thing:a");
});

test("a post-style conflict named by the handler downgrades the row with the prefixed reason", async () => {
  const h = harness();
  class Clash extends Error {}
  h.register("thing", { current: new Map([["a", { version: 1, hash: "h" }]]), apply: async () => { throw new Clash("version moved"); },
    extra: { isApplyConflict: (error: unknown): error is Error => error instanceof Clash } });
  h.baselineRepo.upsert({ record: { workspaceId: WS, peerPrincipalId: SRC, entityType: "thing", entityId: "a", hashAtLastSync: "h", hashVersion: CONTENT_HASH_VERSION, syncedAt: clock.nowIso(), runId: "r0" } });
  const result = await h.apply([pack("thing", "a")], reportOf([row("thing", "a", "applied")]));
  assert.deepEqual([result.report!.rows[0]!.outcome, result.report!.rows[0]!.writes, result.report!.rows[0]!.reason],
    ["conflict", false, "thing 'a' changed on the destination during apply: version moved"]);
});

test("an applied row is checked against the baseline of its OWN hash generation; an obsolete one never authorizes it", async () => {
  const h = harness();
  h.register("thing", { current: new Map([["a", { version: 1, hash: "live-hash" }]]) });
  await h.baselineRepo.upsert({ record: { workspaceId: WS, peerPrincipalId: SRC, entityType: "thing", entityId: "a", hashAtLastSync: "live-hash", hashVersion: CONTENT_HASH_VERSION + 1, syncedAt: clock.nowIso(), runId: "r0" } });
  const obsolete = await h.apply([pack("thing", "a")], reportOf([row("thing", "a", "applied")]));
  assert.equal(obsolete.report!.rows[0]!.outcome, "conflict");
  assert.equal(obsolete.report!.rows[0]!.reason, "thing 'a' was edited on the destination again after this run's own plan was built");
  await h.baselineRepo.upsert({ record: { workspaceId: WS, peerPrincipalId: SRC, entityType: "thing", entityId: "a", hashAtLastSync: "live-hash", hashVersion: CONTENT_HASH_VERSION, syncedAt: clock.nowIso(), runId: "r0" } });
  assert.equal((await h.apply([pack("thing", "a")], reportOf([row("thing", "a", "applied")]))).report!.rows[0]!.outcome, "applied");
});

test("a row gone at apply time is a conflict with the exact words", async () => {
  const h = harness();
  h.register("thing");
  const result = await h.apply([pack("thing", "a")], reportOf([row("thing", "a", "applied")]));
  assert.equal(result.report!.rows[0]!.reason, "thing 'a' was removed from the destination between plan and apply");
});

const retire = { entityType: "thing", entityId: "old", entityLabel: null, hash: "old-hash" };
function retiring(h: ReturnType<typeof harness>, extra: Partial<PublishContentHandler> = {}, script: Partial<Script> = {}) {
  const calls: string[] = [];
  const s = h.register("thing", { ...script, extra: {
    planRetire: async () => ({ ...retire }),
    retire: async () => { calls.push("retire"); return { changeSetId: "cs-retire", undo: async () => { calls.push("undo"); } }; },
    ...extra,
  } });
  return { s, calls };
}
const retireRow = () => row("thing", "a", "forced", { retires: retire, canOverwrite: true });

test("a retire-forced row is refused before any write when its own id is now held, or the handler cannot retire, or the live holder changed", async () => {
  const cases: Array<[string, (h: ReturnType<typeof harness>) => { calls: string[] }, string, string]> = [
    ["id held", (h) => retiring(h, {}, { current: new Map([["a", { version: 1, hash: "x" }]]) }), "conflict", "thing 'a' was created on the destination between plan and apply"],
    ["cannot retire", (h) => { h.register("thing"); return { calls: [] }; }, "blocked", "internal inconsistency: no planRetire()/retire() on the thing handler for a retire-offered row at apply time"],
    ["holder gone", (h) => retiring(h, { planRetire: async () => null }), "conflict", "the live thing at this address changed after this run's plan was built"],
    ["other holder", (h) => retiring(h, { planRetire: async () => ({ ...retire, entityId: "someone-else" }) }), "conflict", "the live thing at this address changed after this run's plan was built"],
    ["holder edited", (h) => retiring(h, { planRetire: async () => ({ ...retire, hash: "edited" }) }), "conflict", "the live thing at this address changed after this run's plan was built"],
  ];
  for (const [name, build, outcome, reason] of cases) {
    resetPublishContentContributorsForTests();
    const h = harness();
    const { calls } = build(h);
    const result = await h.apply([pack("thing", "a")], reportOf([retireRow()]));
    assert.deepEqual([result.report!.rows[0]!.outcome, result.report!.rows[0]!.writes, result.report!.rows[0]!.reason], [outcome, false, reason], name);
    assert.deepEqual(calls, [], name);
    assert.deepEqual(result.changeSetIds, [], name);
  }
});

test("a retire-forced row retires first under a run-scoped key, then creates; both change sets are tracked and the baseline refreshed", async () => {
  const h = harness();
  const keys: string[] = [];
  retiring(h, { retire: async ({ idempotencyKey }) => { keys.push(idempotencyKey); return { changeSetId: "cs-retire", undo: async () => {} }; } });
  const result = await h.apply([pack("thing", "a")], reportOf([retireRow()]));
  assert.deepEqual([result.changeSetIds, result.retiredChangeSetIds], [["cs-a"], ["cs-retire"]]);
  assert.match(keys[0]!, new RegExp(`^publish-content:v1:[0-9a-f]{64}:retire:${result.runId}$`));
  const baseline = await h.baselineRepo.findOne({ workspaceId: WS, peerPrincipalId: SRC, entityType: "thing", entityId: "a" });
  assert.equal(baseline?.hashAtLastSync, hash("thing", "a"));
  const items = JSON.parse(h.runRepo.saved.find((r) => (JSON.parse(r.itemsJson!) as Array<{ phase: string }>)[0]!.phase === "content_applied")!.itemsJson!) as Array<{ changeSetId: string; retiredChangeSetId: string }>;
  assert.deepEqual([items[0]!.changeSetId, items[0]!.retiredChangeSetId], ["cs-a", "cs-retire"], "both ids are durable before the baseline write");
});

test("when the create fails after the retire, the holder is put back; when putting it back fails too the error says so", async () => {
  const h = harness();
  const { calls } = retiring(h, {}, { apply: async () => { throw new Error("boom"); } });
  await assert.rejects(h.apply([pack("thing", "a")], reportOf([retireRow()])), /boom/);
  assert.deepEqual(calls, ["retire", "undo"]);

  resetPublishContentContributorsForTests();
  const h2 = harness();
  retiring(h2, { retire: async () => ({ changeSetId: "cs-retire", undo: async () => { throw new Error("undo failed"); } }) }, { apply: async () => { throw new Error("boom"); } });
  await assert.rejects(h2.apply([pack("thing", "a")], reportOf([retireRow()])), (err: Error) =>
    err.message === "thing 'a' was not created (boom), and putting the retired thing 'old' back failed too (undo failed) — restore it from Trash");
});

test("repointing skips every id this run wrote, reports a whole-handler failure in words, and leaves rows that never retired alone", async () => {
  const h = harness();
  const seen: Array<{ replacements: unknown; skipIds: string[] }> = [];
  retiring(h, { repointReferences: async ({ replacements, skipIds }) => { seen.push({ replacements, skipIds: [...skipIds] }); throw new Error("port not wired"); } },
    { current: new Map([["c", { version: 1, hash: "x" }]]) });
  const result = await h.apply([pack("thing", "a"), pack("thing", "c")], reportOf([retireRow(), row("thing", "c", "conflict")]));
  assert.deepEqual(seen, [{ replacements: [{ entityType: "thing", oldId: "old", newId: "a" }], skipIds: ["a"] }]);
  assert.deepEqual(result.menuLinksNotUpdated, ["Thing links were not updated: port not wired"]);
  assert.deepEqual([result.menuLinksUpdated, result.repointChangeSetIds], [0, []]);
});

test("verification skips rows that ended blocked or conflict and words a failing check", async () => {
  const h = harness();
  const verified: string[][] = [];
  h.register("thing", { current: new Map([["c", { version: 1, hash: "x" }]]), extra: { verifyApplied: async ({ entities }) => { verified.push(entities.map((e) => e.id)); throw new Error("not servable"); } } });
  const result = await h.apply([pack("thing", "a"), pack("thing", "c")], reportOf([row("thing", "a", "created"), row("thing", "c", "created")]));
  assert.deepEqual(verified, [["a"]], "c became a conflict at apply time, so it is not verified");
  assert.deepEqual(result.verificationProblems, ["Thing could not be checked after publishing: not servable"]);
});

// ---- send by hand: raw rows and files, audit, rollbacks

const metadata = { mode: "backstop" as const, reason: "needed to fix the live footer", sourceActor: "admin-1", destinationHost: "live.example", gapLabels: [] as string[] };
const raw = (type: "raw-row" | "raw-file", id: string, state: Record<string, unknown>) => ({ ...pack(type, id), state, backstop: metadata } as PackedEntity);

function audited(h: ReturnType<typeof harness>) {
  const saves: Array<Record<string, unknown>> = [];
  const events: string[] = [];
  const inverses: unknown[] = [];
  const fileRollbacks = [async () => { events.push("rollback-first"); }, async () => { events.push("rollback-second"); }];
  const backstop = {
    audit: { ready: async () => true, save: async ({ record }: { record: Record<string, unknown> }) => { saves.push(structuredClone(record)); }, get: async () => null, gaps: async () => [] },
    rows: { transaction: async ({ work }: { work: () => Promise<unknown> }) => { events.push("tx"); return work(); } },
    inverses, fileRollbacks, coveredTables: [], coveredRoots: [],
  };
  return { saves, events, inverses, fileRollbacks, backstop };
}

test("send by hand: the audit row is saved pending with each item's hash before the run, the report carries the metadata, and success records the inverses", async () => {
  const h = harness();
  const a = audited(h);
  const entity = raw("raw-row", 'p_widgets:{"id":"a"}', { table: "p_widgets", pk: { id: "a" }, columns: [], values: { id: "a" } });
  const before = { table: "p_widgets", columns: [], pk: { id: "a" }, values: { id: "a", title: "old" } };
  h.register("raw-row", {
    current: new Map([[entity.id, { version: 1, hash: "hash-before" }]]),
    apply: async () => { a.inverses.push({ kind: "raw-row", entity, before, afterHash: entity.contentHash }); return { changeSetId: "cs-raw" }; },
  });
  const result = await h.apply([entity], reportOf([row("raw-row", entity.id, "forced")]), { backstop: a.backstop });
  assert.equal(a.saves.length, 2);
  assert.deepEqual([a.saves[0]!.result, a.saves[0]!.direction, a.saves[0]!.actorId, a.saves[0]!.destination, a.saves[0]!.reason, a.saves[0]!.runId],
    ["pending", "destination", "admin-1", "live.example", metadata.reason, result.runId]);
  assert.equal((a.saves[0]!.gapLabels as string[]).length, 1, "the destination derives its own gap labels");
  assert.deepEqual(a.saves[0]!.items, [{ entityType: "raw-row", id: entity.id, beforeHash: "hash-before", afterHash: entity.contentHash }]);
  assert.equal((result.report as { backstop?: unknown }).backstop !== undefined, true);
  assert.equal(JSON.parse(h.runRepo.saved[0]!.reportJson!).backstop.reason, metadata.reason, "the run row's report carries the send's metadata from the start");
  assert.equal(a.saves[1]!.result, "success");
  assert.deepEqual(a.saves[1]!.inverses, a.inverses);
  assert.deepEqual((a.saves[1]!.items as Array<{ beforeHash: string }>)[0]!.beforeHash, contentHash({ entityType: "raw-row", state: before as never }), "a raw row's before hash is hashed as a raw row");
  assert.deepEqual(a.events, ["tx"]);
});

test("send by hand: a raw file's before hash is its path, sha, size and mode", async () => {
  const h = harness();
  const a = audited(h);
  const entity = raw("raw-file", "snippets/a.html", { path: "snippets/a.html", sha256: "a".repeat(64), size: 3, mode: 0o644 });
  const inverse = { relPath: "snippets/a.html", backupName: null, sha256: "b".repeat(64), size: 5, mode: 0o755 };
  h.register("raw-file", { apply: async () => { a.inverses.push({ kind: "raw-file", entity, before: inverse, afterHash: entity.contentHash }); return { changeSetId: "cs-file" }; } });
  await h.apply([entity], reportOf([row("raw-file", entity.id, "created")]), { backstop: a.backstop });
  assert.equal((a.saves[1]!.items as Array<{ beforeHash: string }>)[0]!.beforeHash,
    contentHash({ entityType: "raw-file", state: { path: "snippets/a.html", sha256: inverse.sha256, size: 5, mode: 0o755 } }));
});

test("send by hand: audit storage that is not ready refuses before anything is saved", async () => {
  const h = harness();
  const a = audited(h);
  h.register("raw-row");
  const entity = raw("raw-row", 'p:{"id":"a"}', { table: "p", pk: { id: "a" }, columns: [], values: { id: "a" } });
  const notReady = { ...a.backstop, audit: { ...a.backstop.audit, ready: async () => false } };
  await assert.rejects(h.apply([entity], reportOf([row("raw-row", entity.id, "created")]), { backstop: notReady }),
    (err: Error) => err.message === "Send by hand needs its audit storage installed before it can send anything.");
  assert.equal(h.runRepo.saved.length, 0);
  assert.equal(a.saves.length, 0);
});

test("send by hand: a transactional run needs the transaction port, in words", async () => {
  const h = harness();
  const a = audited(h);
  h.register("raw-row");
  const entity = raw("raw-row", 'p:{"id":"a"}', { table: "p", pk: { id: "a" }, columns: [], values: { id: "a" } });
  await assert.rejects(h.apply([entity], reportOf([row("raw-row", entity.id, "created")]), { backstop: { ...a.backstop, rows: undefined } }),
    (err: Error) => err.message === "The raw-row transaction port is not wired.");
});

test("send by hand: a failure rolls back files last first, keeps the raw error, and records what may remain", async () => {
  for (const rollbackFails of [false, true]) {
    resetPublishContentContributorsForTests();
    const h = harness();
    const a = audited(h);
    if (rollbackFails) a.fileRollbacks.push(async () => { throw new Error("disk gone"); });
    const file = raw("raw-file", "snippets/a.html", { path: "snippets/a.html", sha256: "a".repeat(64), size: 3, mode: 0o644 });
    const rowEntity = raw("raw-row", 'p:{"id":"a"}', { table: "p", pk: { id: "a" }, columns: [], values: { id: "a" } });
    const inverse = { relPath: file.id, backupName: null, sha256: null, size: null, mode: 0o644 };
    h.register("raw-file", { apply: async () => { a.inverses.push({ kind: "raw-file", entity: file, before: inverse, afterHash: file.contentHash }); return { changeSetId: "cs-file" }; } });
    h.register("raw-row", { apply: async () => { a.inverses.push({ kind: "raw-row", entity: rowEntity, before: null, afterHash: rowEntity.contentHash }); throw new Error("row write failed"); } });
    await assert.rejects(h.apply([file, rowEntity], reportOf([row("raw-file", file.id, "created"), row("raw-row", rowEntity.id, "created")]), { backstop: a.backstop }),
      (err: unknown) => err instanceof Error && err.message === "row write failed", "the raw error is rethrown as it was, not wrapped");
    assert.deepEqual(a.events.filter((e) => e.startsWith("rollback")), ["rollback-second", "rollback-first"]);
    const final = h.runRepo.saved.at(-1)!;
    assert.equal(final.phase, "failed");
    const report = JSON.parse(final.reportJson!) as { rows: Array<{ entityType: string; outcome: string; writes: boolean; reason: string }> };
    const expectedReason = rollbackFails ? "row write failed disk gone" : "row write failed";
    assert.deepEqual(report.rows.map((r) => [r.entityType, r.outcome, r.writes, r.reason]), [
      ["raw-file", "blocked", rollbackFails, expectedReason], ["raw-row", "blocked", false, expectedReason],
    ], `rollbackFails=${rollbackFails}`);
    const failure = a.saves.at(-1)!;
    assert.deepEqual([failure.result, (failure.details as { error: string }).error, (failure.details as { rollbackErrors: string[] }).rollbackErrors],
      ["failure", "row write failed", rollbackFails ? ["disk gone"] : []]);
    assert.deepEqual((failure.inverses as Array<{ kind: string }>).map((i) => i.kind), rollbackFails ? ["raw-file"] : []);
  }
});

test("send by hand: a file rollback that throws a non-Error is recorded with the fixed words", async () => {
  const h = harness();
  const a = audited(h);
  a.fileRollbacks.push(async () => { throw "weird"; });
  const file = raw("raw-file", "snippets/a.html", { path: "snippets/a.html", sha256: "a".repeat(64), size: 3, mode: 0o644 });
  h.register("raw-file", { apply: async () => { throw new Error("file write failed"); } });
  await assert.rejects(h.apply([file], reportOf([row("raw-file", file.id, "created")]), { backstop: a.backstop }), /file write failed/);
  assert.deepEqual((a.saves.at(-1)!.details as { rollbackErrors: string[] }).rollbackErrors, ["A file could not be rolled back."]);
});

test("a file-only send is all-or-nothing too", async () => {
  const h = harness();
  const a = audited(h);
  const file = raw("raw-file", "snippets/a.html", { path: "snippets/a.html", sha256: "a".repeat(64), size: 3, mode: 0o644 });
  h.register("raw-file", { apply: async () => { throw new Error("file write failed"); } });
  await assert.rejects(h.apply([file], reportOf([row("raw-file", file.id, "created")]), { backstop: a.backstop }), (err: unknown) => err instanceof Error && err.message === "file write failed");
  assert.deepEqual(a.events, ["tx", "rollback-second", "rollback-first"]);
});
