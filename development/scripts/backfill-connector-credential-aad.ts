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
 * `account_label` is left untouched — it was never sealed (`db/schema.sqlite.ts`'s
 * `composioConnectorCredentials` doc: "the only part held in the clear").
 *
 * The dry-run/`--apply` split, restore-point capture, and per-row seal-verify-write loop live in
 * `aad-backfill-runner.ts`, shared with the other five `backfill-*-aad.ts` scripts — this file keeps
 * only what's genuinely specific to `composio_connector_credentials`: its identity shape, its AAD
 * builder, and its own column write.
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

import { and, eq } from "drizzle-orm";

import { composioConnectorCredentials } from "../../apps/website/src/platform/db/schema.sqlite.js";
import type { ContentDb } from "../../apps/website/src/platform/db/sqlite/content-db.js";
import { buildConnectorCredentialAad } from "../../apps/website/src/platform/connectors/connector-credential-aad.js";

import {
  runAadBackfill,
  runAadBackfillMain,
  type AadBackfillDeps,
  type AadBackfillMainMessages,
  type AadBackfillResult,
  type AadBackfillUnit,
} from "./aad-backfill-runner.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const DEFAULT_DB_PATH = path.join(REPO_ROOT, "infra", "content.db");

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

/** @complexity O(n) in the pending row count. */
function loadPendingUnits(db: ContentDb): AadBackfillUnit[] {
  return loadPendingRows(db).map((row) => ({
    label: `workspace=${row.workspaceId} connector=${row.connectorId}`,
    sealed: row.sealed,
    buildAad: () => buildConnectorCredentialAad({ workspaceId: row.workspaceId, connectorId: row.connectorId }),
    write: (sealed) =>
      db
        .update(composioConnectorCredentials)
        .set({
          sealedKeyId: sealed.keyId,
          sealedCiphertext: sealed.ciphertext,
          sealedNonce: sealed.nonce,
          sealedAlg: sealed.alg,
          aadVersion: 1,
        })
                // `aadVersion` is in the predicate, not just the SET: this write must land only while the
        // row is still in the state `loadPending` selected it in. A credential the live server
        // re-sealed since then matches nothing, `.changes` is 0, and the runner aborts rather than
        // reverting that rotation with this unit's older plaintext.
        .where(and(eq(composioConnectorCredentials.workspaceId, row.workspaceId), eq(composioConnectorCredentials.connectorId, row.connectorId), eq(composioConnectorCredentials.aadVersion, 0)))
        .run().changes,
  }));
}

const messages: AadBackfillMainMessages = {
  found: (count) => `Found ${count} row(s) at aad_version=0 with credentials to migrate.`,
  dryRunUnit: (label) => `DRY RUN: would migrate ${label} -> aad_version=1`,
  migratedUnit: (label) => `MIGRATED: ${label} -> aad_version=1`,
  mismatch: (label) =>
    `connector-credential AAD backfill: post-seal verification mismatch for ${label} — refusing to write a row that cannot be proven to re-open correctly`,
  dryRunSummary: (result) =>
    `DRY RUN: ${result.migrated} row(s) would be migrated, ${result.total} total pending. Re-run with --apply to write.`,
  nothingToMigrate: () =>
    "Nothing to migrate — every composio_connector_credentials row with credentials already carries aad_version=1.",
  done: (result) => `Done: ${result.migrated} row(s) migrated, ${result.total} total pending.`,
};

export interface ConnectorCredentialAadBackfillDeps extends AadBackfillDeps {}
export interface ConnectorCredentialAadBackfillResult extends AadBackfillResult {}

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
  return runAadBackfill(deps, opts, { loadPending: loadPendingUnits, messages });
}

async function main(): Promise<void> {
  await runAadBackfillMain(process.argv.slice(2), {
    defaultDbPath: DEFAULT_DB_PATH,
    restorePointScopeId: "backfill-connector-credential-aad",
    loadPending: loadPendingUnits,
    messages,
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
