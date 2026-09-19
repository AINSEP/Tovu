/**
 * @file Task 5 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 5.
 *
 * `planImport()` is pure planning with ZERO writes — this file's dominant concern is proving that
 * literally, not just asserting "no exception thrown". Every fixture that reaches a `conflict`,
 * `blocked`, or `refused` outcome snapshots its destination store BEFORE calling `planImport` and
 * asserts it is byte-identical AFTER (`assertUnchanged` below) — and, since `planImport` never
 * writes for ANY outcome (only a LATER apply pass, Task 8, would), every fixture in this file uses
 * that same assertion, not only the three the dispatch called out explicitly.
 *
 * Section 1 exercises the seven outcomes plus the whole-run refusal against a hand-built fake
 * handler (`makeFakeHandler`), so every branch — including ones the real post/page handler can never
 * produce today (a required blob, a stale baseline `hashVersion`) — is directly constructible.
 * Section 2 re-proves `created`/`unchanged`/`blocked` end-to-end against the REAL
 * `contributePostPublish()` handler (Task 2) plus a real `InMemoryPostRepo`, through the REAL
 * registry (`registerPublishContentContributor`), so this planner is shown to actually compose
 * with Task 2's own contract, not just with a fake built to match it. Section 3 covers
 * catalog ordering through `planImport`; invalid catalog cases live in `type-registry.test.ts`.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { CONTENT_HASH_VERSION, contentHash } from "../content-hash.js";
import {
  registerPublishContentContributor,
  resetPublishContentContributorsForTests,
  type PublishContentContributor,
  type PublishContentHandler,
  type PackedEntity,
} from "../type-registry.js";
import {
  entityKey,
  planImport,
  type BaselineRecord,
  type PlanImportDeps,
  type PublishContentBundle,
} from "../planner.js";

test.beforeEach(() => {
  resetPublishContentContributorsForTests();
});

// ---------------------------------------------------------------------------
// Shared fixture plumbing
// ---------------------------------------------------------------------------

interface FakeDestinationRow {
  readonly version: number;
  readonly hash: string;
}

/** A minimal, hand-built handler for constructing every outcome directly and precisely — see this
 *  file's header. `apply()` throws unconditionally: if `planImport` ever called it, that would be a
 *  write during planning, which is exactly the property this whole file exists to rule out. */
function makeFakeHandler(options: {
  entityType: string;
  dependsOn?: readonly string[];
  destination: Map<string, FakeDestinationRow>;
  blockedIds?: ReadonlySet<string>;
  blockReason?: string;
}): PublishContentHandler {
  return {
    entityType: options.entityType,
    permission: "content.write",
    dependsOn: options.dependsOn ?? [],
    pack: async function* () {},
    inspect: async (id) => options.destination.get(id) ?? null,
    precheck: async (entity) =>
      options.blockedIds?.has(entity.id) ? (options.blockReason ?? `blocked: ${entity.id}`) : null,
    apply: async () => {
      throw new Error(`planImport must never call apply() — it is pure planning (entityType=${options.entityType})`);
    },
  };
}

function fakeContributor(handler: PublishContentHandler): PublishContentContributor {
  return { entityType: handler.entityType, dependsOn: handler.dependsOn, build: () => handler };
}

function makeEntity(overrides: Partial<PackedEntity> & { entityType: string; id: string }): PackedEntity {
  return {
    contentHash: contentHash(overrides.entityType, { title: overrides.id }),
    hashVersion: CONTENT_HASH_VERSION,
    requiredBlobs: [],
    state: { title: overrides.id },
    ...overrides,
  };
}

/** Builds `PlanImportDeps` backed by plain maps/sets — no real `PublishContentDeps` is needed
 *  because every contributor in these tests supplies its own fake handler via `build: () => handler`
 *  and ignores the argument. */
function makeDeps(options: {
  baselines?: Map<string, BaselineRecord | null>;
  availableBlobs?: ReadonlySet<string>;
  forcedEntityKeys?: ReadonlySet<string>;
}): PlanImportDeps {
  const baselines = options.baselines ?? new Map();
  const availableBlobs = options.availableBlobs ?? new Set();
  return {
    publishContentDeps: {} as PlanImportDeps["publishContentDeps"],
    getBaseline: async ({ entityType, entityId }) => baselines.get(entityKey(entityType, entityId)) ?? null,
    hasBlob: async (sha256) => availableBlobs.has(sha256),
    forcedEntityKeys: options.forcedEntityKeys,
  };
}

