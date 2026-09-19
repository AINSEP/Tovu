/**
 * @file Task 8 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 8 / §5 risks
 * #1, #3, #6, #7, #9.
 *
 * `createPublishContentApplyPort` (`../apply-loop.ts`) is the one place a destination edit landing
 * in the narrow window between `gated-hooks.ts`'s own fresh `buildReport()` and this file's own
 * per-row write must downgrade that ONE row to `conflict`, never overwrite it and never abort the
 * whole run. Every test below that exercises a race constructs the race for REAL — mutating the
 * SAME `InMemoryPostRepo` instance the apply port reads from between planning and applying — rather
 * than mocking `handler.inspect()` to return a canned value, so a regression in the real
 * `contributePostPublish()` handler (`features/post/publish-content.ts`) would also be caught here,
 * not just a regression in this file's own control flow.
 *
 * Every race test in this file was confirmed to FAIL against a deliberately naive implementation
 * (the relevant guard commented out in `apply-loop.ts`, test run, guard restored) before being
 * accepted — see the dispatch's own falsification requirement. The exact commands and observed
 * failures are recorded in the Task 8 handoff, not duplicated here as comments, so this file does
 * not itself carry a permanently-disabled "broken" code path.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryOutbox } from "#src/contracts/core/events/index";

import { InMemoryPostRepo } from "#src/features/post/repo.memory";
import type { PostRecord } from "#src/features/post/post";
import { contributePostPublish, toPublishableState } from "#src/features/post/publish-content";
import { InMemoryAssetBlobRepo, InMemoryBlobStore, InMemoryMediaRepo, computeBlobStorageKey, type MediaRecord } from "#src/features/media/index";
import { contributeMediaPublish } from "#src/features/media/publish-content";

import { CONTENT_HASH_VERSION, contentHash } from "../content-hash.js";
import { PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION } from "../artifact-format.js";
import { InMemoryPublishContentBaselineRepo } from "../baseline-repo.js";
import type { PublishContentBaselineRepoPort } from "../baseline-repo.js";
import { InMemoryPublishContentBundleRepo, stageBundle } from "../bundle-staging.js";
import { getPublishContentRunStatus, InMemoryPublishContentRunRepo } from "../run-repo.js";
import { planImport } from "../planner.js";
import type { PublishContentBundle, PublishContentReport } from "../planner.js";
import {
  registerPublishContentContributor,
  resetPublishContentContributorsForTests,
} from "../type-registry.js";
import type { PackedEntity, PublishContentDeps } from "../type-registry.js";
import { createPublishContentApplyPort, publishContentItemIdempotencyKey } from "../apply-loop.js";

const WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";
/** The bundle's AUTHENTICATED source — plan §1.6 / §5 risk #9's own peer key. Deliberately a
 *  different string from {@link OPERATOR_PRINCIPAL_ID} throughout this file, so a test that
 *  accidentally keys a baseline on the wrong one fails loudly rather than by coincidence matching. */
const SOURCE_PRINCIPAL_ID = "peer-principal-source";
/** The principal running plan/confirm/execute against this instance — never the baseline key. */
const OPERATOR_PRINCIPAL_ID = "operator-principal-executing";

function makeCounterIdGen(prefix: string) {
  let n = 0;
  return { newId: () => `${prefix}-${++n}` };
}

function makeClock(iso = "2026-09-19T00:00:00.000Z") {
  return { nowIso: () => iso };
}

function makePost(overrides: Partial<PostRecord> & { id: string }): PostRecord {
  return {
    workspaceId: WORKSPACE_ID,
    title: "Untitled",
    slug: overrides.id,
    bodyJson: { type: "doc", content: [] },
    status: "draft",
    kind: "post",
    bodyFormat: "doc",
    bodyHtml: null,
    updatedAt: "2026-09-01T00:00:00.000Z",
    version: 1,
    createdByPrincipalId: null,
    ...overrides,
  };
}

function packedFrom(post: PostRecord): PackedEntity {
  return {
    entityType: "post",
    id: post.id,
    schemaVersion: 1,
    contentHash: contentHash("post", toPublishableState(post)),
    hashVersion: CONTENT_HASH_VERSION,
    requiredBlobs: [],
    state: toPublishableState(post),
  };
}

