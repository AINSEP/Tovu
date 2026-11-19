import type { composeAgentPluginBootstrap } from "./agent-plugin-bootstrap.js";
import type { SiteStore } from "../open-site-store.js";
import type { composeStoreBasics } from "./store-basics.js";
import type { composeIdentitySettings } from "./identity-settings.js";
import type { composeSiteKeysMembers } from "./site-keys-members.js";
import type { composeAssistantCredentials } from "./assistant-credentials.js";
import type { composePublishingStoresThemes } from "./publishing-stores-themes.js";
import type { composePreAssembly } from "./pre-assembly.js";
import type { ByokToolSurfaceDeps } from "#src/assistant/index";
import type { NewsletterRouteDeps } from "../../../inbound/admin-http/routes/newsletter/deps.js";
import type { composeProviderConfig } from "./provider-identity.js";
import type { composeOutboundConnections } from "./outbound-connections.js";
import type { createFormCollectionRegistry } from "@jini-ai/cms/forms";
import { DatabaseDestinationRepo } from "#src/features/database-transfer/destination-repo";
import { INSTRUCTIONS_NAMESPACE } from "#src/features/settings/index";
import { SealedDatabaseDestinationStore } from "#src/features/database-transfer/destination-store";
import { SqliteAdminExecutionCredentialRepo } from "#src/assistant/execution-credential-repo.sqlite";
import { SqliteExternalMcpToolApprovalRepo } from "#src/platform/db/sqlite/external-mcp-tool-approval-repo.sqlite";
import { SqliteMediaProviderCredentialRepo } from "#src/features/media/media-provider-credential-repo.sqlite";
import { bundledAgentPluginsDir } from "../site-paths.js";
import { composeAgentPluginPreferences } from "../agent-plugin-service-ports.js";
import { composePluginProviderFaces } from "../agent-plugin-service-ports.js";
import { composeVisitorToolsManagement } from "../visitor-tools-management.js";
import { createApplyConnectDefaults } from "#src/features/agent-plugins/apply-connect-defaults";
import { createExternalMcpOAuthService } from "../../../../features/external-mcp/external-mcp-oauth.js";
import { createSiteConsentStore } from "#src/features/consent/revisions.repo";
import { getEffective } from "#src/features/settings/index";
import { isAdminAssistantEnabled } from "../admin-assistant-enabled.js";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { notifyExternalMcpRosterChanged } from "../../../../assistant/external-mcp-roster-change.js";
import { preparePreviewSwitcherWrite } from "#src/features/theme/preview-switcher";
import { publicPageSecurityHeaders } from "#src/features/theme/public-page-security-headers";
import { readBuiltInExternalMcpServerIds } from "#src/features/external-mcp/built-in-connections";
import { readFile } from "node:fs/promises";
import { resolveActiveThemeId } from "#src/features/presentation/index";
import { resolvePublicAssistantAvailability } from "../../../../assistant/index.js";
import { rm } from "node:fs/promises";
import { set } from "#src/features/settings/index";
import { tmpdir } from "node:os";
import { compositionSharedOAuth } from "./shared-oauth-commerce.js";

