import { VaultError, type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import { byVaultLabel, parseTovuStoreMeta } from "#src/platform/secrets/vault-kinds";
import type { CustomCredentialCategoryId } from "../../contracts/core/custom-credential-categories.js";
import type { CustomCredentialProjectScope, CustomCredentialSetRecord, CustomCredentialSetRepoPort } from "./types.js";

type VaultPutRecord = Parameters<VaultRepoPort["put"]>[0]["record"];

export function customVaultScope({ workspaceId, id, kind = "vendor" }: { workspaceId: string; id?: string; kind?: "vendor" | "custom" }, _options = {}) {
  return { workspaceId, kind, ownerKey: "tovu", principalId: null, binding: null,
    ...(id === undefined ? {} : { id }) };
}

function isCustomCredentialRow({ row }: { row: VaultPutRecord }, _options = {}): boolean {
  return row.kind === "custom" || (row.kind === "vendor" && row.meta.credentialType === "custom");
}

/** Username belongs exclusively to metadata after normalization; no sealed fallback can resurrect
 * an explicit clear. The private envelope/revision never becomes a public summary field.
 */
export function customVaultRecord({ row, expectedRevision }: { row: VaultPutRecord; expectedRevision?: number | null }, _options = {}): CustomCredentialSetRecord {
  const wrongOwner = !isCustomCredentialRow({ row }) || row.ownerKey !== "tovu";
  if (wrongOwner || row.principalId !== null || row.binding !== null || row.provider !== null) {
    throw new VaultError({ code: "context" });
  }
  const meta = parseTovuStoreMeta({ kind: row.kind as "vendor" | "custom", meta: row.meta, provider: row.provider });
  if (!row.sealed) throw new VaultError({ code: "invalid-record" });
  const record: CustomCredentialSetRecord = { workspaceId: row.workspaceId, id: row.id, label: row.label,
    category: meta.category as CustomCredentialCategoryId, baseUrl: meta.baseUrl as string,
    worksFor: meta.worksFor as string[], additionalHosts: meta.additionalHosts as string[], ...(meta.username == null ? {} : { username: meta.username as string }),
    sealed: row.sealed, createdAt: row.createdAt, updatedAt: row.updatedAt };
  Object.defineProperty(record, "vaultRecord", { value: { ...row, meta } });
  if (expectedRevision !== undefined) Object.defineProperty(record, "vaultExpectedRevision", { value: expectedRevision });
  return record;
}

/** Fixed owner/provider scope keeps custom labels unique across the workspace in both adapters. */
export class CustomCredentialVaultRepo implements CustomCredentialSetRepoPort {
  readonly vault: VaultRepoPort;
  readonly project?: CustomCredentialProjectScope;
  /** @param optional.project The project store this site's rows fall back to (`types.ts`). */
  constructor({ vault }: { vault: VaultRepoPort }, optional: { project?: CustomCredentialProjectScope } = {}) {
    this.vault = vault;
    if (optional.project) this.project = optional.project;
  }
  async findById(input: { workspaceId: string; id: string }): Promise<CustomCredentialSetRecord | null> {
    const row = await this.vault.find(input);
    if (!row || !isCustomCredentialRow({ row })) return null;
    return customVaultRecord({ row });
  }
  async listByWorkspace(input: { workspaceId: string }): Promise<CustomCredentialSetRecord[]> {
    // Label order, as before the vault (the label index drove the scan); the vault lists by id.
    const unified = await this.vault.list(customVaultScope(input));
    // This is a read bridge, not a kind rewrite: the stored kind still authenticates old envelopes.
    const legacy = await this.vault.list(customVaultScope({ ...input, kind: "custom" }));
    return [...unified.filter(row => row.meta.credentialType === "custom"), ...legacy].sort(byVaultLabel).map(row => customVaultRecord({ row }));
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
  private async write({ record, expectedRevision, existing }: { record: CustomCredentialSetRecord; expectedRevision: number | null; existing?: VaultPutRecord }, _options = {}): Promise<void> {
    const prepared = preparedVaultRow({ record });
    const row = prepared ?? compatibilityVaultRow({ record, expectedRevision, existing });
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

type CompatibilityWrite = { record: CustomCredentialSetRecord; expectedRevision: number | null; existing?: VaultPutRecord };

function compatibilityVaultRow({ record, expectedRevision, existing }: CompatibilityWrite, _options = {}): VaultPutRecord {
  const kind = existing?.kind === "custom" ? "custom" : "vendor";
  return { ...customVaultScope({ ...record, kind }), id: record.id, provider: null, label: record.label,
    sealed: record.sealed, isDefault: existing?.isDefault ?? false, revision: (expectedRevision ?? 0) + 1,
    ...compatibilityTokenHints({ record, existing }),
    meta: compatibilityVaultMeta({ record, existing, kind }),
    createdAt: existing?.createdAt ?? record.createdAt, updatedAt: record.updatedAt };
}

function compatibilityVaultMeta({ record, existing, kind }: Pick<CompatibilityWrite, "record" | "existing"> & { kind: "vendor" | "custom" }, _options = {}) {
  return parseTovuStoreMeta({ kind, meta: { ...existing?.meta, credentialType: "custom",
    worksFor: [...(record.worksFor ?? existing?.meta.worksFor as string[] ?? [])],
    category: record.category, baseUrl: record.baseUrl,
    additionalHosts: [...record.additionalHosts], username: record.username ?? null } });
}

function compatibilityTokenHints({ record, existing }: Pick<CompatibilityWrite, "record" | "existing">, _options = {}): Pick<VaultPutRecord, "last4" | "tokenLength"> {
  const sealed = existing?.sealed;
  let unchanged = false;
  if (sealed != null) {
    const sameContent = sealed.keyId === record.sealed.keyId && sealed.ciphertext === record.sealed.ciphertext;
    unchanged = sameContent && sealed.nonce === record.sealed.nonce && sealed.alg === record.sealed.alg;
  }
  return { last4: unchanged ? existing!.last4 : null, tokenLength: unchanged ? existing!.tokenLength : null };
}

function preparedVaultRow({ record }: { record: CustomCredentialSetRecord }, _options = {}): VaultPutRecord | undefined {
  const prepared = record.vaultExpectedRevision === undefined ? undefined : record.vaultRecord;
  if (prepared) {
    customVaultRecord({ row: prepared });
    if (prepared.workspaceId !== record.workspaceId || prepared.id !== record.id) throw new VaultError({ code: "context" });
  }
  return prepared;
}
