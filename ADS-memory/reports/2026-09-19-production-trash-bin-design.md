# Production trash bin — 60-day recoverable delete (design)

Author: Codex gpt-5.6-sol, xhigh, read-only, 2026-09-19.
Owner rulings this designs to: deleting on production unpublishes and is recoverable for 60 days then purged;
deleting LOCALLY never deletes live; skipping a row during publish means keep the production version.

---

Codex(Review Mode): Use the existing content row as the recoverable trash item: production trash sets destination-owned `deletedAt` and `purgeAfter`, preserves the complete row for 60 days, and then hard-purges its recoverable content. Do not model the trash bin as a second full-record tombstone table. The current row already preserves every field, reserves the slug, and is hidden by domain reads while remaining available to raw repository reads and restore machinery (`apps/website/src/features/post/post.ts:68-87`, `apps/website/src/features/post/post.ts:1346-1360`, `apps/website/src/features/post/post.ts:1396-1416`). Production trash must be a separately confirmed wire operation, never inferred from local `deletedAt`, bundle absence, or a skipped row. After hard purge, retain only an identity-level deletion fence—not the recoverable item—to stop a later ordinary publish from silently recreating it.

## Schema and wire-format changes

For posts/pages:

- Keep `posts.deleted_at`; add `purge_after`, `trashed_by_principal_id`, and an idempotent `trash_operation_id`. Enforce `deleted_at IS NULL ⇔ purge_after IS NULL`, index `(workspace_id, purge_after)`, and derive `purgeAfter = destination clock + 60 days`. Never trust a source timestamp for retention. The existing soft-delete already bumps `version` and writes a full delete revision atomically (`apps/website/src/features/post/post.ts:585-619`).

- Add a destination-global `production_deletion_fences` row keyed by `(workspaceId, entityType, entityId)`. It stores only the operation ID, trash/purge timestamps, and actor/source installation—not title, body, or other recoverable content. Once the post row is purged, this fence prevents the current `destination === null → created` planner rule from resurrecting it (`apps/website/src/features/publish-content/planner.ts:194-202`). Only an explicit Restore/Republish action removes the fence.

- Extend publishing baselines with `lifecycleState: "live" | "trashed"` and `entitySchemaVersion`. Current baselines store only a content hash and hash-algorithm version (`apps/website/src/features/publish-content/baseline-repo.ts:22-37`). Key them by stable source-installation identity, not rotating API-key principal identity; the audit already identifies credential rotation as capable of turning rows into apparent first syncs (`ADS-memory/.local-artifacts/codex-publish-audit/codex-report.md:172`).

Use a discriminated wire entity:

```ts
type PublishEntity =
  | {
      operation: "upsert";
      operationId: string;
      entityType: string;
      id: string;
      schemaVersion: number;
      hashVersion: number;
      contentHash: string;
      requiredBlobs: string[];
      state: Record<string, unknown>;
    }
  | {
      operation: "trash";
      operationId: string;
      entityType: string;
      id: string;
      schemaVersion: number;
      hashVersion: number;
      contentHash: string; // canonical lifecycle hash
      requiredBlobs: [];
      state: null;
    };
```

A trash `contentHash` should hash stable lifecycle data such as `{entityType,id,schemaVersion,operation:"trash"}`—not `deletedAt`, because the destination owns that timestamp. This lets the ordinary baseline comparison produce:

- `applied`: destination still equals the prior live baseline;
- `unchanged`: destination already carries the same trash lifecycle hash;
- `conflict`: destination changed since the baseline;
- never `created` for a trash operation.

Artifact compatibility must be strict. The in-flight format already declares exact artifact-version compatibility and per-type `schemaVersion` (`apps/website/src/features/publish-content/artifact-format.ts:1-8`, `apps/website/src/features/publish-content/type-registry.ts:131-156`), and the planner now refuses incompatible versions before planning (`apps/website/src/features/publish-content/planner.ts:229-267`). Reserve `operation` and `operationId` before the first real artifact. Missing `operation` may be migrated only to `"upsert"` for a specifically recognized legacy version; it must never be guessed as `"trash"`. Advertise a `trash-v1` capability so a source cannot send a destructive operation to an older receiver.

