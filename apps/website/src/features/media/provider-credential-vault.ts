import { VaultError, type VaultBatchOp, type VaultRecord, type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import { parseTovuStoreMeta } from "#src/platform/secrets/vault-kinds";
import type { MediaProviderCredentialRecord, MediaProviderCredentialRepoPort, MediaProviderCredentialReplacePlanner } from "./provider-credential-contracts.js";

const MEDIA_PROVIDER_KIND = "media-provider" as const;

type VaultPutRecord = Parameters<VaultRepoPort["put"]>[0]["record"];

/** Expected nonpersonal ownership, plus an exact provider filter when selecting a singleton. */
export function mediaVaultScope({ workspaceId, providerId }: { workspaceId: string; providerId?: string }, _options = {}) {
  return { workspaceId, kind: MEDIA_PROVIDER_KIND, ownerKey: "tovu", principalId: null, binding: null,
    ...(providerId === undefined ? {} : { provider: providerId }) };
}

/** Media's singleton is per provider, regardless of default flags (migrated rows may have none).
 * Adapt Jini's indexed exact-group read to its singleton service lifecycle: one read, one open.
 */
export function mediaProviderVault({ vault, providerId }: { vault: VaultRepoPort; providerId: string }, _options = {}): VaultRepoPort {
  return { find: input => vault.find(input), list: input => vault.list(input), put: input => vault.put(input),
    patchMeta: input => vault.patchMeta(input), delete: input => vault.delete(input),
    findOne: async input => {
      const row = (await vault.list({ ...input, ownerKey: "tovu", principalId: null, provider: providerId }))[0];
      if (row && row.provider !== providerId) throw new VaultError({ code: "context" });
      return row ?? null;
    } };
}

/** Deterministic id for a provider's first row; later writes keep whatever id is stored. */
export function mediaVaultId({ providerId }: { providerId: string }, _options = {}): string {
  return `vault:${JSON.stringify([MEDIA_PROVIDER_KIND, providerId])}`;
}

/** Expected ownership is this adapter's, never the row's: anything else is a context breach. */
function ownedProviderId({ row }: { row: VaultPutRecord }, _options = {}): string {
  const owned = row.kind === MEDIA_PROVIDER_KIND && row.ownerKey === "tovu" && row.principalId === null && row.binding === null;
  if (!owned || row.provider === null) {
    throw new VaultError({ code: "context" });
  }
  return row.provider;
}

/** Short/unknown-length tokens withhold their suffix; an unsealed row has no tail at all. */
function keyTailOf({ row }: { row: VaultPutRecord }, _options = {}): string | null {
  if (!row.sealed) return null;
  return row.tokenLength !== null && row.tokenLength >= 12 ? row.last4 ?? "" : "";
}

/** Historical DTO; vault identity/revision/hints remain private to the adapter, never API fields. */
export function mediaVaultRecord({ row }: { row: VaultPutRecord }, _options = {}): MediaProviderCredentialRecord {
  const providerId = ownedProviderId({ row });
  const meta = parseTovuStoreMeta({ kind: MEDIA_PROVIDER_KIND, meta: row.meta });
  const record: MediaProviderCredentialRecord = { workspaceId: row.workspaceId, providerId,
    baseUrl: meta.baseUrl as string | null, model: meta.model as string | null, sealed: row.sealed,
    keyTail: keyTailOf({ row }), aadVersion: row.sealed ? 1 : 0, createdAt: row.createdAt, updatedAt: row.updatedAt };
  Object.defineProperty(record, "vaultRecord", { value: row });
  return record;
}

/** A prepared row must target the stored row's id; its hints win over the stored row's. */
function rowIdentity({ record, existing }: { record: MediaProviderCredentialRecord; existing?: VaultRecord }, _options = {}) {
  const prepared = record.vaultRecord;
  const id = existing?.id ?? prepared?.id ?? mediaVaultId(record);
  if (prepared && prepared.id !== id) throw new VaultError({ code: "conflict" });
  return { id, hint: prepared ?? existing };
}

/** Safe hints describe one envelope: they survive only while every envelope field is unchanged. */
function preservedHints({ hint, sealed }: { hint?: VaultPutRecord; sealed: VaultPutRecord["sealed"] }, _options = {}) {
  const stored = hint?.sealed;
  if (stored == null || sealed === null) return { last4: null, tokenLength: null };
  const unchanged = stored.keyId === sealed.keyId &&
    stored.ciphertext === sealed.ciphertext && stored.nonce === sealed.nonce && stored.alg === sealed.alg;
  return unchanged ? { last4: hint!.last4, tokenLength: hint!.tokenLength } : { last4: null, tokenLength: null };
}

/** CAS bookkeeping a replacement inherits from the stored row, or a first row's defaults. */
function carriedFromExisting({ record, existing }: { record: MediaProviderCredentialRecord; existing?: VaultRecord }, _options = {}) {
  return { isDefault: existing?.isDefault ?? false, revision: (existing?.revision ?? 0) + 1,
    createdAt: existing?.createdAt ?? record.createdAt, updatedAt: record.updatedAt };
}

/** DTO persistence delegates CAS/batch atomicity to Jini. No plaintext enters this adapter. */
export class MediaProviderCredentialVaultRepo implements MediaProviderCredentialRepoPort {
  readonly vault: VaultRepoPort;
  constructor({ vault }: { vault: VaultRepoPort }, _options = {}) { this.vault = vault; }
  async listByWorkspaceId(workspaceId: string): Promise<MediaProviderCredentialRecord[]> {
    return (await this.vault.list(mediaVaultScope({ workspaceId }))).map(row => mediaVaultRecord({ row }));
  }
  private row({ record, existing }: { record: MediaProviderCredentialRecord; existing?: VaultRecord }, _options = {}): VaultRecord {
    const { id, hint } = rowIdentity({ record, existing });
    return { ...mediaVaultScope(record), id, provider: record.providerId, label: record.providerId,
      meta: parseTovuStoreMeta({ kind: MEDIA_PROVIDER_KIND, meta: { ...existing?.meta, baseUrl: record.baseUrl, model: record.model } }),
      sealed: record.sealed, ...preservedHints({ hint, sealed: record.sealed }), ...carriedFromExisting({ record, existing }) };
  }
  async upsert(record: MediaProviderCredentialRecord): Promise<void> {
    const existing = (await this.vault.list(mediaVaultScope(record)))[0];
    await this.vault.put({ record: this.row({ record, existing }), expectedRevision: existing?.revision ?? null });
  }
  async deleteByProviderIds(input: { workspaceId: string; providerIds: readonly string[] }): Promise<void> {
    if (!input.providerIds.length) return;
    await this.replaceWorkspace({ workspaceId: input.workspaceId, plan: () => ({ upserts: [], tombstoneProviderIds: input.providerIds }) });
  }
  /** The fresh snapshot alone supplies preserved envelopes/revisions. Sealing happens earlier;
   * CAS rejects a writer racing this snapshot and Jini publishes the complete batch once.
   * @complexity O(n) planning/space for catalogue-bounded providers, one read and one batch.
   */
  async replaceWorkspace(input: { workspaceId: string; plan: MediaProviderCredentialReplacePlanner }): Promise<readonly MediaProviderCredentialRecord[]> {
    if (!this.vault.applyBatch) throw new VaultError({ code: "invalid-record" });
    const current = await this.vault.list(mediaVaultScope(input));
    const byProvider = new Map(current.map(row => [row.provider!, row]));
    const plan = input.plan(current.map(row => mediaVaultRecord({ row })));
    const ops: VaultBatchOp[] = plan.upserts.map(record => {
      if (record.workspaceId !== input.workspaceId) throw new VaultError({ code: "context" });
      const existing = byProvider.get(record.providerId);
      return { put: { record: this.row({ record, existing }), expectedRevision: existing?.revision ?? null } };
    });
    for (const providerId of new Set(plan.tombstoneProviderIds)) {
      const row = byProvider.get(providerId);
      if (row) ops.push({ delete: { workspaceId: input.workspaceId, id: row.id, expectedRevision: row.revision } });
    }
    return (await this.vault.applyBatch({ ops })).filter((row): row is VaultRecord => typeof row !== "boolean").map(row => mediaVaultRecord({ row }));
  }
}