interface RouteDepsAssistantSettingsRequired {
  agentPluginLayout: ReturnType<typeof composeAgentPluginBootstrap>["agentPluginLayout"];
  kernel: SiteStore["content"];
  workspaceId: string;
  chat: SiteStore["chat"];
  clock: ReturnType<typeof composeStoreBasics>["clock"];
  idGen: ReturnType<typeof composeStoreBasics>["idGen"];
  identity: ReturnType<typeof composeIdentitySettings>["identity"];
  settingsPrincipals: ReturnType<typeof composeIdentitySettings>["settingsPrincipals"];
  presentationRepo: ReturnType<typeof composeIdentitySettings>["presentationRepo"];
  settingsRepo: ReturnType<typeof composeIdentitySettings>["settingsRepo"];
  settingsReady: ReturnType<typeof composeIdentitySettings>["settingsReady"];
  assistantSettingsReady: ReturnType<typeof composeIdentitySettings>["assistantSettingsReady"];
  seoReady: ReturnType<typeof composeIdentitySettings>["seoReady"];
  siteAssistantSecretKeyring: ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretKeyring"];
  siteAssistantSecretSealer: ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretSealer"];
  siteAssistantCredentialRepo: ReturnType<typeof composeAssistantCredentials>["siteAssistantCredentialRepo"];
  externalMcpServerRepo: ReturnType<typeof composeAssistantCredentials>["externalMcpServerRepo"];
  siteThemes: ReturnType<typeof composePublishingStoresThemes>["siteThemes"];
  seoDeps: ReturnType<typeof composePreAssembly>["seoDeps"];
  sitemapService: ReturnType<typeof composePreAssembly>["sitemapService"];
  agentPluginMcp: ReturnType<typeof composePreAssembly>["agentPluginMcp"];
  routeDeps: () => (NewsletterRouteDeps & ByokToolSurfaceDeps);
}

interface RouteDepsExternalMcpOAuthRequired {
  resolvedSiteBinding: ReturnType<typeof composeAgentPluginBootstrap>["resolvedSiteBinding"];
  agentPluginLayout: ReturnType<typeof composeAgentPluginBootstrap>["agentPluginLayout"];
  workspaceId: string;
  clock: ReturnType<typeof composeStoreBasics>["clock"];
  identity: ReturnType<typeof composeIdentitySettings>["identity"];
  siteAssistantSecretKeyring: ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretKeyring"];
  siteAssistantSecretSealer: ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretSealer"];
  externalMcpServerRepo: ReturnType<typeof composeAssistantCredentials>["externalMcpServerRepo"];
  externalMcpOAuthDevices: ReturnType<typeof composeAssistantCredentials>["externalMcpOAuthDevices"];
  siteReferenceRepo: ReturnType<typeof composeAssistantCredentials>["siteReferenceRepo"];
  projectSiteId: Awaited<ReturnType<typeof composeProviderConfig>>["siteId"];
  projectStore: Awaited<ReturnType<typeof composeProviderConfig>>["projectStore"];
  externalMcpOAuthHttpPorts: ReturnType<typeof composeOutboundConnections>["externalMcpOAuthHttpPorts"];
  derivedPublicOrigin: ReturnType<typeof composeOutboundConnections>["derivedPublicOrigin"];
  agentPluginMcp: ReturnType<typeof composePreAssembly>["agentPluginMcp"];
  routeDeps: () => (NewsletterRouteDeps & ByokToolSurfaceDeps);
}

interface RouteDepsExecutionPluginsRequired {
  kernel: SiteStore["content"];
  workspaceId: string;
  analyticsSettingsReady: ReturnType<typeof composeIdentitySettings>["analyticsSettingsReady"];
  executionSettingsReady: ReturnType<typeof composeIdentitySettings>["executionSettingsReady"];
  settingsUiTabsReady: ReturnType<typeof composeIdentitySettings>["settingsUiTabsReady"];
  siteTitleReady: ReturnType<typeof composeIdentitySettings>["siteTitleReady"];
  formCollectionProviders: () => ReturnType<typeof createFormCollectionRegistry>;
  siteConsentReady: ReturnType<typeof composePreAssembly>["siteConsentReady"];
  pluginExports: ReturnType<typeof composePreAssembly>["pluginExports"];
}