/** One full harness: a real registered `contributePostPublish()` handler over a real
 *  `InMemoryPostRepo`, a real `InMemoryChangeSetRepo`, and every publish-content-side repo/port
 *  `createPublishContentApplyPort` needs — everything an apply-loop test needs to exercise the real
 *  composed path, not a hand-rolled fake. `applyPort`'s own `idGen` is a SEPARATE counter from every
 *  other id generator in this harness so `runId` is always predictably `"run-1"` for the first
 *  `applyReport()` call in a test, regardless of how many ids bundle staging/`executeCommand`
 *  consumed from their own counters first. */
function makeHarness(
  rows: PostRecord[] = [],
  baselineRepo: PublishContentBaselineRepoPort = new InMemoryPublishContentBaselineRepo()
) {
  resetPublishContentContributorsForTests();
  registerPublishContentContributor(contributeMediaPublish());
  registerPublishContentContributor(contributePostPublish());

  const postRepo = new InMemoryPostRepo(rows);
  const clock = makeClock();
  const outbox = new InMemoryOutbox();
  const changeSets = new InMemoryChangeSetRepo([], [], outbox);
  const authorize = async () => ({ allowed: true, reason: "test-always-allow" });
  const bundleRepo = new InMemoryPublishContentBundleRepo();
  const runRepo = new InMemoryPublishContentRunRepo();

  const publishContentDeps: PublishContentDeps = {
    workspaceId: WORKSPACE_ID,
    postRepo,
    clock,
    idGen: makeCounterIdGen("cs"),
    outbox,
    changeSets,
    authorize,
  };

  const applyPort = createPublishContentApplyPort({
    workspaceId: WORKSPACE_ID,
    bundleRepo,
    baselineRepo,
    runRepo,
    publishContentDeps,
    clock,
    idGen: makeCounterIdGen("run"),
  });

  return { postRepo, clock, changeSets, baselineRepo, bundleRepo, runRepo, publishContentDeps, applyPort };
}

test("the per-item idempotency key is stable for one exact version and changes with version identity", () => {
  const entity = packedFrom(makePost({ id: "post-key", title: "Exact source version" }));
  const key = publishContentItemIdempotencyKey({
    workspaceId: WORKSPACE_ID,
    sourcePrincipalId: SOURCE_PRINCIPAL_ID,
    entity,
  });
  assert.equal(
    publishContentItemIdempotencyKey({
      workspaceId: WORKSPACE_ID,
      sourcePrincipalId: SOURCE_PRINCIPAL_ID,
      entity: { ...entity },
    }),
    key,
    "retrying the same exact source entity must address the same command"
  );
  assert.notEqual(
    publishContentItemIdempotencyKey({
      workspaceId: WORKSPACE_ID,
      sourcePrincipalId: SOURCE_PRINCIPAL_ID,
      entity: { ...entity, contentHash: `${entity.contentHash}-changed` },
    }),
    key,
    "a different content version must not alias the prior command"
  );
  assert.notEqual(
    publishContentItemIdempotencyKey({
      workspaceId: WORKSPACE_ID,
      sourcePrincipalId: "a-different-peer",
      entity,
    }),
    key,
    "the same artifact from a different authenticated source must not alias the prior command"
  );
});

async function stage(
  bundleRepo: InstanceType<typeof InMemoryPublishContentBundleRepo>,
  clock: { nowIso(): string },
  entities: readonly PackedEntity[],
  sourcePrincipalId: string = SOURCE_PRINCIPAL_ID
): Promise<string> {
  const { bundleId } = await stageBundle(
    {
      workspaceId: WORKSPACE_ID,
      sourcePrincipalId,
      artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION,
      hashVersion: CONTENT_HASH_VERSION,
      entities,
      blobManifest: [],
    },
    { repo: bundleRepo, clock, idGen: makeCounterIdGen("bundle") }
  );
  return bundleId;
}

/** Plans against the REAL registry/handler, reading baselines through `baselineRepo` exactly the
 *  way `gated-hooks.ts#buildReport` does — so the report handed to `applyReport` in these tests is
 *  the same shape a real `plan()`/`execute()` request would produce. */
