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
 * `apply-loop.ts` (Task 8) is the only writer: exactly one terminal row per `applyReport()` call —
 * `abandoned` (the whole run was already `refused`), `failed` (a non-conflict error aborted the run
 * partway through), or `applied` (the run completed, however many rows it downgraded to `conflict`
 * along the way). This port therefore never updates a row after writing it — see {@link
 * PublishContentRunRepoPort.save}'s own doc.
 */

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
  readonly phase: "planned" | "applied" | "failed" | "abandoned";
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
}

export interface PublishContentRunRepoPort {
  /** Insert-once. This feature never updates a run row after writing it — a run's outcome is
   *  decided exactly once, at the end of one `applyReport()` call (this file's header). */
  save(record: PublishContentRunRecord): Promise<void>;
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

  /** Test-only accessor — no HTTP route reads a run back yet (a later task's job). Mirrors
   *  `InMemoryPublishContentBundleRepo.findById`'s own defensive-copy-on-read discipline.
   *  @complexity O(1). */
  findById(id: string): PublishContentRunRecord | null {
    const record = this.recordsById.get(id);
    return record ? { ...record } : null;
  }
}
