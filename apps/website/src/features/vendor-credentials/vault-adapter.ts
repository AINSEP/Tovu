import { SecretsVaultService, VaultError, type VaultRepoPort, type VaultRecord, type VaultSummary } from "@jini-ai/platform/secrets/credential-sets";
import type { Clock } from "@jini-ai/core/primitives";
import type { KeyringPort, SecretSealerPort, SealedSecret } from "../webhooks/index.js";
import type { SourceControlCredentialSetRecord } from "../source-control/types.js";
import type { VendorCredentialSetRecord, VendorCredentialSetRepoPort } from "./types.js";
import { createTovuVaultKinds } from "../../server/runtime/composition/vault-kinds.js";

type Record = SourceControlCredentialSetRecord | VendorCredentialSetRecord;
type Kind = "vendor" | "source-control";
const registry = createTovuVaultKinds({ policy: {
  // Credential catalogs/connection shapes remain validated by the feature stores. This adapter
  // registers their only plain metadata field with the common safe-field policy.
  validateMeta: ({ meta }) => meta,
  legacyPublishCredential: () => undefined,
  tokenField: () => undefined,
} });

/** Tovu's historical DTOs retain their fields; vault revisions and hints are adapter details. */
export class TovuCredentialSetVaultAdapter<R extends Record> {
  readonly vault: VaultRepoPort;
  constructor({ vault, kind, vendor = false }: { vault: VaultRepoPort; kind: Kind; vendor?: boolean }, _options = {}) {
    this.vault = vault;
    this.kind = kind;
    this.vendor = vendor;
  }
  private readonly kind: Kind;
  private readonly vendor: boolean;
  private scope(input: { workspaceId: string; provider?: string }, _options = {}) {
    return { workspaceId: input.workspaceId, kind: this.kind, ownerKey: "tovu", principalId: null, binding: null,
      ...(input.provider === undefined ? {} : { provider: input.provider }) };
  }
  private record(row: VaultRecord | null, _options = {}): R | null {
    if (!row || row.kind !== this.kind || row.ownerKey !== "tovu" || row.principalId !== null || row.binding !== null) return null;
    const meta = registry.metaParsers[this.kind]({ meta: row.meta });
    if (!row.sealed || row.provider === null) throw new VaultError({ code: "invalid-record" });
    // Keep the hint out of sealed-row DTO enumeration; public store summaries opt in explicitly.
    const record = { workspaceId: row.workspaceId, id: row.id, label: row.label, sealed: row.sealed,
      ...(this.vendor ? { vendorId: row.provider, tokenTail: row.tokenLength !== null && row.tokenLength >= 12 ? row.last4 ?? "" : "" } : { providerId: row.provider }),
      isDefault: row.isDefault, accountLabel: meta.accountLabel ?? null, createdAt: row.createdAt, updatedAt: row.updatedAt } as R;
    Object.defineProperty(record, "tokenHint", { value: credentialHint({ record: row }), enumerable: false });
    return record;
  }
  async findById(input: { workspaceId: string; id: string }, _options = {}): Promise<R | null> {
    return this.record(await this.vault.find(input));
  }
  async findDefaultByProvider(input: { workspaceId: string; providerId: string }, _options = {}): Promise<R | null> {
    if (!this.vault.findDefault) throw new VaultError({ code: "invalid-record" });
    return this.record(await this.vault.findDefault({ ...this.scope(input), provider: input.providerId }));
  }
  async listByProvider(input: { workspaceId: string; providerId: string }, _options = {}): Promise<R[]> {
    return (await this.vault.list(this.scope({ ...input, provider: input.providerId }))).map(row => this.record(row)!);
  }
  async listByWorkspace(input: { workspaceId: string }, _options = {}): Promise<R[]> {
    return (await this.vault.list(this.scope(input))).map(row => this.record(row)!);
  }
  /** Compatibility for callers holding sealed DTOs; the Jini repo owns defaults and CAS. */
  async insert(record: R, _options = {}): Promise<void> { await this.write({ record, expectedRevision: null }); }
  async update(record: R, _options = {}): Promise<void> {
    const existing = await this.vault.find(record);
    if (!existing || !this.record(existing)) return;
    await this.write({ record, expectedRevision: existing.revision, existing });
  }
  private async write({ record, expectedRevision, existing }: { record: R; expectedRevision: number | null; existing?: VaultRecord }, _options = {}): Promise<void> {
    await this.vault.put({ expectedRevision, record: { ...this.scope(record), id: record.id,
      provider: "vendorId" in record ? record.vendorId : record.providerId, label: record.label, sealed: record.sealed,
      meta: registry.metaParsers[this.kind]({ meta: { ...existing?.meta, accountLabel: record.accountLabel } }),
      last4: existing?.sealed?.ciphertext === record.sealed.ciphertext && existing.sealed.nonce === record.sealed.nonce ? existing.last4 : null,
      tokenLength: existing?.sealed?.ciphertext === record.sealed.ciphertext && existing.sealed.nonce === record.sealed.nonce ? existing.tokenLength : null,
      isDefault: record.isDefault, revision: (expectedRevision ?? 0) + 1, createdAt: record.createdAt, updatedAt: record.updatedAt } });
  }
  async delete(input: { workspaceId: string; id: string }, _options = {}): Promise<void> {
    const row = await this.vault.find(input);
    if (row && this.record(row)) await this.vault.delete({ ...input, expectedRevision: row.revision });
  }
  /** Preserve the old missing/stale-probe no-op and updatedAt semantics. Jini's targeted JSON
   * patch increments revision, so a rotation racing the probe cannot be overwritten. */
  async updateAccountLabel(input: { workspaceId: string; id: string; accountLabel: string; expectedSealed?: SealedSecret }, _options = {}): Promise<void> {
    const row = await this.vault.find(input);
    if (!row || !this.record(row)) return;
    if (input.expectedSealed && ["keyId", "ciphertext", "nonce", "alg"].some(key =>
      row.sealed![key as keyof SealedSecret] !== input.expectedSealed![key as keyof SealedSecret])) return;
    const meta = registry.metaParsers[this.kind]({ meta: { ...row.meta, accountLabel: input.accountLabel } });
    try {
      await this.vault.patchMeta({ ...input, expectedRevision: row.revision, patch: { accountLabel: meta.accountLabel! }, updatedAt: row.updatedAt });
    } catch (error) {
      if (!(error instanceof VaultError && error.code === "conflict")) throw error;
      // A deleted/rotated row is a completed stale probe, never an instruction to recreate it.
    }
  }
}

