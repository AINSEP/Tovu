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
 * The `--apply` process itself still exits non-zero if ANY row failed (so a partial run is visible to
 * a caller that only checks the exit code), but only AFTER every row has been processed — never a
 * short-circuit that stops the sweep partway through.
 *
 * ## Usage
 *
 *   npx tsx development/scripts/backfill-custom-credential-usernames.ts                (dry run)
 *   npx tsx development/scripts/backfill-custom-credential-usernames.ts --apply
 *   npx tsx development/scripts/backfill-custom-credential-usernames.ts --db <path> --apply
 *
 * `--apply` requires `TOVU_INTEGRATIONS_ROOT_KEY` to be set to the SAME root key the live server uses
 * (`EnvOrFileKeyring({ allowFileFallback: false })` — identical construction to `server/deps.ts`'s
 * `siteAssistantSecretKeyring`, the actual instance `custom-credentials/store.ts` seals and opens
 * through today). This script deliberately does not fall back to a generated key file
 * (`allowFileFallback: false`) so a missing env var fails loudly instead of silently minting an
 * unrelated key. A dry run never touches the keyring at all — it only compares the `username` column
 * against `NULL`, which needs no decryption — so it needs no env var.
 *
 * Exit codes: `0` on success, including "nothing to do" and "some rows had no username to migrate";
 * `1` if any row failed to decrypt (checked only after every row has been processed).
 */
import path from "node:path";

import { and, eq } from "drizzle-orm";

import { openContentDb, type ContentDb } from "../../apps/website/src/platform/db/sqlite/content-db.js";
import { SqliteDbOpsAdapter } from "../../apps/website/src/platform/db/sqlite/db-ops.js";
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

/**
 * The core sweep over `custom_credential_sets` — see this file's header for the full design.
 * `opts.apply === false` NEVER touches `deps.sealer`/`deps.keyring` (a pending row is identified
 * purely by `username IS NULL`, which needs no decryption); `opts.apply === true` decrypts each
 * pending row under its own `(workspaceId, id)` AAD and writes ONLY the `username` column for a row
 * whose sealed payload actually carries one.
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
 * @complexity O(n) in the row count — one `username IS NULL` check, and for a pending row one
 *   decrypt, one parse, and at most one single-column `UPDATE`; no nested iteration over the row
 *   collection itself.
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
    if (row.username !== null) {
      skippedAlreadyMigrated += 1;
      log(`SKIPPED (already migrated): workspace=${row.workspaceId} id=${row.id}`);
      continue;
    }

    if (!opts.apply) {
      migrated += 1;
      log(`DRY RUN: would inspect workspace=${row.workspaceId} id=${row.id} (username currently NULL)`);
      continue;
    }

    let username: string | undefined;
    try {
      const plaintext = await deps.sealer.open({
        sealed: { keyId: row.sealedKeyId, ciphertext: row.sealedCiphertext, nonce: row.sealedNonce, alg: row.sealedAlg },
        aad: buildCustomCredentialAad({ workspaceId: row.workspaceId, id: row.id }),
      });
      username = extractUsername(plaintext);
    } catch (err) {
      failed += 1;
      log(`FAILED (could not decrypt): workspace=${row.workspaceId} id=${row.id}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    if (username === undefined) {
      skippedNoUsername += 1;
      log(`SKIPPED (no username in sealed payload): workspace=${row.workspaceId} id=${row.id}`);
      continue;
    }

    // The ONLY column this script ever writes — `sealed_*` are never included in this `SET` clause,
    // so they cannot be touched even by accident (this file's header).
    deps.db
      .update(customCredentialSets)
      .set({ username })
      .where(and(eq(customCredentialSets.workspaceId, row.workspaceId), eq(customCredentialSets.id, row.id)))
      .run();

    migrated += 1;
    log(`MIGRATED: workspace=${row.workspaceId} id=${row.id}`);
  }

  return { migrated, skippedAlreadyMigrated, skippedNoUsername, failed, total: rows.length };
}

/** Read-only pending-row count — needs no decryption (`username IS NULL` alone identifies a pending
 *  row). Used by `main()` to decide whether an `--apply` run has anything to do BEFORE paying for a
 *  restore-point capture, same "skip the backup when there's nothing to back up for" posture
 *  `backfill-vendor-credentials.ts`'s own `main()` follows. */
function countPending(db: ContentDb): number {
  return db.select().from(customCredentialSets).all().filter((row) => row.username === null).length;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const db = openContentDb(args.dbPath);

  if (!args.apply) {
    // Constructed unconditionally but touches no env var until `sealer.open` is actually called — a
    // dry run never calls it, so a dry run needs no `TOVU_INTEGRATIONS_ROOT_KEY` at all.
    const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
    const sealer = new AesGcmSecretSealer(keyring);
    const result = await runCustomCredentialUsernameBackfill({ db, sealer, keyring }, { apply: false });
    console.log(
      `DRY RUN: ${result.migrated} row(s) pending (username NULL), ${result.skippedAlreadyMigrated} already migrated, ${result.total} total. Re-run with --apply to write.`
    );
    return;
  }

  const pending = countPending(db);
  if (pending === 0) {
    console.log("Nothing to migrate — every custom_credential_sets row already has a username column value (or genuinely has none to backfill).");
    return;
  }

  const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const sealer = new AesGcmSecretSealer(keyring);

  const dbOps = new SqliteDbOpsAdapter({ db, filePath: args.dbPath });
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
