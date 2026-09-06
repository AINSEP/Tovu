import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminExternalMcpServer } from "@/lib/api";

/**
 * @file Coverage for `useExternalMcp` (0/9 funcs) — the real `/mcp-servers` transport behind
 * Settings → External MCP. No injected port here (unlike its `settings/hooks` siblings): the hook
 * calls `api.*` directly, so this file mocks `lib/api` the same way `access-tokens-dependencies
 * .unit.test.ts` does for a live-binding surface.
 */

const { listExternalMcpServers, saveExternalMcpServer, deleteExternalMcpServer, probeExternalMcpServer } = vi.hoisted(() => ({
  listExternalMcpServers: vi.fn(),
  saveExternalMcpServer: vi.fn(),
  deleteExternalMcpServer: vi.fn(),
  probeExternalMcpServer: vi.fn(),
}));

vi.mock("../../../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, listExternalMcpServers, saveExternalMcpServer, deleteExternalMcpServer, probeExternalMcpServer },
  };
});

const { useExternalMcp } = await import("../use-external-mcp.hooks");

beforeEach(() => {
  listExternalMcpServers.mockReset();
  saveExternalMcpServer.mockReset();
  deleteExternalMcpServer.mockReset();
  probeExternalMcpServer.mockReset();
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
          writeAllowedToolNames: "",
          authMode: "static_env",
          env: "",
          ...BLANK_OAUTH_FIELDS,
        },
        statusMessage: "Credentials set: GITHUB_TOKEN",
      },
    ]);
  });

  it("joins writeAllowedToolNames the same way as allowedToolNames, comma-separated", async () => {
    listExternalMcpServers.mockResolvedValue({
      servers: [server({ allowedToolNames: ["read_file", "generate_image"], writeAllowedToolNames: ["generate_image"] })],
    });
    const { result } = renderHook(() => useExternalMcp());

    const items = await result.current.dependencies.port.fetchSources();

    expect(items[0]!.fields.writeAllowedToolNames).toBe("generate_image");
    expect(items[0]!.fields.allowedToolNames).toBe("read_file, generate_image");
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
      writeAllowedToolNames: "",
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
      writeAllowedToolNames: "",
      authMode: "static_env",
      env: "FOO=bar",
    });
    expect(outcome).toEqual({ ok: true, source: expect.objectContaining({ id: "new-server" }) });
    await waitFor(() => expect(result.current.restartRequired).toBe(true));
  });

  it("sends a non-blank writeAllowedToolNames through unchanged, same as allowedToolNames", async () => {
    saveExternalMcpServer.mockResolvedValue({ server: server({ serverId: "new-server" }), restartRequired: true });
    const { result } = renderHook(() => useExternalMcp());

    await act(async () => {
      await result.current.dependencies.port.addSource({
        fields: { id: "new-server", command: "npx", args: "", allowedToolNames: "generate_image", writeAllowedToolNames: "generate_image" },
      });
    });

    const [, body] = saveExternalMcpServer.mock.calls[0]!;
    expect(body.writeAllowedToolNames).toBe("generate_image");
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
      writeAllowedToolNames: "",
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

  it("two concurrent updateSource calls for the SAME id must not let the later write revert the earlier one's change (stale merge-base race)", async () => {
    // `existing`'s row starts enabled, with a known command — the merge base both concurrent
    // calls below read from before either one's own write has landed.
    listExternalMcpServers.mockResolvedValue({
      servers: [server({ serverId: "existing", command: "npx", enabled: true })],
    });
    // Echoes back whatever body was actually sent, so each call's own `lastKnown` update reflects
    // that specific write — the same shape a real PUT-then-reread round trip has.
    saveExternalMcpServer.mockImplementation((id: string, body: Record<string, unknown>) =>
      Promise.resolve({
        server: server({ serverId: id, command: body.command as string, enabled: body.enabled as boolean }),
        restartRequired: true,
      }),
    );
    const { result } = renderHook(() => useExternalMcp());
    await result.current.dependencies.port.fetchSources(); // populates lastKnown

    // Neither call is awaited before the other starts — reproduces two edits to the SAME server
    // firing close together (e.g. toggling "enabled" while a field edit is also mid-flight).
    // Call A only ever touches `enabled`; call B only ever touches `command`. Whichever order the
    // two writes land in, the SECOND one must merge against the FIRST one's already-committed
    // result, not a snapshot from before either write landed — otherwise the second write's own
    // patch silently reverts the field neither of its own edits ever named.
    await act(async () => {
      await Promise.all([
        result.current.dependencies.port.updateSource!("existing", { enabled: false }),
        result.current.dependencies.port.updateSource!("existing", { fields: { command: "newcmd" } }),
      ]);
    });

    const [, secondBody] = saveExternalMcpServer.mock.calls[1]!;
    expect(secondBody.enabled).toBe(false);
    expect(secondBody.command).toBe("newcmd");
  });
});