async function plan(
  publishContentDeps: PublishContentDeps,
  baselineRepo: InstanceType<typeof InMemoryPublishContentBaselineRepo>,
  sourcePrincipalId: string,
  entities: readonly PackedEntity[]
): Promise<PublishContentReport> {
  const bundle: PublishContentBundle = {
    artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION,
    hashVersion: CONTENT_HASH_VERSION,
    entities,
  };
  return planImport(bundle, {
    publishContentDeps,
    getBaseline: async ({ entityType, entityId }) => {
      const record = await baselineRepo.findOne({ workspaceId: WORKSPACE_ID, peerPrincipalId: sourcePrincipalId, entityType, entityId });
      return record ? { hashAtLastSync: record.hashAtLastSync, hashVersion: record.hashVersion } : null;
    },
    hasBlob: async () => true,
  });
}

// ---------------------------------------------------------------------------
// The single most important property: a concurrent local edit during apply
// downgrades to `conflict`, never an overwrite (plan §5 risk #3).
// ---------------------------------------------------------------------------

test("a destination edit landing AFTER plan but BEFORE apply downgrades 'applied' to 'conflict' and never overwrites it", async () => {
  const original = makePost({ id: "post-1", title: "Original title", slug: "post-1", version: 1, createdByPrincipalId: "orig-author" });
  const { postRepo, clock, baselineRepo, bundleRepo, runRepo, publishContentDeps, applyPort } = makeHarness([original]);

  // Prior sync recorded a baseline matching the CURRENT (original) destination hash.
  await baselineRepo.upsert({
    workspaceId: WORKSPACE_ID,
    peerPrincipalId: SOURCE_PRINCIPAL_ID,
    entityType: "post",
    entityId: "post-1",
    hashAtLastSync: contentHash("post", toPublishableState(original)),
    hashVersion: CONTENT_HASH_VERSION,
    syncedAt: clock.nowIso(),
    runId: "prior-run",
  });

  const sourceUpdate = makePost({ ...original, title: "Updated from peer" });
  const entities = [packedFrom(sourceUpdate)];
  const report = await plan(publishContentDeps, baselineRepo, SOURCE_PRINCIPAL_ID, entities);
  assert.equal(report.rows[0].outcome, "applied", "precondition: plan must see this as a clean 'applied' before the race");

  const bundleId = await stage(bundleRepo, clock, entities);

  // The race: a local edit lands on the SAME row after the plan above was computed, before apply.
  await postRepo.save({ ...original, title: "Local edit happened concurrently", version: 2, updatedAt: "2026-09-19T00:00:01.000Z" });

  const result = await applyPort.applyReport({ report, principalId: OPERATOR_PRINCIPAL_ID, bundleId, restorePointId: "rp-1" });

  assert.deepEqual(result.changeSetIds, [], "the conflicted row must not produce a change set");

  const finalPost = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "post-1" });
  assert.equal(finalPost?.title, "Local edit happened concurrently", "the concurrent local edit must survive — never silently overwritten");

  const run = await runRepo.findById({ workspaceId: WORKSPACE_ID, id: "run-1" });
  assert.ok(run, "a run row must be persisted even though the only row conflicted");
  const persistedReport = JSON.parse(run!.reportJson ?? "null") as PublishContentReport;
  assert.equal(persistedReport.rows[0].outcome, "conflict", "the run's OWN audit trail must reflect the downgrade, not the plan's stale prediction");
  assert.equal(run!.phase, "applied", "the run itself completed — only the one row was downgraded, the run did not abort");

  const baseline = await baselineRepo.findOne({ workspaceId: WORKSPACE_ID, peerPrincipalId: SOURCE_PRINCIPAL_ID, entityType: "post", entityId: "post-1" });
  assert.equal(baseline?.hashAtLastSync, contentHash("post", toPublishableState(original)), "a conflicted row must never refresh the baseline");
});

// ---------------------------------------------------------------------------
// The created-path race: `save()`'s upsert has no version/existence guard of
// its own — this loop's re-`inspect()` is the only guard (plan §5 risk #1).
// ---------------------------------------------------------------------------

