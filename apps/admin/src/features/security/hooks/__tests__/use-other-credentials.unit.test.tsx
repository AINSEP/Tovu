import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import type { AdminMediaProviderMap } from "@jini-ai/admin/screens/media/api/media-api";
import type { MediaProviderFields } from "@jini-ai/ui/core";
import { useOtherCredentials, useWiredOtherCredentials } from "../use-other-credentials.hooks";
import type { OtherCredentialGroupState } from "../use-other-credentials.hooks";
import { createFakeOtherCredentialsPort } from "../other-credentials-dependencies.hooks";
import type { AdminExternalMcpServer } from "@jini-ai/core/contracts/site/cms-external-mcp";

/** Minimal, fully-shaped `AdminExternalMcpServer` fixture — the OAuth-related fields this suite
 *  never exercises stay at their "nothing configured" defaults so each call site only spells out
 *  what it actually varies. */
function fakeExternalMcpServer(overrides: Partial<AdminExternalMcpServer> = {}): AdminExternalMcpServer {
  return {
    serverId: "local-fs",
    label: "Local filesystem",
    version: 1,
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
    ...overrides,
  };
}

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
  listExternalMcpServers,
} = vi.hoisted(() => ({
  getAssistantSiteCredential: vi.fn(),
  getAdminExecutionCredential: vi.fn(),
  getMediaProviders: vi.fn(),
  listExternalMcpServers: vi.fn(),
}));

vi.mock("@/features/integrations/integrations-host-ports", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/integrations/integrations-host-ports")>();
  return { ...actual, integrationsApi: { ...actual.integrationsApi, listExternalMcpServers } };
});
vi.mock("../../../ai-assistant/api/ai-assistant-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../ai-assistant/api/ai-assistant-api")>();
  return { ...actual, aiAssistantApi: { ...actual.aiAssistantApi, getAssistantSiteCredential, getAdminExecutionCredential } };
});
vi.mock("../../../media/api/media-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../media/api/media-api")>();
  return { ...actual, mediaApi: { ...actual.mediaApi, getMediaProviders } };
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

/** One write the screen issued against the per-provider media routes, as the fake server saw it. */
type MediaProviderWrite = { op: "patch"; providerId: string; fields: MediaProviderFields } | { op: "remove"; providerId: string };

/** The stored view of one provider after a PATCH merged `fields` into `stored` — same rules as the
 *  server's `patchMediaProvider` (`provider-credential-store.ts`'s `mergedPatchEntry`): an omitted
 *  `apiKey`/`baseUrl`/`model` keeps the stored value. Markers only, never key material. */
function mergedMediaProviderView(stored: AdminMediaProviderMap[string] | undefined, fields: MediaProviderFields): AdminMediaProviderMap[string] {
  const tail = fields.apiKey ? fields.apiKey.slice(-4) : stored?.apiKeyTail;
  const baseUrl = fields.baseUrl ?? stored?.baseUrl;
  const model = fields.model ?? stored?.model;
  return {
    ...(tail === undefined ? {} : { apiKeyConfigured: true, apiKeyTail: tail }),
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(model === undefined ? {} : { model }),
  };
}

/** A fake `/media/providers/:providerId` with the real server's per-provider semantics: PATCH merges
 *  ONE provider's fields into its own row, DELETE drops exactly the named provider, and neither can
 *  touch any other provider. Every write is recorded in `writes`. With `held`, a write lands only when
 *  the test calls `releaseNext`, so two writes can be put in flight before either applies. */
function fakePerProviderMediaServer(initial: AdminMediaProviderMap, { held = false }: { held?: boolean } = {}) {
  let state: AdminMediaProviderMap = structuredClone(initial);
  const writes: MediaProviderWrite[] = [];
  const releases: Array<() => void> = [];
  const land = (apply: () => void): Promise<AdminMediaProviderMap> =>
    new Promise((resolve) => {
      const release = () => {
        apply();
        resolve(structuredClone(state));
      };
      if (held) releases.push(release);
      else release();
    });
  return {
    state: () => state,
    setState: (next: AdminMediaProviderMap) => { state = structuredClone(next); },
    writes,
    releaseNext: () => releases.shift()?.(),
    pendingWrites: () => releases.length,
    getMediaProviders: () => Promise.resolve(structuredClone(state)),
    patchMediaProvider: ({ providerId, fields }: { providerId: string; fields: MediaProviderFields }) => {
      writes.push({ op: "patch", providerId, fields: structuredClone(fields) });
      return land(() => { state = { ...state, [providerId]: mergedMediaProviderView(state[providerId], fields) }; });
    },
    removeMediaProvider: ({ providerId }: { providerId: string }) => {
      writes.push({ op: "remove", providerId });
      return land(() => {
        const next = { ...state };
        delete next[providerId];
        state = next;
      });
    },
  };
}

