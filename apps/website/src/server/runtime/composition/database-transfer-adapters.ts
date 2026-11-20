import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { databaseFile } from "@jini-ai/db/kernel";
import { openSqliteFileKernel, openSqliteSnapshot } from "#src/platform/db/kernel/drivers/sqlite";
import { contentKernel } from "#src/platform/db/content-kernel";
import { computeCoreTableCopyOrder, DERIVED_OBJECTS } from "#src/platform/db/migration/manifest";
import * as schema from "#src/platform/db/schema.postgres";
import { openSqliteSnapshotSource } from "@jini-ai/db/transfer";
import { planSnapshotTables, planChatSnapshotTables, type CoreTableCatalogPorts } from "#src/features/database-transfer/table-catalog";
import type { DatabaseTransferAdapters, DatabaseTransferToolDeps } from "#src/features/database-transfer/tool-registrations";

/** Bind this build's trusted schema and copy order for the transfer and schema fixtures. */
export function createCoreTableCatalog(_required = {}, _optional = {}): CoreTableCatalogPorts {
  return {
    schema: schema as unknown as CoreTableCatalogPorts["schema"],
    copyOrder: computeCoreTableCopyOrder,
    derivedNames: new Set(DERIVED_OBJECTS.map(object => object.name)),
  };
}

/** Bind trusted host metadata and native snapshot handles; feature policy stays driver-free. */
export function createDatabaseTransferAdapters(_required = {}, _optional = {}): DatabaseTransferAdapters {
  const catalog = createCoreTableCatalog({});
  return {
    openSource: bytes => openSqliteSnapshotSource({ bytes, open: data => openSqliteSnapshot({ data }) }),
    catalog: (name, source) => name === "chat" ? planChatSnapshotTables(source) : planSnapshotTables({ source, catalog }),
    captureChatSnapshot,
  };
}

/** Online backup (includes WAL writes) of an open SQLite handle, read back as bytes; the temp copy is always removed. */
export async function captureSqliteBackupBytes(required: { source: { backupTo(destPath: string): Promise<void> } }): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "tovu-transfer-chat-"));
  try {
    const snapshotPath = join(dir, "chat.db");
    await required.source.backupTo(snapshotPath);
    return await readFile(snapshotPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Read-only online backup of the exact configured chat DB; never create a missing source. */
async function captureChatSnapshot(deps: Pick<DatabaseTransferToolDeps, "db" | "databaseTransferChatSnapshot">, _optional = {}): Promise<Buffer> {
  if (deps.databaseTransferChatSnapshot) return deps.databaseTransferChatSnapshot();
  const contentPath = deps.db === undefined ? null : await databaseFile({ kernel: contentKernel({ store: deps.db }) });
  if (contentPath === null) throw new Error("the chat snapshot source is not wired");
  const path = process.env.TOVU_CHAT_DB ?? join(dirname(contentPath), "chat.db");
  const source = openSqliteFileKernel({ filePath: path }, { readOnly: true });
  try {
    return await captureSqliteBackupBytes({ source });
  } finally {
    await source.close();
  }
}
