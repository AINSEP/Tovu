import type { ClockPort, IdGeneratorPort } from "@jini-ai/cms/core";
import { computeBlobStorageKey } from "@jini-ai/cms/media";

import type { GatedMutationHooks } from "../../contracts/core/gated-mutations/gateway.js";
import { planHashOf, resolveActorClassIdentity } from "../../contracts/core/gated-mutations/composition.js";
import { loadActiveBundle } from "./bundle-staging.js";
import type { PublishContentBundleRepoPort } from "./bundle-staging.js";
import type { PublishContentBaselineRepoPort } from "./baseline-repo.js";
import { planImport } from "./planner.js";
import type { PlanImportDeps, PublishContentBundle, PublishContentReport } from "./planner.js";
import type { PublishContentDeps, PackedEntity } from "./type-registry.js";

/**
 * @file Task 7 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §1.5/§4 task 7.
 *
 * `buildPublishContentImportHooks` is publish-content's `GatedMutationHooks` factory for the
 * import ceremony (`domain: "publish_content.import"`) — the same shape as
 * `features/taxonomy/gated-hooks.ts`'s `buildMergeTermHooks` (a workspace-scoped ceremony; no
 * `scopeKind` override, unlike the two instance-scoped ceremonies in `features/database`/
 * `features/recovery`). A route builds fresh hooks per request (closing over that request's
 * `bundleId`), exactly like `buildMergeTermHooks` closes over `fromTermId`/`intoTermId`.
 *
 * ## Why `computePlan()` needs no special-casing for `PLAN_STALE`
 *
 * `computePlan()` re-derives `PublishContentReport` from LIVE state on every call — reloading the staged
 * bundle and calling `planImport()` fresh, which itself calls every registered handler's `inspect()`
 * live (never cached). `gateway.execute()` (CIC U-001-B3) already re-runs `hooks.computePlan()` and
 * hash-compares it against the confirmed token before ever reaching `executeMutation()` — so a
 * destination row that changes between `plan()` and `execute()` changes that row's outcome (e.g.
 * `unchanged` -> `conflict`), which changes `planHashOf(report)`, which `execute()` rejects as
 * `PLAN_STALE` with ZERO code in this file dedicated to detecting it. This is exactly the property
 * plan §0 #7 and §5 risk #2 call out: the built gated-mutation gateway gives this for free where a
 * bespoke `?mode=dry-run` flow would not.
 *
 * ## The seam with Task 8 — read this before touching `executeMutation`
 *
 * `executeMutation()` does exactly two things: (1) captures a restore point via
 * `DbOpsPort.captureRestorePoint` and persists it through `restorePointsRepo`, BEFORE any write this
 * run might make (plan §4 task 7's own instruction); (2) hands the report `gateway.execute()`
 * verified against the confirmed token — passed in as `verified.details`, never re-derived here
 * (sol review 2026-09-20, High finding 1) — to
 * {@link PublishContentApplyPort.applyReport}. This file owns (1) and the wiring in (2); it does
 * NOT own what happens inside `applyReport` — that is Task 8's apply loop
 * (`features/publish-content/apply-loop.ts`: per-type ordering, `executeCommand` +
 * `expectedVersion`, baseline upserts). Both composition roots require and bind that real port.
 *
 * **Task 8 addendum (2026-09-18):** the ORIGINAL seam here was too narrow to actually apply
 * anything — `applyReport({report, principalId})` alone gives a real apply port no way to reload the
 * staged bundle's packed entities or its `sourcePrincipalId` (the baseline peer key, plan §5 risk
 * #9 — never the executing operator's id). `applyReport`'s input is widened below with `bundleId`/
 * `restorePointId`, both already free in this function's own closure/locals, so a real apply port
 * can call `loadActiveBundle` itself rather than `TransportReport` growing an apply-time-only field.
 * This is the one disclosed, necessary touch to this file Task 8 makes — see
 * `apply-loop.ts`'s own header for why threading raw entities through the report instead would have
 * leaked apply-time concerns into Task 5's planner.
 *
 * ## Restore-point cost-class refusal lives OUTSIDE this file
 *
 * "`costClass: 'unavailable'` refuses, with no override" is enforced by `execute-import.ts`'s
 * `executePublishContentImport()`, which the `/execute` ROUTE calls to wrap `gatewayExecute()` —
 * mirroring `features/database/migrate-forward/execute.ts`'s identical split (the check happens
 * before `gateway.execute()`'s own authorize/token/plan-hash checks even run, not buried inside this
 * file's `executeMutation()`, which only runs after every one of those has already passed).
 */

/** Narrow structural slice of `DbOpsPort` this file actually calls — declared locally rather than
 *  importing the whole `contracts/core/gated-mutations/ports.ts#DbOpsPort`, the same "keep the
 *  domain's own hooks file decoupled from the full port surface" precedent
 *  `features/database/gated-hooks.ts`'s own `MigrateForwardDbOpsPort` sets. */
