/**
 * @file Binds AAD to every `external_mcp_servers` row's sealed blobs, re-sealing the SAME decrypted
 * plaintext under `assistant/external-mcp-aad.ts`'s builders.
 *
 * Same design as `backfill-execution-credential-aad.ts` (see that script's header for the full
 * "why not plain SQL", "in-place re-seal, not a new table", and dry-run/`--apply`/restore-point
 * safety story). This table's shape differences, both load-bearing:
 *
 * 1. **Two independent sealed blobs per row.** `sealed_*` (the env block) and `oauth_sealed_*`
 *    (`{clientSecret?, tokens?}`) are different secret classes written by different flows, carry
 *    different AAD, and have their own version columns. Each is migrated independently: a row may
 *    legitimately have one blob to migrate and not the other, or neither.
 * 2. **The table was not in `ffb5ce44`'s five** — it had no `aad_version` column at all until
 *    migration `0056_redundant_killraven`, so unlike its siblings there was nothing to backfill
 *    *to* before that migration is applied.
 *
 * Everything else on the row (`transport`, `auth_mode`, `env_names`, `oauth_*` metadata, the
 * write-grant attribution columns) is left untouched.
 *
 * ## Usage
 *
 *   npx tsx development/scripts/backfill-external-mcp-aad.ts --db <path>            (dry run)
 *   npx tsx development/scripts/backfill-external-mcp-aad.ts --db <path> --apply
 *
 * `--apply` requires `TOVU_INTEGRATIONS_ROOT_KEY` set to the SAME root key the live server uses. A
 * dry run never touches the keyring.
 *
 * Exit codes: `0` on success (including "nothing to do"); `1` if any blob fails to decrypt, fails
 * its post-seal verification, or the process otherwise throws.
 */
import path from "node:path";

import { and, eq } from "drizzle-orm";

import { resolveExistingDbPath } from "./backfill-db-path.js";
import { openContentDb, type ContentDb } from "../../apps/website/src/platform/db/sqlite/content-db.js";
import { SqliteDbOpsAdapter } from "../../apps/website/src/platform/db/sqlite/db-ops.js";
import { externalMcpServers } from "../../apps/website/src/platform/db/schema.js";
import { AesGcmSecretSealer } from "../../apps/website/src/features/webhooks/secret-sealer.aesgcm.js";
import { EnvOrFileKeyring } from "../../apps/website/src/features/webhooks/keyring.env.js";
import type { KeyringPort, SecretSealerPort } from "../../apps/website/src/features/webhooks/index.js";
import {
  buildExternalMcpEnvAad,
  buildExternalMcpOAuthAad,
  EXTERNAL_MCP_AAD_VERSION,
} from "../../apps/website/src/assistant/external-mcp-aad.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

interface Args {
  readonly dbPath: string;
  readonly apply: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const dbFlag = argv.indexOf("--db");
  return {
    dbPath: dbFlag === -1 ? path.join(REPO_ROOT, "sites", "tovu-com", "content.db") : path.resolve(argv[dbFlag + 1]!),
    apply: argv.includes("--apply"),
  };
}

interface SealedColumns {
  readonly keyId: string;
  readonly ciphertext: string;
  readonly nonce: string;
  readonly alg: string;
}

/** One blob needing migration. `slot` selects which column family and which AAD builder applies. */
interface PendingBlob {
  readonly workspaceId: string;
  readonly serverId: string;
  readonly slot: "env" | "oauth";
  readonly sealed: SealedColumns;
}

function loadPendingBlobs(db: ContentDb): PendingBlob[] {
  const pending: PendingBlob[] = [];
  for (const row of db.select().from(externalMcpServers).all()) {
    if (row.aadVersion === 0 && row.sealedKeyId !== null) {
      pending.push({
        workspaceId: row.workspaceId,
        serverId: row.serverId,
        slot: "env",
        sealed: { keyId: row.sealedKeyId, ciphertext: row.sealedCiphertext!, nonce: row.sealedNonce!, alg: row.sealedAlg! },
      });
    }
    if (row.oauthAadVersion === 0 && row.oauthSealedKeyId !== null) {
      pending.push({
        workspaceId: row.workspaceId,
        serverId: row.serverId,
        slot: "oauth",
        sealed: {
          keyId: row.oauthSealedKeyId,
          ciphertext: row.oauthSealedCiphertext!,
          nonce: row.oauthSealedNonce!,
          alg: row.oauthSealedAlg!,
        },
      });
    }
  }
  return pending;
}

export interface ExternalMcpAadBackfillDeps {
  readonly db: ContentDb;
  readonly sealer: SecretSealerPort;
  readonly keyring: KeyringPort;
  readonly log?: (message: string) => void;
}

