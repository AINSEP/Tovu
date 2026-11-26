import { createAgentPluginInstallPort } from "@jini-ai/agent-plugins/react/agent-plugin-install-port";
import { authenticatedAdminRequest } from "@/lib/admin-http/request";
import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import type { AgentPluginInstallPort, AgentPluginInstallResult } from "@jini-ai/admin/screens/integrations/agent-plugin-ports";

/** The live upload, through the shared authenticated request seam (session expiry, API prefix). */
export const defaultAgentPluginInstallPort = createAgentPluginInstallPort<AgentPluginInstallResult>({
  request: authenticatedAdminRequest, workspaceId: WORKSPACE_ID,
  digest: (algorithm, data) => crypto.subtle.digest(algorithm, data),
}, {}) satisfies AgentPluginInstallPort;

