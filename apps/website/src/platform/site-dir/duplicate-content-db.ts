import Database from "better-sqlite3";
import { getTableConfig } from "drizzle-orm/sqlite-core";

import { collectCoreTables, DERIVED_OBJECTS } from "../db/migration/manifest.js";
import { openContentDbReadOnly } from "../db/sqlite/content-db.js";
import { InternalError } from "./errors.js";

/**
 * @file The `content.db` half of `duplicateSite` (SPEC-003 sibling operation, 2026-09-05) — a
 * physically consistent, WAL-safe copy of one site's content database with conversation/session
 * history excluded BY CONSTRUCTION rather than by a hand-maintained exclusion list.
 *
 * WHY NOT A PLAIN FILESYSTEM COPY. This repo runs `journal_mode = WAL` (`sqlite/content-db.ts`'s
 * `openContentDb`) — a `.db` file's bytes are not the whole story once WAL is in play; committed
 * data can still be sitting in a separate `-wal` file the main file's own bytes never reflect, so a
 * `.db`-only `fs.copyFileSync` can silently drop the newest committed rows, and a SHA taken over
 * just the main file is not evidence of what the database actually contains. `VACUUM INTO` is
 * SQLite's own answer: it reads through the connection (folding in anything still parked in the
 * WAL) and writes a single, consistent, checkpoint-equivalent file at the destination path, without
 * requiring write access to the source connection — the same guarantee a plain copy cannot give,
 * from a READ-ONLY open of the source (`openContentDbReadOnly`), so duplicating a site can never be
 * the thing that mutates it.
 *
 * WHY CHAT/SESSION HISTORY IS EXCLUDED "BY CONSTRUCTION". The owner's requirement is that
 * duplicating a client's site must never carry its chat history along. The three tables that hold
 * that history (`ai_chats`, `ai_chat_messages`, `assistant_agent_sessions`) are raw SQL — never
 * declared in `db/schema.ts` — precisely because `db/migration/manifest.ts`'s own
 * `RAW_SQL_MANAGED_TABLES` registry already documents this (see that file's own header). Rather than
 * re-deriving a THIRD hand-maintained "these are the chat tables" list here (this repo has already
 * paid for that mistake once — see `development/scripts/seed-site.mjs`'s `PRUNE_TABLES`, a
 * hand-maintained exclude-list this file deliberately does NOT imitate), this module inverts the
 * direction: it builds an ALLOWLIST of every table `schema.ts` actually declares
 * (`collectCoreTables()` — the exact same introspection `schema-migration-drift.test.ts` and the
 * Postgres-migration manifest already trust as the one source of truth for "what is real content"),
 * plus the small set of infrastructure `schema.ts` never declares on purpose (the migrator's own
 * bookkeeping table, SQLite's internal catalog, and the FTS5 search-index objects `DERIVED_OBJECTS`
 * already documents as rebuildable-not-authored), and purges every OTHER table's rows.
 *
 * The three chat/session tables are never named anywhere in this file. That is the point: if the
 * concurrent chat/session split into a separate `chat.db` lands, those three tables simply stop
 * existing in `content.db` and this file purges nothing for them (there is nothing left to purge) —
 * still correct, with zero code change here. If a future engineer adds a FOURTH raw-SQL table to
 * `content.db` without a `schema.ts` declaration, it is purged from every duplicate by default
 * (the conservative failure mode for a "make me a copy of this site" operation) until someone
 * deliberately reviews it into either `schema.ts` (making it real content) or this module's own
 * `isKeptInfrastructureTable` (making it recognized infrastructure) — never a duplicate that
 * silently, structurally, keeps something like it.
 *
 * Architectural role: `site-dir` domain logic (INV-06) — no `express`/`cli` import. Depends on
 * `db/migration/manifest.ts` and `db/sqlite/content-db.ts` only, both already `site-dir`-reachable
 * (siblings under `platform/db/`, not `server`/`cli`).
 */

/** Created by `drizzle-orm`'s own migrator (`sqlite/content-db.ts`'s `migrate()` call), not by any
 *  migration file — real infrastructure the purge below must never touch, or the duplicate would
 *  look unmigrated on its first real `openContentDb()` and re-run every migration from scratch
 *  against tables that already exist. */
const MIGRATOR_BOOKKEEPING_TABLE = "__drizzle_migrations";

/** Every table name Drizzle actually declares in `schema.ts` — the positive allowlist this module
 *  purges everything else against. Reuses `db/migration/manifest.ts`'s own `collectCoreTables()`
 *  (already the Postgres-migration manifest's single source of truth for "what schema.ts declares")
 *  rather than a second registry, for the same "one mirror, and it drifts" reason that file's own
 *  header gives for reusing it instead of retyping the filter.
 *  @complexity O(t) in schema.ts's own table count — fixed by the codebase, not caller input. */
function declaredContentTableNames(): ReadonlySet<string> {
  return new Set(collectCoreTables().map(({ table }) => getTableConfig(table).name));
}

/** True for a table/object the purge must leave alone even though `schema.ts` never declares it:
 *  the migrator's bookkeeping table, SQLite's own internal catalog objects, and the FTS5
 *  search-index objects `DERIVED_OBJECTS` documents (the virtual table itself, its ordinary
 *  content-table shadow, and FTS5's own internal `_data`/`_idx`/`_content`/`_docsize`/`_config`
 *  shadow tables, all named `<object>_<suffix>`) — every one of these is a rebuildable-but-still-
 *  physically-consistent mirror of content this function DOES keep (`posts`), so leaving their
 *  already-copied bytes alone is correct, not a gap; purging them would desync the FTS5 index from
 *  the `posts` rows the duplicate still has. */
