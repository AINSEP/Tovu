import fs from "node:fs";
import path from "node:path";

import { copyPgStore, type CopiedTable, nonEmptyTables } from "#src/features/database-transfer/pg-store-copy";
import { openPgliteKernel } from "#src/platform/db/kernel/drivers/pglite";
import { acquireOwnerLock, PgliteOwnerLockedError } from "#src/platform/db/kernel/drivers/pglite-owner";
import { openPostgresKernel, storageOps, type StorageKernel } from "#src/platform/db/kernel/index";
import { migrateChatDatabase, migrateContentDatabase } from "#src/platform/db/migrations/index";
import { writeJsonFileAtomic } from "#src/platform/site-dir/atomic-write";
import { ValidationError } from "#src/platform/site-dir/errors";
import { PGLITE_DATA_DIR_NAME } from "#src/platform/site-dir/layout";
import { parseSiteStorage, SITE_META_FILENAME } from "#src/platform/site-dir/site-storage";
import type { SiteStorage } from "#src/platform/site-dir/types";
import { type SiteSecretSealer, writeSealedConnectionString } from "./storage-secret.js";

/**
 * @file `tovu storage move --to postgres` (R1 plan slice R1g): moves a site stored on PGlite onto a
 * Postgres server. Same dialect only; a SQLite site moves with the database transfer tools.
 *
 * Order, and why:
 * 1. The site must be STOPPED: the move takes the PGlite data dir's owner lock, so nothing (API or
 *    agent daemon) can write while rows are copied — a write during the copy would be lost. A running
 *    site is refused, never paused behind its back.
 * 2. The target must be empty (no rows in `public`/`ai_chat` besides the migration ledgers).
 * 3. Both sides are brought to head by the migration runner (content + AI chat histories).
 * 4. Every table is copied, verified and counter-fixed in one target transaction (`pg-store-copy.ts`).
 * 5. The connection string is sealed with the site key (O3) into `.storage-secret.json` — or, with
 *    `secretRef: { env }`, left to that variable — and only then `.site-meta.json` is switched to
 *    `postgres`, atomically. The switch is the last write: any failure before it leaves the site on
 *    PGlite exactly as it was.
 * The PGlite data dir is KEPT (never deleted here) and named in the result.
 */

export interface MoveSiteStorageRequired {
  siteDir: string;
  connectionString: string;
  /** `"site"` = seal the connection string in the site folder; `{ env }` = the site reads that variable. */
  secretRef: "site" | { env: string };
}

export interface MoveSiteStorageOptional {
  /** The site key's sealer (default: the site's own, `siteSecretSealer`). */
  sealer?: Partial<SiteSecretSealer>;
  /** Runs inside the copy transaction once everything verified (tests inject a failure here). */
  onCopied?: () => Promise<void>;
}

export interface MoveSiteStorageResult {
  storage: SiteStorage;
  tables: CopiedTable[];
  /** The PGlite data dir the site ran on; kept for the owner to remove once satisfied. */
  keptPgliteDir: string;
}

function readMeta(siteDir: string): Record<string, unknown> {
  const metaPath = path.join(siteDir, SITE_META_FILENAME);
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8")) as Record<string, unknown>;
  } catch (err) {
    throw new ValidationError(`storage move: ${metaPath} cannot be read: ${(err as Error).message}`);
  }
}

/**
 * Moves the PGlite site in `siteDir` onto the Postgres database `connectionString` names (see this
 * file's header for the order).
 *
 * @throws {ValidationError} the site is not on PGlite, is running, or the target already holds data —
 *   nothing changed.
 * @throws whatever the migration, the copy (`StoreCopyError`) or the secret write throws — the site's
 *   meta is unchanged; a failed copy leaves the target migrated but empty.
 * @complexity O(total rows) — one read and one write per row, batched.
 */
export async function moveSiteStorage(required: MoveSiteStorageRequired, optional: MoveSiteStorageOptional = {}): Promise<MoveSiteStorageResult> {
  const { siteDir, connectionString, secretRef } = required;
  const meta = readMeta(siteDir);
  const from = parseSiteStorage(meta.storage);
  if (from.kind !== "pglite") {
    const hint = from.kind === "sqlite" ? "; a SQLite site moves with the database transfer tools" : "";
    throw new ValidationError(`storage move: this site is stored on ${from.kind}, not pglite${hint}`);
  }
  const dataDir = path.join(siteDir, PGLITE_DATA_DIR_NAME);
  if (!fs.existsSync(dataDir)) throw new ValidationError(`storage move: the site's PGlite data dir ${dataDir} does not exist`);

  let release: () => void;
  try {
    release = acquireOwnerLock(dataDir);
  } catch (err) {
    if (err instanceof PgliteOwnerLockedError) {
      throw new ValidationError(`storage move: the site is running (process ${err.pid ?? "unknown"}); stop it, then move it`);
    }
    throw err;
  }
  let source: StorageKernel<unknown> | undefined;
  let target: StorageKernel<unknown> | undefined;
  try {
    source = openPgliteKernel<unknown>({ dataDir });
    target = openPostgresKernel<unknown>({ connectionString, max: 2 });
    const occupied = await nonEmptyTables(target);
    if (occupied.length > 0) {
      const named = occupied.slice(0, 5).join(", ") + (occupied.length > 5 ? `, and ${occupied.length - 5} more` : "");
      throw new ValidationError(`storage move: the target database already holds data (${named}); move into an empty database`);
    }
    for (const kernel of [source, target]) {
      await migrateContentDatabase(kernel);
      await migrateChatDatabase(kernel);
    }
    const tables = await copyPgStore(source, target, { onCopied: optional.onCopied });
    await storageOps(target).compactAndVerify();

    if (secretRef === "site") await writeSealedConnectionString({ siteDir, connectionString }, optional.sealer);
    const storage: SiteStorage = { kind: "postgres", secretRef };
    writeJsonFileAtomic({ filePath: path.join(siteDir, SITE_META_FILENAME), data: { ...meta, storage } }, {});
    return { storage, tables, keptPgliteDir: dataDir };
  } finally {
    await target?.close();
    await source?.close();
    release();
  }
}
