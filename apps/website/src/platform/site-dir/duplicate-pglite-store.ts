import { sql } from "kysely";

import type { ContentKernel } from "../db/content-kernel.js";
import { openPgliteKernel } from "../db/kernel/drivers/pglite.js";
import { acquireOwnerLock, PgliteOwnerLockedError, runningPgliteOwner } from "../db/kernel/drivers/pglite-owner.js";
import { copyServedPgliteTo, StorageOpError, storageOps } from "../db/kernel/ops.js";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import { copyPgliteSourceTo } from "@jini-ai/db/pglite";
import { CHAT_LEDGER_TABLE } from "../db/migrations/index.js";
import { resetLegacySiteTitlePin } from "../db/sqlite/reset-legacy-site-title-pin.js";
import { InternalError, ValidationError } from "./errors.js";

/**
 * @file The PGlite half of `duplicateSite` (R1g): the `content.db` counterpart for a site stored on
 * PGlite. The copy is a consistent dump of the source's data dir restored into the new site's
 * (`storageOps.copyTo`), then the new copy is made the duplicate's own:
 *
 * - AI chat history is left behind, as on SQLite (where `chat.db` is simply not copied): every table
 *   in the `ai_chat` schema is emptied; its migration ledger is kept, so the copy is at head.
 * - The source's legacy site-title pin is reset (SPEC-050 REQ-12), exactly as `duplicateContentDb`.
 * - Compacted and verified (`VACUUM` + `CHECKPOINT` + ledger read-back) before it is handed back.
 *
 * Reaching the source: served-versus-stopped and the owner lock live in `copyPgliteSourceTo`
 * (`@jini-ai/db/pglite`); a source served by another live process is refused with a `ValidationError`.
 */

/** The `ai_chat` tables emptied in a copy: all of them but the migration ledger. */
async function purgeAiChat(kernel: KyselyKernel<unknown>): Promise<void> {
  const tables = await kernel.query<{ name: string }>(
    sql`SELECT table_name AS name FROM information_schema.tables
        WHERE table_schema = 'ai_chat' AND table_type = 'BASE TABLE' AND table_name <> ${CHAT_LEDGER_TABLE}
        ORDER BY table_name`
  );
  if (tables.length === 0) return;
  const tableNames = tables.map(t => sql.table(`ai_chat.${t.name}`));
  await kernel.execute(sql`TRUNCATE ${sql.join(tableNames)}`);
}

/** Copies the source data dir to `targetDataDir` through the right door (see this file's header); the served-versus-
 *  stopped lifecycle lives in `@jini-ai/db/pglite`, this binds Tovu's kernels and maps the lock refusal. */
async function copySource({ sourceDataDir, targetDataDir }: { sourceDataDir: string; targetDataDir: string }, _optional = {}): Promise<void> {
  await copyPgliteSourceTo({ sourceDataDir, targetDataDir, ports: {
    runningOwner: ({ dataDir }) => runningPgliteOwner({ dataDir }),
    copyServed: ({ owner, targetPath }) => copyServedPgliteTo({ owner, targetPath }),
    acquireOwnerLock: ({ dataDir }) => {
      try {
        return acquireOwnerLock({ dataDir });
      } catch (err) {
        if (err instanceof PgliteOwnerLockedError) {
          throw new ValidationError({ message: `the site being duplicated is running (process ${err.pid ?? "unknown"}); stop it, or duplicate it from inside that site, then retry` });
        }
        throw err;
      }
    },
    openStopped: ({ dataDir }) => openPgliteKernel<unknown>({ dataDir }),
    copyStopped: ({ source, targetPath }) => storageOps({ kernel: source }).copyTo(targetPath),
  } });
}

/**
 * Copies a PGlite site's data dir to `targetDataDir` (which must not exist) with its AI chat emptied
 * and its legacy title pin reset.
 *
 * @throws {ValidationError} the source is served by another live process.
 * @throws {InternalError} the copy, the purge or the final verification failing (the driver's message kept).
 * @complexity One dump + restore of the whole data dir, one TRUNCATE, one VACUUM — bounded by the site's size.
 */
export async function duplicatePgliteStore(required: { sourceDataDir: string; targetDataDir: string }, _optional: Record<string, never> = {}): Promise<void> {
  const { sourceDataDir, targetDataDir } = required;
  try {
    await copySource({ sourceDataDir, targetDataDir });
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new InternalError({ message: `duplicatePgliteStore: copying to ${targetDataDir} failed: ${(err as Error).message}` });
  }
  const target = openPgliteKernel<unknown>({ dataDir: targetDataDir });
  try {
    await purgeAiChat(target);
    await resetLegacySiteTitlePin({ db: target as ContentKernel });
    await storageOps({ kernel: target }).compactAndVerify();
  } catch (err) {
    if (err instanceof StorageOpError) throw new InternalError({ message: `duplicatePgliteStore: ${err.message}` });
    throw err;
  } finally {
    await target.close();
  }
}
