import type { composeOutboundConnections } from "./outbound-connections.js";
import type { composeContentStores } from "./content-stores.js";
import type { composeIdentitySettings } from "./identity-settings.js";
import type { composePublishingStoresThemes } from "./publishing-stores-themes.js";
import type { startBootData } from "./boot-data.js";
import type { composeEventsOrigin } from "./events-origin.js";
import type { composeStoreBasics } from "./store-basics.js";
import type { NewsletterRouteDeps } from "../../../inbound/admin-http/routes/newsletter/deps.js";
import type { composeAgentPluginBootstrap } from "./agent-plugin-bootstrap.js";
import type { composeProviderConfigSource } from "./provider-config.js";
import type { composeSiteKeysMembers } from "./site-keys-members.js";
import type { composeAssistantCredentials } from "./assistant-credentials.js";
import type { ByokToolSurfaceDeps } from "#src/assistant/index";
import type { RouteDeps } from "../../../routes/types.js";
import { SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID } from "../../configuration/seed.js";
import { bundledAgentPluginsDir } from "../site-paths.js";
import { composeAgentPluginMcp } from "../agent-plugin-service-ports.js";
import { createPluginExportRuntime } from "#src/features/agent-plugins/exports/runtime";
import { createPluginExportSource } from "#src/features/agent-plugins/exports/source";
import { createReadyLoginProviderList } from "#src/features/member-login/index";
import { createSeoDeps } from "#src/features/seo/index";
import { createSiteConsentReadiness } from "@jini-ai/cookie-consent/site/settings";
import { reportPrivacyDefaultsFailure } from "#src/features/consent/privacy-defaults-reporter";
import { createSitemapService } from "@jini-ai/cms/seo";
import { ensureSiteConsentPrivacy } from "../site-consent.js";
import { resolve } from "node:path";

interface ComposePreAssemblyRequired {
  agentPluginConnections: ReturnType<typeof composeOutboundConnections>["agentPluginConnections"];
  postRepo: ReturnType<typeof composeContentStores>["postRepo"];
  settingsRepo: ReturnType<typeof composeIdentitySettings>["settingsRepo"];
  mediaRepo: ReturnType<typeof composeContentStores>["mediaRepo"];
  mediaContentTypeStore: ReturnType<typeof composePublishingStoresThemes>["mediaContentTypeStore"];
  transformDefinitionRepo: ReturnType<typeof startBootData>["transformDefinitionRepo"];
  originRegistry: ReturnType<typeof composeEventsOrigin>["originRegistry"];
  clock: ReturnType<typeof composeStoreBasics>["clock"];
  siteTitleSettingsDeps: ReturnType<typeof composeIdentitySettings>["siteTitleSettingsDeps"];
  siteSettingsReady: ReturnType<typeof composeIdentitySettings>["siteSettingsReady"];
  identity: ReturnType<typeof composeIdentitySettings>["identity"];
  workspaceId: string;
  routeDeps: () => (NewsletterRouteDeps & ByokToolSurfaceDeps);
  agentPluginLifecycle: ReturnType<typeof composeAgentPluginBootstrap>["agentPluginLifecycle"];
  customCredentialSetRepo: ReturnType<typeof composeProviderConfigSource>["customCredentialSetRepo"];
  siteAssistantSecretSealer: ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretSealer"];
  externalMcpServerRepo: ReturnType<typeof composeAssistantCredentials>["externalMcpServerRepo"];
  siteAssistantSecretKeyring: ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretKeyring"];
}

export function composePreAssembly(required: ComposePreAssemblyRequired, _optional = {}) {
  const { agentPluginConnections, postRepo, settingsRepo, mediaRepo, mediaContentTypeStore, transformDefinitionRepo, originRegistry, clock, siteTitleSettingsDeps, siteSettingsReady, identity, workspaceId, routeDeps, agentPluginLifecycle, customCredentialSetRepo, siteAssistantSecretSealer, externalMcpServerRepo, siteAssistantSecretKeyring } = required;
  // Boot load of plugin admin-surface handlers (each surface open reloads them too; see handlers.ts).
  const adminSurfaceHandlersReady = agentPluginConnections.adminSurfaceHost.refresh().then(() => {}, (error: unknown) => {
    console.warn(`[admin-surfaces] handler modules could not be loaded at boot, continuing without them — ${error instanceof Error ? error.message : String(error)}`);
  });
  // Every app over this composition shares the store's lifetime; each boot pass leaves once settled.
  const siteAppBootWork = new Set<Promise<void>>();
  const seoDeps = createSeoDeps({ deps: { postRepo, settingsRepo, mediaRepo, mediaContentTypeStore, transformDefinitionRepo, originRegistry, clock } }, {});
  const sitemapService = createSitemapService({ deps: seoDeps }, {});
  let resolveRouteDeps!: (deps: RouteDeps) => void;
  const routeDepsBuilt = new Promise<RouteDeps>(resolve => { resolveRouteDeps = resolve; });
  // Serialize ledger registration, but never gate consent on unrelated title preservation.
  const siteConsentReady = createSiteConsentReadiness({ ...siteTitleSettingsDeps,
    after: Promise.all([siteSettingsReady, identity.identityReady]).then(() => undefined),
    systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID,
  }, {
    ensurePrivacyDefaults: () => ensureSiteConsentPrivacy({ deps: routeDepsBuilt }),
    reportPrivacyDefaultsFailure,
  });
  const pluginExports = createPluginExportRuntime({ workspaceId: workspaceId, embedConsentOff: () => routeDeps().cookieConsent?.embedConsentOff?.() === true, source: createPluginExportSource({ lifecycle: agentPluginLifecycle }), listProviders: createReadyLoginProviderList({ sourceRoot: bundledAgentPluginsDir(), loadContributions: agentPluginLifecycle.loadPluginContributions, credentials: { repo: customCredentialSetRepo, sealer: siteAssistantSecretSealer } }) });
  // ONE composed MCP port: routeDeps.mcp and the sign-in grant share its projections and classifier.
  const agentPluginMcp = composeAgentPluginMcp({ repo: externalMcpServerRepo, sealer: siteAssistantSecretSealer, keyring: siteAssistantSecretKeyring, clock });
  return { adminSurfaceHandlersReady, siteAppBootWork, seoDeps, sitemapService, resolveRouteDeps, siteConsentReady, pluginExports, agentPluginMcp };
}