test("a destination row created by someone else between plan and apply downgrades 'created' to 'conflict' and never overwrites it", async () => {
  const { postRepo, clock, baselineRepo, bundleRepo, runRepo, publishContentDeps, applyPort } = makeHarness([]);

  const incoming = makePost({ id: "post-new", title: "Imported title", slug: "imported-slug", createdByPrincipalId: "source-author-1" });
  const entities = [packedFrom(incoming)];
  const report = await plan(publishContentDeps, baselineRepo, SOURCE_PRINCIPAL_ID, entities);
  assert.equal(report.rows[0].outcome, "created", "precondition: no destination row exists yet at plan time");

  const bundleId = await stage(bundleRepo, clock, entities);

  // The race: someone else creates the SAME id directly (bypassing this import) before apply runs.
  const raceCreated = makePost({ id: "post-new", title: "Race-created by someone else", slug: "race-slug", version: 1, createdByPrincipalId: "race-author" });
  await postRepo.save(raceCreated);

  const result = await applyPort.applyReport({ report, principalId: OPERATOR_PRINCIPAL_ID, bundleId, restorePointId: "rp-1" });

  assert.deepEqual(result.changeSetIds, []);

  const finalPost = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "post-new" });
  assert.equal(finalPost?.title, "Race-created by someone else", "the racing create must survive — never silently overwritten by the import");
  assert.equal(finalPost?.createdByPrincipalId, "race-author", "authorship of the racing row must also survive untouched");

  const run = await runRepo.findById({ workspaceId: WORKSPACE_ID, id: "run-1" });
  const persistedReport = JSON.parse(run!.reportJson ?? "null") as PublishContentReport;
  assert.equal(persistedReport.rows[0].outcome, "conflict");

  const baseline = await baselineRepo.findOne({ workspaceId: WORKSPACE_ID, peerPrincipalId: SOURCE_PRINCIPAL_ID, entityType: "post", entityId: "post-new" });
  assert.equal(baseline, null, "a conflicted 'created' row must never gain a baseline");
});

// ---------------------------------------------------------------------------
// Baselines: written for created/unchanged/applied/forced ONLY.
// ---------------------------------------------------------------------------

test("baselines are upserted for created/unchanged/applied/forced and NEVER for conflict/blocked", async () => {
  const applied = makePost({ id: "p-applied", title: "Applied dest", slug: "p-applied", version: 1, createdByPrincipalId: "author-a" });
  const forced = makePost({ id: "p-forced", title: "Forced dest", slug: "p-forced", version: 1, createdByPrincipalId: "author-f" });
  const { postRepo, clock, baselineRepo, bundleRepo, runRepo, publishContentDeps, applyPort } = makeHarness([applied, forced]);

  // "applied" needs a baseline matching the CURRENT destination hash so it does not itself downgrade.
  await baselineRepo.upsert({
    workspaceId: WORKSPACE_ID,
    peerPrincipalId: SOURCE_PRINCIPAL_ID,
    entityType: "post",
    entityId: "p-applied",
    hashAtLastSync: contentHash("post", toPublishableState(applied)),
    hashVersion: CONTENT_HASH_VERSION,
    syncedAt: clock.nowIso(),
    runId: "prior-run",
  });

  const createdSource = makePost({ id: "p-created", title: "New from peer", slug: "p-created", createdByPrincipalId: "author-c" });
  const unchangedSource = makePost({ id: "p-unchanged", title: "Same as dest", slug: "p-unchanged" });
  const appliedSource = makePost({ ...applied, title: "Updated from peer" });
  const forcedSource = makePost({ ...forced, title: "Force-overwrite from peer" });
  // Packed entities ALSO exist for the conflict/blocked ids below — deliberately, so a naive
  // implementation that upserts a baseline whenever `entityByKey` merely CONTAINS the row (rather
  // than gating on `outcome`) would actually have something to write and this test would catch it,
  // instead of the negative assertion passing for free because the entity lookup happened to miss.
  const conflictSource = makePost({ id: "p-conflict", title: "Conflicting from peer", slug: "p-conflict" });
  const blockedSource = makePost({ id: "p-blocked", title: "Blocked from peer", slug: "p-blocked" });

  const entities = [
    packedFrom(createdSource),
    packedFrom(unchangedSource),
    packedFrom(appliedSource),
    packedFrom(forcedSource),
    packedFrom(conflictSource),
    packedFrom(blockedSource),
  ];

  const report: PublishContentReport = {
    refused: false,
    refusalReason: null,
    applyOrder: ["post"],
    rows: [
      { entityType: "post", entityId: "p-created", outcome: "created", writes: true, reason: null },
      { entityType: "post", entityId: "p-unchanged", outcome: "unchanged", writes: false, reason: null },
      { entityType: "post", entityId: "p-applied", outcome: "applied", writes: true, reason: null },
      { entityType: "post", entityId: "p-forced", outcome: "forced", writes: true, reason: "was a conflict, operator forced it" },
      { entityType: "post", entityId: "p-conflict", outcome: "conflict", writes: false, reason: "edited on destination" },
      { entityType: "post", entityId: "p-blocked", outcome: "blocked", writes: false, reason: "slug taken" },
    ],
  };

  const bundleId = await stage(bundleRepo, clock, entities);
  const result = await applyPort.applyReport({ report, principalId: OPERATOR_PRINCIPAL_ID, bundleId, restorePointId: "rp-1" });

  assert.equal(result.changeSetIds.length, 3, "created + applied + forced each produce one change set");

  const findBaseline = (entityId: string) =>
    baselineRepo.findOne({ workspaceId: WORKSPACE_ID, peerPrincipalId: SOURCE_PRINCIPAL_ID, entityType: "post", entityId });

  assert.ok(await findBaseline("p-created"), "created must gain a baseline");
  assert.ok(await findBaseline("p-unchanged"), "unchanged must gain (refresh) a baseline");
  assert.ok(await findBaseline("p-applied"), "applied must gain a baseline");
  assert.ok(await findBaseline("p-forced"), "forced must gain a baseline");
  assert.equal(await findBaseline("p-conflict"), null, "conflict must NEVER gain a baseline");
  assert.equal(await findBaseline("p-blocked"), null, "blocked must NEVER gain a baseline");

  void runRepo; // asserted indirectly via result.changeSetIds above; run-row content covered in its own test below.
});

