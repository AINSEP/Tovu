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
 * The dry-run/`--apply` split, restore-point capture, and per-blob seal-verify-write loop live in
 * `aad-backfill-runner.ts`, shared with the other five `backfill-*-aad.ts` scripts — this file keeps
 * only what's genuinely specific to `external_mcp_servers`: its two-blobs-per-row identity shape,
 * both AAD builders, and its own column writes.
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

import { externalMcpServers } from "../../apps/website/src/platform/db/schema.js";
import type { ContentDb } from "../../apps/website/src/platform/db/sqlite/content-db.js";
import { buildExternalMcpEnvAad, buildExternalMcpOAuthAad, EXTERNAL_MCP_AAD_VERSION } from "../../apps/website/src/assistant/external-mcp-aad.js";

import {
  runAadBackfill,
  runAadBackfillMain,
  type AadBackfillDeps,
  type AadBackfillMainMessages,
  type AadBackfillResult,
  type AadBackfillUnit,
  type SealedColumns,
} from "./aad-backfill-runner.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
// Deliberately a path this repo never creates, matching the five sibling backfill-*-aad.ts scripts:
// omitting --db must fail loudly rather than re-seal whatever live site database this checkout
// happens to contain. See backfill-db-path.ts's header for the false all-clear the guard prevents.
const DEFAULT_DB_PATH = path.join(REPO_ROOT, "infra", "content.db");

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

/** @complexity O(n) in the pending blob count. */
function loadPendingUnits(db: ContentDb): AadBackfillUnit[] {
  return loadPendingBlobs(db).map((blob) => {
    const identity = { workspaceId: blob.workspaceId, serverId: blob.serverId };
    const where = and(eq(externalMcpServers.workspaceId, blob.workspaceId), eq(externalMcpServers.serverId, blob.serverId));
    return {
      label: `workspace=${blob.workspaceId} server=${blob.serverId} slot=${blob.slot}`,
      sealed: blob.sealed,
      buildAad: () => (blob.slot === "env" ? buildExternalMcpEnvAad(identity) : buildExternalMcpOAuthAad(identity)),
      // Each slot's CAS predicate is its OWN version column, not a shared one. The two blobs are
      // independent secret classes with independent versions (see this file's header), so an env
      // migration must not be invalidated by an oauth rotation, or vice versa — pairing `where` with
      // the wrong column would abort correct work and let the racy write through.
      write: (sealed) => {
        if (blob.slot === "env") {
          return db
            .update(externalMcpServers)
            .set({
              sealedKeyId: sealed.keyId,
              sealedCiphertext: sealed.ciphertext,
              sealedNonce: sealed.nonce,
              sealedAlg: sealed.alg,
              aadVersion: EXTERNAL_MCP_AAD_VERSION,
            })
            .where(and(where, eq(externalMcpServers.aadVersion, 0)))
            .run().changes;
        }
        return db
          .update(externalMcpServers)
          .set({
            oauthSealedKeyId: sealed.keyId,
            oauthSealedCiphertext: sealed.ciphertext,
            oauthSealedNonce: sealed.nonce,
            oauthSealedAlg: sealed.alg,
            oauthAadVersion: EXTERNAL_MCP_AAD_VERSION,
          })
          .where(and(where, eq(externalMcpServers.oauthAadVersion, 0)))
          .run().changes;
      },
    };
  });
}

/**
 * The dry-run line (unlike the MIGRATED line) names the target column, which is slot-dependent —
 * `label` always ends in `slot=env` or `slot=oauth` (see `loadPendingUnits`' own label format
 * immediately above), so this recovers `blob.slot` from the one place the shared message interface
 * still has it by the time this runs. Kept local to this file, matching the original script's own
 * `blob.slot === "env" ? "aad_version" : "oauth_aad_version"` ternary one-for-one.
 */
function targetVersionColumn(label: string): "aad_version" | "oauth_aad_version" {
  return label.endsWith("slot=env") ? "aad_version" : "oauth_aad_version";
}

const messages: AadBackfillMainMessages = {
  found: (count) => `Found ${count} sealed blob(s) at version 0 to migrate.`,
  dryRunUnit: (label) => `DRY RUN: would migrate ${label} -> ${targetVersionColumn(label)}=${EXTERNAL_MCP_AAD_VERSION}`,
  migratedUnit: (label) => `MIGRATED: ${label}`,
  mismatch: (label) =>
    `external-mcp AAD backfill: post-seal verification mismatch for ${label} — refusing to write a blob that cannot be proven to re-open correctly`,
  dryRunSummary: (result) =>
    `DRY RUN: ${result.migrated} blob(s) would be migrated, ${result.total} total pending. Re-run with --apply to write.`,
  nothingToMigrate: () => "Nothing to migrate — every external_mcp_servers sealed blob already carries a bound AAD.",
  done: (result) => `Done: ${result.migrated} blob(s) migrated, ${result.total} total pending.`,
};

export interface ExternalMcpAadBackfillDeps extends AadBackfillDeps {}
export interface ExternalMcpAadBackfillResult extends AadBackfillResult {}

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
  return runAadBackfill(deps, opts, { loadPending: loadPendingUnits, messages });
}

async function main(): Promise<void> {
  await runAadBackfillMain(process.argv.slice(2), {
    defaultDbPath: DEFAULT_DB_PATH,
    restorePointScopeId: "backfill-external-mcp-aad",
    loadPending: loadPendingUnits,
    messages,
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
