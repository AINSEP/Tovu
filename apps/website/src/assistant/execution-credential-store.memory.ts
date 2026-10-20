import type { ISODateTime, UUID } from "@jini-ai/core/primitives";
import { InMemoryVaultRepo, type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import type { AdminExecutionCredentialRecord, AdminExecutionCredentialRepoPort } from "./execution-credential-store.js";
import { assistantVaultContext, assistantVaultRepo, type AssistantVaultRepo } from "./assistant-vault.js";
import { assistantVaultKeyView, clearAssistantVaultKey, upsertAssistantVaultRow } from "./assistant-vault-compat.js";

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
      ...assistantVaultKeyView({ row }) };
  }

  /** Full-row compatibility write; ordinary store saves use the vault service directly. */
  async upsert(record: AdminExecutionCredentialRecord): Promise<void> {
    const context = assistantVaultContext({ kind: "personal-execution", workspaceId: record.workspaceId, principalId: record.principalId });
    await upsertAssistantVaultRow({ vault: this.vault, context, write: { provider: record.providerId,
      meta: { protocol: record.protocol, baseUrl: record.baseUrl, model: record.model, maxTokens: record.maxTokens },
      sealed: record.sealed, createdAt: record.createdAt, updatedAt: record.updatedAt } });
  }

  /** Clearing is a nullable-envelope replacement, preserving settings and singleton identity. */
  async clearKey(input: { workspaceId: UUID; principalId: UUID; updatedAt: ISODateTime }): Promise<void> {
    await clearAssistantVaultKey({ vault: this.vault, context: assistantVaultContext({ ...input, kind: "personal-execution" }), updatedAt: input.updatedAt });
  }
}
