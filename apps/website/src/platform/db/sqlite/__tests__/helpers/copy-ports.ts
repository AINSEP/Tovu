import { existsSync } from "node:fs";
import path from "node:path";
import { openNativeSqlite } from "../../../kernel/drivers/sqlite.js";
import { createCopyCoordinator, sqliteCopyPorts, type ReadonlySqliteOpener } from "../../copy-coordinator.js";

/** Real copy ports (quick_check, journal protection) on a fresh coordinator, for tests that migrate a file. */
export function testCopyPorts({ filePath }: { filePath: string }, _optional: Record<string, never> = {}) {
  const journalPath = path.join(path.dirname(path.resolve(filePath)), "ops", "database-journal.db");
  return sqliteCopyPorts({ journalPath, copies: createCopyCoordinator({}, {}), open: openNativeSqlite as unknown as ReadonlySqliteOpener, exists: existsSync });
}
