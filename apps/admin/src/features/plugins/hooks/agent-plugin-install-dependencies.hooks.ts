import { ApiError, authenticatedAdminRequest, WORKSPACE_ID, type AdminAgentPlugin } from "@/lib/api";
import type { AgentPluginInstallPort, AgentPluginInstallResult } from "./agent-plugin-install-port.hooks";

/** The live upload, through the shared authenticated request seam (session expiry, API prefix). */
export const defaultAgentPluginInstallPort: AgentPluginInstallPort = {
  installZip: ({ file, sha256, replace = false }) =>
    authenticatedAdminRequest<AgentPluginInstallResult>({
      path: `/workspaces/${WORKSPACE_ID}/agent-plugins/install/zip?${new URLSearchParams({ expectedSha256: sha256, replace: String(replace) })}`,
      method: "POST",
      body: file.slice(0, file.size, "application/zip"),
    }),
  sha256: async ({ file }) => {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  },
};

/** An in-memory {@link AgentPluginInstallPort}: answers with `row`, or rejects with `failWith`. */
export function createFakeAgentPluginInstallPort(
  required: { row: AdminAgentPlugin },
  optional: { failWith?: ApiError; alreadyInstalled?: boolean } = {},
): AgentPluginInstallPort & { uploads: Array<{ name: string; sha256: string }> } {
  const uploads: Array<{ name: string; sha256: string }> = [];
  return {
    uploads,
    installZip: async ({ file, sha256 }) => {
      uploads.push({ name: file.name, sha256 });
      if (optional.failWith) throw optional.failWith;
      return { alreadyInstalled: optional.alreadyInstalled === true, agentPlugin: required.row };
    },
    sha256: async ({ file }) => `sha-of-${file.name}`,
  };
}
