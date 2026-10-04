import { ApiError, authenticatedAdminRequest, WORKSPACE_ID } from "@/lib/api";
import type { PluginInstallPort, PluginInstallPreview } from "./plugin-install-port.hooks";

/** Reuse the authenticated request seam, including session expiry and the normal API prefix. */
export const defaultPluginInstallPort: PluginInstallPort = {
  preview: (body) => authenticatedAdminRequest({ path: `/workspaces/${WORKSPACE_ID}/plugins/install/preview`, method: "POST", body }),
  install: (body) => authenticatedAdminRequest({ path: `/workspaces/${WORKSPACE_ID}/plugins/install`, method: "POST", body }),
};

export function createFakePluginInstallPort(required: { preview: PluginInstallPreview }, _optional = {}): PluginInstallPort & { installed: PluginInstallPreview[] } {
  const installed: PluginInstallPreview[] = [];
  return {
    installed,
    preview: async () => ({ plugin: required.preview }),
    install: async (input) => {
      if (input.expectedDigest !== required.preview.digest) throw new ApiError("Consent digest does not match", 409, "PLUGIN_CHANGED_SINCE_PREVIEW");
      installed.push(required.preview); return { plugin: required.preview };
    },
  };
}
