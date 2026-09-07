import Database from "better-sqlite3";

import { CHAT_TABLE_NAMES } from "../db/sqlite/chat-orphan-check.js";
import { openContentDbReadOnly } from "../db/sqlite/content-db.js";
import { InternalError } from "./errors.js";

/**
 * @file The `content.db` half of `duplicateSite` (SPEC-003 sibling operation, 2026-09-05) — a
 * physically consistent, WAL-safe copy of one site's content database, with the chat/session
 * tables the `chat.db` split left stranded in older databases emptied by NAME, and everything else
 * carried across.
 *
 * READ THIS BEFORE TRUSTING IT WITH CHAT HISTORY. Everything below is scoped to the TABLES inside
 * one `content.db` file. It cannot see, and never could, the site directory around that file. Since
 * the chat/session split (`0fb84ae0`) conversation history lives in a SIBLING `<siteDir>/chat.db`,
 * so keeping a duplicated SITE free of the source's chat history is `site-dir/layout.ts`'s job —
 * its portable allowlist does not name `chat.db` — not this file's.
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
 * ## Why the purge names what it DELETES rather than what it keeps
 *
 * This module previously inverted that: it built an allowlist of every table `db/schema.ts`
 * declares (plus the migrator's bookkeeping table, SQLite's catalog and the FTS5 shadow objects)
 * and `DELETE`d the rows of every OTHER table, on the stated premise that the only undeclared
 * tables in a `content.db` were the three chat tables. That premise was false, and the file's own
 * citation for it was false too — both are corrected here:
 *
 * - **The premise.** Measured read-only against `sites/tovu-com/content.db` on 2026-09-06: 104
 *   physical tables, 81 declared by `schema.ts`, and the keep-list emptied FIFTEEN — the three chat
 *   tables and TWELVE plugin tables. `_plugin_identity` (3 rows), `_plugin_migration_journal` (3),
 *   `_plugin_migrations` (12), `p_comments__comments`, `p_comments__moderation_log`, five
 *   `p_newsletter__*` (one holding a real list), `p_store__orders` and `p_store__products` (3 real
 *   products). None is declared in `schema.ts` because none is created by a MIGRATION: they are
 *   raw SQL written at plugin-install time by `features/plugins/data-module.ts` (`p_{pluginId}__`
 *   tables plus `_plugin_migrations`), `plugin-identity.ts` and `migration-journal.ts`. Duplicating
 *   a client site with a store and a newsletter therefore produced a copy with zero products, zero
 *   orders and zero subscribers, a re-mintable plugin identity, and no DDL timeline —
 *   `newsletter_campaigns` IS declared, so its rows survived pointing at a `list_id` that no longer
 *   existed.
 * - **The citation.** The old header sourced its "the chat tables are the raw-SQL ones" claim to a
 *   `RAW_SQL_MANAGED_TABLES` registry "in `db/migration/manifest.ts`". No such constant has ever
 *   existed in that file. It lives in `platform/db/__tests__/schema-migration-drift.test.ts`, it
 *   names exactly the three chat tables, and its own doc says what it is: tables a MIGRATION
 *   creates as raw SQL. Plugin tables are outside its subject matter by construction, so it could
 *   never have been evidence about them.
 *
 * **Why not simply widen the keep-list to `p_*`/`_plugin_*`.** That is the shape `layout.ts` and
 * `0d63cfd8` just finished removing one level up, kept pointing the other way: an artifact nobody
 * classified still gets the wrong treatment, and the next plugin naming convention (or the next
 * raw-SQL table added by anything) is silently emptied from every duplicate. The two directions are
 * not in tension — they are the same rule applied to two different risk profiles. At the DIRECTORY
 * level the unclassified class is dominated by whole-database backups and restore points, so an
 * unclassified entry copied is a privacy incident; at the TABLE level inside one `content.db` the
 * unclassified class is dominated by plugin business data, so an unclassified table purged is
 * silent client data loss. Losing a client's store orders is worse than copying one extra table, so
 * this direction keeps by default and the one privacy-bearing category is named explicitly.
 *
 * **What the purge set is, and why it can be named safely here when the keep-list could not.** It
 * is `chat-orphan-check.ts`'s `CHAT_TABLE_NAMES` — the same list that drives the boot-time
 * "unmigrated conversations" warning, imported rather than retyped, so the two can never disagree
 * about which tables are chat and a fourth chat table updates both at once. Naming is safe here in
 * a way it is not for the keep-list because this category is closed and owned: chat lives in
 * `chat.db` now (`db/sqlite/chat-db.ts` owns its DDL), no new chat table can appear in `content.db`
 * from the current runtime, and the set is exhaustively enumerated in three existing places.
 *
 * **Why not drop the purge entirely**, given `chat.db` and given that `0d63cfd8` made
 * `duplicateSite` copy only an allowlist of directories, so the source's `chat.db` never reaches a
 * duplicate at all: because the split was wiring-only. It never moved the rows an already-deployed
 * `content.db` was holding — the owner's own site still had 157 `ai_chats` / 562
 * `ai_chat_messages` / 19 `assistant_agent_sessions` in `content.db` on 2026-09-06 (`ef7fa9c8`,
 * which added the boot warning). Duplicating an unmigrated source site with no purge would copy
 * every one of those conversations into the new site. The purge stays until nothing can be
 * stranded, and it is exactly the same three tables `ef7fa9c8` warns about.
 *
 * Reversal is this file's `purgeStrandedChatTables` and the one `CHAT_TABLE_NAMES` export it reads;
 * nothing else in the module depends on either.
 *
 * Architectural role: `site-dir` domain logic (INV-06) — no `express`/`cli` import. Depends on
 * `db/sqlite/content-db.ts` and `db/sqlite/chat-orphan-check.ts` only, both already
 * `site-dir`-reachable (siblings under `platform/db/`, not `server`/`cli`).
 */

