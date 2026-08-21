import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "../../../../lib/fetch-query";
import type { AdminMediaProviderMap } from "../../../../lib/api";
import { useOtherCredentials, useWiredOtherCredentials } from "../use-other-credentials.hooks";
import type { OtherCredentialGroupState } from "../use-other-credentials.hooks";
import { createFakeOtherCredentialsPort } from "../other-credentials-dependencies.hooks";

/**
 * @file Coverage for `useOtherCredentials` (0/50 funcs) — the Tier-2 controller behind
 * `OtherCredentialsSection.tsx`. Drives the hook directly against `createFakeOtherCredentialsPort`
 * overrides for every store-read/write path (mirrors `use-access-tokens.unit.test.tsx`'s own
 * `createFakeAccessTokensPort` pattern); a final small block covers `useWiredOtherCredentials`
 * against a mocked `lib/api`, since that wrapper binds the real port + real locale.
 */

const {
  getAssistantSiteCredential,
  getAdminExecutionCredential,
  getMediaProviders,
  getComposioConfig,
  listConnectors,
  getConnectorStatuses,
  listExternalMcpServers,
} = vi.hoisted(() => ({
  getAssistantSiteCredential: vi.fn(),
  getAdminExecutionCredential: vi.fn(),
  getMediaProviders: vi.fn(),
  getComposioConfig: vi.fn(),
  listConnectors: vi.fn(),
  getConnectorStatuses: vi.fn(),
  listExternalMcpServers: vi.fn(),
}));

vi.mock("../../../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getAssistantSiteCredential,
      getAdminExecutionCredential,
      getMediaProviders,
      getComposioConfig,
      listConnectors,
      getConnectorStatuses,
      listExternalMcpServers,
    },
  };
});

