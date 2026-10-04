import type { MediaRecord } from "#src/features/media/index";
import type { MediaRouteDeps } from "./deps.js";

type ByteSizeDeps = Pick<MediaRouteDeps, "workspaceId" | "assetBlobRepo" | "blobStore">;

/** Only the returned media batch is visited; original keys come from the blob repo port.
 * LocalFsBlobStore memoizes successful stat results by content-addressed key. Older built Jini
 * adapters remain importable and report unknown until their sizeOf capability is available.
 * One missing/unreadable blob must not prevent the operator from seeing the rest of the library.
 */
export async function resolveMediaByteSizes(
  { deps, media }: { deps: ByteSizeDeps; media: readonly MediaRecord[] },
  _optional: Record<string, never> = {},
): Promise<Map<string, number | null>> {
  const sha256s = [...new Set(media.map((item) => item.source.sha256))];
  const sizes = new Map<string, number | null>();
  // Structural capability check also supports the installed declaration before Jini is rebuilt.
  const store = deps.blobStore as ByteSizeDeps["blobStore"] & {
    sizeOf?: (required: { storageKey: string }, optional?: Record<string, never>) => Promise<number | null>;
  };
  let cursor = 0;
  const worker = async () => {
    while (cursor < sha256s.length) {
      const sha256 = sha256s[cursor++]!;
      let size: number | null = null;
      try {
        if (store.sizeOf) {
          const blob = await deps.assetBlobRepo.findByHash({ workspaceId: deps.workspaceId, sha256 });
          if (blob) size = await store.sizeOf({ storageKey: blob.storageKey });
        }
      } catch {
        // Per-row failure stays unknown; the adapter does not cache absent/error results.
      }
      sizes.set(sha256, size);
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, sha256s.length) }, worker));
  return sizes;
}