// ---------------------------------------------------------------------------
// Baselines are keyed on the bundle's OWN sourcePrincipalId, NEVER the
// executing operator's principal (plan §1.6 / §5 risk #9 — a security property).
// ---------------------------------------------------------------------------

test("a baseline is keyed on the bundle's sourcePrincipalId, never on the executing operator's principalId", async () => {
  const { clock, baselineRepo, bundleRepo, publishContentDeps, applyPort } = makeHarness([]);

  const incoming = makePost({ id: "post-keyed", title: "New from peer", slug: "post-keyed", createdByPrincipalId: "author-1" });
  const entities = [packedFrom(incoming)];
  const report = await plan(publishContentDeps, baselineRepo, SOURCE_PRINCIPAL_ID, entities);
  assert.equal(report.rows[0].outcome, "created");

  // Stage under SOURCE_PRINCIPAL_ID, but EXECUTE as a different, unrelated OPERATOR_PRINCIPAL_ID —
  // exactly the real shape (an admin confirms/executes an import someone else's key pushed).
  const bundleId = await stage(bundleRepo, clock, entities, SOURCE_PRINCIPAL_ID);
  await applyPort.applyReport({ report, principalId: OPERATOR_PRINCIPAL_ID, bundleId, restorePointId: "rp-1" });

  const underSource = await baselineRepo.findOne({ workspaceId: WORKSPACE_ID, peerPrincipalId: SOURCE_PRINCIPAL_ID, entityType: "post", entityId: "post-keyed" });
  const underOperator = await baselineRepo.findOne({ workspaceId: WORKSPACE_ID, peerPrincipalId: OPERATOR_PRINCIPAL_ID, entityType: "post", entityId: "post-keyed" });

  assert.ok(underSource, "the baseline must be keyed on the bundle's authenticated source principal");
  assert.equal(underOperator, null, "the baseline must NEVER be keyed on the executing operator's principal — that would let any key-holder poison another peer's baselines");
});

// ---------------------------------------------------------------------------
// The run row records every changeSetId a run produced (plan §4 task 8).
// ---------------------------------------------------------------------------

