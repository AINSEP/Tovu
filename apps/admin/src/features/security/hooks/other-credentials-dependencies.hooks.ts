import { api, type AdminComposioConfig, type AdminConnector, type AdminMediaProviderMap } from "../../../lib/api";
import type { OtherCredentialsPort } from "./other-credentials-port.hooks";

/** The live implementation, as a module-level singleton — matches
 *  `access-tokens-dependencies.hooks.ts`'s `defaultAccessTokensPort`. Every method is a thin bind
 *  onto an existing `api.*` call already used by AI Assistant, Settings' Execution mode tab, Media's
 *  Providers tab, or Settings' Connectors/External MCP tabs — see `other-credentials-port.hooks.ts`'s
 *  own header for why this page adds no new HTTP surface. */
export const defaultOtherCredentialsPort: OtherCredentialsPort = {
  getSiteAssistantCredential: () => api.getAssistantSiteCredential(),
  setSiteAssistantCredential: (patch) => api.setAssistantSiteCredential(patch),
  deleteSiteAssistantCredential: () => api.deleteAssistantSiteCredential(),

  getAdminByokCredential: () => api.getAdminExecutionCredential(),
  setAdminByokCredential: (patch) => api.setAdminExecutionCredential(patch),
  deleteAdminByokCredential: () => api.deleteAdminExecutionCredential(),

  getMediaProviders: () => api.getMediaProviders(),
  saveMediaProviders: (providers) => api.saveMediaProviders(providers),

  getComposioConfig: () => api.getComposioConfig(),
  saveComposioConfig: (apiKey) => api.saveComposioConfig(apiKey),

  listConnectors: () => api.listConnectors(),
  getConnectorStatuses: () => api.getConnectorStatuses(),
  disconnectConnector: (connectorId) => api.disconnectConnector(connectorId),

  listExternalMcpServers: () => api.listExternalMcpServers(),
  deleteExternalMcpServer: (serverId) => api.deleteExternalMcpServer(serverId),
};

/** {@link createFakeOtherCredentialsPort}'s site-assistant slice — one small named helper per
 *  Tier-2 store, dispatched by composition rather than inlined, same "extract, don't inline"
 *  discipline this repo's complexity gate forces everywhere else (e.g. a widened
 *  `validateConnection` split into one small named validator per vendor). Each of these six helpers
 *  carries only ITS OWN store's `??` fallbacks, so no single function's branch count can climb back
 *  toward the cap the way one flat 15-field object literal did.
 *  @complexity O(1) — three independent `??` fallbacks. */
function siteAssistantCredentialDefaults(
  overrides: Partial<OtherCredentialsPort>
): Pick<OtherCredentialsPort, "getSiteAssistantCredential" | "setSiteAssistantCredential" | "deleteSiteAssistantCredential"> {
  return {
    getSiteAssistantCredential:
      overrides.getSiteAssistantCredential ??
      (() => Promise.resolve({ data: { isSet: false, masked: null, provider: "openai", baseUrl: null, model: null, updatedAt: null } })),
    setSiteAssistantCredential: overrides.setSiteAssistantCredential ?? (() => Promise.reject(new Error("setSiteAssistantCredential not stubbed for this test"))),
    deleteSiteAssistantCredential: overrides.deleteSiteAssistantCredential ?? (() => Promise.reject(new Error("deleteSiteAssistantCredential not stubbed for this test"))),
  };
}

/** {@link createFakeOtherCredentialsPort}'s admin-BYOK slice — see {@link siteAssistantCredentialDefaults}'s doc.
 *  @complexity O(1) — three independent `??` fallbacks. */
function adminByokCredentialDefaults(
  overrides: Partial<OtherCredentialsPort>
): Pick<OtherCredentialsPort, "getAdminByokCredential" | "setAdminByokCredential" | "deleteAdminByokCredential"> {
  return {
    getAdminByokCredential:
      overrides.getAdminByokCredential ??
      (() => Promise.resolve({ data: { isSet: false, masked: null, protocol: "anthropic-messages", providerId: null, baseUrl: null, model: null, maxTokens: null, updatedAt: null } })),
    setAdminByokCredential: overrides.setAdminByokCredential ?? (() => Promise.reject(new Error("setAdminByokCredential not stubbed for this test"))),
    deleteAdminByokCredential: overrides.deleteAdminByokCredential ?? (() => Promise.reject(new Error("deleteAdminByokCredential not stubbed for this test"))),
  };
}

