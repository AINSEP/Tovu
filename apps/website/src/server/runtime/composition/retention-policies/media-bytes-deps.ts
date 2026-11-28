import { sql, type RawBuilder } from "kysely";
import path from "node:path";
import { lstat, readdir } from "node:fs/promises";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import { DEFAULT_GC_GRACE_MS, type BlobStorePort, type VersionedMediaRepoPort } from "@jini-ai/cms/media";
import { createBlobGcJournal } from "#src/platform/db/repos/blob-gc-journal";
import { listMigrationCopies } from "#src/platform/db/sqlite/copy-coordinator";
import type { MediaBytesPolicyRequired, MediaBytesProbeInput, MediaBytesProbes } from "./media-bytes.js";

type Kernel = KyselyKernel<unknown>;
/** A retained database copy (restore point or pre-migration copy); `createdAt` is ISO text or epoch ms. */
export interface RecoveryArtifact { readonly createdAt: string | number }
/** The site share backend's "an export or upload is running" read; absent when the site has no shares. */
export type ShareTransfers = { hasWork?(required: Record<string, never>, optional?: Record<string, never>): boolean } | undefined;

const exists = async (kernel: Kernel, query: RawBuilder<unknown>): Promise<boolean> =>
  (await kernel.run(db => query.execute(db))).rows.length > 0;

/** A rendition row, in ANY workspace, naming this exact object: shared rendition objects count. */
function renditionProbe(kernel: Kernel) {
  return (input: MediaBytesProbeInput) => exists(kernel, sql`SELECT id FROM asset_renditions WHERE storage_key = ${input.storageKey} LIMIT 1`);
}

/** Whether one form file clean-up job names these bytes. @throws when the job cannot be read (kept). */
function cleanupJobNames(eventJson: unknown, input: MediaBytesProbeInput): boolean {
  const event = typeof eventJson === "string" ? JSON.parse(eventJson) as unknown : eventJson;
  const payload = (event as { payload?: unknown } | null)?.payload as { sha256?: unknown; storageKeys?: unknown } | undefined;
  if (!payload || typeof payload !== "object") throw new Error("A form file clean-up job could not be read, so its files are kept.");
  return payload.sha256 === input.sha256 || (Array.isArray(payload.storageKeys) && payload.storageKeys.includes(input.storageKey));
}

/**
 * Forms still need the bytes while a form file clean-up job for them is not delivered (that job owns
 * their removal, and must not race this one), or while any submission, trashed ones included, names
 * a media row that holds them.
 * @complexity One scan of the workspace's undelivered form clean-up jobs, plus one LIKE scan of the
 * workspace's submissions per media row holding these bytes (normally zero or one).
 */
function formsProbe(kernel: Kernel) {
  return async (input: MediaBytesProbeInput): Promise<boolean> => {
    const jobs = await kernel.run(db => sql<{ event_json: unknown }>`SELECT event_json FROM outbox_events WHERE workspace_id = ${input.workspaceId} AND status <> 'delivered' AND id LIKE ${"forms:file:cleanup:%"}`.execute(db));
    if (jobs.rows.some(row => cleanupJobNames(row.event_json, input))) return true;
    const media = await kernel.run(db => sql<{ id: string }>`SELECT id FROM media WHERE workspace_id = ${input.workspaceId} AND source_sha256 = ${input.sha256}`.execute(db));
    for (const { id } of media.rows) {
      // A substring match over the stored JSON can over-match (keeps more), never under-match.
      if (await exists(kernel, sql`SELECT id FROM form_submissions WHERE workspace_id = ${input.workspaceId} AND CAST(data_json AS text) LIKE ${`%${id}%`} LIMIT 1`)) return true;
    }
    return false;
  };
}

/**
 * Any running transfer keeps every file. Why not per file: a share export or a publish run only learns
 * which bytes it copies as it reads them, so while one is running no file can be ruled out.
 * @throws when a share backend exists but cannot say whether it is working (kept as unknown).
 */