// The media routes now take one provider per write (PATCH/DELETE on `/media/providers/:providerId`);
// the legacy whole-map PUT answers 409 without an `If-Match` revision this screen never had. A whole
// map from this screen also re-sends a snapshot of every OTHER provider, so a key another window saved
// after this page loaded is undone, and a provider missing from that snapshot is deleted by omission.
describe("useOtherCredentials — media Replace/Remove name exactly one provider", () => {
  const twoProviders: AdminMediaProviderMap = {
    cloudinary: { apiKeyConfigured: true, apiKeyTail: "old4", baseUrl: "https://cloud.example" },
    grok: { apiKeyConfigured: true, apiKeyTail: "g222", model: "grok-imagine-2" },
  };

  it("Replace patches only that provider with only the typed key, and no other provider is written", async () => {
    const server = fakePerProviderMediaServer(twoProviders);
    const port = createFakeOtherCredentialsPort({ getMediaProviders: server.getMediaProviders, patchMediaProvider: server.patchMediaProvider, removeMediaProvider: server.removeMediaProvider });
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const row = findGroup(result.current.groups, "media-provider")!.rows.find((r) => r.itemId === "cloudinary")!;
    // Another window saves a newer grok key after this page loaded; this screen must not undo it.
    server.setState({ ...server.state(), grok: { apiKeyConfigured: true, apiKeyTail: "new9", model: "grok-imagine-3" } });
    act(() => result.current.setDraftToken({ key: row.key, value: "sk-cloud-new1" }));

    await act(() => result.current.replace(findGroup(result.current.groups, "media-provider")!.rows.find((r) => r.itemId === "cloudinary")!));

    expect(server.writes).toStrictEqual([{ op: "patch", providerId: "cloudinary", fields: { apiKey: "sk-cloud-new1" } }]);
    expect(server.state()).toStrictEqual({
      cloudinary: { apiKeyConfigured: true, apiKeyTail: "new1", baseUrl: "https://cloud.example" },
      grok: { apiKeyConfigured: true, apiKeyTail: "new9", model: "grok-imagine-3" },
    });
    expect(findGroup(result.current.groups, "media-provider")!.rows.find((r) => r.itemId === "cloudinary")).toMatchObject({ token: "", saving: false, error: null });
  });

  it("Remove deletes only that provider by name, and a provider saved in another window survives", async () => {
    const server = fakePerProviderMediaServer(twoProviders);
    const port = createFakeOtherCredentialsPort({ getMediaProviders: server.getMediaProviders, patchMediaProvider: server.patchMediaProvider, removeMediaProvider: server.removeMediaProvider });
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    // Saved elsewhere after this page loaded — absent from this screen's view, so a map rebuilt from
    // that view would omit it, and omission would delete it.
    server.setState({ ...server.state(), fal: { apiKeyConfigured: true, apiKeyTail: "fal1" } });

    await act(() => result.current.remove(findGroup(result.current.groups, "media-provider")!.rows.find((r) => r.itemId === "cloudinary")!));

    expect(server.writes).toStrictEqual([{ op: "remove", providerId: "cloudinary" }]);
    expect(server.state()).toStrictEqual({
      grok: { apiKeyConfigured: true, apiKeyTail: "g222", model: "grok-imagine-2" },
      fal: { apiKeyConfigured: true, apiKeyTail: "fal1" },
    });
    expect(findGroup(result.current.groups, "media-provider")!.rows.map((r) => r.itemId).sort()).toStrictEqual(["fal", "grok"]);
  });
});

