import { api, type AdminExternalMcpServer, type AdminExternalMcpToolApproval } from "@/lib/api";
import type { AlwaysAllowPort } from "./always-allow-port.hooks";

/**
 * @file The only place under `features/providers/hooks` that reaches `lib/api` for the "Always
 * allow" tab — see `always-allow-port.hooks.ts`.
 */

export const defaultAlwaysAllowPort: AlwaysAllowPort = {
  listExternalMcpToolApprovals: () => api.listExternalMcpToolApprovals(),
  listExternalMcpServers: () => api.listExternalMcpServers(),
  revokeExternalMcpToolApproval: (serverId, toolName) => api.revokeExternalMcpToolApproval(serverId, toolName),
};

/** Seed state for {@link createFakeAlwaysAllowPort}. */
export interface FakeAlwaysAllowPortOptions {
  approvals?: AdminExternalMcpToolApproval[];
  servers?: Pick<AdminExternalMcpServer, "serverId" | "label">[];
  /** When set, every revoke rejects with this error and removes nothing. */
  revokeError?: Error;
}

/** An in-memory {@link AlwaysAllowPort} for tests; a revoke really removes the row. */
export function createFakeAlwaysAllowPort(options: FakeAlwaysAllowPortOptions = {}): AlwaysAllowPort {
  let approvals = [...(options.approvals ?? [])];
  const servers = options.servers ?? [];

  return {
    async listExternalMcpToolApprovals() {
      return { approvals: [...approvals] };
    },
    async listExternalMcpServers() {
      return { servers };
    },
    async revokeExternalMcpToolApproval(serverId, toolName) {
      if (options.revokeError) throw options.revokeError;
      const before = approvals.length;
      approvals = approvals.filter((row) => !(row.serverId === serverId && row.toolName === toolName));
      return { removed: approvals.length < before };
    },
  };
}