/** {@link createFakeOtherCredentialsPort}'s media-providers slice — see {@link siteAssistantCredentialDefaults}'s doc.
 *  @complexity O(1) — two independent `??` fallbacks. */
function mediaProvidersDefaults(overrides: Partial<OtherCredentialsPort>): Pick<OtherCredentialsPort, "getMediaProviders" | "saveMediaProviders"> {
  const emptyMediaProviders: AdminMediaProviderMap = {};
  return {
    getMediaProviders: overrides.getMediaProviders ?? (() => Promise.resolve(emptyMediaProviders)),
    saveMediaProviders: overrides.saveMediaProviders ?? (() => Promise.reject(new Error("saveMediaProviders not stubbed for this test"))),
  };
}

/** {@link createFakeOtherCredentialsPort}'s Composio-project slice — see {@link siteAssistantCredentialDefaults}'s doc.
 *  @complexity O(1) — two independent `??` fallbacks. */
function composioConfigDefaults(overrides: Partial<OtherCredentialsPort>): Pick<OtherCredentialsPort, "getComposioConfig" | "saveComposioConfig"> {
  const emptyComposioConfig: AdminComposioConfig = { configured: false, apiKeyTail: "" };
  return {
    getComposioConfig: overrides.getComposioConfig ?? (() => Promise.resolve(emptyComposioConfig)),
    saveComposioConfig: overrides.saveComposioConfig ?? (() => Promise.reject(new Error("saveComposioConfig not stubbed for this test"))),
  };
}

/** {@link createFakeOtherCredentialsPort}'s Composio-connectors slice — see {@link siteAssistantCredentialDefaults}'s doc.
 *  @complexity O(1) — three independent `??` fallbacks. */
function connectorsDefaults(overrides: Partial<OtherCredentialsPort>): Pick<OtherCredentialsPort, "listConnectors" | "getConnectorStatuses" | "disconnectConnector"> {
  return {
    listConnectors: overrides.listConnectors ?? (() => Promise.resolve({ connectors: [] as AdminConnector[] })),
    getConnectorStatuses: overrides.getConnectorStatuses ?? (() => Promise.resolve({})),
    disconnectConnector: overrides.disconnectConnector ?? (() => Promise.reject(new Error("disconnectConnector not stubbed for this test"))),
  };
}

/** {@link createFakeOtherCredentialsPort}'s external-MCP slice — see {@link siteAssistantCredentialDefaults}'s doc.
 *  @complexity O(1) — two independent `??` fallbacks. */
function externalMcpDefaults(overrides: Partial<OtherCredentialsPort>): Pick<OtherCredentialsPort, "listExternalMcpServers" | "deleteExternalMcpServer"> {
  return {
    listExternalMcpServers: overrides.listExternalMcpServers ?? (() => Promise.resolve({ servers: [] })),
    deleteExternalMcpServer: overrides.deleteExternalMcpServer ?? (() => Promise.reject(new Error("deleteExternalMcpServer not stubbed for this test"))),
  };
}

/** An in-memory {@link OtherCredentialsPort} for tests — every call defaults to a neutral,
 *  overridable stub, matching `createFakeAccessTokensPort`'s per-call override shape. Every
 *  "get" defaults to the honest empty/unconfigured state (nothing saved anywhere in this
 *  workspace), never to a fabricated connected one.
 *
 *  Composes the six per-store helpers above by plain object spread — zero branches of its own
 *  (spreading is not a conditional), which is what brings this function back under the complexity
 *  cap; the original flat version inlined all fifteen `??` fallbacks here directly and hit 17.
 *  @complexity O(1) — no branches, six spreads. */
export function createFakeOtherCredentialsPort(overrides: Partial<OtherCredentialsPort> = {}): OtherCredentialsPort {
  return {
    ...siteAssistantCredentialDefaults(overrides),
    ...adminByokCredentialDefaults(overrides),
    ...mediaProvidersDefaults(overrides),
    ...composioConfigDefaults(overrides),
    ...connectorsDefaults(overrides),
    ...externalMcpDefaults(overrides),
  };
}