describe("useOtherCredentials — reading all four stores", () => {
  // Per-provider contract: the screen sends only the typed key, so a row deleted in another window
  // is re-created from that key alone — the stale `baseUrl` this page loaded is never echoed back.
  it("recreates a media provider removed elsewhere using its new key without stale settings", async () => {
    const server = fakePerProviderMediaServer({ cloudinary: { apiKeyConfigured: true, apiKeyTail: "old4", baseUrl: "https://old.example" } });
    const port = createFakeOtherCredentialsPort({ getMediaProviders: server.getMediaProviders, patchMediaProvider: server.patchMediaProvider, removeMediaProvider: server.removeMediaProvider });
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const row = findGroup(result.current.groups, "media-provider")!.rows[0]!;
    server.setState({});
    act(() => result.current.setDraftToken({ key: row.key, value: "replacement-key" }));
    await act(() => result.current.replace(row));
    expect(server.writes).toStrictEqual([{ op: "patch", providerId: "cloudinary", fields: { apiKey: "replacement-key" } }]);
    expect(server.state()).toStrictEqual({ cloudinary: { apiKeyConfigured: true, apiKeyTail: "-key" } });
    expect(findGroup(result.current.groups, "media-provider")!.rows[0]).toMatchObject({ valueFact: "••••-key", token: "", saving: false, error: null });
  });

  it("prefers media token metadata to a legacy mask and still shows a configured key with no metadata", async () => {
    const port = createFakeOtherCredentialsPort({
      getMediaProviders: async () => ({
        cloudinary: { apiKeyConfigured: true, apiKeyTail: "old4", apiKeyHint: { length: 18, last4: "new4" } },
        grok: { apiKeyConfigured: true },
      }),
    });
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const rows = findGroup(result.current.groups, "media-provider")!.rows;
    expect(rows.find(row => row.itemId === "cloudinary")!.valueFact).toBe("…new4, 18 chars");
    expect(rows.find(row => row.itemId === "grok")!.valueFact).toBe("••••");
    expect(result.current.totalCount).toBe(2);
  });

  it("omits built-in MCP servers and chooses access-token, environment-token, then environment-name facts", async () => {
    const port = createFakeOtherCredentialsPort({
      listExternalMcpServers: async () => ({ servers: [
        fakeExternalMcpServer({ serverId: "internal", builtIn: true }),
        fakeExternalMcpServer({ serverId: "access", accessTokenHint: { length: 16, last4: "abcd" }, envTokenHints: { KEY: { length: 4, last4: null } } }),
        fakeExternalMcpServer({ serverId: "environment", envTokenHints: { KEY: { length: 4, last4: null } } }),
        fakeExternalMcpServer({ serverId: "names", label: "", envNames: ["KEY"] }),
      ] }),
    });
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const rows = findGroup(result.current.groups, "external-mcp")!.rows;
    expect(rows.map(row => row.itemId)).toEqual(["access", "environment", "names"]);
    expect(rows.find(row => row.itemId === "access")!.valueFact).toBe("…abcd, 16 chars");
    expect(rows.find(row => row.itemId === "environment")!.valueFact).toBe("KEY: 4 chars");
    expect(rows.find(row => row.itemId === "names")).toMatchObject({ name: "names", valueFact: "1 environment variable set" });
  });

  it("rejects an invalid replacement token and clears the error when the draft is corrected", async () => {
    const setSiteAssistantCredential = vi.fn();
    const port = createFakeOtherCredentialsPort({
      getSiteAssistantCredential: async () => ({ data: { isSet: true, masked: "••••kept", provider: "openai", baseUrl: null, model: null, updatedAt: null } }),
      setSiteAssistantCredential,
    });
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const row = findGroup(result.current.groups, "site-assistant")!.rows[0]!;
    act(() => result.current.setDraftToken({ key: row.key, value: "bad token" }));
    await act(() => result.current.replace(row));
    expect(findGroup(result.current.groups, "site-assistant")!.rows[0]).toMatchObject({
      token: "bad token", valueFact: "••••kept", saving: false,
      error: "Hosted tokens must use visible ASCII characters (0x21–0x7E).",
    });
    expect(setSiteAssistantCredential).not.toHaveBeenCalled();
    act(() => result.current.setDraftToken({ key: row.key, value: "corrected-token" }));
    expect(findGroup(result.current.groups, "site-assistant")!.rows[0]).toMatchObject({ token: "corrected-token", saving: false, error: null, valueFact: "••••kept" });
  });

  it("shows a failed remove on a row with no draft using a blank token", async () => {
    const port = createFakeOtherCredentialsPort({
      getSiteAssistantCredential: async () => ({ data: { isSet: true, masked: "••••kept", provider: "openai", baseUrl: null, model: null, updatedAt: null } }),
      deleteSiteAssistantCredential: async () => { throw new Error("permission denied"); },
    });
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    await act(() => result.current.remove(findGroup(result.current.groups, "site-assistant")!.rows[0]!));
    expect(findGroup(result.current.groups, "site-assistant")!.rows[0]).toMatchObject({
      token: "", saving: false, valueFact: "••••kept", error: "Couldn't save this token: permission denied",
    });
    expect(result.current.totalCount).toBe(1);
  });

  it("uses the same localized server hint for both BYOK stores without adding mask bullets", async () => {
    const port = createFakeOtherCredentialsPort({
      getSiteAssistantCredential: () => Promise.resolve({ data: { isSet: true, masked: "••••a9F2", tokenHint: { length: 18, last4: "a9F2" }, provider: "openai", baseUrl: null, model: null, updatedAt: null } }),
      getAdminByokCredential: () => Promise.resolve({ data: { isSet: true, masked: null, tokenHint: { length: 4, last4: null }, protocol: "anthropic", providerId: null, baseUrl: null, model: null, maxTokens: null, updatedAt: null } }),
    });
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: "es", filter: { query: "", category: "all" } }), { wrapper });
    await waitFor(() => expect(findGroup(result.current.groups, "site-assistant")?.rows[0]?.valueFact).toBe("…a9F2, 18 caracteres"));
    await waitFor(() => expect(findGroup(result.current.groups, "admin-byok")?.rows[0]?.valueFact).toBe("4 caracteres"));
  });
  it("settles each store independently into its own row(s), covering every reader and readStore's dispatch", async () => {
    const port = createFakeOtherCredentialsPort({
      getSiteAssistantCredential: () => Promise.resolve({ data: { isSet: true, masked: "site", provider: "openai", baseUrl: null, model: null, updatedAt: "2026-08-01T00:00:00.000Z" } }),
      getAdminByokCredential: () => Promise.resolve({ data: { isSet: false, masked: null, protocol: "anthropic-messages", providerId: null, baseUrl: null, model: null, maxTokens: null, updatedAt: null } }),
      getMediaProviders: () =>
        Promise.resolve({
          "totally-unknown-vendor": { apiKeyConfigured: true, apiKeyTail: "1234" },
          "not-configured-vendor": { apiKeyConfigured: false },
        } as AdminMediaProviderMap),
      listExternalMcpServers: () =>
        Promise.resolve({ servers: [fakeExternalMcpServer({ envNames: ["FOO", "BAR"] })] }),
    });

    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
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

    // external-mcp: envNamesFact with more than one name.
    const mcp = findGroup(result.current.groups, "external-mcp");
    expect(mcp?.rows[0]?.valueFact).toBe("2 environment variables set");

    // totalCount sums every store's item count regardless of filter.
    expect(result.current.totalCount).toBe(1 + 0 + 1 + 1);
  });

  it("a rejected store read reports its own loadError with the exact banner text, without blocking the other three stores", async () => {
    const port = createFakeOtherCredentialsPort({
      getMediaProviders: () => Promise.reject(new Error("media down")),
    });
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });

    await waitFor(() => expect(result.current.groups).toBeDefined());
    expect(result.current.loadError).toBe("Couldn't load saved access tokens: media down");
    // The failed store still renders (as empty), and its neighbors are unaffected.
    expect(findGroup(result.current.groups, "media-provider")?.rows).toHaveLength(0);
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
    const { result } = renderHook(() => useOtherCredentials({ port: twoAiOneMediaPort(), t: T, locale: LOCALE, filter: { query: "", category: "ai" } }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());

    const ids = result.current.groups?.map((g) => g.store.id) ?? [];
    expect(ids).toContain("site-assistant");
    expect(ids).toContain("admin-byok");
    expect(ids).toContain("external-mcp");
    expect(ids).not.toContain("media-provider");
  });

  it("matchCount only counts items whose name matches the query, independent of totalCount", async () => {
    const { result } = renderHook(() => useOtherCredentials({ port: twoAiOneMediaPort(), t: T, locale: LOCALE, filter: { query: "cloud", category: "all" } }), { wrapper });
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
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());

    act(() => result.current.setDraftToken({ key: "site-assistant:site-assistant", value: "sk-typed" }));

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
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const row = findGroup(result.current.groups, "site-assistant")!.rows[0]!;

    await act(() => result.current.replace(row));

    expect(setSiteAssistantCredential).not.toHaveBeenCalled();
  });

  it("does nothing for a store that does not support Replace, even with a token typed", async () => {
    const deleteExternalMcpServer = vi.fn();
    const listExternalMcpServers = vi.fn(() => Promise.resolve({ servers: [fakeExternalMcpServer({ serverId: "s1", label: "S1" })] }));
    const port = createFakeOtherCredentialsPort({
      listExternalMcpServers,
      deleteExternalMcpServer,
    });
    const writes = [
      "setSiteAssistantCredential", "deleteSiteAssistantCredential",
      "setAdminByokCredential", "deleteAdminByokCredential",
      "patchMediaProvider", "removeMediaProvider", "deleteExternalMcpServer",
    ] as const;
    const writeSpies = writes.map((method) => vi.spyOn(port, method));
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const row = findGroup(result.current.groups, "external-mcp")!.rows[0]!;
    act(() => result.current.setDraftToken({ key: row.key, value: "irrelevant" }));

    const before = { ...findGroup(result.current.groups, "external-mcp")!.rows[0]! };
    expect(before.token).toBe("irrelevant");
    expect(listExternalMcpServers).toHaveBeenCalledTimes(1);
    await act(() => result.current.replace(findGroup(result.current.groups, "external-mcp")!.rows[0]!));

    expect(deleteExternalMcpServer).not.toHaveBeenCalled();
    for (const write of writeSpies) expect(write).not.toHaveBeenCalled();
    expect(listExternalMcpServers).toHaveBeenCalledTimes(1);
    expect(findGroup(result.current.groups, "external-mcp")!.rows[0]!).toEqual(before);
  });
});

