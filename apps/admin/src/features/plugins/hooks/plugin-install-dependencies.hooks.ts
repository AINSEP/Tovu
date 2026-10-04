import { ApiError, authenticatedAdminRequest, WORKSPACE_ID } from "@/lib/api";
import type { PluginInstallPort, PluginInstallPreview, PluginInstallSource } from "./plugin-install-port.hooks";

function installRequest(input: PluginInstallSource & { expectedDigest?: string }, preview: boolean) {
  const endpoint = `/workspaces/${WORKSPACE_ID}/plugins/install`;
  if (input.source.kind === "folder") return authenticatedAdminRequest<{ plugin: PluginInstallPreview }>({ path: endpoint + (preview ? "/preview" : ""), method: "POST", body: input });
  const query = new URLSearchParams({ replace: String(input.replace === true), ...(input.expectedDigest ? { expectedDigest: input.expectedDigest } : {}) });
  return authenticatedAdminRequest<{ plugin: PluginInstallPreview }>({ path: `${endpoint}/zip${preview ? "/preview" : ""}?${query}`, method: "POST", body: input.source.file.slice(0, input.source.file.size, "application/zip") });
}

/** Reuse the authenticated request seam, including session expiry and the normal API prefix. */
export const defaultPluginInstallPort: PluginInstallPort = {
  preview: (body) => installRequest(body, true),
  install: (body) => installRequest(body, false),
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
