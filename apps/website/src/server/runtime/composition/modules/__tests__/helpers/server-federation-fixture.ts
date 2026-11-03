import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import { createContributionRegistry, type DerivedToolContributor, type ToolContributor } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import type { McpSessionPort, ResolvedFederatedConnection } from "@jini-ai/mcp/federation";
import { createByokToolSurface } from "#src/assistant/byok-tool-surface";
import type { AssistantToolRegistryDeps } from "#src/assistant/tool-registrations";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { installFirstPartyToolContributors } from "#src/server/runtime/composition/tool-catalog-manifest";
import { saveExternalMcpServer } from "#src/features/external-mcp/external-mcp-store";
import type { ExternalMcpOAuthService } from "#src/features/external-mcp/contracts";

/** Real server store, registration builder, executor and federation; only the remote session is fake. */
export function serverFederationFixture({ connect, oauthFor }: {
  connect: (connection: ResolvedFederatedConnection) => Promise<McpSessionPort>;
  oauthFor?: (deps: ReturnType<typeof createRouteDeps>) => ExternalMcpOAuthService;
}, _optional: Record<string, never> = {}) {
  const deps = createRouteDeps();
  deps.authorize = async ({ principalId }) => ({ allowed: principalId === "owner", reason: "matched" });
  if (oauthFor) deps.externalMcpOAuth = oauthFor(deps);
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions }, { readAdmissions: () => surface.readFederationAdmissions({}, {}).then(snapshot => ({ ok: true as const, ...snapshot })) });
  const surface = createByokToolSurface(deps, { contributions, federationConnect: connect });
  async function save({ serverId = "hosted", oauth = false, toolName = "echo" }: { serverId?: string; oauth?: boolean; toolName?: string } = {}) {
    await saveExternalMcpServer({ repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock }, {
      workspaceId: deps.workspaceId, principalId: "owner", serverId, enabled: true,
      transport: "streamable_http", url: `https://${serverId}.example/mcp`, command: "", args: "", env: "",
      authMode: oauth ? "oauth" : "none", allowedToolNames: toolName, writeAllowedToolNames: toolName,
      ...(oauth ? { oauth: { grant: "authorization_code", clientId: "test-client", scopes: "read", authorizationEndpoint: "https://oauth.example/authorize", tokenEndpoint: "https://oauth.example/token" } } : {}),
    });
  }
  return { deps, surface, save };
}