describe("useOtherCredentials — remaining read and write guards", () => {
  it("shows a set single-key store with no server hint as a bare mask", async () => {
    const port = createFakeOtherCredentialsPort({
      getSiteAssistantCredential: () => Promise.resolve({ data: { isSet: true, masked: null, provider: "openai", baseUrl: null, model: null, updatedAt: null } }),
    });
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
    await waitFor(() => expect(findGroup(result.current.groups, "site-assistant")?.rows[0]?.valueFact).toBe("••••"));
  });

  it("writes nothing for an external-mcp row even if it were offered Replace", async () => {
    const port = createFakeOtherCredentialsPort({
      listExternalMcpServers: () => Promise.resolve({ servers: [fakeExternalMcpServer({ serverId: "s1", label: "S1" })] }),
    });
    const writeSpies = (["setSiteAssistantCredential", "setAdminByokCredential", "patchMediaProvider", "removeMediaProvider", "getMediaProviders", "deleteExternalMcpServer"] as const).map((method) => vi.spyOn(port, method));
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
    await waitFor(() => expect(findGroup(result.current.groups, "external-mcp")?.rows[0]).toBeDefined());
    const row = findGroup(result.current.groups, "external-mcp")!.rows[0]!;
    act(() => result.current.setDraftToken({ key: row.key, value: "a-replacement-value-1234" }));
    const offered = { ...findGroup(result.current.groups, "external-mcp")!.rows[0]!, store: { ...row.store, supportsReplace: true } };
    for (const spy of writeSpies) spy.mockClear();
    await act(() => result.current.replace(offered));
    for (const spy of writeSpies) expect(spy).not.toHaveBeenCalled();
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
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const row = findGroup(result.current.groups, "site-assistant")!.rows[0]!;
    act(() => result.current.setDraftToken({ key: row.key, value: "  sk-new  " }));

    await act(() => result.current.replace(findGroup(result.current.groups, "site-assistant")!.rows[0]!));

    expect(setSiteAssistantCredential).toHaveBeenCalledExactlyOnceWith({ apiKey: "  sk-new  " }); // store owns normalization
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
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const row = findGroup(result.current.groups, "admin-byok")!.rows[0]!;
    act(() => result.current.setDraftToken({ key: row.key, value: "sk-byok" }));

    await act(() => result.current.replace(findGroup(result.current.groups, "admin-byok")!.rows[0]!));

    expect(setAdminByokCredential).toHaveBeenCalledWith({ apiKey: "sk-byok" });
  });

  it("media-provider: patches the target alone with the new key — no map, no other provider named", async () => {
    const patchMediaProvider = vi.fn(({ providerId }: { providerId: string; fields: MediaProviderFields }) => Promise.resolve({ [providerId]: { apiKeyConfigured: true, apiKeyTail: "-new" } } as AdminMediaProviderMap));
    const removeMediaProvider = vi.fn();
    const port = createFakeOtherCredentialsPort({
      getMediaProviders: () =>
        Promise.resolve({
          cloudinary: { apiKeyConfigured: true, apiKeyTail: "old4" },
          grok: { apiKeyConfigured: true, apiKeyTail: "grok" },
        } as AdminMediaProviderMap),
      patchMediaProvider,
      removeMediaProvider,
    });
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const row = findGroup(result.current.groups, "media-provider")!.rows.find((r) => r.itemId === "cloudinary")!;
    act(() => result.current.setDraftToken({ key: row.key, value: "sk-cloud-new" }));

    await act(() => result.current.replace(findGroup(result.current.groups, "media-provider")!.rows.find((r) => r.itemId === "cloudinary")!));

    expect(patchMediaProvider).toHaveBeenCalledTimes(1);
    expect(patchMediaProvider.mock.calls[0]![0]).toStrictEqual({ providerId: "cloudinary", fields: { apiKey: "sk-cloud-new" } });
    expect(removeMediaProvider).not.toHaveBeenCalled();
  });

  // Was: the whole-map rebuild had to copy every provider's baseUrl/model into the PUT, or the server
  // nulled them. Per-provider, the equivalent guarantee is that a Replace sends only the key and the
  // server's merge against the CURRENT row keeps the target's own baseUrl/model, while no other
  // provider is written at all — so neither can lose its settings.
  it("media-provider: a Replace keeps baseUrl/model for the target AND every other provider", async () => {
    const server = fakePerProviderMediaServer({
      cloudinary: { apiKeyConfigured: true, apiKeyTail: "old4", baseUrl: "https://cloud.example", model: "c-1" },
      grok: { apiKeyConfigured: true, apiKeyTail: "grok", baseUrl: "https://grok.example/v1" },
    });
    const port = createFakeOtherCredentialsPort({ getMediaProviders: server.getMediaProviders, patchMediaProvider: server.patchMediaProvider, removeMediaProvider: server.removeMediaProvider });
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const row = findGroup(result.current.groups, "media-provider")!.rows.find((r) => r.itemId === "cloudinary")!;
    act(() => result.current.setDraftToken({ key: row.key, value: "sk-cloud-new" }));

    await act(() => result.current.replace(findGroup(result.current.groups, "media-provider")!.rows.find((r) => r.itemId === "cloudinary")!));

    // Marker fields and settings are read-only view facts here; the write carries the key alone.
    expect(server.writes).toStrictEqual([{ op: "patch", providerId: "cloudinary", fields: { apiKey: "sk-cloud-new" } }]);
    expect(server.state()).toStrictEqual({
      cloudinary: { apiKeyConfigured: true, apiKeyTail: "-new", baseUrl: "https://cloud.example", model: "c-1" },
      grok: { apiKeyConfigured: true, apiKeyTail: "grok", baseUrl: "https://grok.example/v1" },
    });
  });

  it("a rejected write surfaces the exact save-error text and preserves the typed (untrimmed-source) token", async () => {
    const port = createFakeOtherCredentialsPort({
      getSiteAssistantCredential: () => Promise.resolve({ data: { isSet: true, masked: "abcd", provider: "openai", baseUrl: null, model: null, updatedAt: null } }),
      setSiteAssistantCredential: () => Promise.reject(new Error("network down")),
    });
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const row = findGroup(result.current.groups, "site-assistant")!.rows[0]!;
    act(() => result.current.setDraftToken({ key: row.key, value: "sk-fails" }));

    await act(() => result.current.replace(findGroup(result.current.groups, "site-assistant")!.rows[0]!));

    const settled = findGroup(result.current.groups, "site-assistant")!.rows[0]!;
    expect(settled.error).toBe("Couldn't save this token: network down");
    expect(settled.token).toBe("sk-fails");
    expect(settled.saving).toBe(false);
  });
});

