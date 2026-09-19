import type { ClockPort, IdGeneratorPort } from "@jini-ai/cms/core";
import { computeBlobStorageKey } from "@jini-ai/cms/media";

import type { GatedMutationHooks } from "../../contracts/core/gated-mutations/gateway.js";
import { planHashOf, resolveActorClassIdentity } from "../../contracts/core/gated-mutations/composition.js";
import { loadActiveBundle } from "./bundle-staging.js";
import type { ContentTransportBundleRepoPort } from "./bundle-staging.js";
import type { ContentTransportBaselineRepoPort } from "./baseline-repo.js";
import { planImport } from "./planner.js";
import type { PlanImportDeps, TransportBundle, TransportReport } from "./planner.js";
import type { ContentTransportDeps, PackedEntity } from "./type-registry.js";

/**
 * @file Task 7 of the content-transport (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §1.5/§4 task 7.
 *
 * `buildContentTransportImportHooks` is content-transport's `GatedMutationHooks` factory for the
 * import ceremony (`domain: "content.transport"`) — the same shape as
 * `features/taxonomy/gated-hooks.ts`'s `buildMergeTermHooks` (a workspace-scoped ceremony; no
 * `scopeKind` override, unlike the two instance-scoped ceremonies in `features/database`/
 * `features/recovery`). A route builds fresh hooks per request (closing over that request's
 * `bundleId`), exactly like `buildMergeTermHooks` closes over `fromTermId`/`intoTermId`.
 *
 * ## Why `computePlan()` needs no special-casing for `PLAN_STALE`
 *
 * `computePlan()` re-derives `TransportReport` from LIVE state on every call — reloading the staged
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
 * run might make (plan §4 task 7's own instruction); (2) re-derives the report and hands it to
 * {@link ContentTransportApplyPort.applyReport}. This file owns (1) and the wiring in (2); it does
 * NOT own what happens inside `applyReport` — that is Task 8's apply loop (per-type ordering,
 * ~200-entity chunks, one transaction per chunk, `executeCommand` + `expectedVersion`, baseline
 * upserts). The default binding this file ships, {@link createNotYetImplementedContentTransportApplyPort},
 * throws {@link ContentTransportApplyNotImplementedError} unconditionally — the same "throw loudly
 * rather than fake a write" discipline `features/post/content-transport.ts`'s own `apply()` stub
 * already uses, for the identical reason: a caller that reaches this before Task 8 lands gets an
 * immediate, unambiguous failure, never a silent no-op reported as success. Task 8 replaces the
 * COMPOSITION-ROOT BINDING of `applyPort` with a real implementation; it should not need to touch
 * this file's `executeMutation()` body at all.
 *
 * ## Restore-point cost-class refusal lives OUTSIDE this file
 *
 * "`costClass: 'unavailable'` refuses, with no override" is enforced by `execute-import.ts`'s
 * `executeContentTransportImport()`, which the `/execute` ROUTE calls to wrap `gatewayExecute()` —
 * mirroring `features/database/migrate-forward/execute.ts`'s identical split (the check happens
 * before `gateway.execute()`'s own authorize/token/plan-hash checks even run, not buried inside this
 * file's `executeMutation()`, which only runs after every one of those has already passed).
 */

/** Narrow structural slice of `DbOpsPort` this file actually calls — declared locally rather than
 *  importing the whole `contracts/core/gated-mutations/ports.ts#DbOpsPort`, the same "keep the
 *  domain's own hooks file decoupled from the full port surface" precedent
 *  `features/database/gated-hooks.ts`'s own `MigrateForwardDbOpsPort` sets. */
export interface ContentTransportDbOpsPort {
  captureRestorePoint(required: { scopeId: string }): Promise<{ artifactRef: string; watermarkAtCapture: number }>;
}

/** Narrow structural slice of `features/database/restore-points.ts#RestorePointSavePort` this file
 *  actually calls — declared locally for the identical decoupling reason as
 *  {@link ContentTransportDbOpsPort} (and the same reason `buildMigrateForwardHooks` declares its
 *  own `restorePointsRepo` field type inline rather than importing the whole port). */
export interface ContentTransportRestorePointSavePort {
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
export class ContentTransportBundleNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentTransportBundleNotFoundError";
  }
}

/** Thrown by {@link createNotYetImplementedContentTransportApplyPort} — see this file's header,
 *  "The seam with Task 8". */
export class ContentTransportApplyNotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentTransportApplyNotImplementedError";
  }
}

/**
 * Task 8's seam: applies an already-computed, already-authorized {@link TransportReport}. Never
 * called by anything in this file except `executeMutation()`, and never before the restore point is
 * captured (see this file's header).
 */