export interface PublishContentDbOpsPort {
  captureRestorePoint(required: { scopeId: string }): Promise<{ artifactRef: string; watermarkAtCapture: number }>;
}

/** Narrow structural slice of `features/database/restore-points.ts#RestorePointSavePort` this file
 *  actually calls — declared locally for the identical decoupling reason as
 *  {@link PublishContentDbOpsPort} (and the same reason `buildMigrateForwardHooks` declares its
 *  own `restorePointsRepo` field type inline rather than importing the whole port). */
export interface PublishContentRestorePointSavePort {
  save(row: {
    restorePointId: string;
    idempotencyKey: string;
    trigger: string;
    createdAt: string;
    createdBy: string;
    artifactRef?: string;
    watermarkAtCapture?: number | null;
  }): Promise<void>;
}

/** Thrown when the `bundleId` a `plan`/`execute` request names has no active staged bundle — either
 *  it was never staged for this workspace, or {@link loadActiveBundle}'s TTL check (`bundle-staging.
 *  ts`) has already expired it. Both causes are deliberately collapsed into one error, mirroring that
 *  same file's own "an unrecognized bundle and an expired bundle are indistinguishable to a caller"
 *  reasoning for `token.ts`'s `TokenExpiredError`. */
export class PublishContentBundleNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishContentBundleNotFoundError";
  }
}

/**
 * Task 8's seam: applies an already-computed, already-authorized {@link PublishContentReport}. Never
 * called by anything in this file except `executeMutation()`, and never before the restore point is
 * captured (see this file's header).
 *
 * `bundleId`/`restorePointId` (2026-09-18, this file's "Task 8 addendum" above) let a real
 * implementation (`apply-loop.ts`) reload the staged bundle itself — the report alone does not carry
 * enough to apply anything (no packed entity state, no source principal id).
 */
export interface PublishContentApplyPort {
  applyReport(input: {
    report: PublishContentReport;
    principalId: string;
    bundleId: string;
    restorePointId: string;
    /**
     * The authorization function each registered type's `apply()` must run under, when the CALLER
     * knows better than the port's own bag.
     *
     * The port is a composition-root singleton and closes over the instance-wide `authorize`, which
     * is RBAC. That is right for a human and wrong for a publishing credential: `pub:<installation>`
     * is deliberately not a row in `principals`, so RBAC answers `principal_disabled` and the whole
     * execute fails. The import route therefore hands down the per-request attenuated function that
     * answers from the grant — see `publish-trust-auth.ts`'s `withPublishTrustContentAuthorize`.
     *
     * Absent means "use the port's own", so every existing caller is unchanged.
     */
    authorize?: PublishContentDeps["authorize"];
  }): Promise<{ runId: string; changeSetIds: readonly string[] }>;
}

export interface BuildPublishContentImportHooksInput {
  workspaceId: string;
  /** The staged bundle (`bundle-staging.ts`, Task 6) this ceremony plans/applies against. Fixed for
   *  the lifetime of one built hooks object — a route builds fresh hooks per request, exactly like
   *  `buildMergeTermHooks` closes over `fromTermId`/`intoTermId` per request. */
  bundleId: string;
  actorId: string;
  clock: ClockPort;
  idGen: IdGeneratorPort;
  /** The already-built `PublishContentDeps` bag every registered contributor's `build()` closes
   *  over — same shape `export.ts`'s own `toPublishContentDeps` produces. */
  publishContentDeps: PublishContentDeps;
  bundleRepo: PublishContentBundleRepoPort;
  baselineRepo: PublishContentBaselineRepoPort;
  /** Only the read side is used ({@link BlobStorePort.exists}) — this ceremony never writes a blob
   *  itself (Task 6's `blobs/probe`/`blobs/:sha` routes own that). */
  blobStore: { exists(input: { storageKey: string }): Promise<boolean> };
  dbOps: PublishContentDbOpsPort;
  restorePointsRepo: PublishContentRestorePointSavePort;
  applyPort: PublishContentApplyPort;
}

/**
 * SPEC publish-content — the `publish_content` import ceremony's `GatedMutationHooks`. See this
 * file's header for the `PLAN_STALE`-for-free property and the Task 8 seam.
 *
 * @complexity O(n) in the staged bundle's entity count, via `planImport()` — dominated by
 * `planImport`'s own cost (its file header documents this precisely), not by anything in this file.
 * @overallScore 100
 */
export function buildPublishContentImportHooks(
  input: BuildPublishContentImportHooksInput
): GatedMutationHooks<
  PublishContentReport,
  { restorePointId: string; runId: string; changeSetIds: readonly string[] }
