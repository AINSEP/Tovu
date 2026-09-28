/**
 * @file G3 remembered approvals (owner rule 2026-09-27, "Remembered approvals"): the two places a
 * person's "don't ask me again" for an external tool is kept, and the fingerprint that ties each one
 * to the tool exactly as it was when approved.
 *
 * - **This chat** — `ConversationToolApprovalStore`, stored with the conversation in `chat.db`
 *   (`assistant/persistence/conversation-tool-approval-store.ts`), so it survives a daemon/API
 *   restart and a new chat asks again. Scoped to the person too: naming someone else's
 *   conversation id reuses nothing.
 * - **Always** — `ExternalMcpToolApprovalRepoPort`, one `external_mcp_tool_approvals` row per site +
 *   connection + remote tool in `content.db`, beside the connection's own row and deleted with it.
 *   Listed and revoked from the Integrations page (`GET/DELETE /api/admin/v1/external-mcp/:serverId/
 *   tool-approvals`). Never stored for a destructive tool.
 *
 * One general mechanism for every federated tool (external MCP servers, agent plugins,
 * integrations): nothing here names a plugin or reads plugin config.
 *
 * Architectural role: `assistant` ports + pure helpers; the card and the lookups are wired in
 * `external-mcp-call-confirmation.ts`.
 */
import { createHash } from "node:crypto";

import type { UUID } from "@jini-ai/cms/core";

import type { FederatedConnectionOrigin, RemoteToolDescriptor } from "./mcp-federation/ports.js";

/** How long a person's answer on the card should count. `once` is the plain "Allow". */
export type FederatedApprovalScope = "once" | "chat" | "always";

/** Everything that identifies a tool for a remembered approval — change any of it and it asks again. */
export interface FederatedToolIdentity {
  readonly connectionId: string;
  readonly remoteName: string;
  /** The hints recorded when the tool was admitted (`AdmittedFederatedTool.declaredAnnotations`). */
  readonly declaredAnnotations: RemoteToolDescriptor["annotations"] | undefined;
  /**
   * Where the connection came from. A roster connection's `admissionRevision` already changes when
   * its url/command/args/transport/auth mode/credential or the row itself changes
   * (`externalMcpAdmissionRevision`), which is what "the server changed" means here.
   */
  readonly origin: FederatedConnectionOrigin | undefined;
}

/** Stable JSON: object keys sorted at every depth, so the same hints always hash the same. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * The fingerprint a remembered approval is saved under and later matched against: the connection,
 * the server it reaches (its origin and admission revision), the remote tool name and its declared
 * hints. Hashed, because an admission revision is itself derived from values that can carry
 * credentials and this string is stored and compared, never shown.
 *
 * @complexity O(h) in the size of the hints.
 */
export function federatedToolApprovalFingerprint(identity: FederatedToolIdentity): string {
  const origin = identity.origin === undefined ? null : identity.origin.kind === "roster" ? ["roster", identity.origin.admissionRevision] : ["preset"];
  return createHash("sha256")
    .update(canonicalJson(["g3-approval-v1", identity.connectionId, origin, identity.remoteName, identity.declaredAnnotations ?? null]))
    .digest("hex");
}

/** One saved "Always allow". */
export interface ExternalMcpToolApprovalRecord {
  readonly workspaceId: UUID;
  readonly serverId: string;
  readonly toolName: string;
  readonly fingerprint: string;
  readonly grantedByPrincipalId: string;
  readonly grantedAt: string;
}

/** The "Always allow" store (`external_mcp_tool_approvals`). */
export interface ExternalMcpToolApprovalRepoPort {
  find(input: { workspaceId: UUID; serverId: string; toolName: string }): Promise<ExternalMcpToolApprovalRecord | null>;
  /** Inserts, or replaces the fingerprint/grant of, the one row for this site + connection + tool. */
  upsert(record: ExternalMcpToolApprovalRecord): Promise<void>;
  listByWorkspaceId(workspaceId: UUID): Promise<ExternalMcpToolApprovalRecord[]>;
  /** @returns Whether a row was removed. */
  delete(input: { workspaceId: UUID; serverId: string; toolName: string }): Promise<boolean>;
}

/** One saved "Allow for this chat". */
export interface ConversationToolApprovalKey {
  readonly conversationId: string;
  readonly principalId: string;
  readonly connectionId: string;
  readonly toolName: string;
  readonly fingerprint: string;
}

/** The "Allow for this chat" store, kept with the conversation (`chat.db`). */
export interface ConversationToolApprovalStore {
  /** True only for this conversation AND this person AND this exact fingerprint. */
  has(key: ConversationToolApprovalKey): Promise<boolean>;
  grant(key: ConversationToolApprovalKey, grantedAt: string): Promise<void>;
}

function approvalKey(input: { workspaceId: string; serverId: string; toolName: string }): string {
  return JSON.stringify([input.workspaceId, input.serverId, input.toolName]);
}

/** In-memory {@link ExternalMcpToolApprovalRepoPort}, for DB-less compositions and tests. */
export class InMemoryExternalMcpToolApprovalRepo implements ExternalMcpToolApprovalRepoPort {
  private readonly rows = new Map<string, ExternalMcpToolApprovalRecord>();

  async find(input: { workspaceId: UUID; serverId: string; toolName: string }): Promise<ExternalMcpToolApprovalRecord | null> {
    return this.rows.get(approvalKey(input)) ?? null;
  }

  async upsert(record: ExternalMcpToolApprovalRecord): Promise<void> {
    this.rows.set(approvalKey(record), { ...record });
  }

  async listByWorkspaceId(workspaceId: UUID): Promise<ExternalMcpToolApprovalRecord[]> {
    return [...this.rows.values()].filter((row) => row.workspaceId === workspaceId);
  }

  async delete(input: { workspaceId: UUID; serverId: string; toolName: string }): Promise<boolean> {
    return this.rows.delete(approvalKey(input));
  }
}

/** In-memory {@link ConversationToolApprovalStore}, for DB-less compositions and tests. */
export function createInMemoryConversationToolApprovalStore(): ConversationToolApprovalStore {
  const rows = new Map<string, string>();
  const keyOf = (key: ConversationToolApprovalKey) => JSON.stringify([key.conversationId, key.principalId, key.connectionId, key.toolName]);
  return {
    async has(key) {
      return rows.get(keyOf(key)) === key.fingerprint;
    },
    async grant(key) {
      rows.set(keyOf(key), key.fingerprint);
    },
  };
}
