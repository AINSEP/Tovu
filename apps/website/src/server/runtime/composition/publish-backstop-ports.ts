import type { ContentKernel } from "#src/platform/db/content-kernel";
import { createRawRowSqlitePort } from "#src/platform/db/sqlite/publish-backstop-row.sqlite";
import type { BackstopPorts } from "#src/features/publish-content/backstop-ports";
import { listPublishContentContributors } from "#src/features/publish-content/type-registry";
import { createRawFileSitePort } from "#src/platform/site-dir/publish-backstop-file";
import type { BlobStorePort } from "#src/features/media/index";
import type { FileBlobIndexPort } from "#src/features/publish-content/file-blob-index";
import { createBackstopAuditSqlitePort } from "#src/platform/db/sqlite/publish-backstop-audit.sqlite";

/** Read coverage fresh at request time, like the catalog. The raw policy cannot accidentally
 * retain a stale table/root allowlist when another typed contributor becomes available. */
export function buildPublishBackstopPorts(
  { contentKernel, siteBinding, blobStore, fileBlobIndex }: { contentKernel?: ContentKernel; siteBinding?: { dir: string }; blobStore: BlobStorePort; fileBlobIndex: FileBlobIndexPort },
  _optional: Record<string, never> = {},
): BackstopPorts {
  const contributors = listPublishContentContributors();
  return {
    ...(contentKernel?.dialect === "sqlite" ? { rows: createRawRowSqlitePort({ kernel: contentKernel }) } : {}),
    ...(contentKernel?.dialect === "sqlite" ? { audit: createBackstopAuditSqlitePort({ kernel: contentKernel }) } : {}),
    ...(siteBinding ? { files: createRawFileSitePort({ siteDir: siteBinding.dir }) } : {}),
    blobs: blobStore, fileBlobIndex, fileRollbacks: [], inverses: [],
    coveredTables: [...new Set(contributors.flatMap((c) => c.coversTables ?? []))],
    coveredRoots: [...new Set(contributors.flatMap((c) => c.coversRoots ?? []))],
  };
}
