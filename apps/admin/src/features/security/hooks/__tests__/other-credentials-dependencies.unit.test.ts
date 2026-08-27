import { describe, expect, it, vi } from "vitest";

import type {
  AdminComposioConfig,
  AdminConnector,
  AdminExecutionCredential,
  AdminExternalMcpServer,
  AdminMediaProviderMap,
  SiteAssistantCredential,
} from "../../../../lib/api";

/**
 * @file Coverage for `other-credentials-dependencies.hooks.ts` — two independent surfaces:
 *
 * 1. `defaultOtherCredentialsPort` — 14 thin binds onto `api.*`, exercised the same way
 *    `use-admin-execution-credential.hooks.test.ts` exercises `defaultAdminExecutionCredentialPort`
 *    (a mocked `lib/api`, one assertion per bind: right `api.*` call, args forwarded, result
 *    returned unchanged).
 * 2. `createFakeOtherCredentialsPort` — the six per-store default-slice helpers this file composes;
 *    covered by calling every unstubbed method's default AND confirming an override wins over it.
 */

const {
  getAssistantSiteCredential,
  setAssistantSiteCredential,
  deleteAssistantSiteCredential,
  getAdminExecutionCredential,
  setAdminExecutionCredential,
  deleteAdminExecutionCredential,
  getMediaProviders,
  saveMediaProviders,
  getComposioConfig,
  saveComposioConfig,
  listConnectors,
  getConnectorStatuses,
  disconnectConnector,
  listExternalMcpServers,
  deleteExternalMcpServer,
} = vi.hoisted(() => ({
  getAssistantSiteCredential: vi.fn(),
  setAssistantSiteCredential: vi.fn(),
  deleteAssistantSiteCredential: vi.fn(),
  getAdminExecutionCredential: vi.fn(),
  setAdminExecutionCredential: vi.fn(),
  deleteAdminExecutionCredential: vi.fn(),
  getMediaProviders: vi.fn(),
  saveMediaProviders: vi.fn(),
  getComposioConfig: vi.fn(),
  saveComposioConfig: vi.fn(),
  listConnectors: vi.fn(),
  getConnectorStatuses: vi.fn(),
  disconnectConnector: vi.fn(),
  listExternalMcpServers: vi.fn(),
  deleteExternalMcpServer: vi.fn(),
}));

vi.mock("../../../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getAssistantSiteCredential,
      setAssistantSiteCredential,
      deleteAssistantSiteCredential,
      getAdminExecutionCredential,
      setAdminExecutionCredential,
      deleteAdminExecutionCredential,
      getMediaProviders,
      saveMediaProviders,
      getComposioConfig,
      saveComposioConfig,
      listConnectors,
      getConnectorStatuses,
      disconnectConnector,
      listExternalMcpServers,
      deleteExternalMcpServer,
    },
  };
});

const { createFakeOtherCredentialsPort, defaultOtherCredentialsPort } = await import("../other-credentials-dependencies.hooks");

function siteCredential(overrides: Partial<SiteAssistantCredential> = {}): SiteAssistantCredential {
  return { isSet: true, masked: "••••abcd", provider: "openai", baseUrl: null, model: null, updatedAt: null, ...overrides };
}

function executionCredential(overrides: Partial<AdminExecutionCredential> = {}): AdminExecutionCredential {
  return {
    isSet: true,
    masked: "••••wxyz",
    protocol: "anthropic-messages",
    providerId: "anthropic",
    baseUrl: null,
    model: null,
    maxTokens: null,
    updatedAt: null,
    ...overrides,
  };
}

