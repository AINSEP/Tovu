import type { AdminExternalMcpServer, AdminExternalMcpToolApproval } from "@/lib/api";

/**
 * @file What `useAlwaysAllow` needs from the outside world, as an interface rather than a direct
 * `lib/api` import — same split `integration-deliveries-port.hooks.ts` makes.
 */
export interface AlwaysAllowPort {
  listExternalMcpToolApprovals(): Promise<{ approvals: AdminExternalMcpToolApproval[] }>;
  /** For each server's label. */
  listExternalMcpServers(): Promise<{ servers: Pick<AdminExternalMcpServer, "serverId" | "label">[] }>;
  revokeExternalMcpToolApproval(serverId: string, toolName: string): Promise<{ removed: boolean }>;
}