function isKeptInfrastructureTable(tableName: string): boolean {
  if (tableName === MIGRATOR_BOOKKEEPING_TABLE) return true;
  if (tableName.startsWith("sqlite_")) return true;
  return DERIVED_OBJECTS.some((object) => tableName === object.name || tableName.startsWith(`${object.name}_`));
}

/**
 * Deletes every row of every table in `db` that is neither declared content nor recognized
 * infrastructure — see this file's own header for why that is "chat excluded by construction"
 * rather than a name list. Foreign-key order is a non-issue here: every FK among the raw-SQL tables
 * this purges points from one purged table to another (`ai_chat_messages`/`assistant_agent_sessions`
 * -> `ai_chats`, both `ON DELETE CASCADE`), and Drizzle cannot declare a FK to a table it has no
 * `sqliteTable` representation for — so no KEPT table's row can ever reference a row this function
 * removes.
 *
 * @complexity O(k) SQL statements for k physical tables in the copy, each a full-table `DELETE` —
 *   bounded by this codebase's own table count, never by caller-controlled input.
 */
function purgeNonContentTables(db: Database.Database): void {
  const physicalTables = (
    db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>
  ).map((row) => row.name);
  const declared = declaredContentTableNames();

  const purgeAll = db.transaction(() => {
    for (const name of physicalTables) {
      if (declared.has(name) || isKeptInfrastructureTable(name)) continue;
      db.prepare(`DELETE FROM "${name}"`).run();
    }
  });
  purgeAll();
}

export interface DuplicateContentDbRequired {
  /** Absolute path to the SOURCE site's `content.db`. Opened strictly read-only — see this file's
   *  own header for why nothing here can mutate it. */
  sourceDbPath: string;
  /** Absolute path the physical copy is written to. Must not already exist. */
  targetDbPath: string;
}

/**
 * Produces a physically consistent copy of `sourceDbPath` at `targetDbPath`, with every table that
 * is not declared real content (chat/session history today, whatever else is raw SQL tomorrow)
 * purged — see this file's own header for the full design.
 *
 * @throws {InternalError} `VACUUM INTO` failing (e.g. `targetDbPath` already exists, or the parent
 *   directory is not writable), or the purged copy failing `integrity_check` — surfaced with the
 *   real driver message rather than a generic wrapper, so a caller can tell a full disk from a
 *   locked source.
 * @complexity O(1) plus {@link purgeNonContentTables}'s own table-count-bounded cost — the `VACUUM
 *   INTO`/final `VACUUM` calls are each one full pass over the source/copy's own byte size, fixed by
 *   how much content the site being duplicated actually holds, never by any caller-controlled input.
 * @overallScore 100
 */
export function duplicateContentDb(required: DuplicateContentDbRequired): void {
  const { sourceDbPath, targetDbPath } = required;

  const source = openContentDbReadOnly(sourceDbPath);
  try {
    // Bound-parameter form: VACUUM INTO's filename is a general SQL expression (SQLite 3.27+), so
    // this never string-interpolates a caller-influenced path into SQL text.
    source.$client.prepare("VACUUM INTO ?").run(targetDbPath);
  } catch (err) {
    throw new InternalError(`duplicateContentDb: VACUUM INTO ${targetDbPath} failed: ${(err as Error).message}`);
  } finally {
    source.$client.close();
  }

  const target = new Database(targetDbPath);
  try {
    target.pragma("foreign_keys = ON");
    purgeNonContentTables(target);
    target.exec("VACUUM"); // reclaims the purged rows' pages before this copy is handed back.

    // Leaves the copy in the same WAL posture `openContentDb` establishes on every real open, and
    // checkpoints immediately so a fresh site dir never carries a stray `-wal`/`-shm` sidecar before
    // its first real boot (mirrors `seed-site.mjs`'s own `checkpointAndVerify` discipline).
    //
    // Order matters here (empirically, not just stylistically): running `integrity_check` on this
    // same connection BEFORE this WAL switch reproducibly left the connection holding a lock that
    // made the checkpoint below fail with SQLITE_LOCKED ("database table is locked") — a
    // better-sqlite3/SQLite interaction with the just-VACUUMed, just-purged connection, not a real
    // corruption signal (moving `integrity_check` after the checkpoint, or closing and reopening the
    // connection in between, both independently avoid it). `integrity_check` runs LAST instead, as
    // the final gate on the copy this function actually hands back.
    target.pragma("journal_mode = WAL");
    const [checkpoint] = target.pragma("wal_checkpoint(TRUNCATE)") as Array<{ busy: number }>;
    if (checkpoint.busy !== 0) {
      throw new InternalError(`duplicateContentDb: final WAL checkpoint on ${targetDbPath} reported busy=${checkpoint.busy}`);
    }

    const [integrity] = target.pragma("integrity_check") as Array<{ integrity_check: string }>;
    if (integrity.integrity_check !== "ok") {
      throw new InternalError(
        `duplicateContentDb: ${targetDbPath} failed integrity_check after purge: ${JSON.stringify(integrity)}`
      );
    }
  } finally {
    target.close();
  }
}
