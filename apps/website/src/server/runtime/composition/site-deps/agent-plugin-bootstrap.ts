import { builtInThemesDir } from "../site-paths.js";
import { bundledAgentPluginsDir } from "../site-paths.js";
import { createAssistantAgentInventory } from "#src/assistant/agents";
import { createDeferredAgentPluginUpdateEffects } from "#src/features/agent-plugins/update-effects";
import { createFederatedMcpPresetRegistry } from "@jini-ai/mcp/federation";
import { createNativeAgentRuntime } from "@jini-ai/agent-runtime";
import { createTovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { resolveSkillLayout } from "#src/features/skills/layout";
import { seedSiteThemes } from "#src/platform/site-dir/seed-site-themes";
import type { RouteDeps } from "../../../routes/types.js";
import type { NewsletterRouteDeps } from "../../../inbound/admin-http/routes/newsletter/deps.js";
import type { ByokToolSurfaceDeps } from "#src/assistant/index";
import { type CreateSiteRouteDepsOverrides, resolveSiteBindingOverride, resolveThemesDirOverride } from "./overrides.js";
import type { StoreCloseRegistration } from "./open-store.js";

interface ComposeAgentPluginBootstrapRequired {
  onStoreClose: (required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void;
  overrides: Partial<CreateSiteRouteDepsOverrides>;
  lifecycleTracker: () => Pick<RouteDeps['tracker'], 'capture'>;
  routeDeps: () => NewsletterRouteDeps & ByokToolSurfaceDeps;
}

export function composeAgentPluginBootstrap(required: ComposeAgentPluginBootstrapRequired, _optional = {}) {
  const { onStoreClose, overrides, lifecycleTracker, routeDeps } = required;
  const assistantAgentInventory = createAssistantAgentInventory({ runtime: createNativeAgentRuntime({ env: process.env }) });
  onStoreClose({ registration: () => assistantAgentInventory.dispose({}) });

  // Resolved ONCE and threaded down, the same discipline `exportOutputRootDir`/`themesDir` already
  // follow (see `routes/types.ts`). Seeded before anything discovers themes off it: on a site's
  // first boot `<site>/themes` does not exist yet, and `discoverAllBuiltInThemes` below would
  // otherwise hand the admin an empty theme list. Deliberately NOT done in `apps/website/src/server/runtime/composition/app.ts`'s
  // in-memory `createRouteDeps()` — that is the hermetic/test path, and seeding there would copy
  // the whole ~19MB stock tree per test run.
  // The served site. Every `<site>/...` default below is rooted at its `dir`, never at `siteDir()`
  // (`TOVU_SITE_DIR` or `<cwd>/sites/<name>`), which only `tovu serve` pins to the same place — see
  // `resolveExportOutputRootDir`'s doc.
  const resolvedSiteBinding = resolveSiteBindingOverride(overrides);
  const agentPluginLayout = resolveAgentPluginLayout({ siteDir: resolvedSiteBinding.dir });
  const agentPluginLifecycle = createTovuAgentPluginLifecycle({ layout: agentPluginLayout }, {
    bundledSourceRoot: bundledAgentPluginsDir(),
    productTracker: () => lifecycleTracker(),
    identityAdmission: agentPluginIdentityAdmission({ pluginHost: () => routeDeps().pluginHost }),
    // Boot recovery re-provisions a restored revision's MCP servers through the same store; read
    // lazily because that store is composed below.
    mcpProvisioning: createDeferredAgentPluginUpdateEffects({ resolveDeps: () => routeDeps() }),
  });
  const federatedMcpPresetRegistry = createFederatedMcpPresetRegistry({});
  const skillLayout = resolveSkillLayout({ siteDir: resolvedSiteBinding.dir });
  const resolvedThemesDir = resolveThemesDirOverride(resolvedSiteBinding, overrides);
  seedSiteThemes({ stockDir: builtInThemesDir(), siteThemesDir: resolvedThemesDir, siteRoot: resolvedSiteBinding.dir });
  return { assistantAgentInventory, resolvedSiteBinding, agentPluginLayout, agentPluginLifecycle, federatedMcpPresetRegistry, skillLayout, resolvedThemesDir };
}

type AgentPluginIdentityAdmission = NonNullable<NonNullable<Parameters<typeof createTovuAgentPluginLifecycle>[1]>["identityAdmission"]>;

/** Admits an agent plugin's install identity through the plugin host, read lazily because the host is composed after the lifecycle. */
function agentPluginIdentityAdmission({ pluginHost }: { pluginHost: () => RouteDeps["pluginHost"] }, _optional = {}): AgentPluginIdentityAdmission {
  return ({ id, localId, run }) => {
    const host = pluginHost();
    if (!host) throw new Error("agent plugin installation has no plugin host");
    return host.withInstallIdentity({ candidate: { id, localId, family: "agent-plugin" }, run });
  };
}
