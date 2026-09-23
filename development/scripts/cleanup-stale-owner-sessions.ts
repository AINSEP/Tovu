/**
 * @file Operator-invoked cleanup for stale rows in the `sessions` table (owner/admin login
 * sessions) left behind by the desktop shell's pre-`e332ec33` behavior of minting a fresh 30-day
 * session on every launch, with no reuse and no revocation — one site's own database was found
 * carrying 713 of them. The leak itself is fixed (`e332ec33`); this script is only for the rows
 * that already accumulated.
 *
 * ## Safety model — why a delete here can never end a session actually in use
 *
 * `validateSession` (`@jini-ai/cms/identity`, `packages/cms/src/identity/auth-service.ts`) already
 * treats a session with `revokedAt` set OR `expiresAt <= now` as fail-closed invalid, server-side,
 * regardless of what cookie a browser still holds. So from the instant either condition becomes
 * true, that row can NEVER again authenticate a request — deleting it cannot log anyone out of
 * anything still working. This script deletes ONLY rows matching one of those two conditions.
 *
 * There is no "last activity"/"last seen" column on `sessions` (`createdAt`/`expiresAt`/`revokedAt`
 * only), so an UNEXPIRED, UNREVOKED row cannot be told apart from one genuinely open in a running
 * desktop window right now. This script never touches one, full stop — even though most of the
 * pre-fix rows are probably idle, "probably" is not the bar. That is the deliberate, conservative
 * reading of "if you cannot tell reliably, delete only clearly-expired rows".
 *
 * Dry-run by default; `--apply` required to delete, and dry-run opens the database READ-ONLY
 * (`openContentDbReadOnly`) so "dry run" is not just "print but still write" — same discipline
 * `c412bc75` established for the `backfill-*-aad.ts` scripts. `--db` defaults to a path this repo
 * never creates (mirrors every `backfill-*-aad.ts` script) — the operator must name the real site
 * database explicitly.
 *
 * ## Usage
 *
 *   npx tsx development/scripts/cleanup-stale-owner-sessions.ts --db sites/<site>/content.db
 *   npx tsx development/scripts/cleanup-stale-owner-sessions.ts --db sites/<site>/content.db --apply
 *
 * Exit codes: `0` on success (including "nothing to delete"); `1` if the process throws.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

import { inArray } from "drizzle-orm";

import { openContentDb, openContentDbReadOnly, type ContentDb } from "../../apps/website/src/platform/db/sqlite/content-db.js";
import { SqliteDbOpsAdapter } from "../../apps/website/src/platform/db/sqlite/db-ops.js";
import { sessions } from "../../apps/website/src/platform/db/schema.sqlite.js";

import { resolveExistingDbPath } from "./backfill-db-path.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
// Deliberately a path this repo never creates (mirrors every backfill-*-aad.ts script) — see
// resolveExistingDbPath's own doc for why defaulting to a real database would be the exact footgun
// this script exists to avoid.
const DEFAULT_DB_PATH = path.join(REPO_ROOT, "infra", "content.db");

export interface CleanupArgs {
  readonly dbPath: string;
  readonly apply: boolean;
}

/** @complexity O(n) in argv length — one `indexOf` scan, mirrors `parseAadBackfillArgs`. */
export function parseCleanupArgs(argv: readonly string[]): CleanupArgs {
  const dbFlag = argv.indexOf("--db");
  return {
    dbPath: dbFlag === -1 ? DEFAULT_DB_PATH : path.resolve(argv[dbFlag + 1]!),
    apply: argv.includes("--apply"),
  };
}

export interface SessionRow {
  readonly id: string;
  readonly principalId: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}

/**
 * A session row is safe to delete once, and only once, {@link validateSession} (the real auth
 * chokepoint this mirrors) would ALREADY refuse it: revoked, or past its own absolute expiry —
 * never merely "probably idle". See this file's own header for why that is the one condition that
 * can never end a session actually in use.
 * @complexity O(1) per row.
 */
