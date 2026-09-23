/**
 * Indexes every entity that was ALREADY soft-deleted before the local admin Trash shipped, so the
 * Trash screen is not empty on the day it arrives.
 *
 * Design of record: `ADS-memory/reports/2026-09-20-trash-delete-architecture.md` §6.
 *
 * ## The one rule that shapes every statement below
 *
 * **No payload is read, parsed or hydrated anywhere in this script.** Every `SELECT` reads columns
 * only — no domain code, no ORM entity, no JSON parse. That is what lets it succeed on exactly the
 * corrupt rows a user most wants gone (design §1.1: `widgets_trash_instance` fails today precisely
 * because it round-trips `fields_json` to change a status).
 *
 * ## `purge_after` is NOT retroactive, deliberately
 *
 * A row trashed 90 days ago does not get `trashed_at + 60 days` — that would purge it the instant
 * this feature ships, silently destroying data the user never agreed to lose. Backfilled rows get
 * `<backfill run time> + 60 days`: the retention clock starts when the FEATURE starts.
 * `trashed_at` keeps the true original timestamp, so the screen can honestly say "deleted 90 days
 * ago" while the countdown reads 60.
 *
 * ## Marker literals — each one checked against the live schema, not against the design doc
 *
 * | domain | marker | why |
 * |---|---|---|
 * | posts | `deleted_at IS NOT NULL` | matches `createPostTrashAdapter` |
 * | media | `status = 'trashed'` | `MediaStatus` is `"active" \| "trashed"` |
 * | comments | `status = 'trash'` | plugin dataModule table, name derived from `COMMENTS_PLUGIN_ID` |
 * | redirects | latest revision `tombstoned = 1` | **not** `status` alone — see below |
 *
 * **The redirect trap.** The design's §6 SQL says `status = 'tombstoned'`; there is no such value.
 * `RedirectStatus` is `"active" | "disabled"`, and `'disabled'` is AMBIGUOUS — it means both "this
 * redirect was deleted" and "an operator switched this rule off" (`updateRedirect` can write it
 * too). Backfilling on status alone would sweep live-but-switched-off rules into the Trash and,
 * sixty days later, delete them. The tombstone is additionally recorded as a
 * `redirect_revisions.tombstoned = 1` row, so this script requires BOTH: currently `disabled`, and
 * the newest revision is a tombstone.
 *
 * ## Safety
 *
 * Dry-run by default; `--apply` is required to write. Idempotent: `INSERT OR IGNORE` against
 * `trashed_items_identity_unique` means a second run inserts nothing. An `--apply` run captures a
 * whole-file restore point before its first write, like every sibling backfill script here.
 *
 * Usage:
 *   npx tsx development/scripts/backfill-trashed-items.ts               (dry run)
 *   npx tsx development/scripts/backfill-trashed-items.ts --apply
 *   npx tsx development/scripts/backfill-trashed-items.ts --db <path> --apply
 *
 * Exit codes: 0 on success; 1 if the database cannot be opened or a statement fails.
 */
import path from "node:path";

import type Database from "better-sqlite3";

import { COMMENTS_PLUGIN_ID } from "../../apps/website/src/features/comments/index.js";
import { computePurgeAfter, TRASH_RETENTION_DAYS } from "../../apps/website/src/features/trash/index.js";
import { openContentDb, openContentDbReadOnly } from "../../apps/website/src/platform/db/sqlite/content-db.js";
import { SqliteDbOpsAdapter } from "../../apps/website/src/platform/db/sqlite/db-ops.js";
import { resolveExistingDbPath } from "./backfill-db-path.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

/** Who a pre-existing marker is attributed to. The original actor was never recorded on the marker
 *  itself for any of the four domains, and inventing one would be worse than admitting it. */
export const BACKFILL_ACTOR_PRINCIPAL_ID = "system-trash-backfill";

/** Matches the comments adapter's own `substr(body_text, 1, 120)` subtitle. */
const COMMENT_SUBTITLE_MAX = 120;

/** The plugin dataModule table name, derived exactly as `features/comments/repo.sqlite.ts` derives it. */
const COMMENTS_TABLE = `p_${COMMENTS_PLUGIN_ID}__comments`;

/**
 * One domain's candidate projection.
 *
 * `selectSql` yields the ten `trashed_items` columns in insert order and takes exactly two bindings:
 * `purge_after`, then `actor_principal_id`. Expressing it once means the dry-run count and the real
 * insert can never disagree about which rows are candidates.
 */
