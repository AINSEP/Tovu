import { sql } from "kysely";
import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import type { SecretSealerPort, SiteKeyHandle } from "@jini-ai/platform/secrets";
import type { VaultRecord } from "@jini-ai/platform/secrets/credential-sets";
import type { StorageKernel } from "./kernel/port.js";
import { opensVaultCredential, snapshotVaultCredentials, siblingColumns,
  type VaultCredentialKeyDeps, type VaultCredentialValue } from "./vault-credential-inventory.js";

/** @file Last-resort host recovery. Jini retains CAS, default promotion and envelope persistence.
 * Callers take a restore point. Unlike restore artifacts, unknown live columns remain in coverage.
 * The retained device store has no revision; it and unknown columns keep their full-envelope guard.
 */
export type SealedCredentialKeyDeps = VaultCredentialKeyDeps;
export interface ResealCredentialsDeps extends VaultCredentialKeyDeps {
  sealer: Pick<SecretSealerPort, "seal" | "open">; key: SiteKeyHandle; previous: Pick<SecretSealerPort, "open">;
  /** Host codec normalizes legacy rows or rotates ordinary rows through Jini, with CAS. */
  resealRecord: (input: { record: VaultRecord; previous: Pick<SecretSealerPort, "open"> }) => Promise<void>;
}
const OPTIONAL_ENVELOPES = new Set(["site-assistant", "personal-execution", "media-provider", "publish-peer"]);

/** Lock workspaces in a deterministic order, matching every Jini vault writer and boot normalization. */
async function lockWorkspaces({ deps, values }: { deps: SealedCredentialKeyDeps; values: VaultCredentialValue[] }): Promise<void> {
  const workspaces = values.flatMap(value => value.record ? [value.record.workspaceId] : []);
  for (const workspaceId of [...new Set(workspaces)].sort()) await deps.kernel.lockKey(`secrets_vault:${workspaceId}`);
}
/** Recheck all revisions BEFORE mutations: default promotion may legitimately advance later rows. */
async function currentValues({ deps, values }: { deps: SealedCredentialKeyDeps; values: VaultCredentialValue[] }): Promise<VaultCredentialValue[]> {
  const repo = new SqlSecretsVaultRepo({ kernel: deps.kernel as unknown as StorageKernel<SecretsVaultDatabase> });
  const current: VaultCredentialValue[] = [];
  for (const value of values) {
    if (!value.record) { current.push(value); continue; }
    const row = await repo.find(value.record);
    if (row?.revision === value.record.revision) current.push(value);
  }
  return current;
}
/** Unlink first in the same transaction, then delete the vault row (FK is deliberately RESTRICT).
 * OAuth refresh cannot resurrect the discarded session; a fresh connect is required.
 */
async function unlinkMcp({ deps, record }: { deps: SealedCredentialKeyDeps; record: VaultRecord }): Promise<void> {
  if (record.kind === "mcp-env") await deps.kernel.execute(sql`UPDATE external_mcp_servers SET env_secret_id=NULL
    WHERE workspace_id=${record.workspaceId} AND env_secret_id=${record.id}`);
  if (record.kind === "mcp-auth") await deps.kernel.execute(sql`UPDATE external_mcp_servers SET oauth_secret_id=NULL,
    oauth_status='needs_reauth', oauth_expires_at=NULL, oauth_refresh_lease_until=NULL
    WHERE workspace_id=${record.workspaceId} AND oauth_secret_id=${record.id}`);
}
/** Remove only a current record. Settings survive optional clears; hints and legacy markers do not. */
async function discardVaultValue({ deps, value }: { deps: SealedCredentialKeyDeps; value: VaultCredentialValue }): Promise<number> {
  if (!value.record) return mutateOther({ deps, value });
  const repo = new SqlSecretsVaultRepo({ kernel: deps.kernel as unknown as StorageKernel<SecretsVaultDatabase> });
  const record = await repo.find(value.record);
  if (!record) return 0;
  if (OPTIONAL_ENVELOPES.has(record.kind)) {
    const { legacyAad: _legacy, normalization: _flag, ...meta } = record.meta;
    await repo.put({ expectedRevision: record.revision, record: { ...record, meta, sealed: null,
      last4: null, tokenLength: null, revision: record.revision + 1 } });
    return 1;
  }
  await unlinkMcp({ deps, record });
  return Number(await repo.delete({ workspaceId: record.workspaceId, id: record.id, expectedRevision: record.revision }));
}
/** Old device/unknown stores lack revisions: compare the complete envelope, plus known device PK.
 * Use RETURNING to report actual changes; concurrent replacement is never counted as discarded.
 */
