/**
 * @file Flips every `composio_connector_credentials` row still at `aad_version = 0` (sealed with NO
 * additional authenticated data — every row written before the 2026-09-02 AAD gap closure) to
 * `aad_version = 1`, re-sealing the SAME decrypted credentials JSON under
 * `platform/connectors/connector-credential-aad.ts`'s `buildConnectorCredentialAad({workspaceId,
 * connectorId})`.
 *
 * Same design as `backfill-media-provider-credential-aad.ts` (see that script's own header for the
 * full "why not plain SQL", "in-place re-seal, not a new table", and dry-run/`--apply`/restore-point
 * safety story). This table's own shape difference: the composite key is `(workspace_id,
 * connector_id)`, matching `backfill-connector-credential-aad.ts`'s sibling for
 * `composio_connector_credentials`'s own primary key, not a bare `workspace_id`.
 *
 * `account_label` is left untouched — it was never sealed (`db/schema.ts`'s
 * `composioConnectorCredentials` doc: "the only part held in the clear").
 *
 * ## Usage
 *
 *   npx tsx development/scripts/backfill-connector-credential-aad.ts                (dry run)
 *   npx tsx development/scripts/backfill-connector-credential-aad.ts --apply
 *   npx tsx development/scripts/backfill-connector-credential-aad.ts --db <path> --apply
 *
 * `--apply` requires `TOVU_INTEGRATIONS_ROOT_KEY` set to the SAME root key the live server uses. A
 * dry run never touches the keyring.
 *
 * Exit codes: `0` on success (including "nothing to do"); `1` if any row fails to decrypt, fails its
 * post-seal verification, or the process otherwise throws.
 */
import path from "node:path";

import { resolveExistingDbPath } from "./backfill-db-path.js";

import { and, eq } from "drizzle-orm";

import { openContentDb, openContentDbReadOnly, type ContentDb } from "../../apps/website/src/platform/db/sqlite/content-db.js";
import { SqliteDbOpsAdapter } from "../../apps/website/src/platform/db/sqlite/db-ops.js";
import { composioConnectorCredentials } from "../../apps/website/src/platform/db/schema.js";
import { AesGcmSecretSealer } from "../../apps/website/src/features/webhooks/secret-sealer.aesgcm.js";
import { EnvOrFileKeyring } from "../../apps/website/src/features/webhooks/keyring.env.js";
import type { KeyringPort, SecretSealerPort } from "../../apps/website/src/features/webhooks/index.js";
import { buildConnectorCredentialAad } from "../../apps/website/src/platform/connectors/connector-credential-aad.js";

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
  readonly connectorId: string;
  readonly sealed: { keyId: string; ciphertext: string; nonce: string; alg: string };
}

function loadPendingRows(db: ContentDb): PendingRow[] {
  return db
    .select()
    .from(composioConnectorCredentials)
    .all()
    .filter((row) => row.aadVersion === 0 && row.sealedKeyId !== null)
    .map((row) => ({
      workspaceId: row.workspaceId,
      connectorId: row.connectorId,
      sealed: { keyId: row.sealedKeyId!, ciphertext: row.sealedCiphertext!, nonce: row.sealedNonce!, alg: row.sealedAlg! },
    }));
}

export interface ConnectorCredentialAadBackfillDeps {
  readonly db: ContentDb;
  readonly sealer: SecretSealerPort;
  readonly keyring: KeyringPort;
  readonly log?: (message: string) => void;
}

export interface ConnectorCredentialAadBackfillResult {
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
export async function runConnectorCredentialAadBackfill(
  deps: ConnectorCredentialAadBackfillDeps,
  opts: { apply: boolean }
): Promise<ConnectorCredentialAadBackfillResult> {
  const log = deps.log ?? ((message: string) => console.log(message));
  const pending = loadPendingRows(deps.db);
  log(`Found ${pending.length} row(s) at aad_version=0 with credentials to migrate.`);

  let migrated = 0;
  for (const row of pending) {
    if (!opts.apply) {
      migrated += 1;
      log(`DRY RUN: would migrate workspace=${row.workspaceId} connector=${row.connectorId} -> aad_version=1`);
      continue;
    }

    const plaintext = await deps.sealer.open({ sealed: row.sealed });
    const aad = buildConnectorCredentialAad({ workspaceId: row.workspaceId, connectorId: row.connectorId });
    const activeKey = await deps.keyring.activeKey();
    const sealed = await deps.sealer.seal({ plaintext, key: activeKey, aad });

    const verifyPlaintext = await deps.sealer.open({ sealed, aad });
    if (verifyPlaintext !== plaintext) {
      throw new Error(
        `connector-credential AAD backfill: post-seal verification mismatch for workspace=${row.workspaceId} connector=${row.connectorId} — refusing to write a row that cannot be proven to re-open correctly`
      );
    }

    deps.db
      .update(composioConnectorCredentials)
      .set({
        sealedKeyId: sealed.keyId,
        sealedCiphertext: sealed.ciphertext,
        sealedNonce: sealed.nonce,
        sealedAlg: sealed.alg,
        aadVersion: 1,
      })
      .where(and(eq(composioConnectorCredentials.workspaceId, row.workspaceId), eq(composioConnectorCredentials.connectorId, row.connectorId)))
      .run();

    migrated += 1;
    log(`MIGRATED: workspace=${row.workspaceId} connector=${row.connectorId} -> aad_version=1`);
  }

  return { migrated, total: pending.length };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // Prove the database is really there BEFORE opening it: `openContentDb` creates and
  // migrates on open, so a wrong path would otherwise yield an empty db and a false all-clear.
  const dbPath = resolveExistingDbPath(args.dbPath);

  if (!args.apply) {
    // Read-only open: a dry run must never migrate or write the bootstrap watermark row (this
    // file's own header, "Safety" — deferred to `backfill-media-provider-credential-aad.ts`).
    const db = openContentDbReadOnly(dbPath);
    const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
    const sealer = new AesGcmSecretSealer(keyring);
    const result = await runConnectorCredentialAadBackfill({ db, sealer, keyring }, { apply: false });
    console.log(`DRY RUN: ${result.migrated} row(s) would be migrated, ${result.total} total pending. Re-run with --apply to write.`);
    return;
  }

  const db = openContentDb(dbPath);
  const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const sealer = new AesGcmSecretSealer(keyring);

  const pendingCount = loadPendingRows(db).length;
  if (pendingCount === 0) {
    console.log("Nothing to migrate — every composio_connector_credentials row with credentials already carries aad_version=1.");
    return;
  }

  const dbOps = new SqliteDbOpsAdapter({ db, filePath: dbPath });
  const restorePoint = await dbOps.captureRestorePoint({ scopeId: "backfill-connector-credential-aad" });
  console.log(`RESTORE POINT CAPTURED: artifactRef='${restorePoint.artifactRef}' watermarkAtCapture=${restorePoint.watermarkAtCapture}`);

  const result = await runConnectorCredentialAadBackfill({ db, sealer, keyring }, { apply: true });
  console.log(`Done: ${result.migrated} row(s) migrated, ${result.total} total pending.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