interface BackfillSource {
  readonly entityType: string;
  readonly table: string;
  readonly selectSql: string;
}

const INSERT_COLUMNS =
  "(id, workspace_id, entity_type, entity_id, trashed_at, purge_after, actor_principal_id, display_title, display_subtitle, entity_version)";

/** @complexity O(1) — pure string assembly. */
function buildSources(): readonly BackfillSource[] {
  return [
    {
      entityType: "post",
      table: "posts",
      selectSql: `
        SELECT lower(hex(randomblob(16))) AS id, workspace_id AS workspace_id, 'post' AS entity_type,
               id AS entity_id, deleted_at AS trashed_at, ? AS purge_after, ? AS actor_principal_id,
               COALESCE(NULLIF(title, ''), id) AS display_title, slug AS display_subtitle,
               version AS entity_version
          FROM posts
         WHERE deleted_at IS NOT NULL`,
    },
    {
      entityType: "media",
      table: "media",
      selectSql: `
        SELECT lower(hex(randomblob(16))) AS id, workspace_id AS workspace_id, 'media' AS entity_type,
               id AS entity_id, updated_at AS trashed_at, ? AS purge_after, ? AS actor_principal_id,
               COALESCE(NULLIF(title, ''), id) AS display_title, slug AS display_subtitle,
               version AS entity_version
          FROM media
         WHERE status = 'trashed'`,
    },
    {
      entityType: "redirect",
      table: "redirects",
      // BOTH conditions, not either: see this file's header on why `status = 'disabled'` alone
      // would sweep live-but-switched-off rules into the Trash.
      selectSql: `
        SELECT lower(hex(randomblob(16))) AS id, r.workspace_id AS workspace_id, 'redirect' AS entity_type,
               r.id AS entity_id, r.updated_at AS trashed_at, ? AS purge_after, ? AS actor_principal_id,
               COALESCE(NULLIF(r.from_pattern, ''), r.id) AS display_title, r.to_target AS display_subtitle,
               r.version AS entity_version
          FROM redirects r
         WHERE r.status = 'disabled'
           AND EXISTS (
                 SELECT 1
                   FROM redirect_revisions rev
                  WHERE rev.redirect_id = r.id
                    AND rev.workspace_id = r.workspace_id
                    AND rev.tombstoned = 1
                    AND rev.seq = (SELECT MAX(x.seq)
                                     FROM redirect_revisions x
                                    WHERE x.redirect_id = r.id
                                      AND x.workspace_id = r.workspace_id)
               )`,
    },
    {
      entityType: "comment",
      table: COMMENTS_TABLE,
      selectSql: `
        SELECT lower(hex(randomblob(16))) AS id, workspace_id AS workspace_id, 'comment' AS entity_type,
               id AS entity_id, updated_at AS trashed_at, ? AS purge_after, ? AS actor_principal_id,
               'Comment on ' || entry_id AS display_title,
               substr(body_text, 1, ${COMMENT_SUBTITLE_MAX}) AS display_subtitle,
               version AS entity_version
          FROM "${COMMENTS_TABLE}"
         WHERE status = 'trash'`,
    },
  ];
}

/** Whether a table exists in this file at all — the comments table only exists once the tier-2
 *  plugin has been installed, so a site without it must be skipped, not fail.
 *  @complexity O(1) against `sqlite_master`. */
function tableExists(client: Database.Database, table: string): boolean {
  return (
    client.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined
  );
}

export interface BackfillDomainResult {
  readonly entityType: string;
  /** Rows a run would index (dry run) or did index (`--apply`). */
  readonly rows: number;
  /** True when the domain's table is absent from this database, so nothing was examined. */
  readonly skipped: boolean;
}

export interface BackfillTrashedItemsRequired {
  client: Database.Database;
  /** The backfill run's own timestamp. `purge_after` is derived from THIS, never from `trashed_at`. */
  now: string;
  apply: boolean;
}

export interface BackfillTrashedItemsOptional {
  actorPrincipalId?: string;
  retentionDays?: number;
}

