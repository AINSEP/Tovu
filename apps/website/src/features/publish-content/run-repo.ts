/**
 * @file Task 8 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §2/§4 task 8.
 *
 * Write-side seam over `publish_content_runs` (migration `0066`, `platform/db/schema.ts`) — one row
 * per export/import run, the audit trail an operator sees and the report they acted on when choosing
 * to force a conflict (that table's own doc comment). No prior task built this port — `grep -rln
 * "publishContentRuns|PublishContentRun" apps/website/src --include=*.ts` found only doc-comment
 * mentions in `bundle-staging.ts`/`planner.ts` before this file existed.
 *
 * `apply-loop.ts` is the writer. It inserts an `applying` snapshot before the first content write,
 * upserts per-item progress after every transition, then persists `abandoned`, `failed`, or
 * `applied`. That sequencing is what keeps a landed change-set visible when a later baseline write
 * fails.
 */

import type { PublishContentOutcomeKind, PublishContentReport } from "./planner.js";

export type PublishContentRunItemPhase = "pending" | "content_applied" | "completed" | "failed";

/** Durable progress for one exact entity version in a run. */
export interface PublishContentRunItemState {
  readonly entityType: string;
  readonly entityId: string;
  readonly idempotencyKey: string;
  readonly phase: PublishContentRunItemPhase;
  readonly outcome: PublishContentOutcomeKind;
  readonly writes: boolean;
  readonly reason: string | null;
  readonly changeSetId: string | null;
  readonly errorSummary: string | null;
  readonly updatedAt: string;
}

/** One persisted run row — mirrors `publishContentRuns` (`platform/db/schema.ts`) field-for-field. */
export interface PublishContentRunRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly direction: "export" | "import";
  /** The AUTHENTICATED principal this run's baselines are keyed against — same rule as
   *  `PublishContentBaselineRecord.peerPrincipalId` (`baseline-repo.ts`'s own doc): the bundle's own
   *  `sourcePrincipalId`, never a bundle-declared identity. */
  readonly peerPrincipalId: string;
  /** Display only — human label for the peer, never a key (mirrors `StagedBundleRecord.sourceLabel`'s
   *  own "display-only, never used in any comparison or trust decision" rule). */
  readonly peerLabel: string | null;
  readonly phase: "planned" | "applying" | "applied" | "failed" | "abandoned";
  /** Set only once the run actually captures one (`gated-hooks.ts`'s `executeMutation()`, BEFORE any
   *  write this run might make) — `null` for a run that never reached a write attempt. */
  readonly restorePointId: string | null;
  /** JSON array of the `change_sets` ids this run produced — caller serializes, mirrors
   *  `StagedBundleRecord.entitiesJson`'s own "raw JSON text, decoded/encoded by the caller" convention. */
  readonly changeSetIdsJson: string | null;
  readonly actorId: string;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  /** JSON `PublishContentReport` — the report the operator saw and acted on, WITH apply-time
   *  conflict downgrades folded in (`apply-loop.ts`'s own doc: "the run's audit trail should reflect
   *  what actually happened, not merely what planning predicted"). Caller serializes. */
  readonly reportJson: string | null;
  /** JSON array of {@link PublishContentRunItemState}; updated after every durable row transition. */
  readonly itemsJson: string | null;
}

export interface PublishContentRunRepoPort {
  /** Upserts one run snapshot. Apply writes an `applying` snapshot before content, then progress
   *  snapshots after each item transition, then one terminal snapshot. */
  save(record: PublishContentRunRecord): Promise<void>;
  findById(input: { workspaceId: string; id: string }): Promise<PublishContentRunRecord | null>;
}

export interface PublishContentRunStatus {
  readonly id: string;
  readonly workspaceId: string;
  readonly direction: PublishContentRunRecord["direction"];
  readonly phase: PublishContentRunRecord["phase"];
  readonly restorePointId: string | null;
  readonly actorId: string;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly changeSetIds: readonly string[];
  readonly report: PublishContentReport | null;
  readonly items: readonly PublishContentRunItemState[];
}

/** Read-side status lookup used by the HTTP status route and retry diagnostics. */
export async function getPublishContentRunStatus(
  repo: PublishContentRunRepoPort,
  input: { workspaceId: string; runId: string }
): Promise<PublishContentRunStatus | null> {
  const record = await repo.findById({ workspaceId: input.workspaceId, id: input.runId });
  if (!record) return null;
  const changeSetIds = record.changeSetIdsJson ? (JSON.parse(record.changeSetIdsJson) as unknown) : [];
  const items = record.itemsJson ? (JSON.parse(record.itemsJson) as unknown) : [];
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    direction: record.direction,
    phase: record.phase,
    restorePointId: record.restorePointId,
    actorId: record.actorId,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    changeSetIds: Array.isArray(changeSetIds) ? changeSetIds.filter((id): id is string => typeof id === "string") : [],
    report: record.reportJson ? (JSON.parse(record.reportJson) as PublishContentReport) : null,
    items: Array.isArray(items) ? (items as PublishContentRunItemState[]) : [],
  };
}

/** In-process `PublishContentRunRepoPort` — hermetic tests and this feature's own unit tests.
 *  Mirrors `InMemoryPublishContentBaselineRepo`'s shape (`baseline-repo.ts`): a plain `Map`,
 *  defensive copies on read/write so a caller mutating a returned record can never corrupt this
 *  store's own state. */
export class InMemoryPublishContentRunRepo implements PublishContentRunRepoPort {
  private readonly recordsById = new Map<string, PublishContentRunRecord>();

  async save(record: PublishContentRunRecord): Promise<void> {
    this.recordsById.set(record.id, { ...record });
  }

  async findById(input: { workspaceId: string; id: string }): Promise<PublishContentRunRecord | null> {
    const record = this.recordsById.get(input.id);
    if (record?.workspaceId !== input.workspaceId) return null;
    return record ? { ...record } : null;
  }
}
