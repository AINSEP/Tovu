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
import { isTrashed } from "#src/features/post/post";
import type { PostRecord } from "#src/features/post/post";
import { contributePostPublish, toPublishableState } from "#src/features/post/publish-content";
import { removeVia } from "#src/features/post/__tests__/remove-post-double";
import { InMemoryAssetBlobRepo, InMemoryBlobStore, InMemoryVersionedMediaRepo, computeBlobStorageKey, type MediaRecord } from "#src/features/media/index";
import { contributeMediaPublish } from "#src/features/media/publish-content";

import { CONTENT_HASH_VERSION, contentHash } from "../content-hash.js";
import { PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION } from "../artifact-format.js";
import { InMemoryPublishContentBaselineRepo } from "../baseline-repo.js";
import type { PublishContentBaselineRepoPort } from "../baseline-repo.js";
import { InMemoryPublishContentBundleRepo, stageBundle } from "../bundle-staging.js";
import { getPublishContentRunStatus, InMemoryPublishContentRunRepo } from "../run-repo.js";
import { entityKey, planImport } from "../planner.js";
import type { PublishContentBundle, PublishContentReport } from "../planner.js";
import {
  registerPublishContentContributor,
  resetPublishContentContributorsForTests,
} from "../type-registry.js";
import type { PackedEntity, PublishContentDeps, PublishContentContributor, PublishContentHandler, RetireTarget } from "../type-registry.js";
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
  baselineRepo: PublishContentBaselineRepoPort = new InMemoryPublishContentBaselineRepo(),
  getSeedHash?: (args: { entityType: string; entityId: string }) => Promise<string | null>
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
    // Required by `features/post/publish-content.ts`'s apply guard — its rollback restores through
    // `restorePostForward`, which drops the Trash index row when the write it undoes was a trash.
    // An import never trashes, so this never fires here.
    forgetRemovedPost: async () => {},
    // S5 — `retire()`'s own guard requires this too (mirrors `post/__tests__/publish-content.test.ts`'s
    // `makeApplyDeps`), bound to the SAME repo instance every other test in this file already reads/
    // writes through. Harmless for every test that never retires anything.
    removePost: removeVia(postRepo),
  };

  const applyPort = createPublishContentApplyPort({
    workspaceId: WORKSPACE_ID,
    bundleRepo,
    baselineRepo,
    runRepo,
    publishContentDeps,
    clock,
    idGen: makeCounterIdGen("run"),
    ...(getSeedHash === undefined ? {} : { getSeedHash }),
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
// S5 (publish-overwrite-live-plan-2026-09-24.md §4/§5) — the address-clash
// overwrite: retire the live holder, then create the incoming row under its
// own id. Every one of these was confirmed to FAIL with `applyOneRow`'s
// `row.retires` branch commented out (falling through to the pre-S5 generic
// guards) before being accepted, per this file's own falsification rule.
// ---------------------------------------------------------------------------

/** Builds a `PublishContentReport` for exactly one packed entity, using the REAL registry the
 *  caller's `publishContentDeps` was built with — like {@link plan} above, but this file's own
 *  `plan()` helper never threads `forcedEntityKeys`, and every S5 test needs one to reach `forced`. */
async function planWithForce(
  publishContentDeps: PublishContentDeps,
  entities: readonly PackedEntity[],
  forcedEntityKeys: ReadonlySet<string>
): Promise<PublishContentReport> {
  const bundle: PublishContentBundle = {
    artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION,
    hashVersion: CONTENT_HASH_VERSION,
    entities,
  };
  return planImport(bundle, {
    publishContentDeps,
    getBaseline: async () => null,
    hasBlob: async () => true,
    forcedEntityKeys,
  });
}

test("address-clash overwrite: the live holder is retired to Trash and the incoming row is created under its own id, with the create's changeSetId and the retire's tracked separately", async () => {
  const holder = makePost({ id: "post-about", slug: "about", kind: "post", version: 3, status: "published", title: "About (live)" });
  const { postRepo, clock, bundleRepo, runRepo, publishContentDeps, applyPort } = makeHarness([holder]);

  // Same entityType ("post") on both sides deliberately — the cross-kind (post-vs-page) version of
  // this exact production scenario is S11's own scope, not S5's; this test isolates the retire+create
  // mechanics apply-loop.ts itself owns.
  const incoming = makePost({ id: "local-about", slug: "about", kind: "post", title: "About Tovu", createdByPrincipalId: "source-author-1" });
  const entities = [packedFrom(incoming)];
  const forcedKey = entityKey("post", "local-about");
  const report = await planWithForce(publishContentDeps, entities, new Set([forcedKey]));

  assert.equal(report.rows[0].outcome, "forced", "precondition: the slug clash must be offered and forced");
  assert.equal(report.rows[0].retires?.entityId, "post-about", "precondition: the forced row must name the live holder");

  const bundleId = await stage(bundleRepo, clock, entities);
  const result = await applyPort.applyReport({ report, principalId: OPERATOR_PRINCIPAL_ID, bundleId, restorePointId: "rp-1" });

  assert.equal(result.changeSetIds.length, 1, "the create is the only id this port's own changeSetIds surfaces — the retire's stays separate (this file's own doc)");

  const status = await getPublishContentRunStatus(runRepo, { workspaceId: WORKSPACE_ID, runId: "run-1" });
  assert.equal(status?.retiredChangeSetIds.length, 1, "the retire must produce its own change set");
  assert.notEqual(status?.retiredChangeSetIds[0], result.changeSetIds[0], "the retire and the create are two distinct change sets, never the same id twice");

  const retiredHolder = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "post-about" });
  assert.equal(isTrashed(retiredHolder!), true, "the live holder must be moved to Trash, never left live under a taken slug");
  assert.equal(retiredHolder?.slug, "about-replaced-20260919", "the holder's own slug must be freed by renaming, never left colliding");

  const created = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "local-about" });
  assert.ok(created, "the incoming row must be created under its OWN id, never merged into the retired holder's id");
  assert.equal(created?.slug, "about", "the incoming row takes the now-freed address");

  const run = await runRepo.findById({ workspaceId: WORKSPACE_ID, id: "run-1" });
  assert.equal(run?.phase, "applied", "the run itself must complete, not merely the row");
});

