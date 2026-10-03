import type { ISODateTime, UUID } from "@jini-ai/core/primitives";

import type { AdminExecutionCredentialRecord, AdminExecutionCredentialRepoPort } from "./execution-credential-store.js";

/**
 * @file `AdminExecutionCredentialRepoPort`'s in-memory adapter — the ADR-006 rule-of-two test
 * double, backing `server/app.ts`'s hermetic composition root (mirrors
 * `site-credential-store.memory.ts`'s identical role for the sibling ADR-058 port, keyed by
 * `(workspaceId, principalId)` instead of `workspaceId` alone).
 */
export class InMemoryAdminExecutionCredentialRepo implements AdminExecutionCredentialRepoPort {
  private readonly rows = new Map<string, AdminExecutionCredentialRecord>();

  private static key(workspaceId: UUID, principalId: UUID): string {
    return `${workspaceId}\u0000${principalId}`;
  }

  async findByWorkspaceAndPrincipal(required: { workspaceId: UUID; principalId: UUID }): Promise<AdminExecutionCredentialRecord | null> {
    return this.rows.get(InMemoryAdminExecutionCredentialRepo.key(required.workspaceId, required.principalId)) ?? null;
  }

  async upsert(record: AdminExecutionCredentialRecord): Promise<void> {
    this.rows.set(InMemoryAdminExecutionCredentialRepo.key(record.workspaceId, record.principalId), { ...record });
  }

  async clearKey(input: { workspaceId: UUID; principalId: UUID; updatedAt: ISODateTime }): Promise<void> {
    const key = InMemoryAdminExecutionCredentialRepo.key(input.workspaceId, input.principalId);
    const existing = this.rows.get(key);
    if (!existing) return;
    this.rows.set(key, {
      ...existing,
      sealed: null,
      masked: null,
      updatedAt: input.updatedAt,
    });
  }
}