describe("defaultOtherCredentialsPort — site-assistant", () => {
  it("getSiteAssistantCredential delegates to api.getAssistantSiteCredential and returns its result unchanged", async () => {
    const data = siteCredential();
    getAssistantSiteCredential.mockResolvedValue({ data });
    await expect(defaultOtherCredentialsPort.getSiteAssistantCredential()).resolves.toEqual({ data });
    expect(getAssistantSiteCredential).toHaveBeenCalledWith();
  });

  it("setSiteAssistantCredential forwards the patch to api.setAssistantSiteCredential", async () => {
    const data = siteCredential({ masked: "••••live" });
    setAssistantSiteCredential.mockResolvedValue({ data });
    await expect(defaultOtherCredentialsPort.setSiteAssistantCredential({ apiKey: "sk-new" })).resolves.toEqual({ data });
    expect(setAssistantSiteCredential).toHaveBeenCalledWith({ apiKey: "sk-new" });
  });

  it("deleteSiteAssistantCredential delegates to api.deleteAssistantSiteCredential", async () => {
    const data = siteCredential({ isSet: false, masked: null });
    deleteAssistantSiteCredential.mockResolvedValue({ data });
    await expect(defaultOtherCredentialsPort.deleteSiteAssistantCredential()).resolves.toEqual({ data });
    expect(deleteAssistantSiteCredential).toHaveBeenCalledWith();
  });
});

describe("defaultOtherCredentialsPort — admin BYOK", () => {
  it("getAdminByokCredential delegates to api.getAdminExecutionCredential", async () => {
    const data = executionCredential();
    getAdminExecutionCredential.mockResolvedValue({ data });
    await expect(defaultOtherCredentialsPort.getAdminByokCredential()).resolves.toEqual({ data });
    expect(getAdminExecutionCredential).toHaveBeenCalledWith();
  });

  it("setAdminByokCredential forwards the patch to api.setAdminExecutionCredential", async () => {
    const data = executionCredential({ masked: "••••zzzz" });
    setAdminExecutionCredential.mockResolvedValue({ data });
    await expect(defaultOtherCredentialsPort.setAdminByokCredential({ apiKey: "sk-new" })).resolves.toEqual({ data });
    expect(setAdminExecutionCredential).toHaveBeenCalledWith({ apiKey: "sk-new" });
  });

  it("deleteAdminByokCredential delegates to api.deleteAdminExecutionCredential", async () => {
    const data = executionCredential({ isSet: false, masked: null });
    deleteAdminExecutionCredential.mockResolvedValue({ data });
    await expect(defaultOtherCredentialsPort.deleteAdminByokCredential()).resolves.toEqual({ data });
    expect(deleteAdminExecutionCredential).toHaveBeenCalledWith();
  });
});

describe("defaultOtherCredentialsPort — media providers", () => {
  it("getMediaProviders delegates to api.getMediaProviders", async () => {
    const map: AdminMediaProviderMap = { cloudinary: { apiKeyConfigured: true, apiKeyTail: "1234" } };
    getMediaProviders.mockResolvedValue(map);
    await expect(defaultOtherCredentialsPort.getMediaProviders()).resolves.toEqual(map);
    expect(getMediaProviders).toHaveBeenCalledWith();
  });

  it("saveMediaProviders forwards the whole map to api.saveMediaProviders", async () => {
    const map: AdminMediaProviderMap = { cloudinary: { apiKeyConfigured: true, apiKeyTail: "1234" } };
    saveMediaProviders.mockResolvedValue(map);
    await expect(defaultOtherCredentialsPort.saveMediaProviders(map)).resolves.toEqual(map);
    expect(saveMediaProviders).toHaveBeenCalledWith(map);
  });
});

