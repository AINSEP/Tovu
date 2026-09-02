/**
 * @file Flips every `composio_config` row still at `aad_version = 0` (sealed with NO additional
 * authenticated data — every row written before the 2026-09-02 AAD gap closure) to `aad_version =
 * 1`, re-sealing the SAME decrypted plaintext under `platform/connectors/composio-config-aad.ts`'s
 * `buildComposioConfigAad({workspaceId})`.
 *
 * Same design as `backfill-media-provider-credential-aad.ts` (see that script's own header for the
 * full "why not plain SQL", "in-place re-seal, not a new table", and dry-run/`--apply`/restore-point
 * safety story — repeated here only where this table's own shape differs):
 *
 * - `composio_config` is single-row-per-workspace (`workspace_id` the bare primary key), so a
 *   "pending" row is simply `aad_version = 0 AND sealed_key_id IS NOT NULL`, matched by workspace id
 *   alone rather than a composite key.
 * - Only `sealed_*`/`aad_version` are rewritten — `key_tail`, `auth_config_ids`, and `key_generation`
 *   (`ComposioConfigStore`'s own compare-and-swap counter) are left exactly as they were. This
 *   script never bumps `key_generation`: the key's plaintext identity did not change, only its
 *   ciphertext's AAD binding did, so any auth-config ids provisioned under the current generation
 *   remain valid after this script runs.
 *
 * Idempotent and resumable per row — each row is written the instant it is verified, so a crash
 * mid-run leaves every already-migrated row at `aad_version = 1` and every other row untouched,
 * exactly as documented in `backfill-media-provider-credential-aad.ts`'s own header.
 *
 * ## Usage
 *
 *   npx tsx development/scripts/backfill-composio-config-aad.ts                (dry run)
 *   npx tsx development/scripts/backfill-composio-config-aad.ts --apply
 *   npx tsx development/scripts/backfill-composio-config-aad.ts --db <path> --apply
 *
 * `--apply` requires `TOVU_INTEGRATIONS_ROOT_KEY` set to the SAME root key the live server uses. A
 * dry run never touches the keyring.
 *
 * Exit codes: `0` on success (including "nothing to do"); `1` if any row fails to decrypt, fails its
 * post-seal verification, or the process otherwise throws.
 */
import path from "node:path";

import { eq } from "drizzle-orm";

import { openContentDb, type ContentDb } from "../../apps/website/src/platform/db/sqlite/content-db.js";
import { SqliteDbOpsAdapter } from "../../apps/website/src/platform/db/sqlite/db-ops.js";
import { composioConfig } from "../../apps/website/src/platform/db/schema.js";
import { AesGcmSecretSealer } from "../../apps/website/src/features/webhooks/secret-sealer.aesgcm.js";
import { EnvOrFileKeyring } from "../../apps/website/src/features/webhooks/keyring.env.js";
import type { KeyringPort, SecretSealerPort } from "../../apps/website/src/features/webhooks/index.js";
import { buildComposioConfigAad } from "../../apps/website/src/platform/connectors/composio-config-aad.js";

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
  readonly sealed: { keyId: string; ciphertext: string; nonce: string; alg: string };
}

/** Every row still at `aad_version = 0` with an actual key to re-seal. Re-queried fresh on every
 *  call, never cached — see `backfill-media-provider-credential-aad.ts`'s identical rationale. */
function loadPendingRows(db: ContentDb): PendingRow[] {
  return db
    .select()
    .from(composioConfig)
    .all()
    .filter((row) => row.aadVersion === 0 && row.sealedKeyId !== null)
    .map((row) => ({
      workspaceId: row.workspaceId,
      sealed: { keyId: row.sealedKeyId!, ciphertext: row.sealedCiphertext!, nonce: row.sealedNonce!, alg: row.sealedAlg! },
    }));
}

export interface ComposioConfigAadBackfillDeps {
  readonly db: ContentDb;
  readonly sealer: SecretSealerPort;
  readonly keyring: KeyringPort;
  readonly log?: (message: string) => void;
}

export interface ComposioConfigAadBackfillResult {
  readonly migrated: number;
  readonly total: number;
}

/**
 * The core per-row upgrade — see this file's header. `opts.apply === false` never touches the
 * sealer/keyring; `opts.apply === true` decrypts under no aad, re-seals under the derived aad,
 * self-verifies, and writes ONLY `sealed_*`/`aad_version`, one row at a time.
 *
 * @throws Propagates a decrypt/seal/keyring failure, or this function's own post-seal verification
 *   mismatch — always BEFORE any write for the row that failed.
 * @complexity O(n) in the pending row count.
 */
export async function runComposioConfigAadBackfill(
  deps: ComposioConfigAadBackfillDeps,
  opts: { apply: boolean }
): Promise<ComposioConfigAadBackfillResult> {
  const log = deps.log ?? ((message: string) => console.log(message));
  const pending = loadPendingRows(deps.db);
  log(`Found ${pending.length} row(s) at aad_version=0 with a key to migrate.`);

  let migrated = 0;
  for (const row of pending) {
    if (!opts.apply) {
      migrated += 1;
      log(`DRY RUN: would migrate workspace=${row.workspaceId} -> aad_version=1`);
      continue;
    }

    const plaintext = await deps.sealer.open({ sealed: row.sealed });
    const aad = buildComposioConfigAad({ workspaceId: row.workspaceId });
    const activeKey = await deps.keyring.activeKey();
    const sealed = await deps.sealer.seal({ plaintext, key: activeKey, aad });

    const verifyPlaintext = await deps.sealer.open({ sealed, aad });
    if (verifyPlaintext !== plaintext) {
      throw new Error(
        `composio-config AAD backfill: post-seal verification mismatch for workspace=${row.workspaceId} — refusing to write a row that cannot be proven to re-open correctly`
      );
    }

    deps.db
      .update(composioConfig)
      .set({
        sealedKeyId: sealed.keyId,
        sealedCiphertext: sealed.ciphertext,
        sealedNonce: sealed.nonce,
        sealedAlg: sealed.alg,
        aadVersion: 1,
      })
      .where(eq(composioConfig.workspaceId, row.workspaceId))
      .run();

    migrated += 1;
    log(`MIGRATED: workspace=${row.workspaceId} -> aad_version=1`);
  }

  return { migrated, total: pending.length };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const db = openContentDb(args.dbPath);
  const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const sealer = new AesGcmSecretSealer(keyring);

  if (!args.apply) {
    const result = await runComposioConfigAadBackfill({ db, sealer, keyring }, { apply: false });
    console.log(`DRY RUN: ${result.migrated} row(s) would be migrated, ${result.total} total pending. Re-run with --apply to write.`);
    return;
  }

  const pendingCount = loadPendingRows(db).length;
  if (pendingCount === 0) {
    console.log("Nothing to migrate — every composio_config row with a key already carries aad_version=1.");
    return;
  }

  const dbOps = new SqliteDbOpsAdapter({ db, filePath: args.dbPath });
  const restorePoint = await dbOps.captureRestorePoint({ scopeId: "backfill-composio-config-aad" });
  console.log(`RESTORE POINT CAPTURED: artifactRef='${restorePoint.artifactRef}' watermarkAtCapture=${restorePoint.watermarkAtCapture}`);

  const result = await runComposioConfigAadBackfill({ db, sealer, keyring }, { apply: true });
  console.log(`Done: ${result.migrated} row(s) migrated, ${result.total} total pending.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