test("the run row's changeSetIdsJson records every changeSetId the run produced", async () => {
  const { clock, baselineRepo, bundleRepo, runRepo, publishContentDeps, applyPort } = makeHarness([]);

  const first = makePost({ id: "post-a", title: "A", slug: "post-a", createdByPrincipalId: "author-a" });
  const second = makePost({ id: "post-b", title: "B", slug: "post-b", createdByPrincipalId: "author-b" });
  const entities = [packedFrom(first), packedFrom(second)];
  const report = await plan(publishContentDeps, baselineRepo, SOURCE_PRINCIPAL_ID, entities);
  assert.equal(report.rows.filter((r) => r.writes).length, 2, "precondition: both rows are writing 'created' rows");

  const bundleId = await stage(bundleRepo, clock, entities);
  const result = await applyPort.applyReport({ report, principalId: OPERATOR_PRINCIPAL_ID, bundleId, restorePointId: "rp-1" });

  assert.equal(result.changeSetIds.length, 2);

  const run = await runRepo.findById({ workspaceId: WORKSPACE_ID, id: "run-1" });
  assert.ok(run);
  const recorded = JSON.parse(run!.changeSetIdsJson ?? "[]") as string[];
  assert.deepEqual([...recorded].sort(), [...result.changeSetIds].sort(), "the run row must record EVERY changeSetId the run produced, not a subset");
});

test("a baseline failure after the content command durably records the landed item and exact retry key", async () => {
  const storedBaselines = new InMemoryPublishContentBaselineRepo();
  const failingBaselineRepo: PublishContentBaselineRepoPort = {
    findOne: (input) => storedBaselines.findOne(input),
    upsert: async () => {
      throw new Error("simulated baseline write failure");
    },
  };
  const { postRepo, clock, changeSets, bundleRepo, runRepo, publishContentDeps, applyPort } = makeHarness(
    [],
    failingBaselineRepo
  );
  const incoming = makePost({ id: "post-partial", title: "Content lands first", slug: "post-partial" });
  const entity = packedFrom(incoming);
  const report = await plan(publishContentDeps, failingBaselineRepo, SOURCE_PRINCIPAL_ID, [entity]);
  const bundleId = await stage(bundleRepo, clock, [entity]);

  await assert.rejects(
    applyPort.applyReport({
      report,
      principalId: OPERATOR_PRINCIPAL_ID,
      bundleId,
      restorePointId: "rp-partial",
    }),
    /simulated baseline write failure/
  );

  assert.equal(
    (await postRepo.findById({ workspaceId: WORKSPACE_ID, id: entity.id }))?.title,
    "Content lands first",
    "precondition: the domain write really landed before the simulated accounting failure"
  );
  const status = await getPublishContentRunStatus(runRepo, { workspaceId: WORKSPACE_ID, runId: "run-1" });
  assert.equal(status?.phase, "failed");
  assert.equal(status?.items.length, 1);
  assert.equal(status?.items[0]?.phase, "content_applied");
  assert.match(status?.items[0]?.errorSummary ?? "", /simulated baseline write failure/);
  assert.ok(status?.items[0]?.changeSetId, "the landed command's change-set id must survive the later failure");
  assert.deepEqual(status?.changeSetIds, [status?.items[0]?.changeSetId]);

  const expectedKey = publishContentItemIdempotencyKey({
    workspaceId: WORKSPACE_ID,
    sourcePrincipalId: SOURCE_PRINCIPAL_ID,
    entity,
  });
  assert.equal(status?.items[0]?.idempotencyKey, expectedKey);
  assert.equal(
    (await changeSets.findByIdempotencyKey({ workspaceId: WORKSPACE_ID, idempotencyKey: expectedKey }))?.id,
    status?.items[0]?.changeSetId,
    "status and the command ledger must point at the same exact-version command"
  );
});

// ---------------------------------------------------------------------------
// Author preservation through the composed loop (Task 15) — both arms.
// ---------------------------------------------------------------------------

test("apply-loop: a 'created' row with a non-null source author imports with that author, never the operator's id", async () => {
  const { postRepo, clock, baselineRepo, bundleRepo, publishContentDeps, applyPort } = makeHarness([]);

  const incoming = makePost({ id: "post-authored", title: "Authored", slug: "post-authored", createdByPrincipalId: "source-author-42" });
  const entities = [packedFrom(incoming)];
  const report = await plan(publishContentDeps, baselineRepo, SOURCE_PRINCIPAL_ID, entities);
  const bundleId = await stage(bundleRepo, clock, entities);

  await applyPort.applyReport({ report, principalId: OPERATOR_PRINCIPAL_ID, bundleId, restorePointId: "rp-1" });

  const saved = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "post-authored" });
  assert.equal(saved?.createdByPrincipalId, "source-author-42");
  assert.notEqual(saved?.createdByPrincipalId, OPERATOR_PRINCIPAL_ID);
});

