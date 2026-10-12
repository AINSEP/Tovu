import { VaultError, type VaultRecord, type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import { parseTovuStoreMeta } from "../../server/runtime/composition/vault-kinds.js";
import type { CustomCredentialCategoryId, CustomCredentialSetRecord, CustomCredentialSetRepoPort } from "./types.js";

export function customVaultScope({ workspaceId, id }: { workspaceId: string; id?: string }, _options = {}) {
  return { workspaceId, kind: "custom" as const, ownerKey: "tovu", principalId: null, binding: null,
    ...(id === undefined ? {} : { id }) };
}

/** Username belongs exclusively to metadata after normalization; no sealed fallback can resurrect
 * an explicit clear. The private envelope/revision never becomes a public summary field.
 */
export function customVaultRecord({ row, expectedRevision }: { row: VaultRecord; expectedRevision?: number | null }, _options = {}): CustomCredentialSetRecord {
  if (row.kind !== "custom" || row.ownerKey !== "tovu" || row.principalId !== null || row.binding !== null || row.provider !== null) {
    throw new VaultError({ code: "context" });
  }
  const meta = parseTovuStoreMeta({ kind: "custom", meta: row.meta });
  if (!row.sealed) throw new VaultError({ code: "invalid-record" });
  const record: CustomCredentialSetRecord = { workspaceId: row.workspaceId, id: row.id, label: row.label,
    category: meta.category as CustomCredentialCategoryId, baseUrl: meta.baseUrl as string,
    additionalHosts: meta.additionalHosts as string[], ...(meta.username === null || meta.username === undefined ? {} : { username: meta.username as string }),
    sealed: row.sealed, createdAt: row.createdAt, updatedAt: row.updatedAt };
  Object.defineProperty(record, "vaultRecord", { value: row });
  if (expectedRevision !== undefined) Object.defineProperty(record, "vaultExpectedRevision", { value: expectedRevision });
  return record;
}

/** Fixed owner/provider scope keeps custom labels unique across the workspace in both adapters. */
export class CustomCredentialVaultRepo implements CustomCredentialSetRepoPort {
  readonly vault: VaultRepoPort;
  constructor({ vault }: { vault: VaultRepoPort }, _options = {}) { this.vault = vault; }
  async findById(input: { workspaceId: string; id: string }): Promise<CustomCredentialSetRecord | null> {
    const row = await this.vault.find(input);
    if (!row || row.kind !== "custom") return null;
    return customVaultRecord({ row });
  }
  async listByWorkspace(input: { workspaceId: string }): Promise<CustomCredentialSetRecord[]> {
    return (await this.vault.list(customVaultScope(input))).map(row => customVaultRecord({ row }));
  }
  async insert(record: CustomCredentialSetRecord): Promise<void> { await this.write({ record, expectedRevision: null }); }
  async update(record: CustomCredentialSetRecord): Promise<void> {
    if (record.vaultExpectedRevision !== undefined) {
      await this.write({ record, expectedRevision: record.vaultExpectedRevision });
      return;
    }
    const existing = await this.findById(record);
    if (!existing) return;
    await this.write({ record, expectedRevision: existing.vaultRecord!.revision,
      existing: existing.vaultRecord });
  }
  /** Prepared records carry the caller's CAS; sealed DTO compatibility preserves hints only when
   * the envelope is unchanged. Label conflicts keep the historical raw UNIQUE error contract.
   */
  private async write({ record, expectedRevision, existing }: { record: CustomCredentialSetRecord; expectedRevision: number | null; existing?: VaultRecord }, _options = {}): Promise<void> {
    const prepared = record.vaultExpectedRevision === undefined ? undefined : record.vaultRecord;
    if (prepared) {
      customVaultRecord({ row: prepared });
      if (prepared.workspaceId !== record.workspaceId || prepared.id !== record.id) throw new VaultError({ code: "context" });
    }
    const unchanged = existing?.sealed != null && existing.sealed.keyId === record.sealed.keyId &&
      existing.sealed.ciphertext === record.sealed.ciphertext && existing.sealed.nonce === record.sealed.nonce && existing.sealed.alg === record.sealed.alg;
    const row: VaultRecord = prepared ?? { ...customVaultScope(record), id: record.id, provider: null, label: record.label,
      sealed: record.sealed, isDefault: existing?.isDefault ?? false, revision: (expectedRevision ?? 0) + 1,
      last4: unchanged ? existing!.last4 : null, tokenLength: unchanged ? existing!.tokenLength : null,
      meta: parseTovuStoreMeta({ kind: "custom", meta: { ...existing?.meta, category: record.category, baseUrl: record.baseUrl,
        additionalHosts: [...record.additionalHosts], username: record.username ?? null } }),
      createdAt: existing?.createdAt ?? record.createdAt, updatedAt: record.updatedAt };
    try { await this.vault.put({ record: row, expectedRevision }); }
    catch (error) {
      if (error instanceof VaultError && error.code === "conflict" && (await this.listByWorkspace(record)).some(other => other.id !== record.id && other.label === record.label)) {
        throw new Error("UNIQUE constraint failed: secrets_vault.workspace_id, secrets_vault.kind, secrets_vault.label");
      }
      throw error;
    }
  }
  async delete(input: { workspaceId: string; id: string }): Promise<void> {
    const row = await this.findById(input);
    if (row) await this.vault.delete({ ...input, expectedRevision: row.vaultRecord!.revision });
  }
}
