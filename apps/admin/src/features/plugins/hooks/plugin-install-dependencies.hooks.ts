import { createPluginInstallPort } from "@jini-ai/plugins/react/plugin-install-port";
import { ApiError, authenticatedAdminRequest } from "@/lib/admin-http/request";
import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import type { PluginInstallPort, PluginInstallPreview } from "@jini-ai/admin/screens/plugins/hooks/plugin-install-port.hooks";

/** Reuse the authenticated request seam, including session expiry and the normal API prefix. */
export const defaultPluginInstallPort = createPluginInstallPort<PluginInstallPreview>({ request: authenticatedAdminRequest, workspaceId: WORKSPACE_ID }, {}) satisfies PluginInstallPort;

export function createFakePluginInstallPort(required: { preview: PluginInstallPreview }, _optional = {}): PluginInstallPort & { installed: PluginInstallPreview[] } {
  const installed: PluginInstallPreview[] = [];
  return {
    installed,
    preview: async () => ({ plugin: required.preview }),
    install: async (input, _optional = {}) => {
      if (input.expectedDigest !== required.preview.digest) throw new ApiError({ message: "Consent digest does not match", status: 409 }, { code: "PLUGIN_CHANGED_SINCE_PREVIEW" });
      installed.push(required.preview); return { plugin: required.preview };
    },
  };
}