/** Host-bound service: feature routes own permission checks; this policy limits their vault
 * access to Tovu's two credential kinds. Encryption failures retain each store's typed error. */
export function credentialVault(required: { repo: { vault?: VaultRepoPort }; sealer: SecretSealerPort;
  keyring?: KeyringPort; clock?: Clock; idGen?: { newId(): string }; storageError: () => Error }, _options = {}): SecretsVaultService {
  if (!required.repo.vault) throw new VaultError({ code: "invalid-record" });
  const protect = async <T>(operation: () => Promise<T>): Promise<T> => {
    try { return await operation(); } catch { throw required.storageError(); }
  };
  return new SecretsVaultService({ repo: required.repo.vault, metaParsers: registry.metaParsers,
    authorize: async ({ context }) => {
      if (!["vendor", "source-control"].includes(context.kind) || context.ownerKey !== "tovu" || context.principalId !== null) throw new VaultError({ code: "context" });
    },
    keyring: { activeKey: () => protect(() => {
      if (!required.keyring) throw required.storageError();
      return required.keyring.activeKey();
    }) } as KeyringPort,
    sealer: { seal: input => protect(() => required.sealer.seal(input)), open: (input, options) => protect(() => required.sealer.open(input, options)) },
    now: () => new Date(required.clock?.nowMs() ?? 0).toISOString(),
    newId: () => { if (!required.idGen) throw new VaultError({ code: "invalid-record" }); return required.idGen.newId(); },
  });
}

export function credentialScope({ workspaceId, kind, id }: { workspaceId: string; kind: Kind; id?: string }, _options = {}) {
  return { workspaceId, kind, ownerKey: "tovu", principalId: null, binding: null, ...(id === undefined ? {} : { id }) };
}
/** Safe read-model hints require no open and never hydrate summaries one credential at a time. */
export function credentialHint({ record }: { record: Pick<VaultSummary, "tokenLength" | "last4"> }, _options = {}) {
  return record.tokenLength === null ? null : { length: record.tokenLength, last4: record.tokenLength >= 12 ? record.last4 : null };
}

/** Vendor DTO mapping; default selection/promotion and persistence belong to Jini's vault. */
export class VendorCredentialSetVaultRepo extends TovuCredentialSetVaultAdapter<VendorCredentialSetRecord> implements VendorCredentialSetRepoPort {
  async findDefaultByVendor(input: { workspaceId: string; vendorId: string }, _options = {}) {
    return this.findDefaultByProvider({ workspaceId: input.workspaceId, providerId: input.vendorId });
  }
  async listByVendor(input: { workspaceId: string; vendorId: string }, _options = {}) {
    return this.listByProvider({ workspaceId: input.workspaceId, providerId: input.vendorId });
  }
}
