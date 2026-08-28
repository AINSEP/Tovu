import type { ISODateTime, UUID } from "@jini-ai/cms/core";

import type { SiteAssistantCredentialRecord, SiteAssistantCredentialRepoPort } from "./site-credential-store.js";

/**
 * @file `SiteAssistantCredentialRepoPort`'s in-memory adapter — the ADR-006 rule-of-two test double,
 * backing `server/app.ts`'s hermetic composition root (mirrors `origin/repo.memory.ts`'s identical
 * role for `OriginSettingRepoPort`).
 */
export class InMemorySiteAssistantCredentialRepo implements SiteAssistantCredentialRepoPort {
  private readonly rows = new Map<UUID, SiteAssistantCredentialRecord>();

  async findByWorkspaceId(workspaceId: UUID): Promise<SiteAssistantCredentialRecord | null> {
    return this.rows.get(workspaceId) ?? null;
  }

  async upsert(record: SiteAssistantCredentialRecord): Promise<void> {
    this.rows.set(record.workspaceId, { ...record });
  }

  async clearKey(input: { workspaceId: UUID; updatedAt: ISODateTime }): Promise<void> {
    const existing = this.rows.get(input.workspaceId);
    if (!existing) return;
    this.rows.set(input.workspaceId, {
      ...existing,
      sealed: null,
      masked: null,
      updatedAt: input.updatedAt,
    });
  }
}
