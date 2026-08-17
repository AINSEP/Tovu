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

/** An in-memory {@link OtherCredentialsPort} for tests — every call defaults to a neutral,
 *  overridable stub, matching `createFakeAccessTokensPort`'s per-call override shape. Every
 *  "get" defaults to the honest empty/unconfigured state (nothing saved anywhere in this
 *  workspace), never to a fabricated connected one.
 *  @complexity O(1). */
export function createFakeOtherCredentialsPort(overrides: Partial<OtherCredentialsPort> = {}): OtherCredentialsPort {
  const emptyComposioConfig: AdminComposioConfig = { configured: false, apiKeyTail: "" };
  const emptyMediaProviders: AdminMediaProviderMap = {};
  return {
    getSiteAssistantCredential:
      overrides.getSiteAssistantCredential ??
      (() => Promise.resolve({ data: { isSet: false, masked: null, provider: "openai", baseUrl: null, model: null, updatedAt: null } })),
    setSiteAssistantCredential: overrides.setSiteAssistantCredential ?? (() => Promise.reject(new Error("setSiteAssistantCredential not stubbed for this test"))),
    deleteSiteAssistantCredential: overrides.deleteSiteAssistantCredential ?? (() => Promise.reject(new Error("deleteSiteAssistantCredential not stubbed for this test"))),

    getAdminByokCredential:
      overrides.getAdminByokCredential ??
      (() => Promise.resolve({ data: { isSet: false, masked: null, protocol: "anthropic-messages", providerId: null, baseUrl: null, model: null, maxTokens: null, updatedAt: null } })),
    setAdminByokCredential: overrides.setAdminByokCredential ?? (() => Promise.reject(new Error("setAdminByokCredential not stubbed for this test"))),
    deleteAdminByokCredential: overrides.deleteAdminByokCredential ?? (() => Promise.reject(new Error("deleteAdminByokCredential not stubbed for this test"))),

    getMediaProviders: overrides.getMediaProviders ?? (() => Promise.resolve(emptyMediaProviders)),
    saveMediaProviders: overrides.saveMediaProviders ?? (() => Promise.reject(new Error("saveMediaProviders not stubbed for this test"))),

    getComposioConfig: overrides.getComposioConfig ?? (() => Promise.resolve(emptyComposioConfig)),
    saveComposioConfig: overrides.saveComposioConfig ?? (() => Promise.reject(new Error("saveComposioConfig not stubbed for this test"))),

    listConnectors: overrides.listConnectors ?? (() => Promise.resolve({ connectors: [] as AdminConnector[] })),
    getConnectorStatuses: overrides.getConnectorStatuses ?? (() => Promise.resolve({})),
    disconnectConnector: overrides.disconnectConnector ?? (() => Promise.reject(new Error("disconnectConnector not stubbed for this test"))),

    listExternalMcpServers: overrides.listExternalMcpServers ?? (() => Promise.resolve({ servers: [] })),
    deleteExternalMcpServer: overrides.deleteExternalMcpServer ?? (() => Promise.reject(new Error("deleteExternalMcpServer not stubbed for this test"))),
  };
}
