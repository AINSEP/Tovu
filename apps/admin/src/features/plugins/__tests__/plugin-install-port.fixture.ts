import { ApiError } from "@/lib/admin-http/request";
import type { PluginInstallPort, PluginInstallPreview } from "@jini-ai/admin/screens/plugins/hooks/plugin-install-port.hooks";

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