describe("useOtherCredentials — remove: per-store dispatch (writeRemove), all four stores", () => {
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
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
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
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());

    await act(() => result.current.remove(findGroup(result.current.groups, "admin-byok")!.rows[0]!));

    expect(deleteAdminByokCredential).toHaveBeenCalledWith();
  });

  it("media-provider: removes the target by name — no map, no other provider named", async () => {
    const removeMediaProvider = vi.fn((_required: { providerId: string }) => Promise.resolve({ grok: { apiKeyConfigured: true, apiKeyTail: "grok" } } as AdminMediaProviderMap));
    const patchMediaProvider = vi.fn();
    const port = createFakeOtherCredentialsPort({
      getMediaProviders: () =>
        Promise.resolve({
          cloudinary: { apiKeyConfigured: true, apiKeyTail: "old4" },
          grok: { apiKeyConfigured: true, apiKeyTail: "grok" },
        } as AdminMediaProviderMap),
      patchMediaProvider,
      removeMediaProvider,
    });
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findGroup(result.current.groups, "media-provider")!.rows.find((r) => r.itemId === "cloudinary")!;

    await act(() => result.current.remove(target));

    expect(removeMediaProvider).toHaveBeenCalledTimes(1);
    expect(removeMediaProvider.mock.calls[0]![0]).toStrictEqual({ providerId: "cloudinary" });
    expect(patchMediaProvider).not.toHaveBeenCalled();
  });

  // Regression (found while triaging the terra security review, 2026-09-20): the whole-map rebuild
  // sent `{}` for every OTHER provider, and the server wrote `baseUrl`/`model` from the submitted entry
  // — `{}` only preserved the KEY, so removing one provider silently cleared every other provider's
  // base URL and model. The per-provider DELETE names no other provider; this pins that every other
  // provider's settings and key survive a Remove unchanged.
  it("media-provider: removing one provider leaves every OTHER provider's baseUrl/model unchanged", async () => {
    const server = fakePerProviderMediaServer({
      cloudinary: { apiKeyConfigured: true, apiKeyTail: "old4", baseUrl: "https://cloud.example" },
      grok: { apiKeyConfigured: true, apiKeyTail: "grok", baseUrl: "https://grok.example/v1", model: "grok-imagine-2" },
      openai: { apiKeyConfigured: true, apiKeyTail: "oai1", model: "gpt-image-1" },
      fal: { baseUrl: "https://fal.example" },
    });
    const port = createFakeOtherCredentialsPort({ getMediaProviders: server.getMediaProviders, patchMediaProvider: server.patchMediaProvider, removeMediaProvider: server.removeMediaProvider });
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const target = findGroup(result.current.groups, "media-provider")!.rows.find((r) => r.itemId === "cloudinary")!;

    await act(() => result.current.remove(target));

    expect(server.writes).toStrictEqual([{ op: "remove", providerId: "cloudinary" }]);
    expect(server.state()).toStrictEqual({
      grok: { apiKeyConfigured: true, apiKeyTail: "grok", baseUrl: "https://grok.example/v1", model: "grok-imagine-2" },
      openai: { apiKeyConfigured: true, apiKeyTail: "oai1", model: "gpt-image-1" },
      fal: { baseUrl: "https://fal.example" },
    });
  });

  it("external-mcp: deleteExternalMcpServer(itemId)", async () => {
    const deleteExternalMcpServer = vi.fn(() => Promise.resolve({ removed: true, restartRequired: true }));
    const port = createFakeOtherCredentialsPort({
      listExternalMcpServers: () => Promise.resolve({ servers: [fakeExternalMcpServer({ serverId: "s1", label: "S1", command: "x" })] }),
      deleteExternalMcpServer,
    });
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());

    await act(() => result.current.remove(findGroup(result.current.groups, "external-mcp")!.rows[0]!));

    expect(deleteExternalMcpServer).toHaveBeenCalledWith({ serverId: "s1" });
  });

  it("a rejected remove surfaces the exact error text and preserves whatever draft token already existed", async () => {
    const port = createFakeOtherCredentialsPort({
      getSiteAssistantCredential: () => Promise.resolve({ data: { isSet: true, masked: "abcd", provider: "openai", baseUrl: null, model: null, updatedAt: null } }),
      deleteSiteAssistantCredential: () => Promise.reject(new Error("boom")),
    });
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const row = findGroup(result.current.groups, "site-assistant")!.rows[0]!;
    // A token was typed but never submitted before Remove was clicked.
    act(() => result.current.setDraftToken({ key: row.key, value: "typed-but-not-saved" }));

    await act(() => result.current.remove(findGroup(result.current.groups, "site-assistant")!.rows[0]!));

    const settled = findGroup(result.current.groups, "site-assistant")!.rows[0]!;
    expect(settled.error).toBe("Couldn't save this token: boom");
    expect(settled.token).toBe("typed-but-not-saved");
    expect(settled.saving).toBe(false);
  });
});