Ordinary `pack()` must continue to omit local trash. A separate “Delete on production” command constructs the trash entity only after destination selection and explicit confirmation. A skipped row remains present in the plan as `skipped`, performs no destination write, and does not advance its baseline—therefore it means “keep production.”

Recovery is destination-local and snapshot-based:

- Restore clears `deletedAt`/`purgeAfter`, removes the deletion fence, bumps the row version, and appends a real `"restore"` revision. The revision vocabulary already reserves `"restore"`, but no writer exists yet (`apps/website/src/features/post/post.ts:203-223`).
- It restores exactly the saved production content. If it was published before trashing, the confirmation must say that restoring makes it public again.
- Restore invalidates this entity’s peer baselines instead of pretending the source participated.
- If local has newer content, the next publish shows: “Production was restored from trash and differs from Local,” with `Keep production`, `Replace with local`, and `Skip`.
- If local has deleted its copy, normal export remains absent and production stays restored. The UI says: “Local is in Trash; restoring production does not restore Local, and Local deletion will not be sent.”
- No automatic merge or source overwrite occurs.

## Sweep mechanism

Run the sweep at the destination, behind a `TrashRetentionPort`, because the destination owns both visibility and retention time. This follows the repository’s required ports/adapters shape (`ADS-memory/docs/architecture/sections/13-user-friction-coverage-living-backlog.md:29-40`).

Use a small in-process trigger, but persist its schedule, lease, and history in `content.db`:

- `maintenance_job_state`: job key, `nextDueAt`, lease owner/expiry, last start/success/failure, and sanitized last error.
- `maintenance_job_runs`: run ID, status, timestamps, examined/purged/conflicted counts, and error summary.
- On boot and hourly thereafter, atomically claim the due job using a DB lease, then purge bounded batches.
- Hard-delete only with a compare-and-delete predicate covering `deletedAt`, `purgeAfter <= now`, and the expected version. A concurrent Restore therefore wins safely instead of being deleted underneath itself.
- Write the identity-only deletion fence and remove the recoverable row in one transaction.

The schedule must not live in a JSON file or Fly-specific cron. The deny-store precedent deliberately puts runtime-mutated durable state in the same `content.db` so deploys and host changes cannot silently erase it (`apps/website/src/platform/db/schema.ts:3111-3121`, `apps/website/src/platform/db/sqlite/publish-trust-revocations.sqlite.ts:14-37`). The current jobs specification explicitly requires persisted status, retry count, terminal errors, and dead-letter visibility, although it defers the final scheduler implementation (`apps/website/src/server/__specs__/80-platform/tenancy-and-jobs.spec.md:64-96`).

An operator can tell it ran from the Trash screen and system-health surface:

- “Last sweep succeeded at …; next due …; 12 items examined, 3 purged.”
- Every failure persists a failed run, emits a structured error/metric, and creates an admin alert.
- Missing two hourly successes marks `trash_retention_overdue` unhealthy until a run succeeds.
- A manual “Run sweep now” uses the same lease and records the same run history.

## Ordered implementation steps

1. Write the lifecycle spec and ADR first: absence, local trash, and Skip never delete production; only an explicit `"trash"` operation does. This repository requires spec, architecture, contract tests, observability, and rollback before a critical slice ships (`ADS-memory/docs/architecture/sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md:6-24`).

2. Finish the artifact work by adding the discriminated operation and idempotency key to the first usable artifact/type schema. Add strict decoders at staging and planning boundaries.

3. Migrate `posts`, baselines, deletion fences, and maintenance-job tables. Do not automatically schedule legacy trashed rows for immediate purge; surface them as “legacy—retention not started” until reviewed.

