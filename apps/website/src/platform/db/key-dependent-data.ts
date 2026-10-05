import { sql } from "kysely";

import { listColumns, listTables, tableExists } from "./kernel/dialect.js";
import { openSqliteFileKernel } from "./kernel/drivers/sqlite.js";
import type { StorageKernel } from "./kernel/port.js";

/**
 * @file The "does this site hold data only the current site key can open?" scan (site-key plan
 * §A.2/§A.6), on the storage kernel.
 *
 * Two callers need it: `features/webhooks/site-key-ensure.ts`'s `ensureSiteKey` (refuse to mint a
 * fresh key over sealed data) and the admin site key route's `"missing-with-data"` state. The
 * feature side never imports this module (`platform/db` is composition-built); the boot callers
 * (`src/index.ts`, `cli/commands/serve.ts`) inject `platform/site-dir/site-key-dependent-data.ts`'s
 * `findSiteKeyDependentData` into it, which picks the store to scan by the site's storage kind
 * (ADR-067) and runs {@link hasKeyDependentData} on it.
 *
 * Sealed columns come from the catalog (`listTables` + `listColumns`), every column whose name ends
 * in `sealed_ciphertext` — the same discovery `sealed-credential-inventory.ts` uses, so
 * `external_mcp_servers.oauth_sealed_ciphertext` counts too. `webhook_subscriptions` counts on any
 * row: its signing secrets derive from the key without a sealed column.
 */

const SEALED_COLUMN_SUFFIX = "sealed_ciphertext";
const WEBHOOK_SUBSCRIPTIONS_TABLE = "webhook_subscriptions";

/**
 * Whether the database behind `kernel` holds any key-dependent row: a non-null sealed column value,
 * or any `webhook_subscriptions` row. Read-only.
 *
 * @throws whatever the driver throws for a failed catalog read or probe.
 * @complexity O(t) catalog reads for t tables, plus one `LIMIT 1` probe per sealed column.
 */
export async function hasKeyDependentData<DB>(kernel: StorageKernel<DB>): Promise<boolean> {
  for (const table of await listTables(kernel)) {
    for (const column of await listColumns(kernel, table)) {
      if (!column.name.endsWith(SEALED_COLUMN_SUFFIX)) continue;
      const hit = await kernel.query(
        sql`SELECT 1 AS hit FROM ${sql.table(table)} WHERE ${sql.ref(column.name)} IS NOT NULL LIMIT 1`
      );
      if (hit.length > 0) return true;
    }
  }
  if (!(await tableExists(kernel, WEBHOOK_SUBSCRIPTIONS_TABLE))) return false;
  const subscription = await kernel.query(sql`SELECT 1 AS hit FROM ${sql.table(WEBHOOK_SUBSCRIPTIONS_TABLE)} LIMIT 1`);
  return subscription.length > 0;
}

/**
 * Whether any SQLite `content.db` in `dbPaths` holds key-dependent data ({@link hasKeyDependentData}).
 * Each file is opened read-only on its own kernel and closed before the next.
 *
 * Fails closed: a database that cannot be opened or queried counts as "has data", since a database
 * never inspected could hold sealed rows. Callers pass only paths that exist (`existsSync` first); a
 * missing site database is "nothing to scan yet", never this fail-closed path.
 *
 * @complexity O(n) databases, each {@link hasKeyDependentData}'s cost; stops at the first hit.
 */
export async function findKeyDependentData(dbPaths: readonly string[]): Promise<boolean> {
  for (const dbPath of dbPaths) {
    if (await databaseHasKeyDependentData(dbPath)) return true;
  }
  return false;
}

/** One file's answer, with open/query failures turned into "has data" without aborting the others. */
function databaseHasKeyDependentData(dbPath: string): Promise<boolean> {
  return scanOpenedKernel(() => openSqliteFileKernel<unknown>(dbPath, { readOnly: true }));
}

/**
 * {@link hasKeyDependentData} on a kernel this call opens and closes. Fails closed: an open or
 * query failure is "has data".
 *
 * @complexity {@link hasKeyDependentData}'s cost plus one open/close.
 */
export async function scanOpenedKernel(open: () => StorageKernel<unknown>): Promise<boolean> {
  let kernel: StorageKernel<unknown>;
  try {
    kernel = open();
  } catch {
    return true;
  }
  try {
    return await hasKeyDependentData(kernel);
  } catch {
    return true;
  } finally {
    await kernel.close().catch(() => {});
  }
}