// Regression (terra security review 2026-09-20, #2 — the in-tab half). Was: a media-provider write
// was GET map → rebuild → PUT whole map, so two removes started back to back both read the SAME map and
// the second PUT re-created the provider the first had deleted; the guarantee pinned was "the second
// write reads only after the first landed". There is no read-before-write any more — each write names
// one provider — so the equivalent guarantee is: one write in flight at a time from this tab, each
// naming only its own provider, and the end state holds neither (nothing is re-created).
describe("useOtherCredentials — Tier-2 writes from one tab are serialized", () => {
  it("a second media-provider remove is sent only AFTER the first one's write landed, and re-creates nothing", async () => {
    const server = fakePerProviderMediaServer({
      cloudinary: { apiKeyConfigured: true, apiKeyTail: "c111" },
      grok: { apiKeyConfigured: true, apiKeyTail: "g222" },
    }, { held: true });
    const port = createFakeOtherCredentialsPort({ getMediaProviders: server.getMediaProviders, patchMediaProvider: server.patchMediaProvider, removeMediaProvider: server.removeMediaProvider });
    const { result } = renderHook(() => useOtherCredentials({ port, t: T, locale: LOCALE, filter: { query: "", category: "all" } }), { wrapper });
    await waitFor(() => expect(result.current.groups).toBeDefined());
    const rows = findGroup(result.current.groups, "media-provider")!.rows;
    const cloudinary = rows.find((r) => r.itemId === "cloudinary")!;
    const grok = rows.find((r) => r.itemId === "grok")!;

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.remove(cloudinary);
      second = result.current.remove(grok);
    });
    await waitFor(() => expect(server.pendingWrites()).toBe(1));
    // Only ONE write may be in flight — the second remove must not have been sent yet.
    expect(server.writes).toStrictEqual([{ op: "remove", providerId: "cloudinary" }]);

    server.releaseNext();
    await waitFor(() => expect(server.pendingWrites()).toBe(1));
    expect(server.writes).toStrictEqual([{ op: "remove", providerId: "cloudinary" }, { op: "remove", providerId: "grok" }]);
    server.releaseNext();
    await act(async () => {
      await first;
      await second;
    });

    expect(server.writes).toHaveLength(2);
    expect(server.state()).toStrictEqual({});
  });
});

describe("useWiredOtherCredentials", () => {
  it("wires the real port and locale — reads settle through the mocked lib/api", async () => {
    getAssistantSiteCredential.mockResolvedValue({ data: { isSet: true, masked: "wire", provider: "openai", baseUrl: null, model: null, updatedAt: null } });
    getAdminExecutionCredential.mockResolvedValue({ data: { isSet: false, masked: null, protocol: "anthropic-messages", providerId: null, baseUrl: null, model: null, maxTokens: null, updatedAt: null } });
    getMediaProviders.mockResolvedValue({});
    listExternalMcpServers.mockResolvedValue({ servers: [] });

    const { result } = renderHook(() => useWiredOtherCredentials({ query: "", category: "all" }), { wrapper });

    await waitFor(() => expect(result.current.groups).toBeDefined());
    expect(findGroup(result.current.groups, "site-assistant")?.rows[0]?.valueFact).toBe("••••wire");
  });
});