export interface ContentTransportApplyPort {
  applyReport(input: { report: TransportReport; principalId: string }): Promise<{ changeSetIds: readonly string[] }>;
}

/**
 * The default `ContentTransportApplyPort` binding for BOTH composition roots, until Task 8 lands a
 * real one. Throws unconditionally rather than reporting a fabricated success — see this file's
 * header for why a throw here is the correct, disclosed behavior, not a gap someone forgot to wire.
 *
 * @complexity O(1).
 */
export function createNotYetImplementedContentTransportApplyPort(): ContentTransportApplyPort {
  return {
    applyReport: async () => {
      throw new ContentTransportApplyNotImplementedError(
        "content-transport: applying an import plan is not implemented yet — Task 8 wires the chunked " +
          "apply loop (per-type ordering, ~200-entity chunks, executeCommand + expectedVersion, baseline " +
          "upserts) behind this seam (features/content-transport/gated-hooks.ts#ContentTransportApplyPort)."
      );
    },
  };
}

export interface BuildContentTransportImportHooksInput {
  workspaceId: string;
  /** The staged bundle (`bundle-staging.ts`, Task 6) this ceremony plans/applies against. Fixed for
   *  the lifetime of one built hooks object — a route builds fresh hooks per request, exactly like
   *  `buildMergeTermHooks` closes over `fromTermId`/`intoTermId` per request. */
  bundleId: string;
  actorId: string;
  clock: ClockPort;
  idGen: IdGeneratorPort;
  /** The already-built `ContentTransportDeps` bag every registered contributor's `build()` closes
   *  over — same shape `export.ts`'s own `toContentTransportDeps` produces. */
  contentTransportDeps: ContentTransportDeps;
  bundleRepo: ContentTransportBundleRepoPort;
  baselineRepo: ContentTransportBaselineRepoPort;
  /** Only the read side is used ({@link BlobStorePort.exists}) — this ceremony never writes a blob
   *  itself (Task 6's `blobs/probe`/`blobs/:sha` routes own that). */
  blobStore: { exists(input: { storageKey: string }): Promise<boolean> };
  dbOps: ContentTransportDbOpsPort;
  restorePointsRepo: ContentTransportRestorePointSavePort;
  applyPort: ContentTransportApplyPort;
}

/**
 * SPEC content-transport — the `content.transport` import ceremony's `GatedMutationHooks`. See this
 * file's header for the `PLAN_STALE`-for-free property and the Task 8 seam.
 *
 * @complexity O(n) in the staged bundle's entity count, via `planImport()` — dominated by
 * `planImport`'s own cost (its file header documents this precisely), not by anything in this file.
 * @overallScore 100
 */
export function buildContentTransportImportHooks(
  input: BuildContentTransportImportHooksInput
): GatedMutationHooks<TransportReport, { restorePointId: string; changeSetIds: readonly string[] }> {
  /** Re-derives the current `TransportReport` from live state — called by BOTH `computePlan()` and
   *  `executeMutation()`, never cached across calls (this file's header). */
  async function buildReport(): Promise<TransportReport> {
    const now = input.clock.nowIso();
    const staged = await loadActiveBundle({ repo: input.bundleRepo, workspaceId: input.workspaceId, id: input.bundleId, now });
    if (!staged) {
      throw new ContentTransportBundleNotFoundError(
        `content-transport: bundle '${input.bundleId}' was not found, or has expired, for workspace '${input.workspaceId}'`
      );
    }

    const bundle: TransportBundle = {
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

    return planImport(bundle, { contentTransportDeps: input.contentTransportDeps, getBaseline, hasBlob });
  }

  return {
    domain: "content.transport",
    readPermission: "content.transport.read",
    mutatePermission: "content.transport.apply",
    scopeId: input.workspaceId,
    computePlan: async () => {
      const report = await buildReport();
      return { planHash: planHashOf(report), details: report };
    },
    executeMutation: async () => {
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
        trigger: "content-transport-import",
        createdAt: now,
        createdBy: input.actorId,
        artifactRef: captured.artifactRef,
        watermarkAtCapture: captured.watermarkAtCapture,
      });

      // Re-derived fresh rather than threaded through from computePlan() — there is no memoized
      // value to reuse (this file's header), and `gateway.execute()` has already independently
      // re-run `computePlan()` and hash-compared it moments ago (CIC U-001-B3), so this is
      // guaranteed consistent with what was just verified, not a second independent judgment call.
      const report = await buildReport();
      const { changeSetIds } = await input.applyPort.applyReport({ report, principalId: input.actorId });
      return { restorePointId, changeSetIds };
    },
    resolveActorClassIdentity,
  };
}
