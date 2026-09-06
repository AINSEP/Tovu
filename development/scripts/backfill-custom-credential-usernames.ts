/**
 * Populates `custom_credential_sets.username` (`apps/website/src/platform/db/schema.ts`, migration
 * `0054`) from the `username` field already sitting inside each row's sealed `{token, username?}`
 * connection object — Pass 1 of the two-pass migration that column's own doc comment describes.
 *
 * ## Why this cannot be a plain `.sql` migration
 *
 * `sealed_ciphertext` is AES-256-GCM; `username` (when present) lives INSIDE that ciphertext, not as
 * a separate column value SQL could ever see or copy. Only application code holding the real root
 * key can decrypt it — this script is that application code. Structural template:
 * `development/scripts/backfill-vendor-credentials.ts` (dry-run-by-default / `--apply` /
 * restore-point-first shape, same `SqliteDbOpsAdapter` mechanism); this file's own "Failure isolation"
 * section below documents the one place it deliberately does NOT copy that template.
 *
 * ## Safety
 *
 * Dry-run by default; `--apply` is required to write, and even then only after a restore point is
 * captured (`SqliteDbOpsAdapter`, the same online-backup mechanism `backfill-vendor-credentials.ts`
 * already uses) — skipped entirely when there is nothing pending, same posture.
 *
 * `sealed_ciphertext`/`sealed_nonce`/`sealed_key_id`/`sealed_alg` are NEVER written by this script —
 * only read. The ONLY column this script's `UPDATE` ever touches is `username`. This is Pass 1 of a
 * deliberately two-pass migration: Pass 2 (separate, later work, gated on this script reporting zero
 * unmigrated rows) is the one that stops sealing `username` and strips it from existing payloads.
 * Because the ciphertext is never rewritten, a crash or `Ctrl-C` mid-run cannot lose or brick a
 * credential: whatever `username` values were written before the interruption stay written (each one
 * independently correct — see "Idempotent" below), and every row's sealed connection is byte-for-byte
 * exactly what it was before this script ever ran, migrated or not.
 *
 * Idempotent: every row is skipped the moment its `username` column is already non-`NULL` (see
 * `runCustomCredentialUsernameBackfill`'s own doc) — a row this script has already migrated, or one
 * an ordinary write path (`custom-credentials/store.ts`) has already populated some other way, is
 * never re-decrypted, never re-written. An interrupted or repeated `--apply` run therefore always
 * converges to "every sealed username has been copied onto its row's `username` column" and then
 * stops changing anything.
 *
 * ## Failure isolation — the deliberate divergence from `backfill-vendor-credentials.ts`
 *
 * `backfill-vendor-credentials.ts` aborts the entire run on its first decrypt failure — the correct
 * choice for an irreversible cross-table secret move, where "half-moved" is a state worth stopping
 * to look at. This script's own dispatch requires the OPPOSITE behavior: a row that fails to decrypt
 * (a rotated or wrong master secret, or a corrupted row) is logged, counted, and SKIPPED — the run
 * continues to every remaining row rather than stopping. Two reasons this is the right shape here,
 * not just a preference:
 *
 *   1. This migration is purely additive-column, not cross-table — a row this script cannot decrypt
 *      is left exactly as it already was (`username` still `NULL`, ciphertext untouched), which is
 *      already a safe, fully-recoverable state. There is nothing to "half-do" the way there is when
 *      moving a secret between tables.
 *   2. One workspace's credential can genuinely have been sealed under an OLD, since-rotated root
 *      key generation while every other workspace's credentials use the current one (nothing in this
 *      schema enforces "every row shares one key era"). Aborting the whole run on the first such row
 *      would make it impossible to ever get a complete picture of this table with mixed key eras —
 *      exactly the situation Pass 2's "zero unmigrated rows" gate needs real, per-row visibility
 *      into, not an all-or-nothing abort.
 *
 * A sealed payload that decrypts cleanly but simply has no `username` field is NOT a failure either
 * — it is the ordinary, expected case for a credential that never had one — and is counted in its own
 * separate bucket. Every row is accounted for in exactly one of four buckets at the end of a run:
 * migrated, already-migrated, skipped (no username), or failed — see
 * `CustomCredentialUsernameBackfillResult`.
 *
 * The `--apply` process itself still exits non-zero if ANY row failed. The common case is the
 * per-row apply loop below, which never short-circuits — it processes every row before exiting. But
 * a row that fails to decrypt must never hide simply because it is the ONLY outstanding row in the
 * table: `main()`'s own pending-count pass (`countPending`) now surfaces any row it could not
 * decrypt directly — logged and counted toward the same non-zero exit — for the specific case where
 * nothing else is pending and the apply loop below would otherwise never even run. See
 * `countPending`'s own doc for why this path exists and what silent behavior it replaced.
 *
 * ## Usage
 *
 *   npx tsx development/scripts/backfill-custom-credential-usernames.ts                (dry run)
 *   npx tsx development/scripts/backfill-custom-credential-usernames.ts --apply
 *   npx tsx development/scripts/backfill-custom-credential-usernames.ts --db <path> --apply
 *
 * Both `--apply` and a dry run require `TOVU_INTEGRATIONS_ROOT_KEY` to be set to the SAME root key
 * the live server uses (`EnvOrFileKeyring({ allowFileFallback: false })` — identical construction to
 * `server/deps.ts`'s `siteAssistantSecretKeyring`, the actual instance `custom-credentials/store.ts`
 * seals and opens through today) whenever the table has any `username IS NULL` row to classify — a
 * dry run decrypts each such row exactly like `--apply` does, so its "would be migrated" count
 * genuinely matches what `--apply` would do instead of over-counting token-only rows (see
 * `runCustomCredentialUsernameBackfill`'s own doc). A table with no NULL rows at all needs no key
 * either way. This script deliberately does not fall back to a generated key file
 * (`allowFileFallback: false`) so a missing env var fails loudly instead of silently minting an
 * unrelated key.
 *
 * Exit codes: `0` on success, including "nothing to do" and "some rows had no username to migrate"
 * (a dry run always exits `0` — it only previews); `1` if `--apply` finds any row failed to decrypt —
 * normally checked only after every row has been processed by the apply loop, but if NO other row
 * was pending (so the apply loop never runs at all) the pending-count pass itself reports the
 * undecryptable row and exits `1` — see `countPending`.
 */
