/** @file Workspace and SQL-ABI adapters; Jini owns the stores and remembered-approval policy. */
import type { UUID } from "@jini-ai/core/primitives";
import type {
  ConversationToolApprovalStore as SharedConversationStore,
  ExternalMcpToolApprovalRepoPort as SharedApprovalRepo,
} from "@jini-ai/mcp/federation";
import {
  InMemoryExternalMcpToolApprovalRepo as SharedMemoryRepo,
  createInMemoryConversationToolApprovalStore as createSharedMemoryStore,
} from "@jini-ai/mcp/federation/testing";
import type { ConversationToolApprovalStore, ExternalMcpToolApprovalRecord, ExternalMcpToolApprovalRepoPort } from "./external-mcp-tool-approval-ports.js";

/** Bind a required workspace once; shared code cannot choose or omit the SQL partition.
 * @complexity O(1); returned operations retain the host repository's costs and errors.
 */
export function toJiniToolApprovalRepo({ repo, workspaceId }: {
  repo: ExternalMcpToolApprovalRepoPort; workspaceId: UUID;
}, _optional: Record<string, never> = {}): SharedApprovalRepo {
  return {
    find: input => repo.find({ ...input, workspaceId }),
    upsert: record => repo.upsert({ ...record, workspaceId }),
    listByScope: () => repo.listByWorkspaceId(workspaceId),
    delete: input => repo.delete({ ...input, workspaceId }),
  };
}

/** Adapt the existing two-scalar SQL grant method without changing persisted key bytes. */
export function toJiniConversationApprovalStore({ store }: {
  store: ConversationToolApprovalStore;
}, _optional: Record<string, never> = {}): SharedConversationStore {
  return { has: key => store.has(key), ...(store.hasIdentity ? { hasIdentity: key => store.hasIdentity!(key) } : {}), grant: ({ key, grantedAt }) => store.grant(key, grantedAt) };
}

/** DB-less host composition: workspace ids become Jini's opaque scope; no local map is forked. */
export class InMemoryExternalMcpToolApprovalRepo implements ExternalMcpToolApprovalRepoPort {
  private readonly repo = new SharedMemoryRepo({});

  constructor(_required: Record<string, never> = {}, _optional: Record<string, never> = {}) {}

  async find({ workspaceId, ...input }: { workspaceId: UUID; serverId: string; toolName: string }): Promise<ExternalMcpToolApprovalRecord | null> {
    const row = await this.repo.find(input, { scope: workspaceId });
    if (row === null) return null;
    const { scope: _scope, ...record } = row;
    return { ...record, workspaceId };
  }

  upsert({ workspaceId, ...record }: ExternalMcpToolApprovalRecord): Promise<void> {
    return this.repo.upsert(record, { scope: workspaceId });
  }

  async listByWorkspaceId(workspaceId: UUID): Promise<ExternalMcpToolApprovalRecord[]> {
    return (await this.repo.listByScope({}, { scope: workspaceId })).map(({ scope: _scope, ...record }) => ({ ...record, workspaceId }));
  }

  delete({ workspaceId, ...input }: { workspaceId: UUID; serverId: string; toolName: string }): Promise<boolean> {
    return this.repo.delete(input, { scope: workspaceId });
  }
}

/** Preserve the host's existing factory/SQL ABI while Jini owns conversation/principal isolation. */
export function createInMemoryConversationToolApprovalStore(): ConversationToolApprovalStore {
  const store = createSharedMemoryStore({});
  return { has: key => store.has(key), hasIdentity: key => store.hasIdentity!(key), grant: (key, grantedAt) => store.grant({ key, grantedAt }) };
}
