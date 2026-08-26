import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminExternalMcpServer } from "../../../../lib/api";

/**
 * @file Coverage for `useExternalMcp` (0/9 funcs) — the real `/mcp-servers` transport behind
 * Settings → External MCP. No injected port here (unlike its `settings/hooks` siblings): the hook
 * calls `api.*` directly, so this file mocks `lib/api` the same way `access-tokens-dependencies
 * .unit.test.ts` does for a live-binding surface.
 */

const { listExternalMcpServers, saveExternalMcpServer, deleteExternalMcpServer } = vi.hoisted(() => ({
  listExternalMcpServers: vi.fn(),
  saveExternalMcpServer: vi.fn(),
  deleteExternalMcpServer: vi.fn(),
}));

vi.mock("../../../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/api")>();
  return { ...actual, api: { ...actual.api, listExternalMcpServers, saveExternalMcpServer, deleteExternalMcpServer } };
});

const { useExternalMcp } = await import("../use-external-mcp.hooks");

beforeEach(() => {
  listExternalMcpServers.mockReset();
  saveExternalMcpServer.mockReset();
  deleteExternalMcpServer.mockReset();
});

function server(overrides: Partial<AdminExternalMcpServer> = {}): AdminExternalMcpServer {
  return {
    serverId: "local-fs",
    label: "Local filesystem",
    transport: "stdio",
    authMode: "static_env",
    enabled: true,
    command: "npx",
    url: null,
    args: ["-y", "server-fs"],
    allowedToolNames: ["read_file"],
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

/** The OAuth-shaped flat fields every mapped `SourceConfigItem` carries when nothing OAuth-specific
 *  is configured — spread into an expectation rather than repeated per test. */
const BLANK_OAUTH_FIELDS = {
  oauthProviderId: "",
  oauthGrant: "",
  oauthClientId: "",
  oauthClientSecret: "",
  oauthScopes: "",
  oauthTokenEnvName: "",
  oauthAuthorizationEndpoint: "",
  oauthTokenEndpoint: "",
  oauthDeviceAuthorizationEndpoint: "",
};

describe("useExternalMcp — fetchSources / toItem", () => {
  it("maps each server to a SourceConfigItem, joining args/allowedToolNames, always blanking env", async () => {
    listExternalMcpServers.mockResolvedValue({ servers: [server({ envNames: ["GITHUB_TOKEN"] })] });
    const { result } = renderHook(() => useExternalMcp());

    const items = await result.current.dependencies.port.fetchSources();

    expect(items).toEqual([
      {
        id: "local-fs",
        label: "Local filesystem",
        enabled: true,
        fields: {
          id: "local-fs",
          transport: "stdio",
          command: "npx",
          url: "",
          args: "-y server-fs",
          allowedToolNames: "read_file",
          authMode: "static_env",
          env: "",
          ...BLANK_OAUTH_FIELDS,
        },
        statusMessage: "Credentials set: GITHUB_TOKEN",
      },
    ]);
  });

  it("omits statusMessage entirely when envNames is empty", async () => {
    listExternalMcpServers.mockResolvedValue({ servers: [server({ envNames: [] })] });
    const { result } = renderHook(() => useExternalMcp());

    const items = await result.current.dependencies.port.fetchSources();

    expect(items[0]).not.toHaveProperty("statusMessage");
  });
});

describe("useExternalMcp — addSource", () => {
  it("rejects with a message when the id field is blank, without calling the API", async () => {
    const { result } = renderHook(() => useExternalMcp());

    const outcome = await result.current.dependencies.port.addSource({
      fields: { id: "  ", command: "npx", args: "", allowedToolNames: "", env: "" },
    });

    expect(outcome).toEqual({ ok: false, message: "An ID is required." });
    expect(saveExternalMcpServer).not.toHaveBeenCalled();
  });

  it("rejects the same way when the id key is missing from fields entirely (the ?? \"\" fallback)", async () => {
    const { result } = renderHook(() => useExternalMcp());

    const outcome = await result.current.dependencies.port.addSource({ fields: {} });

    expect(outcome).toEqual({ ok: false, message: "An ID is required." });
  });

  it("defaults command/args/allowedToolNames/env to \"\" when those keys are absent from fields", async () => {
    saveExternalMcpServer.mockResolvedValue({ server: server(), restartRequired: true });
    const { result } = renderHook(() => useExternalMcp());

    await act(async () => {
      await result.current.dependencies.port.addSource({ fields: { id: "bare" } });
    });

    expect(saveExternalMcpServer).toHaveBeenCalledWith("bare", {
      transport: "stdio",
      enabled: true,
      command: "",
      url: "",
      args: "",
      allowedToolNames: "",
      authMode: "static_env",
    });
  });

  it("saves via api.saveExternalMcpServer(id, body), trims the id, sets restartRequired, and returns the mapped item", async () => {
    saveExternalMcpServer.mockResolvedValue({ server: server({ serverId: "new-server" }), restartRequired: true });
    const { result } = renderHook(() => useExternalMcp());
    expect(result.current.restartRequired).toBe(false);

    let outcome;
    await act(async () => {
      outcome = await result.current.dependencies.port.addSource({
        fields: { id: " new-server ", label: "New Server", command: "npx", args: "-y x", allowedToolNames: "tool_a", env: "FOO=bar" },
      });
    });

    expect(saveExternalMcpServer).toHaveBeenCalledWith("new-server", {
      label: "New Server",
      transport: "stdio",
      enabled: true,
      command: "npx",
      url: "",
      args: "-y x",
      allowedToolNames: "tool_a",
      authMode: "static_env",
      env: "FOO=bar",
    });
    expect(outcome).toEqual({ ok: true, source: expect.objectContaining({ id: "new-server" }) });
    await waitFor(() => expect(result.current.restartRequired).toBe(true));
  });

  it("a rejected save surfaces describeApiError's message, defaulting when the error carries none", async () => {
    saveExternalMcpServer.mockRejectedValue(new Error("duplicate id"));
    const { result } = renderHook(() => useExternalMcp());

    const outcome = await result.current.dependencies.port.addSource({
      fields: { id: "dup", command: "npx", args: "", allowedToolNames: "", env: "" },
    });

    expect(outcome).toEqual({ ok: false, message: "duplicate id" });
  });
});

describe("useExternalMcp — removeSource", () => {
  it("calls api.deleteExternalMcpServer(id), sets restartRequired, and returns true", async () => {
    deleteExternalMcpServer.mockResolvedValue({ removed: true, restartRequired: true });
    const { result } = renderHook(() => useExternalMcp());

    let outcome;
    await act(async () => {
      outcome = await result.current.dependencies.port.removeSource("local-fs");
    });

    expect(deleteExternalMcpServer).toHaveBeenCalledWith("local-fs");
    expect(outcome).toBe(true);
    await waitFor(() => expect(result.current.restartRequired).toBe(true));
  });

  it("a rejected delete returns false without throwing", async () => {
    deleteExternalMcpServer.mockRejectedValue(new Error("404"));
    const { result } = renderHook(() => useExternalMcp());

    const outcome = await result.current.dependencies.port.removeSource("missing");

    expect(outcome).toBe(false);
  });
});

describe("useExternalMcp — updateSource", () => {
  it("merges the patch against the last-known fields from fetchSources, then writes the merged body", async () => {
    listExternalMcpServers.mockResolvedValue({ servers: [server({ serverId: "existing", command: "npx", args: ["-y", "x"], allowedToolNames: ["tool_a"] })] });
    saveExternalMcpServer.mockResolvedValue({ server: server({ serverId: "existing" }), restartRequired: true });
    const { result } = renderHook(() => useExternalMcp());
    await result.current.dependencies.port.fetchSources(); // populates lastKnown

    await act(async () => {
      await result.current.dependencies.port.updateSource!("existing", { enabled: false });
    });

    // enabled flips to false; command/args/allowedToolNames are carried over from the last fetch,
    // not blanked out — the exact bug this "merge, don't replace" hook exists to prevent. `label`
    // is carried over too, from the fetched item's own label (mergeSourceUpdate's `patch.label ??
    // previous?.label`).
    expect(saveExternalMcpServer).toHaveBeenCalledWith("existing", {
      label: "Local filesystem",
      transport: "stdio",
      enabled: false,
      command: "npx",
      url: "",
      args: "-y x",
      allowedToolNames: "tool_a",
      authMode: "static_env",
    });
  });

  it("a rejected update returns null without throwing", async () => {
    listExternalMcpServers.mockResolvedValue({ servers: [server()] });
    saveExternalMcpServer.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useExternalMcp());
    await result.current.dependencies.port.fetchSources();

    const outcome = await result.current.dependencies.port.updateSource!("local-fs", { enabled: false });

    expect(outcome).toBeNull();
  });
});

describe("useExternalMcp — addSource rejects a malformed OAuth identity before calling the API", () => {
  it("rejects when authMode is oauth but neither a provider id nor a token endpoint is given", async () => {
    const { result } = renderHook(() => useExternalMcp());

    const outcome = await result.current.dependencies.port.addSource({
      fields: { id: "hosted", transport: "streamable_http", url: "https://mcp.example.com", authMode: "oauth", oauthClientId: "abc" },
    });

    expect(outcome).toEqual({ ok: false, message: "Enter a Provider ID, or fill in this connection's own Token endpoint." });
    expect(saveExternalMcpServer).not.toHaveBeenCalled();
  });

  it("accepts an OAuth draft that names a provider id, and carries the oauth block through to the write", async () => {
    saveExternalMcpServer.mockResolvedValue({ server: server({ serverId: "hosted" }), restartRequired: true });
    const { result } = renderHook(() => useExternalMcp());

    await act(async () => {
      await result.current.dependencies.port.addSource({
        fields: {
          id: "hosted",
          transport: "streamable_http",
          url: "https://mcp.example.com",
          authMode: "oauth",
          oauthProviderId: "example-oidc",
          oauthGrant: "authorization_code",
          oauthClientId: "abc",
          oauthClientSecret: "shh",
          oauthScopes: "read write",
        },
      });
    });

    expect(saveExternalMcpServer).toHaveBeenCalledWith("hosted", {
      transport: "streamable_http",
      enabled: true,
      command: "",
      url: "https://mcp.example.com",
      args: "",
      allowedToolNames: "",
      authMode: "oauth",
      oauth: {
        providerId: "example-oidc",
        grant: "authorization_code",
        clientId: "abc",
        scopes: "read write",
        tokenEnvName: "",
        authorizationEndpoint: "",
        tokenEndpoint: "",
        deviceAuthorizationEndpoint: "",
        clientSecret: "shh",
      },
    });
  });

  it("omits oauth.clientSecret when left blank, so an edit never silently clears a stored secret", async () => {
    saveExternalMcpServer.mockResolvedValue({ server: server({ serverId: "hosted" }), restartRequired: true });
    const { result } = renderHook(() => useExternalMcp());

    await act(async () => {
      await result.current.dependencies.port.addSource({
        fields: {
          id: "hosted",
          transport: "streamable_http",
          url: "https://mcp.example.com",
          authMode: "oauth",
          oauthProviderId: "example-oidc",
          oauthGrant: "authorization_code",
          oauthClientId: "abc",
        },
      });
    });

    const [, body] = saveExternalMcpServer.mock.calls[0]!;
    expect(body.oauth).not.toHaveProperty("clientSecret");
  });
});