test("the live holder changing between plan and apply downgrades the retire-forced row to 'conflict' — nothing is retired, nothing is created", async () => {
  const holder = makePost({ id: "post-about", slug: "about", kind: "post", version: 3, status: "published", title: "About (live)" });
  const { postRepo, clock, bundleRepo, runRepo, publishContentDeps, applyPort } = makeHarness([holder]);

  const incoming = makePost({ id: "local-about", slug: "about", kind: "post", title: "About Tovu" });
  const entities = [packedFrom(incoming)];
  const forcedKey = entityKey("post", "local-about");
  const report = await planWithForce(publishContentDeps, entities, new Set([forcedKey]));
  assert.equal(report.rows[0].outcome, "forced", "precondition");

  const bundleId = await stage(bundleRepo, clock, entities);

  // The race: the live holder is edited AFTER the plan above, BEFORE apply — its content hash (what
  // a fresh planRetire() would report) no longer matches what `row.retires.hash` pinned at plan time.
  await postRepo.save({ ...holder, title: "About (edited on live during the race)", version: holder.version + 1 });

  const result = await applyPort.applyReport({ report, principalId: OPERATOR_PRINCIPAL_ID, bundleId, restorePointId: "rp-1" });

  assert.deepEqual(result.changeSetIds, [], "no create must land while the retire target is stale");

  const run = await runRepo.findById({ workspaceId: WORKSPACE_ID, id: "run-1" });
  const persistedReport = JSON.parse(run!.reportJson ?? "null") as PublishContentReport;
  assert.equal(persistedReport.rows[0].outcome, "conflict");
  assert.match(persistedReport.rows[0].reason ?? "", /changed after this run's plan was built/);

  const status = await getPublishContentRunStatus(runRepo, { workspaceId: WORKSPACE_ID, runId: "run-1" });
  assert.deepEqual(status?.retiredChangeSetIds, [], "a stale retire target must never actually be retired");

  const stillHolder = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "post-about" });
  assert.equal(isTrashed(stillHolder!), false, "the holder must stay live — never retired on a target that already moved on");
  assert.equal(stillHolder?.slug, "about");
  assert.equal(stillHolder?.title, "About (edited on live during the race)", "the live edit itself must survive untouched");

  const created = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "local-about" });
  assert.equal(created, null, "nothing must be created while the address is still contested");
});

/** A minimal fake handler for the one property below that has nothing to do with `post`'s own
 *  domain rules: apply-loop.ts's OWN try/catch/undo wiring when the create half of a retire+create
 *  pair fails. A real `contributePostPublish()` handler cannot be made to fail `apply()` on demand
 *  without also exercising unrelated post-domain validation, so this fake isolates the property. */
