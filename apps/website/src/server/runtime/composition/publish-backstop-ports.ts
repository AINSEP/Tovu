import { sqliteForeignKeyCheckedTransaction, sqliteTableInfo } from "@jini-ai/db/kernel/sqlite";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { createRawRowSqlitePort } from "#src/features/publish-content/publish-backstop-row.sqlite";
import type { BackstopPorts } from "@jini-ai/cms/publish/transfer";
import { listPublishContentContributors } from "#src/features/publish-content/type-registry";
import { createRawFileSitePort } from "@jini-ai/cms/publish/content/publish-backstop-file";
import { BACKSTOP_RAW_FILE_POLICY } from "#src/features/publish-content/backstop-policy";
import type { BlobStorePort } from "#src/features/media/index";
import type { FileBlobIndexPort } from "@jini-ai/cms/publish/transfer";
import { createBackstopAuditSqlPort } from "@jini-ai/cms/publish/transfer/sql/backstop-audit-repo";
import { PUBLISH_BACKSTOP_TABLES } from "#src/platform/db/publish-backstop-tables";
import { tableExists } from "@jini-ai/db/kernel";

/** Read coverage fresh at request time, like the catalog. The raw policy cannot accidentally
 * retain a stale table/root allowlist when another typed contributor becomes available. */
export function buildPublishBackstopPorts(
  { contentKernel, siteBinding, blobStore, fileBlobIndex }: { contentKernel?: ContentKernel; siteBinding?: { dir: string }; blobStore: BlobStorePort; fileBlobIndex: FileBlobIndexPort },
  _optional: Record<string, never> = {},
): BackstopPorts {
  const contributors = listPublishContentContributors();
  return {
    ...(contentKernel?.dialect === "sqlite" ? { rows: createRawRowSqlitePort({ kernel: contentKernel, tableInfo: sqliteTableInfo, checkedTransaction: sqliteForeignKeyCheckedTransaction }) } : {}),
    ...(contentKernel?.dialect === "sqlite" ? { audit: createBackstopAuditSqlPort({ kernel: contentKernel, tables: PUBLISH_BACKSTOP_TABLES, tableExists }) } : {}),
    ...(siteBinding ? { files: createRawFileSitePort({ ...BACKSTOP_RAW_FILE_POLICY, siteDir: siteBinding.dir }) } : {}),
    blobs: blobStore, fileBlobIndex, fileRollbacks: [], inverses: [],
    coveredTables: [...new Set(contributors.flatMap((c) => c.coversTables ?? []))],
    coveredRoots: [...new Set(contributors.flatMap((c) => c.coversRoots ?? []))],
  };
}
