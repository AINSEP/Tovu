import { describeSiteBinding } from "#src/platform/site-dir/index";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { createTovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";
import { bundledAgentPluginsDir } from "../../site-paths.js";
import { createDeferredAgentPluginUpdateEffects } from "#src/features/agent-plugins/update-effects";
import { createFederatedMcpPresetRegistry } from "@jini-ai/mcp/federation";
import { resolveSkillLayout } from "#src/features/skills/layout";
import { InMemoryCustomCredentialSetRepo } from "#src/features/custom-credentials/index";
import type { NewsletterRouteDeps } from "../../../../inbound/admin-http/routes/newsletter/deps.js";
import type { ByokToolSurfaceDeps } from "#src/assistant/index";

export function composeMemoryAgentPlugins(required: { routeDeps: () => NewsletterRouteDeps & ByokToolSurfaceDeps }, _optional = {}) {
  const { routeDeps } = required;
  const siteBinding = describeSiteBinding();
  const agentPluginLayout = resolveAgentPluginLayout({ siteDir: siteBinding.dir });
  const agentPluginLifecycle = createTovuAgentPluginLifecycle({ layout: agentPluginLayout }, {
    bundledSourceRoot: bundledAgentPluginsDir(),
    identityAdmission: ({ id, localId, run }) => {
      const host = routeDeps().pluginHost;
      if (!host) throw new Error("agent plugin installation has no plugin host");
      return host.withInstallIdentity({ candidate: { id, localId, family: "agent-plugin" }, run });
    },
    // Boot recovery re-provisions a restored revision's MCP servers through the same store; read
    // lazily because that store is composed below.
    mcpProvisioning: createDeferredAgentPluginUpdateEffects({ resolveDeps: routeDeps }),
  });
  const federatedMcpPresetRegistry = createFederatedMcpPresetRegistry({});
  const skillLayout = resolveSkillLayout({ siteDir: siteBinding.dir });
  // 2026-08-17 — hermetic double for `apps/website/src/server/runtime/composition/deps.ts`'s real `SqliteCustomCredentialSetRepo`; see
  // `routes/types.ts`'s `customCredentialSetRepo` doc. One instance: the plugin connections read an
  // admin's own OAuth client from the same saved credentials the Access Tokens routes write.
  const customCredentialSetRepo = new InMemoryCustomCredentialSetRepo();
  return { agentPluginLifecycle, agentPluginLayout, customCredentialSetRepo, siteBinding, federatedMcpPresetRegistry, skillLayout };
}
