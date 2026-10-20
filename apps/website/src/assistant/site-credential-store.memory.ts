import type { ISODateTime, UUID } from "@jini-ai/core/primitives";
import { InMemoryVaultRepo, type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import type { SiteAssistantCredentialRecord, SiteAssistantCredentialRepoPort } from "./site-credential-store.js";
import { assistantVaultContext, assistantVaultRepo, type AssistantVaultRepo } from "./assistant-vault.js";
import { assistantVaultKeyView, clearAssistantVaultKey, upsertAssistantVaultRow } from "./assistant-vault-compat.js";

/** Compatibility mapping only; Jini owns persistence, cloning, defaults and revision CAS.
 * The SQL adapter supplies its Jini repo to this same mapping, avoiding a second query body. */
export class InMemorySiteAssistantCredentialRepo implements SiteAssistantCredentialRepoPort {
  readonly vault: AssistantVaultRepo;
  constructor({ vault = new InMemoryVaultRepo({}) }: { vault?: VaultRepoPort } = {}, _options = {}) { this.vault = assistantVaultRepo({ repo: { vault } }); }

  async findByWorkspaceId(workspaceId: UUID): Promise<SiteAssistantCredentialRecord | null> {
    const row = await this.vault.findOne(assistantVaultContext({ workspaceId, kind: "site-assistant" }));
    if (!row) return null;
    return { workspaceId: row.workspaceId,
      provider: row.provider!, baseUrl: row.meta.baseUrl as string | null, model: row.meta.model as string | null,
      ...assistantVaultKeyView({ row }) };
  }

  /** Full-row compatibility write; ordinary store saves use the vault service directly. */
  async upsert(record: SiteAssistantCredentialRecord): Promise<void> {
    const context = assistantVaultContext({ kind: "site-assistant", workspaceId: record.workspaceId });
    await upsertAssistantVaultRow({ vault: this.vault, context, write: { provider: record.provider, meta: { baseUrl: record.baseUrl, model: record.model },
      sealed: record.sealed, createdAt: record.createdAt, updatedAt: record.updatedAt } });
  }

  /** Clearing is a nullable-envelope replacement, preserving settings and singleton identity. */
  async clearKey(input: { workspaceId: UUID; updatedAt: ISODateTime }): Promise<void> {
    await clearAssistantVaultKey({ vault: this.vault, context: assistantVaultContext({ workspaceId: input.workspaceId, kind: "site-assistant" }), updatedAt: input.updatedAt });
  }
}