function makeRetireFakeHandler(options: {
  store: Map<string, { version: number; hash: string; retired: boolean }>;
  holderId: string;
  applyShouldThrow: boolean;
}): PublishContentHandler {
  let retireCount = 0;
  return {
    entityType: "widget",
    schemaVersion: 1,
    permission: "content.write",
    dependsOn: [],
    pack: async function* () {},
    inspect: async (id: string) => {
      const row = options.store.get(id);
      if (!row || row.retired) return null;
      return { version: row.version, hash: row.hash };
    },
    precheck: async (entity: PackedEntity) => (entity.id === "incoming-widget" ? "slug clash (fake)" : null),
    apply: async () => {
      if (options.applyShouldThrow) {
        throw new Error("apply failed deliberately for the undo test");
      }
      options.store.set("incoming-widget", { version: 1, hash: "incoming-hash", retired: false });
      return { changeSetId: "cs-create-1" };
    },
    planRetire: async (): Promise<RetireTarget | null> => {
      const holder = options.store.get(options.holderId);
      if (!holder || holder.retired) return null;
      return { entityType: "widget", entityId: options.holderId, entityLabel: "Holder", hash: holder.hash };
    },
    retire: async (input: { target: RetireTarget; principalId: string; idempotencyKey: string }) => {
      const holder = options.store.get(input.target.entityId)!;
      options.store.set(input.target.entityId, { ...holder, retired: true });
      retireCount += 1;
      return {
        changeSetId: `cs-retire-${retireCount}`,
        undo: async () => {
          const current = options.store.get(input.target.entityId)!;
          options.store.set(input.target.entityId, { ...current, retired: false });
        },
      };
    },
  };
}

function fakeWidgetContributor(handler: PublishContentHandler): PublishContentContributor {
  return { entityType: handler.entityType, dependsOn: handler.dependsOn, build: () => handler };
}

test("the create failing after a successful retire puts the holder back live — the retire is never left stranded", async () => {
  const store = new Map<string, { version: number; hash: string; retired: boolean }>();
  store.set("holder-widget", { version: 1, hash: "holder-hash", retired: false });

  const { clock, bundleRepo, runRepo, publishContentDeps, applyPort } = makeHarness([]);
  registerPublishContentContributor(
    fakeWidgetContributor(makeRetireFakeHandler({ store, holderId: "holder-widget", applyShouldThrow: true }))
  );

  const incomingEntity: PackedEntity = {
    entityType: "widget",
    id: "incoming-widget",
    schemaVersion: 1,
    contentHash: "incoming-hash",
    hashVersion: CONTENT_HASH_VERSION,
    requiredBlobs: [],
    state: { title: "Incoming Widget" },
  };
  const forcedKey = entityKey("widget", "incoming-widget");
  const report = await planWithForce(publishContentDeps, [incomingEntity], new Set([forcedKey]));
  assert.equal(report.rows[0].outcome, "forced", "precondition");
  assert.equal(report.rows[0].retires?.entityId, "holder-widget", "precondition");

  const bundleId = await stage(bundleRepo, clock, [incomingEntity]);

  await assert.rejects(() =>
    applyPort.applyReport({ report, principalId: OPERATOR_PRINCIPAL_ID, bundleId, restorePointId: "rp-1" })
  );

  assert.equal(store.get("holder-widget")?.retired, false, "undo() must have restored the holder live after the create threw");
  assert.equal(store.has("incoming-widget"), false, "the create must never have actually landed");

  const run = await runRepo.findById({ workspaceId: WORKSPACE_ID, id: "run-1" });
  assert.equal(run?.phase, "failed", "a genuine (non-downgradeable) apply() throw must still fail the run, not silently swallow it");
});

