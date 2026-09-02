/**
 * @file Flips every `media_provider_credentials` row still at `aad_version = 0` (sealed with NO
 * additional authenticated data — every row written before the 2026-09-02 AAD gap closure) to
 * `aad_version = 1`, re-sealing the SAME decrypted plaintext under `features/media/aad.ts`'s
 * `buildMediaProviderCredentialAad({workspaceId, providerId})`.
 *
 * ## Why this cannot be a plain `.sql` migration
 *
 * `sealed_ciphertext` is AES-256-GCM; the additional authenticated data (AAD) bound into a row's
 * auth tag is DERIVED, never stored (`features/webhooks/secret-sealer.aesgcm.ts`'s own file header).
 * A legacy row's ciphertext auth tag only verifies under NO aad — starting to pass one on `open()`
 * without first re-sealing would make every existing row permanently unopenable. SQL cannot decrypt
 * or re-encrypt a GCM ciphertext; only application code holding the real root key can. This script
 * is that application code.
 *
 * ## IN-PLACE re-seal, not a migrate-to-a-new-table (unlike `backfill-vendor-credentials.ts`)
 *
 * `media_provider_credentials` is not moving tables — this script updates each pending row's own
 * `sealed_*`/`aad_version` columns, leaving `(workspace_id, provider_id)`, `base_url`, `model`, and
 * `key_tail` untouched. Every reader (`getMediaProviderCredentials`, `resolveMediaProviderCredential`,
 * the admin route) keeps reading the SAME table throughout — there is no cutover step, only a
 * per-row AAD upgrade.
 *
 * ## Safety
 *
 * Dry-run by default; `--apply` is required to write, and even then only after a restore point is
 * captured (`SqliteDbOpsAdapter`) — skipped entirely when there is nothing pending, matching
 * `backfill-vendor-credentials.ts`'s own posture.
 *
 * Idempotent and resumable, per row: each row is updated the instant it is verified (not batched),
 * so a crash or `Ctrl-C` mid-run leaves every already-updated row at `aad_version = 1` (done) and
 * every not-yet-reached row at `aad_version = 0` (still pending, exactly as it was) — a re-run picks
 * up exactly where the last one stopped, because the pending set is re-queried fresh (`aad_version =
 * 0 AND sealed_key_id IS NOT NULL`), never assumed from a prior run's own bookkeeping.
 *
 * Post-seal self-check: immediately after re-sealing a row and BEFORE writing it, this script opens
 * its own freshly-sealed ciphertext back with the exact same new AAD and asserts the decrypted
 * plaintext is byte-identical to what was decrypted from the OLD row. A row that fails this check is
 * never written — the difference between "the row was touched" and "the row is provably still
 * openable", which is the whole point of this script.
 *
 * A row with `sealed_key_id IS NULL` (no key ever saved — `MediaProviderCredentialRecord.sealed`'s
 * own doc: "a row may legitimately hold only `baseUrl`/`model` with no key yet") has nothing to
 * re-seal and is left at `aad_version = 0` (harmless — nothing ever reads that column when
 * `sealed_ciphertext` is `NULL`).
 *
 * ## Usage
 *
 *   npx tsx development/scripts/backfill-media-provider-credential-aad.ts                (dry run)
 *   npx tsx development/scripts/backfill-media-provider-credential-aad.ts --apply
 *   npx tsx development/scripts/backfill-media-provider-credential-aad.ts --db <path> --apply
 *
 * `--apply` requires `TOVU_INTEGRATIONS_ROOT_KEY` to be set to the SAME root key the live server
 * uses (`EnvOrFileKeyring({ allowFileFallback: false })`, identical construction to
 * `server/deps.ts`'s real keyring). A dry run never touches the keyring at all, so it needs no env
 * var.
 *
 * Exit codes: `0` on success (including "nothing to do"); `1` if any row fails to decrypt, fails its
 * post-seal verification, or the process otherwise throws — this script never partially writes a row
 * it cannot prove round-trips.
 */
import path from "node:path";

import { resolveExistingDbPath } from "./backfill-db-path.js";

import { and, eq } from "drizzle-orm";

import { openContentDb, type ContentDb } from "../../apps/website/src/platform/db/sqlite/content-db.js";
import { SqliteDbOpsAdapter } from "../../apps/website/src/platform/db/sqlite/db-ops.js";
import { mediaProviderCredentials } from "../../apps/website/src/platform/db/schema.js";
import { AesGcmSecretSealer } from "../../apps/website/src/features/webhooks/secret-sealer.aesgcm.js";
import { EnvOrFileKeyring } from "../../apps/website/src/features/webhooks/keyring.env.js";
import type { KeyringPort, SecretSealerPort } from "../../apps/website/src/features/webhooks/index.js";
import { buildMediaProviderCredentialAad } from "../../apps/website/src/features/media/aad.js";

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

interface PendingRow {
  readonly workspaceId: string;
  readonly providerId: string;
  readonly sealed: { keyId: string; ciphertext: string; nonce: string; alg: string };
}

/** Every row still at `aad_version = 0` with an actual key to re-seal — rows with no key at all
 *  (`sealed_key_id IS NULL`) have nothing for this script to do. Re-queried fresh on every call
 *  (never cached across a run), which is what makes a re-run after a crash pick up exactly where the
 *  last one stopped (this file's own header). */
