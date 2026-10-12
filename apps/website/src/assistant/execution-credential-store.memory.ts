import type { ISODateTime, UUID } from "@jini-ai/core/primitives";
import { isDeepStrictEqual } from "node:util";
import { InMemoryVaultRepo, type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import type { AdminExecutionCredentialRecord, AdminExecutionCredentialRepoPort } from "./execution-credential-store.js";
import { assistantVaultContext, assistantVaultId, assistantVaultRepo, type AssistantVaultRepo } from "./assistant-vault.js";

/** Compatibility mapping only; Jini owns persistence, cloning, defaults and revision CAS.
 * The SQL adapter supplies its Jini repo to this same mapping, avoiding a second query body. */
export class InMemoryAdminExecutionCredentialRepo implements AdminExecutionCredentialRepoPort {
  readonly vault: AssistantVaultRepo;
  constructor({ vault = new InMemoryVaultRepo({}) }: { vault?: VaultRepoPort } = {}, _options = {}) { this.vault = assistantVaultRepo({ repo: { vault } }); }

  async findByWorkspaceAndPrincipal(required: { workspaceId: UUID; principalId: UUID }): Promise<AdminExecutionCredentialRecord | null> {
    const row = await this.vault.findOne(assistantVaultContext({ ...required, kind: "personal-execution" }));
    if (!row) return null;
    return { workspaceId: row.workspaceId,
      principalId: row.principalId!, protocol: row.meta.protocol as string,
      providerId: row.provider, baseUrl: row.meta.baseUrl as string | null,
      model: row.meta.model as string | null, maxTokens: row.meta.maxTokens as number | null,
      sealed: row.sealed, masked: row.last4 === null ? null : `••••${row.last4}`,
      aadVersion: row.sealed === null ? 0 : 2, createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  /** Full-row compatibility write; ordinary store saves use the vault service directly. */
  async upsert(record: AdminExecutionCredentialRecord): Promise<void> {
    const context = assistantVaultContext({ kind: "personal-execution", workspaceId: record.workspaceId, principalId: record.principalId });
    const existing = await this.vault.findOne(context);
    const unchanged = record.sealed !== null && isDeepStrictEqual(existing?.sealed, record.sealed);
    await this.vault.put({ expectedRevision: existing?.revision ?? null, record: {
      ...context, id: existing?.id ?? assistantVaultId({ context }), provider: record.providerId, label: existing?.label ?? "",
      isDefault: existing?.isDefault ?? false, revision: (existing?.revision ?? 0) + 1,
      meta: { ...existing?.meta, protocol: record.protocol, baseUrl: record.baseUrl, model: record.model, maxTokens: record.maxTokens }, sealed: record.sealed,
      // A raw envelope supplies no trustworthy token length. Preserve the stored hint only for
      // an identical envelope; an unverified mask cannot establish a safe suffix.
      last4: unchanged ? existing!.last4 : null,
      tokenLength: unchanged ? existing!.tokenLength : null,
      createdAt: existing?.createdAt ?? record.createdAt, updatedAt: record.updatedAt,
    } });
  }

  /** Clearing is a nullable-envelope replacement, preserving settings and singleton identity. */
  async clearKey(input: { workspaceId: UUID; principalId: UUID; updatedAt: ISODateTime }): Promise<void> {
    const existing = await this.vault.findOne(assistantVaultContext({ ...input, kind: "personal-execution" }));
    if (!existing) return;
    await this.vault.put({ expectedRevision: existing.revision, record: { ...existing,
      sealed: null, last4: null, tokenLength: null, revision: existing.revision + 1, updatedAt: input.updatedAt } });
  }
}