/**
 * Empties the chat/session tables in `db` — and only those — leaving every other table's rows,
 * including tables this repository has never heard of, exactly as `VACUUM INTO` copied them.
 *
 * Tolerates their absence: a `content.db` that never carried them, or a future one that drops them,
 * must produce a duplicate rather than a "no such table" failure (the same reason
 * `chat-orphan-check.ts` filters through `sqlite_master` before counting).
 *
 * Foreign keys are a non-issue in both directions, verified against `sites/tovu-com/content.db`'s
 * own `sqlite_master` on 2026-09-06: the only tables carrying a `REFERENCES ai_chats(id)` are
 * `ai_chat_messages` and `assistant_agent_sessions`, both purged here themselves and both
 * `ON DELETE CASCADE`. Nothing kept can reference a purged row — Drizzle cannot declare a foreign
 * key to a table it has no `sqliteTable` representation for, and the plugin `dataModule` seam has
 * no foreign-key grammar at all (`features/plugins/data-module.ts`'s `IndexDecl` doc: referential
 * integrity there is "chokepoint-validated, not FK-enforced (v1)").
 *
 * @complexity O(k) SQL statements for k = {@link CHAT_TABLE_NAMES}'s length — a fixed three, never
 *   bounded by caller-controlled input.
 */
function purgeStrandedChatTables(db: Database.Database): void {
  const placeholders = CHAT_TABLE_NAMES.map(() => "?").join(", ");
  const present = new Set(
    (
      db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`)
        .all(...CHAT_TABLE_NAMES) as Array<{ name: string }>
    ).map((row) => row.name)
  );

  const purgeAll = db.transaction(() => {
    for (const name of CHAT_TABLE_NAMES) {
      if (!present.has(name)) continue;
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
 * Produces a physically consistent copy of `sourceDbPath` at `targetDbPath`, with the chat/session
 * tables emptied and everything else — declared content, plugin tables and their rows, the
 * migrator's bookkeeping, the FTS5 index — carried across. See this file's own header for why the
 * purge names what it deletes, and for why this says nothing about the `chat.db` sibling next to
 * `sourceDbPath`.
 *
 * @throws {InternalError} `VACUUM INTO` failing (e.g. `targetDbPath` already exists, or the parent
 *   directory is not writable), or the purged copy failing `integrity_check` — surfaced with the
 *   real driver message rather than a generic wrapper, so a caller can tell a full disk from a
 *   locked source.
 * @complexity O(1) plus {@link purgeStrandedChatTables}'s own fixed three-statement cost — the
 *   `VACUUM INTO`/final `VACUUM` calls are each one full pass over the source/copy's own byte size,
 *   fixed by how much content the site being duplicated actually holds, never by any
 *   caller-controlled input.
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
    purgeStrandedChatTables(target);
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
