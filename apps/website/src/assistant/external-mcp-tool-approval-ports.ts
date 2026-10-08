/**
 * @file Host storage contracts for remembered external-tool approvals.
 * This chat lives with the conversation in chat.db and is scoped to the person; naming another
 * person's conversation reuses nothing. Always grants live beside the connection in content.db,
 * are deleted with it, and are listed/revoked from Integrations → Always allow.
 * Fingerprinting, drift checks and destructive-call locks live in @jini-ai/mcp/federation.
 */
import type { UUID } from "@jini-ai/core/primitives";
import type {
  ConversationToolApprovalKey,
  ExternalMcpToolApprovalRecord as SharedApprovalRecord,
} from "@jini-ai/mcp/federation";

/** A site's durable grant; the required workspace cannot be omitted by a host caller. */
export interface ExternalMcpToolApprovalRecord extends Omit<SharedApprovalRecord, "scope"> {
  readonly workspaceId: UUID;
}

/** Existing SQL adapters keep their workspace partition explicit at every operation. */
export interface ExternalMcpToolApprovalRepoPort {
  find(input: { workspaceId: UUID; serverId: string; toolName: string }): Promise<ExternalMcpToolApprovalRecord | null>;
  upsert(record: ExternalMcpToolApprovalRecord): Promise<void>;
  listByWorkspaceId(workspaceId: UUID): Promise<ExternalMcpToolApprovalRecord[]>;
  delete(input: { workspaceId: UUID; serverId: string; toolName: string }): Promise<boolean>;
}

/** Legacy SQL grant ABI is adapted once at the package boundary. */
export interface ConversationToolApprovalStore {
  has(key: ConversationToolApprovalKey): Promise<boolean>;
  /** Person/identity grant shared across existing chats; used only for native escalations. */
  hasIdentity?(key: Omit<ConversationToolApprovalKey, "conversationId">): Promise<boolean>;
  grant(key: ConversationToolApprovalKey, grantedAt: string): Promise<void>;
}