async function mutateOther({ deps, value, sealed }: {
  deps: SealedCredentialKeyDeps; value: VaultCredentialValue; sealed?: { keyId: string; ciphertext: string; nonce: string; alg: string };
}): Promise<number> {
  const { ref } = value;
  const siblings = siblingColumns(ref.column);
  const envelope = value.guard ?? { [ref.column]: value.ciphertext };
  const guards = Object.entries(envelope).map(([column, value]) => value === null
    ? sql`${sql.id(column)} IS NULL` : sql`${sql.id(column)}=${value}`);
  if (value.device) guards.push(sql`workspace_id=${value.device.workspaceId}`, sql`server_id=${value.device.serverId}`);
  const match = sql.join(guards, sql` AND `);
  if (!sealed && ref.notNull) {
    return (await deps.kernel.query(sql`DELETE FROM ${sql.id(ref.table)} WHERE ${match} RETURNING ${sql.id(ref.column)}`)).length;
  }
  const prefix = ref.column.slice(0, -"sealed_ciphertext".length);
  const companions = ["masked", "key_tail", "token_tail"].map(name => `${prefix}${name}`).filter(name => ref.tableColumns.has(name));
  const values = sealed ? { [ref.column]: sealed.ciphertext, [siblings.keyId]: sealed.keyId, [siblings.nonce]: sealed.nonce, [siblings.alg]: sealed.alg }
    : Object.fromEntries([ref.column, siblings.keyId, siblings.nonce, siblings.alg, ...companions].filter(name => ref.tableColumns.has(name)).map(name => [name, null]));
  const assignments = sql.join(Object.entries(values).map(([column, value]) => sql`${sql.id(column)}=${value}`));
  return (await deps.kernel.query(sql`UPDATE ${sql.id(ref.table)} SET ${assignments} WHERE ${match} RETURNING ${sql.id(ref.column)}`)).length;
}
/** Restore-point guarded discard; snapshot races survive and a later failure rolls back all writes. */
export async function discardVaultCredentialsNotOpening(deps: SealedCredentialKeyDeps, _options = {}): Promise<{ discarded: number; kept: number }> {
  const { values } = await snapshotVaultCredentials(deps);
  const unreadable: VaultCredentialValue[] = [];
  for (const value of values) if (!await opensVaultCredential({ value, sealer: deps.sealer })) unreadable.push(value);
  const discarded = await deps.kernel.transaction(async () => {
    await lockWorkspaces({ deps, values });
    const eligible = await currentValues({ deps, values: unreadable });
    let removed = 0;
    for (const value of eligible) removed += await discardVaultValue({ deps, value });
    return removed;
  });
  return { discarded, kept: values.length - discarded };
}
/** Normalize legacy envelopes under the recovered key even if they already open there. Ordinary
 * rows rotate through Jini only when the previous key opens them. Unknown AADs remain recoverable.
 */
export async function resealVaultCredentialsOpeningUnder(deps: ResealCredentialsDeps, _options = {}): Promise<{ resealed: number; unreadable: number }> {
  const { values } = await snapshotVaultCredentials(deps);
  const moves: Array<{ value: VaultCredentialValue; previous: ResealCredentialsDeps["previous"] }> = [];
  let unreadable = 0;
  for (const value of values) {
    const opens = await opensVaultCredential({ value, sealer: deps.sealer });
    if (opens && value.record?.meta.legacyAad === undefined) continue;
    if (opens) { moves.push({ value, previous: deps.sealer }); continue; }
    if (!await opensVaultCredential({ value, sealer: deps.previous })) { unreadable += 1; continue; }
    moves.push({ value, previous: deps.previous });
  }
  const resealed = await deps.kernel.transaction(async () => {
    await lockWorkspaces({ deps, values });
    const eligible = new Set(await currentValues({ deps, values: moves.map(move => move.value) }));
    let moved = 0;
    for (const { value, previous } of moves) {
      if (!eligible.has(value)) continue;
      if (value.record) { await deps.resealRecord({ record: value.record, previous }); moved += 1; continue; }
      if (!value.sealed) continue;
      const plaintext = await previous.open({ sealed: value.sealed }, { aad: value.aad });
      const sealed = await deps.sealer.seal({ plaintext, key: deps.key, aad: value.aad ?? "" });
      if (await deps.sealer.open({ sealed }, { aad: value.aad }) !== plaintext) throw new Error("Credential recovery verification failed");
      moved += await mutateOther({ deps, value, sealed });
    }
    return moved;
  });
  return { resealed, unreadable };
}