import path from "node:path";

import { and, eq } from "drizzle-orm";

import { openContentDb, openContentDbReadOnly, type ContentDb } from "../../apps/website/src/platform/db/sqlite/content-db.js";
import { SqliteDbOpsAdapter } from "../../apps/website/src/platform/db/sqlite/db-ops.js";
import { resolveExistingDbPath } from "./backfill-db-path.js";
import { customCredentialSets } from "../../apps/website/src/platform/db/schema.js";
import { AesGcmSecretSealer } from "../../apps/website/src/features/webhooks/secret-sealer.aesgcm.js";
import { EnvOrFileKeyring } from "../../apps/website/src/features/webhooks/keyring.env.js";
import type { KeyringPort, SecretSealerPort } from "../../apps/website/src/features/webhooks/index.js";
import { buildCustomCredentialAad } from "../../apps/website/src/features/custom-credentials/aad.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

interface Args {
  readonly dbPath: string;
  readonly apply: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const dbFlag = argv.indexOf("--db");
  return {
    dbPath: dbFlag === -1 ? path.join(REPO_ROOT, "infra", "content.db") : path.resolve(argv[dbFlag + 1]),
    apply: argv.includes("--apply"),
  };
}

/** Extracts the `username` field a decrypted `{token, username?}` connection object carries, per
 *  `custom-credentials/types.ts`'s `CustomProviderConnectionInput`. Treats a missing field, a
 *  non-string value, or an empty string identically — all three mean "this credential has no
 *  username to backfill" (`store.ts`'s own `optionalString` never persists an empty string as a
 *  saved username in the first place, so an empty string here would only ever come from a row this
 *  codebase's own write path never produced — still handled the same safe way, not guessed at).
 *
 * @complexity O(1) — one `JSON.parse` of an already-small connection object, one field read.
 * @throws Whatever `JSON.parse` throws if `plaintext` is not valid JSON — surfaced to the caller as
 *   an ordinary per-row failure (see this file's header on why a per-row failure never aborts the
 *   run), not swallowed here.
 */
function extractUsername(plaintext: string): string | undefined {
  const parsed = JSON.parse(plaintext) as Record<string, unknown>;
  return typeof parsed.username === "string" && parsed.username.length > 0 ? parsed.username : undefined;
}

export interface CustomCredentialUsernameBackfillDeps {
  readonly db: ContentDb;
  readonly sealer: SecretSealerPort;
  readonly keyring: KeyringPort;
  /** Defaults to `console.log`. Injected so callers (tests, `main()`) can capture or silence
   *  progress output without this function knowing anything about where it goes. */
  readonly log?: (message: string) => void;
}

