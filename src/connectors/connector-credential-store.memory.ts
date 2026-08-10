import type { UUID } from "@jini-ai/cms/core";

import type { ConnectorCredentialRepoPort, ConnectorCredentialRow } from "./connector-credential-store";

/**
 * @file `ConnectorCredentialRepoPort`'s in-memory adapter — the ADR-006 rule-of-two test double,
 * backing `server/app.ts`'s hermetic composition root.
 *
 * Keyed by `${workspaceId} ${connectorId}`, matching
 * `media/provider-credential-store.memory.ts`'s composite-string-key shape: neither component can
 * contain a space, so no id pair can collide.
 */
export class InMemoryConnectorCredentialRepo implements ConnectorCredentialRepoPort {
  private readonly rows = new Map<string, ConnectorCredentialRow>();

  private static keyOf(workspaceId: UUID, connectorId: string): string {
    return `${workspaceId} ${connectorId}`;
  }

  async listByWorkspaceId(workspaceId: UUID): Promise<ConnectorCredentialRow[]> {
    return [...this.rows.values()]
      .filter((row) => row.workspaceId === workspaceId)
      .map((row) => ({ ...row }));
  }

  async upsert(row: ConnectorCredentialRow): Promise<void> {
    this.rows.set(InMemoryConnectorCredentialRepo.keyOf(row.workspaceId, row.connectorId), { ...row });
  }

  async deleteByConnectorId(input: { workspaceId: UUID; connectorId: string }): Promise<void> {
    this.rows.delete(InMemoryConnectorCredentialRepo.keyOf(input.workspaceId, input.connectorId));
  }
}
