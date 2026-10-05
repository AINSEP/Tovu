import { existsSync } from "node:fs";
import { join } from "node:path";

import { findKeyDependentData, scanOpenedKernel } from "../db/key-dependent-data.js";
import { openPgliteKernel } from "../db/kernel/drivers/pglite.js";
import { acquireOwnerLock } from "../db/kernel/drivers/pglite-owner.js";
import { openPostgresKernel } from "../db/kernel/drivers/postgres.js";
import { CONTENT_DB_FILENAME, PGLITE_DATA_DIR_NAME, STORAGE_SECRET_FILENAME } from "./layout.js";
import { resolveSiteStorage } from "./site-storage.js";
import type { SiteStorage } from "./types.js";

/**
 * @file "Does this site hold data only its current site key can open?" for a whole site folder, on
 * every storage kind (ADR-067). `ensureSiteKey` (injected by the boot callers) refuses to mint or
 * adopt a key over such data, and the admin site key route reports `"missing-with-data"` from it.
 * A PGlite or Postgres site has no `content.db`, so scanning that file alone saw "no data" there.
 */

/**
 * Whether the site in `siteDir` holds key-dependent data, on whichever storage its
 * `.site-meta.json` names. Runs before the site's store is opened (boot), so it opens the store
 * itself and closes it again; the rows are only read.
 *
 * - `.storage-secret.json` present: yes — the Postgres connection string is sealed with the key.
 * - SQLite: this site's `content.db` (`findKeyDependentData`); no file yet is "no data".
 * - PGlite: `<site>/pglite/`, opened in-process under the data dir's owner lock (only one process
 *   may open it). No database there yet is "no data".
 * - Postgres: the database the `secretRef.env` variable names.
 *
 * Fails closed: an unreadable meta file, a PGlite data dir another process owns, a Postgres site
 * whose connection string cannot be read, or any open/query failure counts as "has data" — a key
 * minted over a store nobody inspected could orphan sealed rows.
 *
 * @complexity O(1) file checks plus one store open and `hasKeyDependentData`'s cost.
 */
export async function findSiteKeyDependentData(siteDir: string, optional: { env?: NodeJS.ProcessEnv } = {}): Promise<boolean> {
  if (existsSync(join(siteDir, STORAGE_SECRET_FILENAME))) return true;
  let storage: SiteStorage;
  try {
    storage = resolveSiteStorage(siteDir);
  } catch {
    return true;
  }
  switch (storage.kind) {
    case "sqlite": {
      const contentDbPath = join(siteDir, CONTENT_DB_FILENAME);
      return existsSync(contentDbPath) ? findKeyDependentData([contentDbPath]) : false;
    }
    case "pglite":
      return pgliteHasKeyDependentData(join(siteDir, PGLITE_DATA_DIR_NAME));
    case "postgres":
      return postgresHasKeyDependentData(storage, optional.env ?? process.env);
  }
}

/** `PG_VERSION` is written by initdb: without it there is no database in the dir, and opening one would create it. */
async function pgliteHasKeyDependentData(dataDir: string): Promise<boolean> {
  if (!existsSync(join(dataDir, "PG_VERSION"))) return false;
  let releaseLock: () => void;
  try {
    releaseLock = acquireOwnerLock(dataDir);
  } catch {
    return true;
  }
  try {
    return await scanOpenedKernel(() => openPgliteKernel<unknown>({ dataDir }));
  } finally {
    releaseLock();
  }
}

/** `secretRef: "site"` with no `.storage-secret.json` (checked by the caller) has nothing to connect with. */
async function postgresHasKeyDependentData(storage: Extract<SiteStorage, { kind: "postgres" }>, env: NodeJS.ProcessEnv): Promise<boolean> {
  if (storage.secretRef === "site") return true;
  const connectionString = env[storage.secretRef.env];
  if (connectionString === undefined || connectionString.trim() === "") return true;
  return scanOpenedKernel(() => openPostgresKernel<unknown>({ connectionString, max: 1 }));
}