describe("defaultOtherCredentialsPort — Composio project key", () => {
  it("getComposioConfig delegates to api.getComposioConfig", async () => {
    const config: AdminComposioConfig = { configured: true, apiKeyTail: "5678" };
    getComposioConfig.mockResolvedValue(config);
    await expect(defaultOtherCredentialsPort.getComposioConfig()).resolves.toEqual(config);
    expect(getComposioConfig).toHaveBeenCalledWith();
  });

  it("saveComposioConfig forwards the apiKey (string or null) to api.saveComposioConfig", async () => {
    const config: AdminComposioConfig = { configured: true, apiKeyTail: "9999" };
    saveComposioConfig.mockResolvedValue(config);
    await expect(defaultOtherCredentialsPort.saveComposioConfig("sk-composio")).resolves.toEqual(config);
    expect(saveComposioConfig).toHaveBeenCalledWith("sk-composio");

    const cleared: AdminComposioConfig = { configured: false, apiKeyTail: "" };
    saveComposioConfig.mockResolvedValue(cleared);
    await expect(defaultOtherCredentialsPort.saveComposioConfig(null)).resolves.toEqual(cleared);
    expect(saveComposioConfig).toHaveBeenCalledWith(null);
  });
});

describe("defaultOtherCredentialsPort — Composio connectors", () => {
  const connector: AdminConnector = { id: "google_calendar", name: "Google Calendar", provider: "google", category: "productivity", status: "connected", tools: [] };

  it("listConnectors delegates to api.listConnectors", async () => {
    listConnectors.mockResolvedValue({ connectors: [connector] });
    await expect(defaultOtherCredentialsPort.listConnectors()).resolves.toEqual({ connectors: [connector] });
    expect(listConnectors).toHaveBeenCalledWith();
  });

  it("getConnectorStatuses delegates to api.getConnectorStatuses", async () => {
    const statuses = { google_calendar: { status: "connected", accountLabel: "me@example.com" } };
    getConnectorStatuses.mockResolvedValue(statuses);
    await expect(defaultOtherCredentialsPort.getConnectorStatuses()).resolves.toEqual(statuses);
    expect(getConnectorStatuses).toHaveBeenCalledWith();
  });

  it("disconnectConnector forwards the connector id to api.disconnectConnector", async () => {
    disconnectConnector.mockResolvedValue({ ...connector, status: "available" });
    await expect(defaultOtherCredentialsPort.disconnectConnector("google_calendar")).resolves.toEqual({ ...connector, status: "available" });
    expect(disconnectConnector).toHaveBeenCalledWith("google_calendar");
  });
});

describe("defaultOtherCredentialsPort — external MCP servers", () => {
  const server: AdminExternalMcpServer = {
    serverId: "local-fs",
    label: "Local filesystem",
    transport: "stdio",
    authMode: "static_env",
    enabled: true,
    command: "npx",
    url: null,
    args: [],
    allowedToolNames: [],
    writeAllowedToolNames: [],
    writeGrantsUpdatedByPrincipalId: null,
    writeGrantsUpdatedAt: null,
    envNames: [],
    oauth: {
      providerId: null,
      grant: null,
      clientId: null,
      scopes: [],
      status: "disconnected",
      expiresAt: null,
      tokenEnvName: null,
      hasStoredToken: false,
    },
  };

  it("listExternalMcpServers delegates to api.listExternalMcpServers", async () => {
    listExternalMcpServers.mockResolvedValue({ servers: [server] });
    await expect(defaultOtherCredentialsPort.listExternalMcpServers()).resolves.toEqual({ servers: [server] });
    expect(listExternalMcpServers).toHaveBeenCalledWith();
  });

  it("deleteExternalMcpServer forwards the server id to api.deleteExternalMcpServer", async () => {
    deleteExternalMcpServer.mockResolvedValue({ removed: true, restartRequired: true });
    await expect(defaultOtherCredentialsPort.deleteExternalMcpServer("local-fs")).resolves.toEqual({ removed: true, restartRequired: true });
    expect(deleteExternalMcpServer).toHaveBeenCalledWith("local-fs");
  });
});