/**
 * Runs (or plans) the backfill for all four phase-1 domains.
 *
 * The dry-run count and the `--apply` insert share one `selectSql` per domain, so what a dry run
 * reports is exactly what an apply writes — modulo rows a concurrent delete adds in between, which
 * `INSERT OR IGNORE` handles either way.
 *
 * @param required the open client, the run timestamp, and whether to write.
 * @param optional actor attribution and the retention window (defaults to `TRASH_RETENTION_DAYS`).
 * @returns one result per domain, in a fixed order.
 * @complexity O(n) over marked rows per domain; the redirect source additionally does one indexed
 *             `MAX(seq)` lookup per candidate redirect.
 */
export function backfillTrashedItems(
  required: BackfillTrashedItemsRequired,
  optional: BackfillTrashedItemsOptional = {}
): BackfillDomainResult[] {
  const purgeAfter = computePurgeAfter(required.now, optional.retentionDays ?? TRASH_RETENTION_DAYS);
  const actor = optional.actorPrincipalId ?? BACKFILL_ACTOR_PRINCIPAL_ID;

  return buildSources().map((source) => {
    if (!tableExists(required.client, source.table)) {
      return { entityType: source.entityType, rows: 0, skipped: true };
    }

    if (!required.apply) {
      // Counts only what an insert would actually add: an entity already indexed (by a live delete,
      // or by an earlier run of this script) is not a candidate.
      const counted = required.client
        .prepare(
          `SELECT COUNT(*) AS n FROM (${source.selectSql}) AS s
            WHERE NOT EXISTS (
                    SELECT 1 FROM trashed_items t
                     WHERE t.workspace_id = s.workspace_id
                       AND t.entity_type = s.entity_type
                       AND t.entity_id = s.entity_id)`
        )
        .get(purgeAfter, actor) as { n: number };
      return { entityType: source.entityType, rows: counted.n, skipped: false };
    }

    // `INSERT OR IGNORE` against `trashed_items_identity_unique` is what makes a re-run free.
    const inserted = required.client
      .prepare(`INSERT OR IGNORE INTO trashed_items ${INSERT_COLUMNS} ${source.selectSql}`)
      .run(purgeAfter, actor);
    return { entityType: source.entityType, rows: inserted.changes, skipped: false };
  });
}

interface Args {
  readonly dbPath: string;
  readonly apply: boolean;
}

/** @complexity O(argv). */
function parseArgs(argv: readonly string[]): Args {
  const dbFlag = argv.indexOf("--db");
  return {
    dbPath: dbFlag === -1 ? path.join(REPO_ROOT, "infra", "content.db") : path.resolve(argv[dbFlag + 1]!),
    apply: argv.includes("--apply"),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // Prove the database is really there BEFORE opening it: `openContentDb` creates-and-migrates on
  // open, so a typo'd path would otherwise report "nothing to backfill" against a new empty file.
  const dbPath = resolveExistingDbPath(args.dbPath);
  const db = args.apply ? openContentDb(dbPath) : openContentDbReadOnly(dbPath);
  const now = new Date().toISOString();

  if (!args.apply) {
    const planned = backfillTrashedItems({ client: db.$client, now, apply: false });
    for (const result of planned) {
      if (result.skipped) console.log(`DRY RUN: ${result.entityType} — table not present in this database, skipped.`);
      else console.log(`DRY RUN: ${result.entityType} — ${result.rows} row(s) would be indexed.`);
    }
    const total = planned.reduce((sum, result) => sum + result.rows, 0);
    console.log(`DRY RUN: ${total} row(s) total. Re-run with --apply to write.`);
    return;
  }

  const dbOps = new SqliteDbOpsAdapter({ db, filePath: dbPath });
  const restorePoint = await dbOps.captureRestorePoint({ scopeId: "backfill-trashed-items" });
  console.log(`RESTORE POINT CAPTURED: artifactRef='${restorePoint.artifactRef}' watermarkAtCapture=${restorePoint.watermarkAtCapture}`);

  const applied = backfillTrashedItems({ client: db.$client, now, apply: true });
  for (const result of applied) {
    if (result.skipped) console.log(`SKIPPED: ${result.entityType} — table not present in this database.`);
    else console.log(`BACKFILLED: ${result.entityType} — ${result.rows} row(s) indexed.`);
  }
  const total = applied.reduce((sum, result) => sum + result.rows, 0);
  console.log(`Done: ${total} row(s) indexed, purge_after = ${computePurgeAfter(now)} (retention starts now, not retroactively).`);
}

// Only when run as a script — the exported `backfillTrashedItems` is imported by tests.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