export interface CustomCredentialUsernameBackfillResult {
  readonly migrated: number;
  readonly skippedAlreadyMigrated: number;
  readonly skippedNoUsername: number;
  readonly failed: number;
  readonly total: number;
}

type CustomCredentialRow = typeof customCredentialSets.$inferSelect;

/** The four buckets a row can land in — see `runCustomCredentialUsernameBackfill`'s own doc. */
type RowClassification =
  | { readonly kind: "alreadyMigrated" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "noUsername" }
  | { readonly kind: "pending"; readonly username: string };

/**
 * Classifies one `custom_credential_sets` row without writing anything — the read-only half of the
 * sweep below, split out so neither function alone carries the full decision tree. An already-
 * migrated row is classified without touching the sealer at all; a NULL-username row is decrypted
 * under its own `(workspaceId, id)` AAD and classified by whether that succeeds and whether the
 * decrypted payload actually carries a `username` (see this file's header on why a token-only
 * credential's `username` column stays NULL forever by design).
 *
 * @throws Never — a decrypt/parse failure is caught and returned as `{ kind: "failed" }`, not
 *   propagated (this file's header, "Failure isolation").
 * @complexity O(1) — at most one decrypt and one JSON parse.
 */
async function classifyRow(row: CustomCredentialRow, deps: { sealer: SecretSealerPort }): Promise<RowClassification> {
  if (row.username !== null) return { kind: "alreadyMigrated" };

  try {
    const plaintext = await deps.sealer.open({
      sealed: { keyId: row.sealedKeyId, ciphertext: row.sealedCiphertext, nonce: row.sealedNonce, alg: row.sealedAlg },
      aad: buildCustomCredentialAad({ workspaceId: row.workspaceId, id: row.id }),
    });
    const username = extractUsername(plaintext);
    return username === undefined ? { kind: "noUsername" } : { kind: "pending", username };
  } catch (err) {
    return { kind: "failed", message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The core sweep over `custom_credential_sets` — see this file's header for the full design.
 * Every NULL-username row is decrypted under its own `(workspaceId, id)` AAD to classify it (via
 * `classifyRow`) — this is true for `opts.apply === false` (dry run) exactly as much as
 * `opts.apply === true`, so a dry run's counts genuinely match what `--apply` would do instead of
 * guessing from `username IS NULL` alone (a token-only row's `username` column stays NULL forever
 * by design — see this file's header and `countPending`'s own doc — so counting NULL rows without
 * decrypting over-counts). The ONLY difference `opts.apply` makes is whether a `pending` row's
 * username gets written.
 *
 * Every row is processed exactly once and lands in exactly one of the four result buckets — no row
 * can be double-counted, and a per-row failure never stops the sweep partway through (this file's
 * header, "Failure isolation").
 *
 * @throws Only for a condition this function has no safe way to route into the `failed` bucket:
 *   `deps.keyring.activeKey()`/`deps.sealer.derive` failing before any row is even attempted would
 *   mean the root key itself is unconfigured, not that any one row is bad — but this function never
 *   calls either eagerly, so in practice a decrypt/parse failure for one row is always caught and
 *   counted here, never propagated.
 * @complexity O(n) in the row count — one classification per row, and for a pending `--apply` row
 *   at most one single-column `UPDATE`; no nested iteration over the row collection itself.
 */
export async function runCustomCredentialUsernameBackfill(
  deps: CustomCredentialUsernameBackfillDeps,
  opts: { apply: boolean }
): Promise<CustomCredentialUsernameBackfillResult> {
  const log = deps.log ?? ((message: string) => console.log(message));
  const rows = deps.db.select().from(customCredentialSets).all();
  log(`Found ${rows.length} row(s) in custom_credential_sets.`);

  let migrated = 0;
  let skippedAlreadyMigrated = 0;
  let skippedNoUsername = 0;
  let failed = 0;

  for (const row of rows) {
    const classification = await classifyRow(row, deps);

    switch (classification.kind) {
      case "alreadyMigrated":
        skippedAlreadyMigrated += 1;
        log(`SKIPPED (already migrated): workspace=${row.workspaceId} id=${row.id}`);
        continue;
      case "failed":
        failed += 1;
        log(`FAILED (could not decrypt): workspace=${row.workspaceId} id=${row.id}: ${classification.message}`);
        continue;
      case "noUsername":
        skippedNoUsername += 1;
        log(`SKIPPED (no username in sealed payload): workspace=${row.workspaceId} id=${row.id}`);
        continue;
    }

    if (!opts.apply) {
      migrated += 1;
      log(`DRY RUN: would migrate workspace=${row.workspaceId} id=${row.id}`);
      continue;
    }

    // The ONLY column this script ever writes — `sealed_*` are never included in this `SET` clause,
    // so they cannot be touched even by accident (this file's header).
    deps.db
      .update(customCredentialSets)
      .set({ username: classification.username })
      .where(and(eq(customCredentialSets.workspaceId, row.workspaceId), eq(customCredentialSets.id, row.id)))
      .run();

    migrated += 1;
    log(`MIGRATED: workspace=${row.workspaceId} id=${row.id}`);
  }

  return { migrated, skippedAlreadyMigrated, skippedNoUsername, failed, total: rows.length };
}

/**
 * Pending count for the `--apply` gate. `username IS NULL` alone is NOT enough: a token-only
 * credential's `username` column stays NULL forever by design (`schema.ts`'s own doc on that
 * column — "NULL means this credential has no username, not not yet migrated"), so counting NULL
 * rows would report outstanding work forever even after every row has already been visited once,
 * and the `--apply` gate below would never again skip its restore-point capture. A row counts as
 * pending only when it is both unmigrated (`username IS NULL`) AND its sealed payload actually
 * carries a `username` to copy — the same `extractUsername` check the apply loop itself applies,
 * reused here so the two can never disagree.
 *
 * The root key is resolved ONCE, unguarded, before the per-row loop: a systemic misconfiguration
 * (the key entirely missing) must fail loudly here exactly as `--apply` already always required,
 * never get swallowed into a false "nothing pending". A single row's OWN decrypt/parse failure
 * (corrupt ciphertext, or sealed under an old, since-rotated key) is caught per-row and never counted
 * toward `pending` — it cannot converge no matter how many times this script re-runs against the same
 * key, same reasoning as the token-only case above. It is NOT discarded, though: it is returned in
 * `unreadable` so `main()` can still report it. This matters specifically when the row is the ONLY
 * one outstanding in the table — the per-row apply loop below only ever runs when `pending > 0`, so
 * without `unreadable` a lone undecryptable row would make `main()` fall through to "Nothing to
 * migrate" and exit `0`, permanently hiding a row this script could never even read. (An earlier
 * version of this function did exactly that, via a bare `catch { continue; }` — see the audit note
 * this fix responds to.)
 *
 * @complexity O(n) in the NULL-row count — one decrypt attempt per row, no nested iteration.
 */
interface PendingCheckUnreadableRow {
  readonly workspaceId: string;
  readonly id: string;
  /** `err.message` (or `String(err)`) only — never the ciphertext, never a decrypted value. */
  readonly message: string;
}

interface PendingCheckResult {
  readonly pending: number;
  /** Rows this pass could not decrypt at all. Never counted toward `pending` (see this function's
   *  doc), but reported so `main()` can surface them even when they are the only NULL rows in the
   *  table and the per-row apply loop would otherwise never run to catch them. */
  readonly unreadable: readonly PendingCheckUnreadableRow[];
  /** The table's real row count — every row, not just the NULL-username ones this function
   *  otherwise looks at. Returned so `main()` can report an honest "total" even on the path where
   *  the apply loop below never runs (see that call site's own comment on why `unreadable.length`
   *  alone under-reports it). */
  readonly totalRows: number;
}

async function countPending(
  db: ContentDb,
  deps: { sealer: SecretSealerPort; keyring: KeyringPort }
): Promise<PendingCheckResult> {
  const allRows = db.select().from(customCredentialSets).all();
  const rows = allRows.filter((row) => row.username === null);
  if (rows.length === 0) return { pending: 0, unreadable: [], totalRows: allRows.length };

  // Forces root-key resolution up front (cached for every derive/open call below) so a missing key
  // fails loudly here rather than masquerading as "every row is unreadable, so nothing is pending".
  await deps.keyring.derive({
    workspaceId: "pending-check",
    purpose: "custom-credential-username-backfill",
    info: "root-key-availability",
  });

  let pending = 0;
  const unreadable: PendingCheckUnreadableRow[] = [];
  for (const row of rows) {
    try {
      const plaintext = await deps.sealer.open({
        sealed: { keyId: row.sealedKeyId, ciphertext: row.sealedCiphertext, nonce: row.sealedNonce, alg: row.sealedAlg },
        aad: buildCustomCredentialAad({ workspaceId: row.workspaceId, id: row.id }),
      });
      if (extractUsername(plaintext) !== undefined) pending += 1;
    } catch (err) {
      unreadable.push({ workspaceId: row.workspaceId, id: row.id, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return { pending, unreadable, totalRows: allRows.length };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // Prove the database is really there BEFORE opening it: `openContentDb` creates-and-migrates on
  // open, so a mistyped path would otherwise open (and migrate) a brand-new empty database and
  // report every row as absent instead of the real problem — no such database. Same guard,
  // same reasoning, as `backfill-reset-admin-password.ts`'s own fix for this.
  const dbPath = resolveExistingDbPath(args.dbPath);

  if (!args.apply) {
    // Read-only open: plain `openContentDb` unconditionally runs pending migrations and writes the
    // bootstrap watermark row before a caller's own `--dry-run` check ever runs (and would silently
    // CREATE `dbPath` if it did not already exist) — `openContentDbReadOnly` opens the file in
    // SQLite's own `readonly` connection mode, so neither can happen. A dry run now decrypts each
    // NULL-username row exactly like `--apply` does (see `runCustomCredentialUsernameBackfill`'s own
    // doc) so its reported counts genuinely match what `--apply` would do instead of over-counting
    // token-only rows as "would be migrated" — it therefore needs `TOVU_INTEGRATIONS_ROOT_KEY` set
    // whenever the table has any NULL-username row to classify, same as `--apply`. A table with no
    // NULL rows at all (nothing to classify) still needs no key.
    const db = openContentDbReadOnly(dbPath);
    const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
    const sealer = new AesGcmSecretSealer(keyring);
    const result = await runCustomCredentialUsernameBackfill({ db, sealer, keyring }, { apply: false });
    console.log(
      `DRY RUN: ${result.migrated} row(s) would be migrated, ${result.skippedNoUsername} would be skipped (no username), ${result.failed} would fail (could not decrypt), ${result.skippedAlreadyMigrated} already migrated, ${result.total} total. Re-run with --apply to write.`
    );
    return;
  }

  const db = openContentDb(dbPath);

  // Constructed before the pending check (moved up from after it): `countPending` now needs to
  // decrypt to tell a genuinely pending row from a token-only one, and a fully-migrated database
  // (no NULL rows at all) still resolves no root key, same as before this change.
  const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const sealer = new AesGcmSecretSealer(keyring);

  const { pending, unreadable, totalRows } = await countPending(db, { sealer, keyring });

  if (pending === 0 && unreadable.length === 0) {
    console.log("Nothing to migrate — every custom_credential_sets row already has a username column value (or genuinely has none to backfill).");
    return;
  }

  if (pending === 0) {
    // No row is genuinely pending (writable), but the pending-count pass could not even READ every
    // row — the case `unreadable` exists to catch (`countPending`'s own doc, and this file's
    // "Failure isolation"). Falling through to "Nothing to migrate" here would make an undecryptable
    // row permanently invisible, since the per-row apply loop below never runs when nothing is
    // pending. Report every such row the same way the apply loop's own FAILED line would, and exit
    // non-zero — but skip the restore point, since nothing here was ever going to be written.
    for (const row of unreadable) {
      console.log(`FAILED (could not decrypt): workspace=${row.workspaceId} id=${row.id}: ${row.message}`);
    }
    // "total" is the table's real row count (`totalRows`), not `unreadable.length` — this branch
    // can be reached with already-migrated or otherwise-excluded rows still sitting in the table
    // that `unreadable` never counts, and this line must not silently drop them from "total".
    console.log(
      `Done: 0 row(s) migrated, ${unreadable.length} failed, ${totalRows} total. No other row was pending, so no restore point was captured — nothing here was ever going to be written this run.`
    );
    process.exitCode = 1;
    return;
  }

  const dbOps = new SqliteDbOpsAdapter({ db, filePath: dbPath });
  const restorePoint = await dbOps.captureRestorePoint({ scopeId: "backfill-custom-credential-usernames" });
  console.log(`RESTORE POINT CAPTURED: artifactRef='${restorePoint.artifactRef}' watermarkAtCapture=${restorePoint.watermarkAtCapture}`);

  const result = await runCustomCredentialUsernameBackfill({ db, sealer, keyring }, { apply: true });
  console.log(
    `Done: ${result.migrated} row(s) migrated, ${result.skippedAlreadyMigrated} already migrated, ${result.skippedNoUsername} skipped (no username), ${result.failed} failed, ${result.total} total.`
  );

  // Exit non-zero only AFTER every row has been processed (this file's header, "Failure isolation")
  // — a partial run must be visible to a caller that only checks the exit code, but the sweep itself
  // must never short-circuit on the row that failed.
  if (result.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