test("a row without `retires` behaves exactly as before S5 — the generic created/removed guards still apply", async () => {
  const { postRepo, clock, baselineRepo, bundleRepo, runRepo, publishContentDeps, applyPort } = makeHarness([]);

  const incoming = makePost({ id: "post-plain", title: "Plain create", slug: "post-plain", createdByPrincipalId: "author-plain" });
  const entities = [packedFrom(incoming)];
  const report = await plan(publishContentDeps, baselineRepo, SOURCE_PRINCIPAL_ID, entities);
  assert.equal(report.rows[0].outcome, "created");
  assert.equal(report.rows[0].retires, null, "precondition: an ordinary create carries no retire target");

  const bundleId = await stage(bundleRepo, clock, entities);
  const result = await applyPort.applyReport({ report, principalId: OPERATOR_PRINCIPAL_ID, bundleId, restorePointId: "rp-1" });

  assert.equal(result.changeSetIds.length, 1);
  const status = await getPublishContentRunStatus(runRepo, { workspaceId: WORKSPACE_ID, runId: "run-1" });
  assert.deepEqual(status?.retiredChangeSetIds, [], "a row with no retires must never produce a retiredChangeSetId");

  const created = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "post-plain" });
  assert.ok(created, "the plain create path must still work unchanged");
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
  const mediaRepo = new InMemoryVersionedMediaRepo();
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
    // See the harness bag above for why `apply()` requires this.
    forgetRemovedPost: async () => {},
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

// ---------------------------------------------------------------------------
// D1 — the seed version is the apply-time virtual baseline too, not only the plan-time one.
// ---------------------------------------------------------------------------

/** Plans exactly like {@link plan}, plus the same seed lookup the apply port was built with —
 *  `gated-hooks.ts#buildReport` passes the one `RouteDeps.publishContentSeedHash` to both. */
async function planWithSeed(
  publishContentDeps: PublishContentDeps,
  getSeedHash: (args: { entityType: string; entityId: string }) => Promise<string | null>,
  entities: readonly PackedEntity[]
): Promise<PublishContentReport> {
  const bundle: PublishContentBundle = { artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION, hashVersion: CONTENT_HASH_VERSION, entities };
  return planImport(bundle, { publishContentDeps, getBaseline: async () => null, hasBlob: async () => true, getSeedHash });
}

test("D1: a row still matching the seed with NO baseline plans 'applied' AND is actually written at apply time", async () => {
  const seeded = makePost({ id: "page-seeded", title: "Seed title", slug: "seeded", version: 3 });
  const seedHash = contentHash("post", toPublishableState(seeded));
  const getSeedHash = async ({ entityId }: { entityType: string; entityId: string }) => (entityId === "page-seeded" ? seedHash : null);
  const { postRepo, clock, baselineRepo, bundleRepo, publishContentDeps, applyPort } = makeHarness([seeded], undefined, getSeedHash);

  const entities = [packedFrom(makePost({ ...seeded, title: "Owner's new title" }))];
  const report = await planWithSeed(publishContentDeps, getSeedHash, entities);
  assert.equal(report.rows[0].outcome, "applied");
  const bundleId = await stage(bundleRepo, clock, entities);

  const result = await applyPort.applyReport({ report, principalId: OPERATOR_PRINCIPAL_ID, bundleId, restorePointId: "rp-1" });

  assert.equal(result.changeSetIds.length, 1, "the seed-matched row must produce a change set, not a silent apply-time conflict");
  const landed = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "page-seeded" });
  assert.equal(landed?.title, "Owner's new title");
  const baseline = await baselineRepo.findOne({ workspaceId: WORKSPACE_ID, peerPrincipalId: SOURCE_PRINCIPAL_ID, entityType: "post", entityId: "page-seeded" });
  assert.equal(baseline?.hashAtLastSync, entities[0].contentHash, "a real baseline is recorded, so the seed is never consulted for this row again");
});

test("D1: a seed-matched row edited on the destination AFTER plan still downgrades to 'conflict' at apply", async () => {
  const seeded = makePost({ id: "page-seeded", title: "Seed title", slug: "seeded", version: 3 });
  const seedHash = contentHash("post", toPublishableState(seeded));
  const getSeedHash = async () => seedHash;
  const { postRepo, clock, bundleRepo, publishContentDeps, applyPort } = makeHarness([seeded], undefined, getSeedHash);

  const entities = [packedFrom(makePost({ ...seeded, title: "Owner's new title" }))];
  const report = await planWithSeed(publishContentDeps, getSeedHash, entities);
  assert.equal(report.rows[0].outcome, "applied");
  const bundleId = await stage(bundleRepo, clock, entities);
  await postRepo.save({ ...seeded, title: "Edited on live meanwhile", version: 4 });

  const result = await applyPort.applyReport({ report, principalId: OPERATOR_PRINCIPAL_ID, bundleId, restorePointId: "rp-1" });

  assert.deepEqual(result.changeSetIds, []);
  const kept = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "page-seeded" });
  assert.equal(kept?.title, "Edited on live meanwhile");
});