export function routeDepsAssistantSettings(required: RouteDepsAssistantSettingsRequired, _optional = {}): Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, "presentationRepo" | "settingsRepo" | "getEffective" | "set" | "instructionsNamespace" | "seoReady" | "seoDeps" | "sitemapService" | "settingsReady" | "assistantSettingsReady" | "visitorToolsManagement" | "adminAssistantEnabled" | "siteAssistantCredentialRepo" | "siteAssistantSecretSealer" | "siteAssistantSecretKeyring" | "databaseTransferChatSnapshot" | "databaseTransferDestinationStore" | "adminExecutionCredentialRepo" | "mediaProviderCredentialRepo" | "externalMcpServerRepo" | "bundledSourceRoot" | "mcp" | "preferences" | "providerFaces" | "notifyRosterChanged" | "builtInExternalMcpServerIds" | "externalMcpToolApprovalRepo"> {
  const { agentPluginLayout, kernel, workspaceId, chat, clock, idGen, identity, settingsPrincipals, presentationRepo, settingsRepo, settingsReady, assistantSettingsReady, seoReady, siteAssistantSecretKeyring, siteAssistantSecretSealer, siteAssistantCredentialRepo, externalMcpServerRepo, siteThemes, seoDeps, sitemapService, agentPluginMcp, routeDeps } = required;
  return {
    presentationRepo,
    settingsRepo,
    getEffective,
    set: (required, optional) => set(required, {
      ...optional,
      preparePreviewSwitcherWrite: async write => preparePreviewSwitcherWrite({ write, themes: siteThemes, workspaceId: workspaceId, activeThemeId: await resolveActiveThemeId({ presentationRepo, workspaceId: workspaceId }) }),
      canEnablePublicAssistant: async ({ workspaceId }) => (await resolvePublicAssistantAvailability({
        repo: siteAssistantCredentialRepo, sealer: siteAssistantSecretSealer, workspaceId,
      })).ready,
    }),
    instructionsNamespace: INSTRUCTIONS_NAMESPACE,
    seoReady,
    seoDeps,
    sitemapService,
    settingsReady,
    assistantSettingsReady,
    visitorToolsManagement: composeVisitorToolsManagement({ workspaceId, ready: assistantSettingsReady,
      settings: { repo: settingsRepo, clock, ids: idGen, authorize: identity.authorize, principals: settingsPrincipals } }),
    // See `routes/types.ts`'s `adminAssistantEnabled` field doc — read once here, mirroring
    // `apps/website/src/server/runtime/composition/app.ts`'s `createRouteDeps()`.
    adminAssistantEnabled: isAdminAssistantEnabled(),
    siteAssistantCredentialRepo,
    siteAssistantSecretSealer,
    siteAssistantSecretKeyring,
    // Transfer uses this composition's exact chat store, including any TOVU_CHAT_DB override.
    // Online backup includes WAL writes; copying the database file alone would silently omit them.
    databaseTransferChatSnapshot: async () => {
      const dir = await mkdtemp(join(tmpdir(), "tovu-transfer-chat-"));
      try {
        const snapshotPath = join(dir, "chat.db");
        await chat.backupTo(snapshotPath);
        return await readFile(snapshotPath);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    databaseTransferDestinationStore: new SealedDatabaseDestinationStore({ repo: new DatabaseDestinationRepo(kernel), sealer: siteAssistantSecretSealer, keyring: siteAssistantSecretKeyring }),
    // The ADMIN's own BYOK credential store — reuses the SAME sealer/keyring instances just above
    // (see `routes/types.ts`'s `adminExecutionCredentialRepo` doc for why one shared sealing
    // capability is correct here rather than a third `EnvOrFileKeyring` instance).
    adminExecutionCredentialRepo: new SqliteAdminExecutionCredentialRepo({ store: kernel }),
    // Same shared sealer/keyring again — one sealing capability across all three credential tables.
    mediaProviderCredentialRepo: new SqliteMediaProviderCredentialRepo(kernel),
    externalMcpServerRepo,
    bundledSourceRoot: bundledAgentPluginsDir(),
    mcp: agentPluginMcp,
    preferences: composeAgentPluginPreferences({ settings: { repo: settingsRepo, clock, ids: idGen, authorize: identity.authorize, principals: settingsPrincipals }, read: getEffective, write: (required, optional) => routeDeps().set(required, optional) }),
    providerFaces: composePluginProviderFaces({ workspaceRoot: () => agentPluginLayout.forWorkspace({ workspaceId }).root }),
    notifyRosterChanged: notifyExternalMcpRosterChanged,
    builtInExternalMcpServerIds: readBuiltInExternalMcpServerIds({ env: process.env }),
    externalMcpToolApprovalRepo: new SqliteExternalMcpToolApprovalRepo({ store: kernel }),
  };
}

export function routeDepsExternalMcpOAuth(required: RouteDepsExternalMcpOAuthRequired, _optional = {}): Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, "externalMcpOAuth" | "externalMcpOAuthDevices" | "derivedPublicOrigin" | "passkeyOrigin"> {
  const { resolvedSiteBinding, agentPluginLayout, workspaceId, clock, identity, siteAssistantSecretKeyring, siteAssistantSecretSealer, externalMcpServerRepo, externalMcpOAuthDevices, siteReferenceRepo, projectSiteId, projectStore, externalMcpOAuthHttpPorts, derivedPublicOrigin, agentPluginMcp, routeDeps } = required;
  return {
    /**
     * ADR-058 sealing again, one more consumer: the OAuth subsystem for `authMode: "oauth"`
     * external MCP connections. Built HERE rather than inside `modules/external-mcp.ts` because its
     * device begin/poll must use the same durable store. Redirect state carries its own encrypted
     * verifier and binding between the daemon and the callback, using this root's site key.
     * See `routes/types.ts`'s `externalMcpOAuthDevices` doc for the shared store's lifetime.
     */
    externalMcpOAuth: createExternalMcpOAuthService({
      httpPorts: externalMcpOAuthHttpPorts,
      workspaceId,
      repo: externalMcpServerRepo,
      sealer: siteAssistantSecretSealer,
      keyring: siteAssistantSecretKeyring,
      clock,
      devices: externalMcpOAuthDevices,
      ...compositionSharedOAuth({ resolvedSiteBinding, workspaceId, clock, identity, siteAssistantSecretKeyring, siteAssistantSecretSealer, siteReferenceRepo, projectSiteId, projectStore }),
      onConnected: createApplyConnectDefaults({ agentPluginLayout, workspaceId, repo: externalMcpServerRepo, applyAccess: input => routeDeps().mcp.applyAccess(input), clock, notifyRosterChanged: notifyExternalMcpRosterChanged, projections: agentPluginMcp.projections, classifyError: agentPluginMcp.classifyError }),
    }),
    externalMcpOAuthDevices,
    // See `routes/types.ts`'s `derivedPublicOrigin` doc; computed above with the plugin connection seams.
    derivedPublicOrigin,
    passkeyOrigin: process.env.TOVU_PUBLIC_URL,
  };
}

export function routeDepsExecutionPlugins(required: RouteDepsExecutionPluginsRequired, _optional = {}): Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, "executionSettingsReady" | "settingsUiTabsReady" | "analyticsSettingsReady" | "siteTitleReady" | "siteConsentReady" | "consentStore" | "publicPageSecurityHeaders" | "pluginExportHosts"> {
  const { kernel, workspaceId, analyticsSettingsReady, executionSettingsReady, settingsUiTabsReady, siteTitleReady, formCollectionProviders, siteConsentReady, pluginExports } = required;
  return {
    // Same shared sealer/keyring once more — see the note above the BYOK repo.
    executionSettingsReady,
    settingsUiTabsReady,
    analyticsSettingsReady,
    siteTitleReady,
    siteConsentReady,
    consentStore: createSiteConsentStore({ kernel, workspaceId }),
    publicPageSecurityHeaders: () => publicPageSecurityHeaders({ formCollectionProviders: () => formCollectionProviders() }),
    pluginExportHosts: () => pluginExports.declaredHosts({ workspaceId }),
  };
}
