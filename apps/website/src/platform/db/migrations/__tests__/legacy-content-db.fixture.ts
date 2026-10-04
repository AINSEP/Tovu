import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { openSqliteContentConnection, type ContentDb } from "../../sqlite/content-db.js";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle/", import.meta.url));

/** Frozen Drizzle chain only, with no Tovu ledger: the pre-adoption test fixture.
 * Product openContentDb returns current schema for fresh databases, so it cannot model this state.
 * Keep this helper in test source; it must never become a product bootstrap option.
 */
export function openLegacyContentDb(
  { filePath }: { filePath: string },
  _optional: Record<string, never> = {},
): ContentDb {
  const db = openSqliteContentConnection(filePath);
  try {
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    return db;
  } catch (error) {
    db.$client.close();
    throw error;
  }
}
