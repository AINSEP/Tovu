import type { UUID } from "@jini-ai/core/primitives";
import { openExternalMcpOAuthPayload, type ExternalMcpServerRepoPort } from "#src/assistant/external-mcp-store";
import type { SecretSealerPort } from "#src/features/webhooks/index";

/**
 * Binds the mail fallback to this workspace's plugin account rows. Each lookup reads the current
 * row and decrypts only an enabled static account owned by the requesting mail plugin.
 * @returns A token resolver returning null for an ineligible row or missing key.
 * @throws Repository and secret-store faults; the mail read fallback handles these as unavailable.
 * @complexity One indexed row read and at most one decrypt; O(1) auxiliary space.
 */
export function createPluginAccountTokenResolver(required: {
  workspaceId: UUID;
  repo: Pick<ExternalMcpServerRepoPort, "findByServerId">;
  sealer: SecretSealerPort;
}, _options: Record<string, never> = {}): (input: { pluginId: string; serverId: string }) => Promise<string | null> {
  const { workspaceId, repo, sealer } = required;
  return async ({ pluginId, serverId }) => {
    const row = await repo.findByServerId({ workspaceId, serverId });
    // A mail plugin may read only its own enabled account, never another plugin's saved key.
    if (!row?.enabled || row.provisionedByPluginId !== pluginId) return null;
    // OAuth MCP tokens target the MCP server, not the vendor REST API. Only a pasted Full-access
    // account key can supply this fallback; never refresh or forward an OAuth token here.
    if (row.authMode !== "static_env") return null;
    return (await openExternalMcpOAuthPayload(sealer, row)).staticAccessToken ?? null;
  };
}