/** Snapshots a destination store's exact contents; two snapshots deep-equal iff the store is
 *  byte-identical — the property every fixture in this file proves, not merely "no throw". */
function snapshot(destination: Map<string, FakeDestinationRow>): string {
  return JSON.stringify([...destination.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function assertUnchanged(destination: Map<string, FakeDestinationRow>, before: string, label: string): void {
  assert.equal(snapshot(destination), before, `${label}: destination must be byte-identical after planImport`);
}

// ---------------------------------------------------------------------------
// 1. The seven outcomes + whole-run refusal (fake handler, precise construction)
// ---------------------------------------------------------------------------

test("created: no destination row for the id", async () => {
  const destination = new Map<string, FakeDestinationRow>();
  registerPublishContentContributor(fakeContributor(makeFakeHandler({ entityType: "widget", destination })));
  const before = snapshot(destination);

  const bundle: PublishContentBundle = { hashVersion: CONTENT_HASH_VERSION, entities: [makeEntity({ entityType: "widget", id: "w1" })] };
  const report = await planImport(bundle, makeDeps({}));

  assert.equal(report.refused, false);
  assert.deepEqual(report.rows, [{ entityType: "widget", entityId: "w1", outcome: "created", writes: true, reason: null }]);
  assertUnchanged(destination, before, "created");
});

test("unchanged: destination hash equals source hash", async () => {
  const destination = new Map<string, FakeDestinationRow>([["w1", { version: 3, hash: "same-hash" }]]);
  registerPublishContentContributor(fakeContributor(makeFakeHandler({ entityType: "widget", destination })));
  const before = snapshot(destination);

  const entity = makeEntity({ entityType: "widget", id: "w1", contentHash: "same-hash" });
  const report = await planImport({ hashVersion: CONTENT_HASH_VERSION, entities: [entity] }, makeDeps({}));

  assert.deepEqual(report.rows, [{ entityType: "widget", entityId: "w1", outcome: "unchanged", writes: false, reason: null }]);
  assertUnchanged(destination, before, "unchanged");
});

test("applied: destination hash differs from source but matches the recorded baseline (untouched since last sync)", async () => {
  const destination = new Map<string, FakeDestinationRow>([["w1", { version: 5, hash: "baseline-hash" }]]);
  registerPublishContentContributor(fakeContributor(makeFakeHandler({ entityType: "widget", destination })));
  const before = snapshot(destination);

  const baselines = new Map<string, BaselineRecord | null>([
    [entityKey("widget", "w1"), { hashAtLastSync: "baseline-hash", hashVersion: CONTENT_HASH_VERSION }],
  ]);
  const entity = makeEntity({ entityType: "widget", id: "w1", contentHash: "new-source-hash" });
  const report = await planImport({ hashVersion: CONTENT_HASH_VERSION, entities: [entity] }, makeDeps({ baselines }));

  assert.deepEqual(report.rows, [{ entityType: "widget", entityId: "w1", outcome: "applied", writes: true, reason: null }]);
  assertUnchanged(destination, before, "applied");
});

test("conflict: destination hash differs from BOTH source and the recorded baseline — edited on the destination", async () => {
  const destination = new Map<string, FakeDestinationRow>([["w1", { version: 5, hash: "edited-on-destination" }]]);
  registerPublishContentContributor(fakeContributor(makeFakeHandler({ entityType: "widget", destination })));
  const before = snapshot(destination);

  const baselines = new Map<string, BaselineRecord | null>([
    [entityKey("widget", "w1"), { hashAtLastSync: "old-baseline-hash", hashVersion: CONTENT_HASH_VERSION }],
  ]);
  const entity = makeEntity({ entityType: "widget", id: "w1", contentHash: "new-source-hash" });
  const report = await planImport({ hashVersion: CONTENT_HASH_VERSION, entities: [entity] }, makeDeps({ baselines }));

  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].outcome, "conflict");
  assert.equal(report.rows[0].writes, false);
  assert.match(report.rows[0].reason ?? "", /edited on the destination since the last sync/);
  assertUnchanged(destination, before, "conflict (edited on destination)");
});

test("conflict: no baseline exists at all for this peer+entity — never a free pass to overwrite", async () => {
  const destination = new Map<string, FakeDestinationRow>([["w1", { version: 1, hash: "already-here" }]]);
  registerPublishContentContributor(fakeContributor(makeFakeHandler({ entityType: "widget", destination })));
  const before = snapshot(destination);

  const entity = makeEntity({ entityType: "widget", id: "w1", contentHash: "incoming-hash" });
  const report = await planImport({ hashVersion: CONTENT_HASH_VERSION, entities: [entity] }, makeDeps({}));

  assert.equal(report.rows[0].outcome, "conflict");
  assert.equal(report.rows[0].writes, false);
  assert.match(report.rows[0].reason ?? "", /no prior sync baseline/);
  assertUnchanged(destination, before, "conflict (no baseline)");
});

test("blocked: precheck fails (e.g. slug taken) — never caught as a write-time constraint violation", async () => {
  const destination = new Map<string, FakeDestinationRow>();
  const handler = makeFakeHandler({ entityType: "widget", destination, blockedIds: new Set(["w1"]), blockReason: "slug 'x' is already held by a different widget" });
  registerPublishContentContributor(fakeContributor(handler));
  const before = snapshot(destination);

  const entity = makeEntity({ entityType: "widget", id: "w1" });
  const report = await planImport({ hashVersion: CONTENT_HASH_VERSION, entities: [entity] }, makeDeps({}));

  assert.deepEqual(report.rows, [
    { entityType: "widget", entityId: "w1", outcome: "blocked", writes: false, reason: "slug 'x' is already held by a different widget" },
  ]);
  assertUnchanged(destination, before, "blocked (precheck)");
});

test("blocked: a required blob is not available on this instance", async () => {
  const destination = new Map<string, FakeDestinationRow>();
  registerPublishContentContributor(fakeContributor(makeFakeHandler({ entityType: "widget", destination })));
  const before = snapshot(destination);

  const entity = makeEntity({ entityType: "widget", id: "w1", requiredBlobs: ["deadbeef"] });
  const report = await planImport({ hashVersion: CONTENT_HASH_VERSION, entities: [entity] }, makeDeps({ availableBlobs: new Set() }));

  assert.equal(report.rows[0].outcome, "blocked");
  assert.match(report.rows[0].reason ?? "", /required blob 'deadbeef' is not available/);
  assertUnchanged(destination, before, "blocked (missing blob)");
});

test("NOT blocked when the required blob IS available", async () => {
  const destination = new Map<string, FakeDestinationRow>();
  registerPublishContentContributor(fakeContributor(makeFakeHandler({ entityType: "widget", destination })));

  const entity = makeEntity({ entityType: "widget", id: "w1", requiredBlobs: ["deadbeef"] });
  const report = await planImport({ hashVersion: CONTENT_HASH_VERSION, entities: [entity] }, makeDeps({ availableBlobs: new Set(["deadbeef"]) }));

  assert.equal(report.rows[0].outcome, "created");
});

test("forced: a conflict (edited on destination) the operator explicitly selected becomes 'forced' and would write", async () => {
  const destination = new Map<string, FakeDestinationRow>([["w1", { version: 5, hash: "edited-on-destination" }]]);
  registerPublishContentContributor(fakeContributor(makeFakeHandler({ entityType: "widget", destination })));
  const before = snapshot(destination);

  const baselines = new Map<string, BaselineRecord | null>([
    [entityKey("widget", "w1"), { hashAtLastSync: "old-baseline-hash", hashVersion: CONTENT_HASH_VERSION }],
  ]);
  const entity = makeEntity({ entityType: "widget", id: "w1", contentHash: "new-source-hash" });
  const report = await planImport(
    { hashVersion: CONTENT_HASH_VERSION, entities: [entity] },
    makeDeps({ baselines, forcedEntityKeys: new Set([entityKey("widget", "w1")]) })
  );

  assert.equal(report.rows[0].outcome, "forced");
  assert.equal(report.rows[0].writes, true);
  assert.match(report.rows[0].reason ?? "", /edited on the destination/);
  assertUnchanged(destination, before, "forced (planImport itself still never writes)");
});

test("forced: the 'no baseline at all' conflict variant can also be forced", async () => {
  const destination = new Map<string, FakeDestinationRow>([["w1", { version: 1, hash: "already-here" }]]);
  registerPublishContentContributor(fakeContributor(makeFakeHandler({ entityType: "widget", destination })));

  const entity = makeEntity({ entityType: "widget", id: "w1", contentHash: "incoming-hash" });
  const report = await planImport(
    { hashVersion: CONTENT_HASH_VERSION, entities: [entity] },
    makeDeps({ forcedEntityKeys: new Set([entityKey("widget", "w1")]) })
  );

  assert.equal(report.rows[0].outcome, "forced");
  assert.equal(report.rows[0].writes, true);
});

test("refused: bundle.hashVersion mismatch refuses the WHOLE run — no rows, no baseline reads", async () => {
  const destination = new Map<string, FakeDestinationRow>();
  registerPublishContentContributor(fakeContributor(makeFakeHandler({ entityType: "widget", destination })));
  const before = snapshot(destination);

  let baselineReads = 0;
  const deps: PlanImportDeps = {
    publishContentDeps: {} as PlanImportDeps["publishContentDeps"],
    getBaseline: async () => {
      baselineReads += 1;
      return null;
    },
    hasBlob: async () => true,
  };
  const entity = makeEntity({ entityType: "widget", id: "w1" });
  const report = await planImport({ hashVersion: CONTENT_HASH_VERSION + 1, entities: [entity] }, deps);

  assert.equal(report.refused, true);
  assert.deepEqual(report.rows, []);
  assert.deepEqual(report.applyOrder, []);
  assert.match(report.refusalReason ?? "", /does not match this instance's/);
  assert.equal(baselineReads, 0, "a bundle-level version mismatch must short-circuit before any baseline read");
  assertUnchanged(destination, before, "refused (bundle version)");
});

test("refused (adversarial, aggregate): ONE stale baseline hashVersion among several entities refuses the WHOLE run, not just that entity", async () => {
  const destination = new Map<string, FakeDestinationRow>([
    ["w1", { version: 1, hash: "h1" }],
    ["w2", { version: 1, hash: "h2" }],
    ["w3", { version: 1, hash: "h3" }],
  ]);
  registerPublishContentContributor(fakeContributor(makeFakeHandler({ entityType: "widget", destination })));
  const before = snapshot(destination);

  const baselines = new Map<string, BaselineRecord | null>([
    [entityKey("widget", "w1"), { hashAtLastSync: "h1", hashVersion: CONTENT_HASH_VERSION }],
    [entityKey("widget", "w2"), { hashAtLastSync: "stale", hashVersion: CONTENT_HASH_VERSION + 1 }], // the poison entity
    [entityKey("widget", "w3"), { hashAtLastSync: "h3", hashVersion: CONTENT_HASH_VERSION }],
  ]);
  const entities = ["w1", "w2", "w3"].map((id) => makeEntity({ entityType: "widget", id, contentHash: `h${id.slice(1)}` }));
  const report = await planImport({ hashVersion: CONTENT_HASH_VERSION, entities }, makeDeps({ baselines }));

  assert.equal(report.refused, true);
  assert.deepEqual(report.rows, [], "no partial rows for w1/w3 even though their own baselines were fine");
  assert.match(report.refusalReason ?? "", /widget 'w2'/);
  assertUnchanged(destination, before, "refused (aggregate, one poisoned baseline)");
});

test("blocked: an entity type present in the bundle with NO registered handler on this instance", async () => {
  // No contributor registered at all for "widget" — resetPublishContentContributorsForTests()
  // ran in beforeEach.
  const entity = makeEntity({ entityType: "widget", id: "w1" });
  const report = await planImport({ hashVersion: CONTENT_HASH_VERSION, entities: [entity] }, makeDeps({}));

  assert.equal(report.rows[0].outcome, "blocked");
  assert.match(report.rows[0].reason ?? "", /no registered publish-content handler for entity type 'widget'/);
});

// ---------------------------------------------------------------------------
// 2. Aggregate/batch: all seven outcomes computed together, no cross-entity interference
// ---------------------------------------------------------------------------

test("a single planImport call classifies a mixed batch correctly, each entity independently of the others", async () => {
  const destination = new Map<string, FakeDestinationRow>([
    ["unchanged-id", { version: 1, hash: "same" }],
    ["applied-id", { version: 2, hash: "baseline-hash" }],
    ["conflict-id", { version: 3, hash: "edited-elsewhere" }],
    ["forced-id", { version: 4, hash: "also-edited-elsewhere" }],
  ]);
  const handler = makeFakeHandler({ entityType: "widget", destination, blockedIds: new Set(["blocked-id"]), blockReason: "blocked reason" });
  registerPublishContentContributor(fakeContributor(handler));
  const before = snapshot(destination);

  const baselines = new Map<string, BaselineRecord | null>([
    [entityKey("widget", "applied-id"), { hashAtLastSync: "baseline-hash", hashVersion: CONTENT_HASH_VERSION }],
    [entityKey("widget", "conflict-id"), { hashAtLastSync: "old-baseline", hashVersion: CONTENT_HASH_VERSION }],
    [entityKey("widget", "forced-id"), { hashAtLastSync: "old-baseline-2", hashVersion: CONTENT_HASH_VERSION }],
  ]);
  const entities = [
    makeEntity({ entityType: "widget", id: "created-id", contentHash: "new" }),
    makeEntity({ entityType: "widget", id: "unchanged-id", contentHash: "same" }),
    makeEntity({ entityType: "widget", id: "applied-id", contentHash: "new-source" }),
    makeEntity({ entityType: "widget", id: "conflict-id", contentHash: "new-source" }),
    makeEntity({ entityType: "widget", id: "forced-id", contentHash: "new-source" }),
    makeEntity({ entityType: "widget", id: "blocked-id", contentHash: "irrelevant" }),
  ];
  const report = await planImport(
    { hashVersion: CONTENT_HASH_VERSION, entities },
    makeDeps({ baselines, forcedEntityKeys: new Set([entityKey("widget", "forced-id")]) })
  );

  const byId = new Map(report.rows.map((row) => [row.entityId, row.outcome]));
  assert.equal(byId.get("created-id"), "created");
  assert.equal(byId.get("unchanged-id"), "unchanged");
  assert.equal(byId.get("applied-id"), "applied");
  assert.equal(byId.get("conflict-id"), "conflict");
  assert.equal(byId.get("forced-id"), "forced");
  assert.equal(byId.get("blocked-id"), "blocked");
  assert.equal(report.rows.length, 6);
  assertUnchanged(destination, before, "mixed batch");
});

// ---------------------------------------------------------------------------
// 3. dependsOn-derived apply order
// ---------------------------------------------------------------------------

test("planImport's applyOrder places a dependency's type before its dependent's, and rows follow that order", async () => {
  const mediaDestination = new Map<string, FakeDestinationRow>();
  const postDestination = new Map<string, FakeDestinationRow>();
  registerPublishContentContributor(fakeContributor(makeFakeHandler({ entityType: "media", destination: mediaDestination })));
  registerPublishContentContributor(
    fakeContributor(makeFakeHandler({ entityType: "post", destination: postDestination, dependsOn: ["media"] }))
  );

  const entities = [makeEntity({ entityType: "post", id: "p1" }), makeEntity({ entityType: "media", id: "m1" })];
  const report = await planImport({ hashVersion: CONTENT_HASH_VERSION, entities }, makeDeps({}));

  assert.deepEqual(report.applyOrder, ["media", "post"]);
  assert.deepEqual(report.rows.map((row) => row.entityId), ["m1", "p1"], "rows must follow applyOrder, not bundle order");
});

test("a contributor registered AFTER an earlier planImport call is picked up by the very next call", async () => {
  const destination = new Map<string, FakeDestinationRow>();
  const entity = makeEntity({ entityType: "widget", id: "w1" });

  const first = await planImport({ hashVersion: CONTENT_HASH_VERSION, entities: [entity] }, makeDeps({}));
  assert.equal(first.rows[0].outcome, "blocked", "no handler registered yet");

  registerPublishContentContributor(fakeContributor(makeFakeHandler({ entityType: "widget", destination })));
  const second = await planImport({ hashVersion: CONTENT_HASH_VERSION, entities: [entity] }, makeDeps({}));
  assert.equal(second.rows[0].outcome, "created", "the newly registered contributor must be seen without recreating planImport itself");
});

// ---------------------------------------------------------------------------
// 4. End-to-end against the REAL post contributor (Task 2) + a real InMemoryPostRepo
// ---------------------------------------------------------------------------

test("real post contributor: created + byte-identical destination", async () => {
  const { InMemoryPostRepo } = await import("../../post/repo.memory.js");
  const { contributePostPublish } = await import("../../post/publish-content.js");
  const { contributeMediaPublish } = await import("../../media/publish-content.js");
  registerPublishContentContributor(contributeMediaPublish());
  registerPublishContentContributor(contributePostPublish());

  const workspaceId = "11111111-1111-1111-1111-111111111111";
  const existing = {
    id: "post-1",
    workspaceId,
    title: "Existing",
    slug: "existing",
    bodyJson: { type: "doc", content: [] },
    status: "draft" as const,
    kind: "post" as const,
    bodyFormat: "doc" as const,
    bodyHtml: null,
    updatedAt: "2026-09-01T00:00:00.000Z",
    version: 1,
  };
  const repo = new InMemoryPostRepo([existing]);
  const before = JSON.stringify(await repo.list({ workspaceId }));

  const newPostState = { ...existing, id: "post-2", slug: "new-post", title: "New Post" };
  const entity: PackedEntity = {
    entityType: "post",
    id: "post-2",
    contentHash: contentHash("post", newPostState),
    hashVersion: CONTENT_HASH_VERSION,
    requiredBlobs: [],
    state: newPostState,
  };
  const deps: PlanImportDeps = {
    publishContentDeps: { workspaceId, postRepo: repo, clock: { nowIso: () => "2026-09-18T00:00:00.000Z" }, idGen: { newId: () => "unused" } },
    getBaseline: async () => null,
    hasBlob: async () => true,
  };
  const report = await planImport({ hashVersion: CONTENT_HASH_VERSION, entities: [entity] }, deps);

  assert.equal(report.rows[0].outcome, "created");
  assert.equal(JSON.stringify(await repo.list({ workspaceId })), before, "real repo must be byte-identical after planImport");
});

test("real post contributor: blocked on a genuine slug collision against a DIFFERENT existing post", async () => {
  const { InMemoryPostRepo } = await import("../../post/repo.memory.js");
  const { contributePostPublish } = await import("../../post/publish-content.js");
  const { contributeMediaPublish } = await import("../../media/publish-content.js");
  registerPublishContentContributor(contributeMediaPublish());
  registerPublishContentContributor(contributePostPublish());

  const workspaceId = "11111111-1111-1111-1111-111111111111";
  const existing = {
    id: "post-1",
    workspaceId,
    title: "Existing",
    slug: "taken-slug",
    bodyJson: { type: "doc", content: [] },
    status: "draft" as const,
    kind: "post" as const,
    bodyFormat: "doc" as const,
    bodyHtml: null,
    updatedAt: "2026-09-01T00:00:00.000Z",
    version: 1,
  };
  const repo = new InMemoryPostRepo([existing]);
  const before = JSON.stringify(await repo.list({ workspaceId }));

  const incomingState = { ...existing, id: "post-2", slug: "taken-slug" };
  const entity: PackedEntity = {
    entityType: "post",
    id: "post-2",
    contentHash: contentHash("post", incomingState),
    hashVersion: CONTENT_HASH_VERSION,
    requiredBlobs: [],
    state: incomingState,
  };
  const deps: PlanImportDeps = {
    publishContentDeps: { workspaceId, postRepo: repo, clock: { nowIso: () => "2026-09-18T00:00:00.000Z" }, idGen: { newId: () => "unused" } },
    getBaseline: async () => null,
    hasBlob: async () => true,
  };
  const report = await planImport({ hashVersion: CONTENT_HASH_VERSION, entities: [entity] }, deps);

  assert.equal(report.rows[0].outcome, "blocked");
  assert.match(report.rows[0].reason ?? "", /already held by a different post \('post-1'\)/);
  assert.equal(JSON.stringify(await repo.list({ workspaceId })), before, "real repo must be byte-identical after a blocked plan");
});

// ---------------------------------------------------------------------------
// 5. entityKey — trivial but load-bearing (forced-selection matching depends on it being stable)
// ---------------------------------------------------------------------------

test("entityKey joins entityType and id with a stable separator", () => {
  assert.equal(entityKey("post", "abc"), "post:abc");
});