> {
  /** Re-derives the current `PublishContentReport` from live state, never cached across calls (this
   *  file's header). `computePlan()` is its ONLY caller: `executeMutation()` deliberately does not
   *  call it, because a second derivation is a second, unverified judgment call — see that
   *  function's own comment. */
  async function buildReport(): Promise<PublishContentReport> {
    const now = input.clock.nowIso();
    const staged = await loadActiveBundle({ repo: input.bundleRepo, workspaceId: input.workspaceId, id: input.bundleId, now });
    if (!staged) {
      throw new PublishContentBundleNotFoundError(
        `publish-content: bundle '${input.bundleId}' was not found, or has expired, for workspace '${input.workspaceId}'`
      );
    }

    const bundle: PublishContentBundle = {
      artifactFormatVersion: staged.artifactFormatVersion,
      hashVersion: staged.hashVersion,
      // Never persisted on a staged bundle row (`bundle-staging.ts`'s own disclosed schema
      // deviation) — display-only, and `planImport` treats it as optional. Not a loss of anything
      // this planner compares on.
      sourceLabel: undefined,
      entities: JSON.parse(staged.entitiesJson) as readonly PackedEntity[],
    };

    const getBaseline: PlanImportDeps["getBaseline"] = async ({ entityType, entityId }) => {
      const record = await input.baselineRepo.findOne({
        workspaceId: input.workspaceId,
        // Plan §1.6 / §5 risk #9: the peer key is the bundle's OWN authenticated source principal
        // (the peer who pushed/staged it), never the confirming/executing admin's principal id —
        // see this file's header and `baseline-repo.ts`'s own doc.
        peerPrincipalId: staged.sourcePrincipalId,
        entityType,
        entityId,
      });
      return record ? { hashAtLastSync: record.hashAtLastSync, hashVersion: record.hashVersion } : null;
    };

    const hasBlob = async (sha256: string): Promise<boolean> =>
      input.blobStore.exists({ storageKey: computeBlobStorageKey({ workspaceId: input.workspaceId, sha256 }) });

    return planImport(bundle, { publishContentDeps: input.publishContentDeps, getBaseline, hasBlob });
  }

  return {
    domain: "publish_content.import",
    readPermission: "publish_content.read",
    mutatePermission: "publish_content.apply",
    scopeId: input.workspaceId,
    computePlan: async () => {
      const report = await buildReport();
      return { planHash: planHashOf(report), details: report };
    },
    executeMutation: async (verified) => {
      // Restore point captured BEFORE any write this run might make (plan §4 task 7's own
      // instruction), mirroring `buildMigrateForwardHooks`'s identical ordering. The
      // `costClass: 'unavailable'` refusal itself lives in `execute-import.ts`, called by the
      // route BEFORE `gateway.execute()` ever reaches this function — see this file's header.
      const captured = await input.dbOps.captureRestorePoint({ scopeId: input.workspaceId });
      const restorePointId = input.idGen.newId();
      const now = input.clock.nowIso();
      await input.restorePointsRepo.save({
        restorePointId,
        idempotencyKey: restorePointId,
        trigger: "publish-content-import",
        createdAt: now,
        createdBy: input.actorId,
        artifactRef: captured.artifactRef,
        watermarkAtCapture: captured.watermarkAtCapture,
      });

      // The report `gateway.execute()` step 4 just re-derived and hash-matched against the
      // confirmed token — NOT a fresh `buildReport()` call.
      //
      // This used to re-derive, on the claim that `gateway.execute()` having hash-compared
      // "moments ago" made a second derivation "guaranteed consistent". That claim was false
      // (sol review 2026-09-20, High finding 1). `buildReport()` reads live state on every call
      // (this file's header) and the two derivations are separated by the token redemption plus
      // this function's own restore-point capture, which is a whole-workspace snapshot —
      // `execute-import.ts` classes its cost `cheap | expensive | unavailable`, so a slow one is a
      // supported state, not a pathology. That same file (line 14) records that this ceremony
      // deliberately takes no cross-domain operation lock. Nothing held the destination still, so a
      // row the operator confirmed as `conflict` (no write) could re-derive as `applied` (a write)
      // and be applied unseen: the operator authorises one write set and gets another.
      const report = verified.details;
      const { runId, changeSetIds } = await input.applyPort.applyReport({
        report,
        principalId: input.actorId,
        bundleId: input.bundleId,
        restorePointId,
        // This hooks bag's OWN authorize, which the route may have attenuated for a publishing
        // credential. Threaded rather than left to the port because the port is built once per
        // process and this decision is per request.
        ...(input.publishContentDeps.authorize === undefined ? {} : { authorize: input.publishContentDeps.authorize }),
      });
      return { restorePointId, runId, changeSetIds };
    },
    resolveActorClassIdentity,
  };
}