function loadPendingRows(db: ContentDb): PendingRow[] {
  return db
    .select()
    .from(mediaProviderCredentials)
    .all()
    .filter((row) => row.aadVersion === 0 && row.sealedKeyId !== null)
    .map((row) => ({
      workspaceId: row.workspaceId,
      providerId: row.providerId,
      sealed: { keyId: row.sealedKeyId!, ciphertext: row.sealedCiphertext!, nonce: row.sealedNonce!, alg: row.sealedAlg! },
    }));
}

export interface MediaProviderCredentialAadBackfillDeps {
  readonly db: ContentDb;
  readonly sealer: SecretSealerPort;
  readonly keyring: KeyringPort;
  /** Defaults to `console.log`. Injected so callers (tests, `main()`) can capture or silence
   *  progress output without this function knowing anything about where it goes. */
  readonly log?: (message: string) => void;
}

export interface MediaProviderCredentialAadBackfillResult {
  readonly migrated: number;
  readonly total: number;
}

/**
 * The core per-row upgrade — see this file's header for the full design. `opts.apply === false`
 * NEVER touches `deps.sealer`/`deps.keyring` (it only reads and reports what it would do);
 * `opts.apply === true` decrypts under no aad, re-seals under the derived aad, self-verifies, and
 * writes one row at a time.
 *
 * @throws Propagates whatever `deps.sealer.open`/`deps.sealer.seal`/`deps.keyring.activeKey()`
 *   throws, or this function's own post-seal verification mismatch — always BEFORE any write for the
 *   row that failed, and never swallowed into a partial or best-guess result.
 * @complexity O(n) in the pending row count — one decrypt, one re-seal, one verify-open, and one
 *   update per row; no nested iteration.
 */
export async function runMediaProviderCredentialAadBackfill(
  deps: MediaProviderCredentialAadBackfillDeps,
  opts: { apply: boolean }
): Promise<MediaProviderCredentialAadBackfillResult> {
  const log = deps.log ?? ((message: string) => console.log(message));
  const pending = loadPendingRows(deps.db);
  log(`Found ${pending.length} row(s) at aad_version=0 with a key to migrate.`);

  let migrated = 0;
  for (const row of pending) {
    if (!opts.apply) {
      migrated += 1;
      log(`DRY RUN: would migrate workspace=${row.workspaceId} provider=${row.providerId} -> aad_version=1`);
      continue;
    }

    const plaintext = await deps.sealer.open({ sealed: row.sealed });
    const aad = buildMediaProviderCredentialAad({ workspaceId: row.workspaceId, providerId: row.providerId });
    const activeKey = await deps.keyring.activeKey();
    const sealed = await deps.sealer.seal({ plaintext, key: activeKey, aad });

    // Post-seal self-check (this file's own header) — never write a row this process cannot itself
    // prove re-opens to the exact plaintext it just sealed.
    const verifyPlaintext = await deps.sealer.open({ sealed, aad });
    if (verifyPlaintext !== plaintext) {
      throw new Error(
        `media-provider-credential AAD backfill: post-seal verification mismatch for workspace=${row.workspaceId} provider=${row.providerId} — refusing to write a row that cannot be proven to re-open correctly`
      );
    }

    deps.db
      .update(mediaProviderCredentials)
      .set({
        sealedKeyId: sealed.keyId,
        sealedCiphertext: sealed.ciphertext,
        sealedNonce: sealed.nonce,
        sealedAlg: sealed.alg,
        aadVersion: 1,
      })
      .where(and(eq(mediaProviderCredentials.workspaceId, row.workspaceId), eq(mediaProviderCredentials.providerId, row.providerId)))
      .run();

    migrated += 1;
    log(`MIGRATED: workspace=${row.workspaceId} provider=${row.providerId} -> aad_version=1`);
  }

  return { migrated, total: pending.length };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // Prove the database is really there BEFORE opening it: `openContentDb` creates and
  // migrates on open, so a wrong path would otherwise yield an empty db and a false all-clear.
  const dbPath = resolveExistingDbPath(args.dbPath);
  const db = openContentDb(dbPath);
  // Constructed unconditionally but touches no env var until `sealer.open`/`sealer.seal` is actually
  // called — a dry run below never calls either, so a dry run needs no `TOVU_INTEGRATIONS_ROOT_KEY`.
  const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const sealer = new AesGcmSecretSealer(keyring);

  if (!args.apply) {
    const result = await runMediaProviderCredentialAadBackfill({ db, sealer, keyring }, { apply: false });
    console.log(`DRY RUN: ${result.migrated} row(s) would be migrated, ${result.total} total pending. Re-run with --apply to write.`);
    return;
  }

  const pendingCount = loadPendingRows(db).length;
  if (pendingCount === 0) {
    console.log("Nothing to migrate — every media_provider_credentials row with a key already carries aad_version=1.");
    return;
  }

  const dbOps = new SqliteDbOpsAdapter({ db, filePath: dbPath });
  const restorePoint = await dbOps.captureRestorePoint({ scopeId: "backfill-media-provider-credential-aad" });
  console.log(`RESTORE POINT CAPTURED: artifactRef='${restorePoint.artifactRef}' watermarkAtCapture=${restorePoint.watermarkAtCapture}`);

  const result = await runMediaProviderCredentialAadBackfill({ db, sealer, keyring }, { apply: true });
  console.log(`Done: ${result.migrated} row(s) migrated, ${result.total} total pending.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