describe("createFakeOtherCredentialsPort — defaults", () => {
  it("every store defaults to the honest empty/unconfigured GET, never a fabricated connected one", async () => {
    const port = createFakeOtherCredentialsPort();

    await expect(port.getSiteAssistantCredential()).resolves.toEqual({
      data: { isSet: false, masked: null, provider: "openai", baseUrl: null, model: null, updatedAt: null },
    });
    await expect(port.getAdminByokCredential()).resolves.toEqual({
      data: { isSet: false, masked: null, protocol: "anthropic-messages", providerId: null, baseUrl: null, model: null, maxTokens: null, updatedAt: null },
    });
    await expect(port.getMediaProviders()).resolves.toEqual({});
    await expect(port.getComposioConfig()).resolves.toEqual({ configured: false, apiKeyTail: "" });
    await expect(port.listConnectors()).resolves.toEqual({ connectors: [] });
    await expect(port.getConnectorStatuses()).resolves.toEqual({});
    await expect(port.listExternalMcpServers()).resolves.toEqual({ servers: [] });
  });

  it("every unstubbed write rejects with a named 'not stubbed for this test' error, never silently resolving", async () => {
    const port = createFakeOtherCredentialsPort();

    await expect(port.setSiteAssistantCredential({ apiKey: "x" })).rejects.toThrow("setSiteAssistantCredential not stubbed for this test");
    await expect(port.deleteSiteAssistantCredential()).rejects.toThrow("deleteSiteAssistantCredential not stubbed for this test");
    await expect(port.setAdminByokCredential({ apiKey: "x" })).rejects.toThrow("setAdminByokCredential not stubbed for this test");
    await expect(port.deleteAdminByokCredential()).rejects.toThrow("deleteAdminByokCredential not stubbed for this test");
    await expect(port.saveMediaProviders({})).rejects.toThrow("saveMediaProviders not stubbed for this test");
    await expect(port.saveComposioConfig("x")).rejects.toThrow("saveComposioConfig not stubbed for this test");
    await expect(port.disconnectConnector("x")).rejects.toThrow("disconnectConnector not stubbed for this test");
    await expect(port.deleteExternalMcpServer("x")).rejects.toThrow("deleteExternalMcpServer not stubbed for this test");
  });

  it("an override wins over its store's default for every one of the six stores", async () => {
    const port = createFakeOtherCredentialsPort({
      getSiteAssistantCredential: () => Promise.resolve({ data: siteCredential({ masked: "••••site" }) }),
      getAdminByokCredential: () => Promise.resolve({ data: executionCredential({ masked: "••••byok" }) }),
      getMediaProviders: () => Promise.resolve({ cloudinary: { apiKeyConfigured: true } }),
      getComposioConfig: () => Promise.resolve({ configured: true, apiKeyTail: "comp" }),
      listConnectors: () => Promise.resolve({ connectors: [{ id: "c1", name: "C1", provider: "p", category: "cat", status: "connected", tools: [] }] }),
      listExternalMcpServers: () =>
        Promise.resolve({
          servers: [
            {
              serverId: "s1",
              label: "S1",
              transport: "stdio",
              authMode: "static_env",
              enabled: true,
              command: "x",
              url: null,
              args: [],
              allowedToolNames: [],
              writeAllowedToolNames: [],
              writeGrantsUpdatedByPrincipalId: null,
              writeGrantsUpdatedAt: null,
              envNames: ["FOO"],
              oauth: {
                providerId: null,
                grant: null,
                clientId: null,
                scopes: [],
                status: "disconnected",
                expiresAt: null,
                tokenEnvName: null,
                hasStoredToken: false,
              },
            },
          ],
        }),
    });

    await expect(port.getSiteAssistantCredential()).resolves.toMatchObject({ data: { masked: "••••site" } });
    await expect(port.getAdminByokCredential()).resolves.toMatchObject({ data: { masked: "••••byok" } });
    await expect(port.getMediaProviders()).resolves.toEqual({ cloudinary: { apiKeyConfigured: true } });
    await expect(port.getComposioConfig()).resolves.toEqual({ configured: true, apiKeyTail: "comp" });
    await expect(port.listConnectors()).resolves.toMatchObject({ connectors: [{ id: "c1" }] });
    await expect(port.listExternalMcpServers()).resolves.toMatchObject({ servers: [{ serverId: "s1" }] });
  });
});