function wrapper({ children }: { children: ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

const T = (key: string): string => key;
const LOCALE = "en";

/** Locates one store's rendered group. */
function findGroup(groups: readonly OtherCredentialGroupState[] | undefined, storeId: string): OtherCredentialGroupState | undefined {
  return groups?.find((g) => g.store.id === storeId);
}

describe("useOtherCredentials — reading all six stores", () => {
  it("settles each store independently into its own row(s), covering every reader and readStore's dispatch", async () => {
    const port = createFakeOtherCredentialsPort({
      getSiteAssistantCredential: () => Promise.resolve({ data: { isSet: true, masked: "site", provider: "openai", baseUrl: null, model: null, updatedAt: "2026-08-01T00:00:00.000Z" } }),
      getAdminByokCredential: () => Promise.resolve({ data: { isSet: false, masked: null, protocol: "anthropic-messages", providerId: null, baseUrl: null, model: null, maxTokens: null, updatedAt: null } }),
      getMediaProviders: () =>
        Promise.resolve({
          "totally-unknown-vendor": { apiKeyConfigured: true, apiKeyTail: "1234" },
          "not-configured-vendor": { apiKeyConfigured: false },
        } as AdminMediaProviderMap),
      getComposioConfig: () => Promise.resolve({ configured: true, apiKeyTail: "9999" }),
      listConnectors: () =>
        Promise.resolve({
          connectors: [{ id: "google_calendar", name: "Google Calendar", provider: "google", category: "productivity", status: "connected", tools: [] }],
        }),
      getConnectorStatuses: () =>
        Promise.resolve({
          google_calendar: { status: "connected", accountLabel: "me@example.com" },
          unknown_connector: { status: "error", lastError: "expired" },
          never_connected: { status: "available" },
        }),
      listExternalMcpServers: () =>
        Promise.resolve({ servers: [{ serverId: "local-fs", label: "Local filesystem", transport: "stdio", enabled: true, command: "npx", args: [], allowedToolNames: [], envNames: ["FOO", "BAR"] }] }),
    });

    const { result } = renderHook(() => useOtherCredentials(port, T, LOCALE, { query: "", category: "all" }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());

    // site-assistant: singleKeyItems(isSet=true) → one row, masked-tail fact.
    const siteAssistant = findGroup(result.current.groups, "site-assistant");
    expect(siteAssistant?.rows).toHaveLength(1);
    expect(siteAssistant?.rows[0]?.valueFact).toBe("••••site");
    expect(siteAssistant?.rows[0]?.updatedAt).toBe("2026-08-01T00:00:00.000Z");

    // admin-byok: singleKeyItems(isSet=false) → zero rows.
    expect(findGroup(result.current.groups, "admin-byok")?.rows).toHaveLength(0);

    // media-provider: only the configured entry becomes a row; unconfigured is filtered out; unknown
    // catalog id falls back to its own raw id as the display name.
    const media = findGroup(result.current.groups, "media-provider");
    expect(media?.rows).toHaveLength(1);
    expect(media?.rows[0]?.itemId).toBe("totally-unknown-vendor");
    expect(media?.rows[0]?.name).toBe("totally-unknown-vendor");
    expect(media?.rows[0]?.valueFact).toBe("••••1234");

    // composio-project: singleKeyItems via getComposioConfig's configured/apiKeyTail fields.
    const composioProject = findGroup(result.current.groups, "composio-project");
    expect(composioProject?.rows[0]?.valueFact).toBe("••••9999");

    // composio-connector: "connected" AND "error" statuses both surface; "available" is excluded.
    // Named connector resolves via the catalog map; an id absent from the catalog falls back to the
    // raw connector id itself.
    const connectors = findGroup(result.current.groups, "composio-connector");
    expect(connectors?.rows).toHaveLength(2);
    const googleRow = connectors?.rows.find((r) => r.itemId === "google_calendar");
    expect(googleRow?.name).toBe("Google Calendar");
    expect(googleRow?.valueFact).toBe("Connected as: me@example.com");
    const unknownRow = connectors?.rows.find((r) => r.itemId === "unknown_connector");
    expect(unknownRow?.name).toBe("unknown_connector");
    expect(unknownRow?.valueFact).toBe("Connected"); // no accountLabel on the "error" status entry

    // external-mcp: envNamesFact with more than one name.
    const mcp = findGroup(result.current.groups, "external-mcp");
    expect(mcp?.rows[0]?.valueFact).toBe("2 environment variables set");

    // totalCount sums every store's item count regardless of filter.
    expect(result.current.totalCount).toBe(1 + 0 + 1 + 1 + 2 + 1);
  });

  it("a rejected store read reports its own loadError with the exact banner text, without blocking the other five stores", async () => {
    const port = createFakeOtherCredentialsPort({
      getComposioConfig: () => Promise.reject(new Error("composio down")),
    });
    const { result } = renderHook(() => useOtherCredentials(port, T, LOCALE, { query: "", category: "all" }), { wrapper });

    await waitFor(() => expect(result.current.groups).toBeDefined());
    expect(result.current.loadError).toBe("Couldn't load saved access tokens: composio down");
    // The failed store still renders (as empty), and its neighbors are unaffected.
    expect(findGroup(result.current.groups, "composio-project")?.rows).toHaveLength(0);
    expect(findGroup(result.current.groups, "site-assistant")).toBeDefined();
  });
});

describe("useOtherCredentials — category and query filtering", () => {
  function twoAiOneMediaPort() {
    return createFakeOtherCredentialsPort({
      getSiteAssistantCredential: () => Promise.resolve({ data: { isSet: true, masked: "abcd", provider: "openai", baseUrl: null, model: null, updatedAt: null } }),
      getMediaProviders: () => Promise.resolve({ cloudinary: { apiKeyConfigured: true, apiKeyTail: "5678" } } as AdminMediaProviderMap),
    });
  }

  it("category='ai' includes only ai-category stores (site-assistant/admin-byok/external-mcp), excluding media/ops", async () => {
    const { result } = renderHook(() => useOtherCredentials(twoAiOneMediaPort(), T, LOCALE, { query: "", category: "ai" }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());

    const ids = result.current.groups?.map((g) => g.store.id) ?? [];
    expect(ids).toContain("site-assistant");
    expect(ids).toContain("admin-byok");
    expect(ids).toContain("external-mcp");
    expect(ids).not.toContain("media-provider");
    expect(ids).not.toContain("composio-project");
  });

  it("matchCount only counts items whose name matches the query, independent of totalCount", async () => {
    const { result } = renderHook(() => useOtherCredentials(twoAiOneMediaPort(), T, LOCALE, { query: "cloud", category: "all" }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());

    expect(result.current.totalCount).toBe(2); // site-assistant row + cloudinary row, unfiltered
    expect(result.current.matchCount).toBe(1); // only "cloudinary" matches "cloud"
    expect(findGroup(result.current.groups, "media-provider")?.rows).toHaveLength(1);
    expect(findGroup(result.current.groups, "site-assistant")?.rows).toHaveLength(0); // filtered out by query
  });
});

describe("useOtherCredentials — setDraftToken", () => {
  it("stores the typed value, defaulting saving/error for a row with no prior draft", async () => {
    const port = createFakeOtherCredentialsPort({
      getSiteAssistantCredential: () => Promise.resolve({ data: { isSet: true, masked: "abcd", provider: "openai", baseUrl: null, model: null, updatedAt: null } }),
    });
    const { result } = renderHook(() => useOtherCredentials(port, T, LOCALE, { query: "", category: "all" }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());

    act(() => result.current.setDraftToken("site-assistant:site-assistant", "sk-typed"));

    const row = findGroup(result.current.groups, "site-assistant")?.rows[0];
    expect(row?.token).toBe("sk-typed");
    expect(row?.saving).toBe(false);
    expect(row?.error).toBeNull();
  });
});

describe("useOtherCredentials — replace: no-op guards", () => {
  it("does nothing when the draft token is empty", async () => {
    const setSiteAssistantCredential = vi.fn();
    const port = createFakeOtherCredentialsPort({
      getSiteAssistantCredential: () => Promise.resolve({ data: { isSet: true, masked: "abcd", provider: "openai", baseUrl: null, model: null, updatedAt: null } }),
      setSiteAssistantCredential,
    });
    const { result } = renderHook(() => useOtherCredentials(port, T, LOCALE, { query: "", category: "all" }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const row = findGroup(result.current.groups, "site-assistant")!.rows[0]!;

    await act(() => result.current.replace(row));

    expect(setSiteAssistantCredential).not.toHaveBeenCalled();
  });

  it("does nothing for a store that does not support Replace, even with a token typed", async () => {
    const disconnectConnector = vi.fn();
    const port = createFakeOtherCredentialsPort({
      listConnectors: () => Promise.resolve({ connectors: [{ id: "c1", name: "C1", provider: "p", category: "cat", status: "connected", tools: [] }] }),
      getConnectorStatuses: () => Promise.resolve({ c1: { status: "connected" } }),
      disconnectConnector,
    });
    const { result } = renderHook(() => useOtherCredentials(port, T, LOCALE, { query: "", category: "all" }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const row = findGroup(result.current.groups, "composio-connector")!.rows[0]!;
    act(() => result.current.setDraftToken(row.key, "irrelevant"));

    await act(() => result.current.replace(findGroup(result.current.groups, "composio-connector")!.rows[0]!));

    expect(disconnectConnector).not.toHaveBeenCalled();
  });
});

describe("useOtherCredentials — replace: per-store dispatch (writeReplace)", () => {
  it("site-assistant: writes via setSiteAssistantCredential, refetches, and clears the draft on success", async () => {
    // A real server's GET reflects the just-committed PUT, so the stub does too — refetchOne re-reads
    // through getSiteAssistantCredential a second time after the write settles.
    let stored = { isSet: true, masked: "old1", provider: "openai", baseUrl: null as string | null, model: null as string | null, updatedAt: null as string | null };
    const setSiteAssistantCredential = vi.fn(() => {
      stored = { ...stored, masked: "new1" };
      return Promise.resolve({ data: stored });
    });
    const port = createFakeOtherCredentialsPort({
      getSiteAssistantCredential: () => Promise.resolve({ data: stored }),
      setSiteAssistantCredential,
    });
    const { result } = renderHook(() => useOtherCredentials(port, T, LOCALE, { query: "", category: "all" }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const row = findGroup(result.current.groups, "site-assistant")!.rows[0]!;
    act(() => result.current.setDraftToken(row.key, "  sk-new  "));

    await act(() => result.current.replace(findGroup(result.current.groups, "site-assistant")!.rows[0]!));

    expect(setSiteAssistantCredential).toHaveBeenCalledWith({ apiKey: "sk-new" }); // trimmed
    await waitFor(() => expect(findGroup(result.current.groups, "site-assistant")?.rows[0]?.valueFact).toBe("••••new1"));
    const settled = findGroup(result.current.groups, "site-assistant")!.rows[0]!;
    expect(settled.token).toBe("");
    expect(settled.saving).toBe(false);
    expect(settled.error).toBeNull();
  });

  it("admin-byok: writes via setAdminByokCredential", async () => {
    const setAdminByokCredential = vi.fn(() => Promise.resolve({ data: { isSet: true, masked: "new2", protocol: "anthropic-messages", providerId: null, baseUrl: null, model: null, maxTokens: null, updatedAt: null } }));
    const port = createFakeOtherCredentialsPort({
      getAdminByokCredential: () => Promise.resolve({ data: { isSet: true, masked: "old2", protocol: "anthropic-messages", providerId: null, baseUrl: null, model: null, maxTokens: null, updatedAt: null } }),
      setAdminByokCredential,
    });
    const { result } = renderHook(() => useOtherCredentials(port, T, LOCALE, { query: "", category: "all" }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const row = findGroup(result.current.groups, "admin-byok")!.rows[0]!;
    act(() => result.current.setDraftToken(row.key, "sk-byok"));

    await act(() => result.current.replace(findGroup(result.current.groups, "admin-byok")!.rows[0]!));

    expect(setAdminByokCredential).toHaveBeenCalledWith({ apiKey: "sk-byok" });
  });

  it("composio-project: writes via saveComposioConfig(apiKey)", async () => {
    const saveComposioConfig = vi.fn(() => Promise.resolve({ configured: true, apiKeyTail: "new3" }));
    const port = createFakeOtherCredentialsPort({
      getComposioConfig: () => Promise.resolve({ configured: true, apiKeyTail: "old3" }),
      saveComposioConfig,
    });
    const { result } = renderHook(() => useOtherCredentials(port, T, LOCALE, { query: "", category: "all" }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const row = findGroup(result.current.groups, "composio-project")!.rows[0]!;
    act(() => result.current.setDraftToken(row.key, "sk-composio"));

    await act(() => result.current.replace(findGroup(result.current.groups, "composio-project")!.rows[0]!));

    expect(saveComposioConfig).toHaveBeenCalledWith("sk-composio");
  });

  it("media-provider: rebuilds the WHOLE map — target gets the new key, every other provider is preserved as {}", async () => {
    const saveMediaProviders = vi.fn((map: AdminMediaProviderMap) => Promise.resolve(map));
    const port = createFakeOtherCredentialsPort({
      getMediaProviders: () =>
        Promise.resolve({
          cloudinary: { apiKeyConfigured: true, apiKeyTail: "old4" },
          grok: { apiKeyConfigured: true, apiKeyTail: "grok" },
        } as AdminMediaProviderMap),
      saveMediaProviders,
    });
    const { result } = renderHook(() => useOtherCredentials(port, T, LOCALE, { query: "", category: "all" }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const row = findGroup(result.current.groups, "media-provider")!.rows.find((r) => r.itemId === "cloudinary")!;
    act(() => result.current.setDraftToken(row.key, "sk-cloud-new"));

    await act(() => result.current.replace(findGroup(result.current.groups, "media-provider")!.rows.find((r) => r.itemId === "cloudinary")!));

    expect(saveMediaProviders).toHaveBeenCalledWith({ cloudinary: { apiKey: "sk-cloud-new" }, grok: {} });
  });

  it("a rejected write surfaces the exact save-error text and preserves the typed (untrimmed-source) token", async () => {
    const port = createFakeOtherCredentialsPort({
      getSiteAssistantCredential: () => Promise.resolve({ data: { isSet: true, masked: "abcd", provider: "openai", baseUrl: null, model: null, updatedAt: null } }),
      setSiteAssistantCredential: () => Promise.reject(new Error("network down")),
    });
    const { result } = renderHook(() => useOtherCredentials(port, T, LOCALE, { query: "", category: "all" }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const row = findGroup(result.current.groups, "site-assistant")!.rows[0]!;
    act(() => result.current.setDraftToken(row.key, "sk-fails"));

    await act(() => result.current.replace(findGroup(result.current.groups, "site-assistant")!.rows[0]!));

    const settled = findGroup(result.current.groups, "site-assistant")!.rows[0]!;
    expect(settled.error).toBe("Couldn't save this token: network down");
    expect(settled.token).toBe("sk-fails");
    expect(settled.saving).toBe(false);
  });
});

describe("useOtherCredentials — remove: per-store dispatch (writeRemove), all six stores", () => {
  it("site-assistant: deleteSiteAssistantCredential, then refetches", async () => {
    let stored = { isSet: true, masked: "abcd" as string | null, provider: "openai", baseUrl: null as string | null, model: null as string | null, updatedAt: null as string | null };
    const deleteSiteAssistantCredential = vi.fn(() => {
      stored = { ...stored, isSet: false, masked: null };
      return Promise.resolve({ data: stored });
    });
    const port = createFakeOtherCredentialsPort({
      getSiteAssistantCredential: () => Promise.resolve({ data: stored }),
      deleteSiteAssistantCredential,
    });
    const { result } = renderHook(() => useOtherCredentials(port, T, LOCALE, { query: "", category: "all" }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());

    await act(() => result.current.remove(findGroup(result.current.groups, "site-assistant")!.rows[0]!));

    expect(deleteSiteAssistantCredential).toHaveBeenCalledWith();
    await waitFor(() => expect(findGroup(result.current.groups, "site-assistant")?.rows).toHaveLength(0));
  });

  it("admin-byok: deleteAdminByokCredential", async () => {
    const deleteAdminByokCredential = vi.fn(() => Promise.resolve({ data: { isSet: false, masked: null, protocol: "anthropic-messages", providerId: null, baseUrl: null, model: null, maxTokens: null, updatedAt: null } }));
    const port = createFakeOtherCredentialsPort({
      getAdminByokCredential: () => Promise.resolve({ data: { isSet: true, masked: "abcd", protocol: "anthropic-messages", providerId: null, baseUrl: null, model: null, maxTokens: null, updatedAt: null } }),
      deleteAdminByokCredential,
    });
    const { result } = renderHook(() => useOtherCredentials(port, T, LOCALE, { query: "", category: "all" }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());

    await act(() => result.current.remove(findGroup(result.current.groups, "admin-byok")!.rows[0]!));

    expect(deleteAdminByokCredential).toHaveBeenCalledWith();
  });

  it("composio-project: saveComposioConfig(null)", async () => {
    const saveComposioConfig = vi.fn(() => Promise.resolve({ configured: false, apiKeyTail: "" }));
    const port = createFakeOtherCredentialsPort({
      getComposioConfig: () => Promise.resolve({ configured: true, apiKeyTail: "abcd" }),
      saveComposioConfig,
    });
    const { result } = renderHook(() => useOtherCredentials(port, T, LOCALE, { query: "", category: "all" }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());

    await act(() => result.current.remove(findGroup(result.current.groups, "composio-project")!.rows[0]!));

    expect(saveComposioConfig).toHaveBeenCalledWith(null);
  });

  it("media-provider: rebuilds the map WITHOUT the removed provider, preserving every other provider as {}", async () => {
    const saveMediaProviders = vi.fn((map: AdminMediaProviderMap) => Promise.resolve(map));
    const port = createFakeOtherCredentialsPort({
      getMediaProviders: () =>
        Promise.resolve({
          cloudinary: { apiKeyConfigured: true, apiKeyTail: "old4" },
          grok: { apiKeyConfigured: true, apiKeyTail: "grok" },
        } as AdminMediaProviderMap),
      saveMediaProviders,
    });
    const { result } = renderHook(() => useOtherCredentials(port, T, LOCALE, { query: "", category: "all" }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findGroup(result.current.groups, "media-provider")!.rows.find((r) => r.itemId === "cloudinary")!;

    await act(() => result.current.remove(target));

    expect(saveMediaProviders).toHaveBeenCalledWith({ grok: {} });
  });

  it("composio-connector: disconnectConnector(itemId)", async () => {
    const disconnectConnector = vi.fn(() => Promise.resolve({ id: "c1", name: "C1", provider: "p", category: "cat", status: "available" as const, tools: [] }));
    const port = createFakeOtherCredentialsPort({
      listConnectors: () => Promise.resolve({ connectors: [{ id: "c1", name: "C1", provider: "p", category: "cat", status: "connected", tools: [] }] }),
      getConnectorStatuses: () => Promise.resolve({ c1: { status: "connected" } }),
      disconnectConnector,
    });
    const { result } = renderHook(() => useOtherCredentials(port, T, LOCALE, { query: "", category: "all" }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());

    await act(() => result.current.remove(findGroup(result.current.groups, "composio-connector")!.rows[0]!));

    expect(disconnectConnector).toHaveBeenCalledWith("c1");
  });

  it("external-mcp: deleteExternalMcpServer(itemId)", async () => {
    const deleteExternalMcpServer = vi.fn(() => Promise.resolve({ removed: true, restartRequired: true }));
    const port = createFakeOtherCredentialsPort({
      listExternalMcpServers: () => Promise.resolve({ servers: [{ serverId: "s1", label: "S1", transport: "stdio", enabled: true, command: "x", args: [], allowedToolNames: [], envNames: [] }] }),
      deleteExternalMcpServer,
    });
    const { result } = renderHook(() => useOtherCredentials(port, T, LOCALE, { query: "", category: "all" }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());

    await act(() => result.current.remove(findGroup(result.current.groups, "external-mcp")!.rows[0]!));

    expect(deleteExternalMcpServer).toHaveBeenCalledWith("s1");
  });

  it("a rejected remove surfaces the exact error text and preserves whatever draft token already existed", async () => {
    const port = createFakeOtherCredentialsPort({
      getSiteAssistantCredential: () => Promise.resolve({ data: { isSet: true, masked: "abcd", provider: "openai", baseUrl: null, model: null, updatedAt: null } }),
      deleteSiteAssistantCredential: () => Promise.reject(new Error("boom")),
    });
    const { result } = renderHook(() => useOtherCredentials(port, T, LOCALE, { query: "", category: "all" }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const row = findGroup(result.current.groups, "site-assistant")!.rows[0]!;
    // A token was typed but never submitted before Remove was clicked.
    act(() => result.current.setDraftToken(row.key, "typed-but-not-saved"));

    await act(() => result.current.remove(findGroup(result.current.groups, "site-assistant")!.rows[0]!));

    const settled = findGroup(result.current.groups, "site-assistant")!.rows[0]!;
    expect(settled.error).toBe("Couldn't save this token: boom");
    expect(settled.token).toBe("typed-but-not-saved");
    expect(settled.saving).toBe(false);
  });
});

describe("useWiredOtherCredentials", () => {
  it("wires the real port and locale — reads settle through the mocked lib/api", async () => {
    getAssistantSiteCredential.mockResolvedValue({ data: { isSet: true, masked: "wire", provider: "openai", baseUrl: null, model: null, updatedAt: null } });
    getAdminExecutionCredential.mockResolvedValue({ data: { isSet: false, masked: null, protocol: "anthropic-messages", providerId: null, baseUrl: null, model: null, maxTokens: null, updatedAt: null } });
    getMediaProviders.mockResolvedValue({});
    getComposioConfig.mockResolvedValue({ configured: false, apiKeyTail: "" });
    listConnectors.mockResolvedValue({ connectors: [] });
    getConnectorStatuses.mockResolvedValue({});
    listExternalMcpServers.mockResolvedValue({ servers: [] });

    const { result } = renderHook(() => useWiredOtherCredentials({ query: "", category: "all" }), { wrapper });

    await waitFor(() => expect(result.current.groups).toBeDefined());
    expect(findGroup(result.current.groups, "site-assistant")?.rows[0]?.valueFact).toBe("••••wire");
  });
});