test("apply-loop: a 'created' row with a NULL source author imports as null, never the operator's id", async () => {
  const { postRepo, clock, baselineRepo, bundleRepo, publishContentDeps, applyPort } = makeHarness([]);

  const incoming = makePost({ id: "post-unauthored", title: "Unauthored", slug: "post-unauthored", createdByPrincipalId: null });
  const entities = [packedFrom(incoming)];
  const report = await plan(publishContentDeps, baselineRepo, SOURCE_PRINCIPAL_ID, entities);
  const bundleId = await stage(bundleRepo, clock, entities);

  await applyPort.applyReport({ report, principalId: OPERATOR_PRINCIPAL_ID, bundleId, restorePointId: "rp-1" });

  const saved = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "post-unauthored" });
  assert.equal(saved?.createdByPrincipalId, null, "a null source author must import as null, never be filled with the operator's id");
});

// ---------------------------------------------------------------------------
// A whole-run refusal is recorded, never applied.
// ---------------------------------------------------------------------------

test("a refused report is persisted as an 'abandoned' run and produces no writes", async () => {
  const { clock, bundleRepo, runRepo, applyPort } = makeHarness([]);
  const bundleId = await stage(bundleRepo, clock, []);
  const refused: PublishContentReport = {
    refused: true,
    refusalReason: "bundle content-hash version mismatch",
    applyOrder: [],
    rows: [],
  };

  const result = await applyPort.applyReport({ report: refused, principalId: OPERATOR_PRINCIPAL_ID, bundleId, restorePointId: "rp-1" });

  assert.deepEqual(result.changeSetIds, []);
  const run = await runRepo.findById({ workspaceId: WORKSPACE_ID, id: "run-1" });
  assert.equal(run?.phase, "abandoned");
});

// ---------------------------------------------------------------------------
// One bad row must not kill the run — the property `apply-errors.ts` exists for.
//
// `media` is the first non-`post` type whose `apply()` can refuse ONE entity for a data-shaped
// reason (a blob this destination never received, a slug held by someone else). Before
// `PublishContentApplyRowError`, any such refusal failed `isKnownApplyRace` and hit `throw error`,
// aborting a whole publish over a single missing image. This test constructs that exact race for
// REAL — deleting the staged bytes from the SAME `InMemoryBlobStore` the apply port reads from,
// between planning and applying, which is what a blob GC pass landing mid-run would do — rather
// than mocking a handler to throw.
// ---------------------------------------------------------------------------

