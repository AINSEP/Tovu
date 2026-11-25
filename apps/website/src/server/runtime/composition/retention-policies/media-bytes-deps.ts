import type { KyselyKernel } from "@jini-ai/db/kernel";
import { DEFAULT_GC_GRACE_MS, type BlobStorePort, type VersionedMediaRepoPort } from "@jini-ai/cms/media";
import { createBlobGcJournal } from "#src/platform/db/repos/blob-gc-journal";
import type { MediaBytesPolicyRequired, MediaBytesProbeInput } from "./media-bytes.js";

/**
 * Bind the serving site's stores to the report-only media policy.
 *
 * Bound today: the live and trashed media probes (one `mediaRepo.list`, which includes trashed rows).
 * The rendition, forms, transfer and recovery probes are left unbound on purpose until their owners
 * expose an exact "still needs this file" read, so every journaled file reports as kept/`unknown`
 * rather than eligible. Legacy orphans are still listed for the owner to see.
 * @complexity O(media rows) per probe call.
 * @example createMediaBytesPolicy(mediaBytesDeps({ ...routeDeps, kernel, signal }, {}), {})
 */
export function mediaBytesDeps(
  required: { workspaceId: string; kernel: KyselyKernel<unknown>; mediaRepo: VersionedMediaRepoPort; blobStore: BlobStorePort; clock: { nowMs(): number }; signal: AbortSignal },
  _optional: Record<string, never> = {},
): MediaBytesPolicyRequired {
  const { workspaceId, kernel, mediaRepo, blobStore, clock, signal } = required;
  const journal = createBlobGcJournal({ kernel }, {});
  const holds = (status: "active" | "trashed") => async (input: MediaBytesProbeInput) =>
    (await mediaRepo.list({ workspaceId: input.workspaceId })).some(row => row.source.sha256 === input.sha256 && row.status === status);
  return {
    gc: { workspaceId, graceMs: DEFAULT_GC_GRACE_MS, now: () => clock.nowMs(), listLegacyOrphans: input => journal.listLegacyOrphans(input) },
    journal,
    probes: { live: holds("active"), trashed: holds("trashed") },
    stat: async storageKey => {
      const size = await blobStore.sizeOf?.({ storageKey });
      return typeof size === "number" ? { size } : null;
    },
    signal,
  };
}
