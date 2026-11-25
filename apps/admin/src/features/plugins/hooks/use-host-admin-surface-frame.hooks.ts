import { useAdminSurfaceFrame, type AdminSurfaceFrameController } from "@jini-ai/admin/screens/plugins/hooks/use-admin-surface-frame.hooks";
import type { AgentPluginSurfacesPort, AgentPluginSurfaceSummary } from "@jini-ai/admin/screens/plugins/hooks/agent-plugin-surfaces-port.hooks";
import { ADMIN_TOKEN_SOURCES } from "../admin-token-sources";

/** Jini's plugin-surface frame controller bound to this admin's design-token map. */
export function useHostAdminSurfaceFrame(
  required: { readonly pluginId: string; readonly surface: AgentPluginSurfaceSummary; readonly port: AgentPluginSurfacesPort },
  _optional: Record<string, never> = {},
): AdminSurfaceFrameController {
  return useAdminSurfaceFrame({ ...required, themeSources: ADMIN_TOKEN_SOURCES });
}