4. Implement explicit destination commands: `trashPublishedEntity`, `restorePublishedEntity`, and `purgeExpiredTrash`. Route trash/restore through the command gateway and revision ledger, with CAS versions and destination timestamps.

5. Make handler inspection lifecycle-aware. Ordinary upserts encountering a trash row or purged fence become conflicts; trash operations use baseline comparison; neither path treats a production-deleted ID as a new create.

6. Keep the current ordinary-export guard and build production deletion through a distinct command path. Current packing correctly filters trashed source rows (`apps/website/src/features/post/publish-content.ts:195-219`).

7. Add the production Trash UI: countdown, actor, source, Restore, explicit permanent purge, and the source-divergence messages described above. Add `skipped` as a persisted plan outcome with no baseline update; the current outcome union does not yet include it (`apps/website/src/features/publish-content/planner.ts:84-90`).

8. Wire the durable hourly scheduler at the destination composition root, with boot catch-up, DB lease, bounded batches, run history, health freshness, alerts, and manual trigger.

9. Prove the two-database path end to end: local delete does not affect production; explicit production trash unpublishes; Skip leaves production unchanged; restore survives changed/deleted local state; purge occurs only after 60 days; a later ordinary publish cannot recreate a fenced ID. Mutation checks should realistically remove the export trash filter, infer trash from local `deletedAt`, and drop the fence check; each must turn the safety test red.

## Risks to flag to the owner

- The dangerous local-delete seam is `deletePost → softDelete → raw postRepo.list → pack`. `deletePost` stamps the marker at `apps/website/src/features/post/post.ts:585-609`, and publishing reads the deliberately unfiltered repository at `apps/website/src/features/post/publish-content.ts:195-207`. The current `isTrashed` guard stops propagation; production tombstone generation must never be added to that loop.

- A receiver-side resurrection path still exists structurally: an accepted entity is rebuilt with `deletedAt: null` (`apps/website/src/features/post/publish-content.ts:161-184`) and then passed to `importPostEntity` (`apps/website/src/features/post/publish-content.ts:338-373`). A malformed but version-compatible trusted bundle can therefore describe trash as an ordinary upsert and land it live. This is why the operation discriminator and strict decoder are release blockers. The audit’s original warning was accurate for its inspected snapshot (`ADS-memory/.local-artifacts/codex-publish-audit/codex-report.md:166-170`), although the current sender-side skip now closes its normal path.

- Hard-purging the post row while forgetting the deletion fence lets the next publish classify it as `created`. Purge and fence insertion must be atomic.

- A trashed row retains its slug for 60 days, intentionally preventing reuse and guaranteeing lossless restore (`apps/website/src/features/post/post.ts:79-85`). The UI should explain that reservation.

- “Removed after 60 days” is not automatically the same as privacy erasure. Post revisions currently store the full record snapshot (`apps/website/src/platform/db/schema.ts:245-274`), and change-set inverses, restore points, or backups may retain it longer. Their retention must be aligned if the promise means complete erasure rather than removal from active content and Trash.

- Multi-replica destinations require the DB lease; an unleased timer can double-run. Clock skew is contained by destination-owned timestamps but still requires a sane destination clock.

- Credential rotation must not reset deletion memory. Stable installation identity must land before relying on lifecycle baselines.

## Could not determine

- Whether “something” covers only posts/pages or every publishable type, including media. Each additional type needs its own restore snapshot, reference checks, and purge adapter.
- Whether the 60-day promise includes revisions, change sets, restore points, and backups, or only the live/trash row.
- Whether artifact format v1 has already reached a real destination. If not, reserve `operation` in v1 now; if it has, this requires artifact v2 and post/page schema v2.
- The production topology—single long-lived process, multiple replicas, or scale-to-zero—which determines whether the hourly trigger alone is sufficient or needs an external wake-up. The durable schedule and status still belong in `content.db`.
- I did not edit files or run tests; this was a read-only design review.