export function isClearlyStaleSession(row: SessionRow, nowIso: string): boolean {
  return row.revokedAt !== null || row.expiresAt <= nowIso;
}

/** Splits `rows` into the clearly-stale set this script is willing to delete and the live set it
 *  will never touch. A pure function so the partition rule itself is unit-testable without a
 *  database. @complexity O(n) in `rows.length`. */
export function partitionStaleSessions(rows: readonly SessionRow[], nowIso: string): { stale: SessionRow[]; live: SessionRow[] } {
  const stale: SessionRow[] = [];
  const live: SessionRow[] = [];
  for (const row of rows) (isClearlyStaleSession(row, nowIso) ? stale : live).push(row);
  return { stale, live };
}

function describeRow(row: SessionRow): string {
  return `id=${row.id} principal=${row.principalId} expiresAt=${row.expiresAt} revokedAt=${row.revokedAt ?? "none"}`;
}

function loadSessionRows(db: ContentDb): SessionRow[] {
  return db
    .select({ id: sessions.id, principalId: sessions.principalId, expiresAt: sessions.expiresAt, revokedAt: sessions.revokedAt })
    .from(sessions)
    .all();
}

/**
 * Core cleanup run, factored out of `main()` so a test can drive it against an already-open
 * fixture database without shelling out to the real CLI. Dry run touches nothing; `apply` captures
 * a restore point before the one batched `DELETE ... WHERE id IN (...)` (a single SQLite statement
 * is already atomic, so a crash mid-run either deletes every stale row or none of them — never a
 * half-deleted set).
 * @complexity O(n) in the session row count — one full-table read, one partition pass, at most one
 * batched delete.
 */
export async function runCleanup(db: ContentDb, opts: { apply: boolean; dbPath: string; log?: (message: string) => void }): Promise<void> {
  const log = opts.log ?? ((message: string) => console.log(message));
  const nowIso = new Date().toISOString();
  const before = loadSessionRows(db);
  const { stale, live } = partitionStaleSessions(before, nowIso);
  log(`Found ${before.length} total session row(s): ${stale.length} clearly stale (expired or revoked), ${live.length} still live (untouched).`);

  if (!opts.apply) {
    for (const row of stale) log(`DRY RUN: would delete ${describeRow(row)}`);
    log(`DRY RUN: ${stale.length} row(s) would be deleted. Re-run with --apply to delete.`);
    return;
  }

  if (stale.length === 0) {
    log("Nothing to delete — every session row is either still live or already gone.");
    return;
  }

  const dbOps = new SqliteDbOpsAdapter({ db, filePath: opts.dbPath });
  const restorePoint = await dbOps.captureRestorePoint({ scopeId: "cleanup-stale-owner-sessions" });
  log(`RESTORE POINT CAPTURED: artifactRef='${restorePoint.artifactRef}' watermarkAtCapture=${restorePoint.watermarkAtCapture}`);

  for (const row of stale) log(`DELETING: ${describeRow(row)}`);
  db.delete(sessions)
    .where(inArray(sessions.id, stale.map((row) => row.id)))
    .run();

  const after = loadSessionRows(db);
  log(`Done: ${stale.length} row(s) deleted. ${before.length} total before, ${after.length} total after.`);
}

async function main(): Promise<void> {
  const args = parseCleanupArgs(process.argv.slice(2));
  const dbPath = resolveExistingDbPath(args.dbPath);
  // Dry run opens READ-ONLY — matches the same "a dry run is not read-only unless the connection
  // itself refuses writes" discipline `c412bc75` established for the AAD backfill scripts.
  const db = args.apply ? openContentDb(dbPath) : openContentDbReadOnly(dbPath);
  await runCleanup(db, { apply: args.apply, dbPath });
}

// Guarded so a test can `import` this module's pure helpers (`isClearlyStaleSession`,
// `partitionStaleSessions`, `runCleanup`) without also triggering a real run against the default
// db path as an unwanted side effect of that import — `check-src-complexity-drift.ts`'s own
// convention for the same dual import/run shape.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
