import { createAgentPluginInstallPort } from "@jini-ai/agent-plugins/react/agent-plugin-install-port";
import type { AgentPluginListRow } from "@jini-ai/admin/agent-plugins/models";
import { ApiError, authenticatedAdminRequest } from "@/lib/admin-http/request";
import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import type { AgentPluginInstallPort, AgentPluginInstallResult } from "@jini-ai/admin/screens/integrations/agent-plugin-ports";

/** The live upload, through the shared authenticated request seam (session expiry, API prefix). */
export const defaultAgentPluginInstallPort = createAgentPluginInstallPort<AgentPluginInstallResult>({
  request: authenticatedAdminRequest, workspaceId: WORKSPACE_ID,
  digest: (algorithm, data) => crypto.subtle.digest(algorithm, data),
}, {}) satisfies AgentPluginInstallPort;

/** An in-memory {@link AgentPluginInstallPort}: answers with `row` (and `warnings`), or rejects
 *  with `failWith`. An update's target is recorded with its upload. */
export function createFakeAgentPluginInstallPort(
  required: { row: AgentPluginListRow },
  optional: { failWith?: ApiError; alreadyInstalled?: boolean; warnings?: string[] } = {},
): AgentPluginInstallPort & { uploads: Array<{ name: string; sha256: string; update?: { pluginId: string; expectedOldDigest: string } }> } {
  const uploads: Array<{ name: string; sha256: string; update?: { pluginId: string; expectedOldDigest: string } }> = [];
  return {
    uploads,
    installZip: async ({ file, sha256, update }) => {
      uploads.push({ name: file.name, sha256, ...(update ? { update } : {}) });
      if (optional.failWith) throw optional.failWith;
      return { alreadyInstalled: optional.alreadyInstalled === true, agentPlugin: required.row, ...(optional.warnings ? { warnings: optional.warnings } : {}) };
    },
    sha256: async ({ file }) => `sha-of-${file.name}`,
  };
}