describe("useExternalMcp — addSource rejects a malformed OAuth identity before calling the API", () => {
  it("rejects a STDIO oauth draft with neither a provider id nor a token endpoint", async () => {
    const { result } = renderHook(() => useExternalMcp());

    const outcome = await result.current.dependencies.port.addSource({
      fields: { id: "local", transport: "stdio", command: "npx", authMode: "oauth", oauthClientId: "abc" },
    });

    expect(outcome).toEqual({ ok: false, message: "Enter a Provider ID, or fill in this connection's own Token endpoint." });
    expect(saveExternalMcpServer).not.toHaveBeenCalled();
  });

  it("accepts a REMOTE oauth draft with no identity at all — the server discovers and registers", async () => {
    // Was previously rejected here for every transport. A hosted MCP server that publishes RFC 9728
    // metadata and an RFC 7591 registration endpoint has no client id a human could type, so
    // blocking this draft made those servers unattachable from the admin tab.
    saveExternalMcpServer.mockResolvedValue({ server: server({ serverId: "hosted" }), restartRequired: true });
    const { result } = renderHook(() => useExternalMcp());

    await act(async () => {
      await result.current.dependencies.port.addSource({
        fields: { id: "hosted", transport: "streamable_http", url: "https://mcp.example.com/mcp", authMode: "oauth", oauthGrant: "authorization_code" },
      });
    });

    expect(saveExternalMcpServer).toHaveBeenCalled();
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
      writeAllowedToolNames: "",
      authMode: "oauth",
      oauth: {
        providerId: "example-oidc",
        grant: "authorization_code",
        clientId: "abc",
        scopes: "read write",
        tokenEnvName: "",
        // No endpoints were typed, so all three are omitted rather than sent blank — see the test
        // below for why that omission is load-bearing.
        clientSecret: "shh",
      },
    });
  });

  it("omits providerId and the three OAuth endpoints when blank, so an untouched save can't look like an identity change (C-011)", async () => {
    // The store reads PRESENCE of `providerId`/`tokenEndpoint`, not their value, to decide whether a
    // save touched the connection's OAuth identity. `toItem` cannot round-trip a connection's own
    // endpoints yet, so if this hook sent them as an always-present blank string, every save —
    // including one that only flips `enabled` — would rebuild `oauthEndpointsJson` from nothing and
    // destroy the stored token. Mirrors the store-side regression in `external-mcp-store.test.ts`.
    saveExternalMcpServer.mockResolvedValue({ server: server({ serverId: "hosted" }), restartRequired: true });
    const { result } = renderHook(() => useExternalMcp());

    await act(async () => {
      await result.current.dependencies.port.addSource({
        fields: {
          id: "hosted",
          transport: "streamable_http",
          url: "https://mcp.example.com",
          authMode: "oauth",
          oauthGrant: "authorization_code",
          oauthClientId: "abc",
          // oauthProviderId/oauthAuthorizationEndpoint/oauthTokenEndpoint/oauthDeviceAuthorizationEndpoint
          // are absent — the same shape `toItem` produces for a connection with no registered provider.
        },
      });
    });

    const [, body] = saveExternalMcpServer.mock.calls[0]!;
    expect(body.oauth).not.toHaveProperty("providerId");
    expect(body.oauth).not.toHaveProperty("authorizationEndpoint");
    expect(body.oauth).not.toHaveProperty("tokenEndpoint");
    expect(body.oauth).not.toHaveProperty("deviceAuthorizationEndpoint");
  });

  it("includes providerId and an endpoint when the operator actually typed one", async () => {
    saveExternalMcpServer.mockResolvedValue({ server: server({ serverId: "hosted" }), restartRequired: true });
    const { result } = renderHook(() => useExternalMcp());

    await act(async () => {
      await result.current.dependencies.port.addSource({
        fields: {
          id: "hosted",
          transport: "streamable_http",
          url: "https://mcp.example.com",
          authMode: "oauth",
          oauthGrant: "authorization_code",
          oauthClientId: "abc",
          oauthProviderId: "example-oidc",
          oauthTokenEndpoint: "https://auth.example.com/token",
        },
      });
    });

    const [, body] = saveExternalMcpServer.mock.calls[0]!;
    expect(body.oauth).toMatchObject({ providerId: "example-oidc", tokenEndpoint: "https://auth.example.com/token" });
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

describe("useExternalMcp — testSource (D-5: wired to the probe route)", () => {
  it("does not call the probe and fails with a save-first message when id is undefined (the add-form's unsaved draft)", async () => {
    const { result } = renderHook(() => useExternalMcp());

    const outcome = await result.current.dependencies.port.testSource!(undefined);

    expect(outcome).toEqual({ ok: false, message: "Save this server before you can test it." });
    expect(probeExternalMcpServer).not.toHaveBeenCalled();
  });

  it("calls api.probeExternalMcpServer(id) and reports the advertised tool count on success", async () => {
    probeExternalMcpServer.mockResolvedValue({
      tools: [{ remoteName: "read_file" }, { remoteName: "generate_image" }],
      probedAt: "2026-08-26T00:00:00.000Z",
    });
    const { result } = renderHook(() => useExternalMcp());

    const outcome = await result.current.dependencies.port.testSource!("local-fs");

    expect(probeExternalMcpServer).toHaveBeenCalledWith("local-fs");
    expect(outcome.ok).toBe(true);
    expect(outcome.message).toBe("2 tools advertised.");
    expect(typeof outcome.latencyMs).toBe("number");
  });

  it("uses the singular 'tool' for exactly one advertised tool", async () => {
    probeExternalMcpServer.mockResolvedValue({ tools: [{ remoteName: "read_file" }], probedAt: "2026-08-26T00:00:00.000Z" });
    const { result } = renderHook(() => useExternalMcp());

    const outcome = await result.current.dependencies.port.testSource!("local-fs");

    expect(outcome.message).toBe("1 tool advertised.");
  });

  it("reports zero tools rather than treating an empty surface as a failure", async () => {
    probeExternalMcpServer.mockResolvedValue({ tools: [], probedAt: "2026-08-26T00:00:00.000Z" });
    const { result } = renderHook(() => useExternalMcp());

    const outcome = await result.current.dependencies.port.testSource!("local-fs");

    expect(outcome).toMatchObject({ ok: true, message: "0 tools advertised." });
  });

  it("surfaces describeApiError's message on a rejected probe (e.g. an unreachable server)", async () => {
    probeExternalMcpServer.mockRejectedValue(new Error("could not connect: ECONNREFUSED"));
    const { result } = renderHook(() => useExternalMcp());

    const outcome = await result.current.dependencies.port.testSource!("local-fs");

    expect(outcome).toEqual({ ok: false, message: "could not connect: ECONNREFUSED" });
  });

  it("falls back to the picker's own unreachable-server copy when the rejection carries no message", async () => {
    // Mirrors `describeApiError`'s own "no message on the error" branch — matches
    // `external-mcp-i18n.ts`'s established "Could not reach this server..." copy so the same
    // failure reads identically whether the operator hits it from the Test button or the picker.
    probeExternalMcpServer.mockRejectedValue({});
    const { result } = renderHook(() => useExternalMcp());

    const outcome = await result.current.dependencies.port.testSource!("local-fs");

    expect(outcome).toEqual({ ok: false, message: "Could not reach this server. You can still type tool names by hand." });
  });
});