function transferProbe(kernel: Kernel, shareTransfers: ShareTransfers) {
  return async (input: MediaBytesProbeInput): Promise<boolean> => {
    if (shareTransfers && typeof shareTransfers.hasWork !== "function") throw new Error("Cannot tell whether a site share is being prepared, so files are kept.");
    if (shareTransfers?.hasWork?.({})) return true;
    return exists(kernel, sql`SELECT id FROM publish_content_runs WHERE workspace_id = ${input.workspaceId} AND phase IN ('planned', 'applying') LIMIT 1`);
  };
}

/**
 * Age of the oldest retained recovery artifact. Why every retained copy counts as protected: restoring
 * any of them brings back the media rows it held, and a copy cannot be opened cheaply to rule out these
 * bytes. Its age extends grace (DR-004), so a file stays kept unless it lost its owner before the oldest
 * copy was taken.
 * @throws when the list fails or a copy has no readable date (kept as unknown).
 */
function recoveryProbe(recoveryArtifacts: () => Promise<readonly RecoveryArtifact[]>, clock: { nowMs(): number }): NonNullable<MediaBytesProbes["recovery"]> {
  return async () => {
    let oldest = Number.POSITIVE_INFINITY;
    for (const { createdAt } of await recoveryArtifacts()) {
      const at = typeof createdAt === "number" ? createdAt : Date.parse(createdAt);
      if (!Number.isFinite(at)) throw new Error("A restore point has no readable date, so files it may need are kept.");
      oldest = Math.min(oldest, at);
    }
    return { protectedRestorePointAgeMs: oldest === Number.POSITIVE_INFINITY ? null : Math.max(0, clock.nowMs() - oldest) };
  };
}

/**
 * Every retained recovery artifact of a serving site: the journal's restore points and the pre-migration
 * copies in `ops/`. A memory-only site has no copies on disk.
 * @complexity One restore-point list plus one directory listing.
 */
export function servingRecoveryArtifacts(
  required: { restorePoints: { list(): Promise<readonly RecoveryArtifact[]> }; contentDbPath: string },
  _optional: Record<string, never> = {},
): () => Promise<RecoveryArtifact[]> {
  const { restorePoints, contentDbPath } = required;
  return async () => {
    const copies = contentDbPath === ":memory:" ? [] : await listMigrationCopies({ opsDir: path.join(path.dirname(path.resolve(contentDbPath)), "ops"), fs: { readdir, lstat } });
    return [...await restorePoints.list(), ...copies];
  };
}

/**
 * Bind the serving site's stores to the report-only media policy. Every probe is bound to a read-only
 * source; a probe that throws keeps the file as `unknown` (the policy fails closed).
 * @complexity Per journaled file: one media list, a few indexed or workspace-scoped reads, one
 * recovery-artifact list.
 * @example createMediaBytesPolicy(mediaBytesDeps({ ...routeDeps, kernel, signal, shareTransfers, recoveryArtifacts }, {}), {})
 */
export function mediaBytesDeps(
  required: {
    workspaceId: string; kernel: Kernel; mediaRepo: VersionedMediaRepoPort; blobStore: BlobStorePort; clock: { nowMs(): number }; signal: AbortSignal;
    shareTransfers: ShareTransfers; recoveryArtifacts: () => Promise<readonly RecoveryArtifact[]>;
  },
  _optional: Record<string, never> = {},
): MediaBytesPolicyRequired {
  const { workspaceId, kernel, mediaRepo, blobStore, clock, signal, shareTransfers, recoveryArtifacts } = required;
  const journal = createBlobGcJournal({ kernel }, {});
  const holds = (status: "active" | "trashed") => async (input: MediaBytesProbeInput) =>
    (await mediaRepo.list({ workspaceId: input.workspaceId })).some(row => row.source.sha256 === input.sha256 && row.status === status);
  return {
    gc: { workspaceId, graceMs: DEFAULT_GC_GRACE_MS, now: () => clock.nowMs(), listLegacyOrphans: input => journal.listLegacyOrphans(input) },
    journal,
    probes: {
      live: holds("active"), trashed: holds("trashed"), rendition: renditionProbe(kernel), forms: formsProbe(kernel),
      transfer: transferProbe(kernel, shareTransfers), recovery: recoveryProbe(recoveryArtifacts, clock),
    },
    stat: async storageKey => {
      const size = await blobStore.sizeOf?.({ storageKey });
      return typeof size === "number" ? { size } : null;
    },
    signal,
  };
}
