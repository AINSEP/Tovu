import { createPluginInstallPort } from "@jini-ai/plugins/react/plugin-install-port";
import { authenticatedAdminRequest } from "@/lib/admin-http/request";
import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import type { PluginInstallPort, PluginInstallPreview } from "@jini-ai/admin/screens/plugins/hooks/plugin-install-port.hooks";

/** Reuse the authenticated request seam, including session expiry and the normal API prefix. */
export const defaultPluginInstallPort = createPluginInstallPort<PluginInstallPreview>({ request: authenticatedAdminRequest, workspaceId: WORKSPACE_ID }, {}) satisfies PluginInstallPort;