export interface ExternalMcpAadBackfillResult {
  readonly migrated: number;
  readonly total: number;
}

/**
 * The core per-blob upgrade — see this file's header. `opts.apply === false` never touches the
 * sealer/keyring; `opts.apply === true` decrypts under no aad, re-seals under this blob's own
 * derived aad, self-verifies, and writes ONLY that blob's `sealed_*`/version columns, one blob at
 * a time so a crash leaves every already-migrated blob correct.
 *
 * @throws Propagates a decrypt/seal/keyring failure, or this function's own post-seal verification
 *   mismatch — always BEFORE any write for the blob that failed.
 * @complexity O(n) in the pending blob count.
 */
export async function runExternalMcpAadBackfill(
  deps: ExternalMcpAadBackfillDeps,
  opts: { apply: boolean }
): Promise<ExternalMcpAadBackfillResult> {
  const log = deps.log ?? ((message: string) => console.log(message));
  const pending = loadPendingBlobs(deps.db);
  log(`Found ${pending.length} sealed blob(s) at version 0 to migrate.`);

  let migrated = 0;
  for (const blob of pending) {
    const label = `workspace=${blob.workspaceId} server=${blob.serverId} slot=${blob.slot}`;
    if (!opts.apply) {
      migrated += 1;
      log(`DRY RUN: would migrate ${label} -> ${blob.slot === "env" ? "aad_version" : "oauth_aad_version"}=${EXTERNAL_MCP_AAD_VERSION}`);
      continue;
    }

    const plaintext = await deps.sealer.open({ sealed: blob.sealed });
    const identity = { workspaceId: blob.workspaceId, serverId: blob.serverId };
    const aad = blob.slot === "env" ? buildExternalMcpEnvAad(identity) : buildExternalMcpOAuthAad(identity);
    const activeKey = await deps.keyring.activeKey();
    const sealed = await deps.sealer.seal({ plaintext, key: activeKey, aad });

    const verifyPlaintext = await deps.sealer.open({ sealed, aad });
    if (verifyPlaintext !== plaintext) {
      throw new Error(
        `external-mcp AAD backfill: post-seal verification mismatch for ${label} — refusing to write a blob that cannot be proven to re-open correctly`
      );
    }

    const where = and(
      eq(externalMcpServers.workspaceId, blob.workspaceId),
      eq(externalMcpServers.serverId, blob.serverId)
    );
    if (blob.slot === "env") {
      deps.db
        .update(externalMcpServers)
        .set({
          sealedKeyId: sealed.keyId,
          sealedCiphertext: sealed.ciphertext,
          sealedNonce: sealed.nonce,
          sealedAlg: sealed.alg,
          aadVersion: EXTERNAL_MCP_AAD_VERSION,
        })
        .where(where)
        .run();
    } else {
      deps.db
        .update(externalMcpServers)
        .set({
          oauthSealedKeyId: sealed.keyId,
          oauthSealedCiphertext: sealed.ciphertext,
          oauthSealedNonce: sealed.nonce,
          oauthSealedAlg: sealed.alg,
          oauthAadVersion: EXTERNAL_MCP_AAD_VERSION,
        })
        .where(where)
        .run();
    }

    migrated += 1;
    log(`MIGRATED: ${label}`);
  }

  return { migrated, total: pending.length };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // Prove the database is really there BEFORE opening it: `openContentDb` creates and
  // migrates on open, so a wrong path would otherwise yield an empty db and a false all-clear.
  const dbPath = resolveExistingDbPath(args.dbPath);
  const db = openContentDb(dbPath);
  const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const sealer = new AesGcmSecretSealer(keyring);

  if (!args.apply) {
    const result = await runExternalMcpAadBackfill({ db, sealer, keyring }, { apply: false });
    console.log(`DRY RUN: ${result.migrated} blob(s) would be migrated, ${result.total} total pending. Re-run with --apply to write.`);
    return;
  }

  const pendingCount = loadPendingBlobs(db).length;
  if (pendingCount === 0) {
    console.log("Nothing to migrate — every external_mcp_servers sealed blob already carries a bound AAD.");
    return;
  }

  const dbOps = new SqliteDbOpsAdapter({ db, filePath: dbPath });
  const restorePoint = await dbOps.captureRestorePoint({ scopeId: "backfill-external-mcp-aad" });
  console.log(`RESTORE POINT CAPTURED: artifactRef='${restorePoint.artifactRef}' watermarkAtCapture=${restorePoint.watermarkAtCapture}`);

  const result = await runExternalMcpAadBackfill({ db, sealer, keyring }, { apply: true });
  console.log(`Done: ${result.migrated} blob(s) migrated, ${result.total} total pending.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