test("a media row blocked at apply time downgrades that ONE row and the rest of the run still applies", async () => {
  resetPublishContentContributorsForTests();
  registerPublishContentContributor(contributePostPublish());
  registerPublishContentContributor(contributeMediaPublish());

  const postRepo = new InMemoryPostRepo([]);
  const mediaRepo = new InMemoryMediaRepo();
  const assetBlobRepo = new InMemoryAssetBlobRepo();
  const blobStore = new InMemoryBlobStore();
  const clock = makeClock();
  const outbox = new InMemoryOutbox();
  const changeSets = new InMemoryChangeSetRepo([], [], outbox);
  const baselineRepo = new InMemoryPublishContentBaselineRepo();
  const bundleRepo = new InMemoryPublishContentBundleRepo();
  const runRepo = new InMemoryPublishContentRunRepo();

  const publishContentDeps: PublishContentDeps = {
    workspaceId: WORKSPACE_ID,
    postRepo,
    clock,
    idGen: makeCounterIdGen("cs"),
    outbox,
    changeSets,
    authorize: async () => ({ allowed: true, reason: "test-always-allow" }),
    mediaRepo,
    assetBlobRepo,
    blobStore,
  };
  const applyPort = createPublishContentApplyPort({
    workspaceId: WORKSPACE_ID,
    bundleRepo,
    baselineRepo,
    runRepo,
    publishContentDeps,
    clock,
    idGen: makeCounterIdGen("run"),
  });

  const photoBytes = new TextEncoder().encode("a real imported photo's bytes");
  const photoSha256 = "86d9075d85c1cce55da0605a557dceaea6c27f18df8702ce86accccce8a41aa9";
  const mediaRecord: MediaRecord = {
    id: "vanishing-photo",
    workspaceId: WORKSPACE_ID,
    title: "Vanishing Photo",
    slug: "vanishing-photo",
    alt: "",
    caption: "",
    credit: "",
    source: { sha256: photoSha256 },
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    width: 800,
    height: 600,
    cssClass: null,
    htmlAttributes: null,
  };
  const mediaEntity: PackedEntity = {
    entityType: "media",
    id: mediaRecord.id,
    schemaVersion: 1,
    contentHash: contentHash("media", { ...mediaRecord }),
    hashVersion: CONTENT_HASH_VERSION,
    requiredBlobs: [photoSha256],
    state: { ...mediaRecord } as unknown as Record<string, unknown>,
  };
  const healthyA = packedFrom(makePost({ id: "healthy-a", title: "Healthy A" }));
  const healthyC = packedFrom(makePost({ id: "healthy-c", title: "Healthy C" }));

  // The bytes ARE present at plan time — so `media.precheck()` passes and the row plans as a real
  // writing `created`, which is the only way `apply()` is ever reached.
  await blobStore.putIfAbsent({ workspaceId: WORKSPACE_ID, sha256: photoSha256, bytes: photoBytes });
  const entities = [mediaEntity, healthyA, healthyC];
  const report = await plan(publishContentDeps, baselineRepo, SOURCE_PRINCIPAL_ID, entities);
  assert.deepEqual(
    report.rows.map((row) => `${row.entityType}:${row.entityId}=${row.outcome}`),
    ["media:vanishing-photo=created", "post:healthy-a=created", "post:healthy-c=created"],
    "all three must plan as writing rows, or this test proves nothing about the apply-time path"
  );
  const bundleId = await stage(bundleRepo, clock, entities);

  // The race: the bytes disappear between plan and apply.
  await blobStore.remove({ storageKey: computeBlobStorageKey({ workspaceId: WORKSPACE_ID, sha256: photoSha256 }) });

  const result = await applyPort.applyReport({
    report,
    principalId: OPERATOR_PRINCIPAL_ID,
    bundleId,
    restorePointId: "rp-1",
  });

  const run = await runRepo.findById({ workspaceId: WORKSPACE_ID, id: "run-1" });
  assert.equal(run?.phase, "applied", "the run must COMPLETE — one bad row is not a failed run");
  const finalRows = (JSON.parse(run!.reportJson) as PublishContentReport).rows;

  const mediaRow = finalRows.find((row) => row.entityType === "media");
  assert.equal(mediaRow?.outcome, "blocked", "a missing blob is `blocked`, never `conflict` — nobody edited anything");
  assert.equal(mediaRow?.writes, false);
  assert.equal(
    mediaRow?.reason,
    `media 'vanishing-photo' cannot be applied — required blob '${photoSha256}' was never received by this destination`,
    "the type's own message is the row's reason, verbatim"
  );
  assert.doesNotMatch(
    mediaRow?.reason ?? "",
    /changed on the destination during apply/,
    "post's legacy conflict prefix must not be glued onto a message that already reads on its own"
  );

  // The whole point: the other two entities still landed.
  assert.deepEqual(
    finalRows.filter((row) => row.entityType === "post").map((row) => `${row.entityId}=${row.outcome}`),
    ["healthy-a=created", "healthy-c=created"]
  );
  assert.equal((await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "healthy-a" }))?.title, "Healthy A");
  assert.equal((await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "healthy-c" }))?.title, "Healthy C");
  assert.equal(result.changeSetIds.length, 2, "exactly the two healthy posts produced change sets");

  // And the blocked row wrote nothing at all.
  assert.equal(await mediaRepo.findById({ workspaceId: WORKSPACE_ID, id: "vanishing-photo" }), null);
  assert.equal(await assetBlobRepo.findByHash({ workspaceId: WORKSPACE_ID, sha256: photoSha256 }), null);
  assert.equal(
    await baselineRepo.findOne({
      workspaceId: WORKSPACE_ID,
      peerPrincipalId: SOURCE_PRINCIPAL_ID,
      entityType: "media",
      entityId: "vanishing-photo",
    }),
    null,
    "a blocked row must never record a baseline — that would tell the NEXT run we agreed on it"
  );
});
