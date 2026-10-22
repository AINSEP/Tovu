import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminExternalMcpServer } from "@/lib/api";
import type { ExternalMcpPort } from "../use-external-mcp.hooks";
import { describeStoredCredentials, toAccessTokenWriteBody, useExternalMcp as useExternalMcpHook } from "../use-external-mcp.hooks";

/**
 * @file Coverage for `useExternalMcp` (0/9 funcs) — the real `/mcp-servers` transport behind
 * Settings → External MCP. Historical seam rationale: no injected port here (unlike its `settings/hooks` siblings): the hook
 * calls `api.*` directly, so this file mocks `lib/api` the same way `access-tokens-dependencies
 * .unit.test.ts` does for a live-binding surface.
 * The hook now accepts the same API contract as an injected port; these are DI fakes instead.
 */

const port = {
  listExternalMcpServers: vi.fn(),
  saveExternalMcpServer: vi.fn(),
  deleteExternalMcpServer: vi.fn(),
  probeExternalMcpServer: vi.fn(),
};
const { listExternalMcpServers, saveExternalMcpServer, deleteExternalMcpServer, probeExternalMcpServer } = port;

// Controls the locale `useExternalMcpDriftCopy` resolves inside the hook under test, the same seam
// `Placeholder.unit.test.tsx`/`AssistantDock.hooks.unit.test.tsx` use for their own locale hook —
// here it is the DEFAULT-port `useAdminLocale` rather than `useWiredAdminLocale`, since that is the
// one `ExternalMcpSettingsPanel.hooks.tsx`'s `useExternalMcpDriftCopy` actually calls.
// The original locale seam above is now supplied directly instead of replacing a module.
const useAdminLocale = vi.fn(() => "en");
function useExternalMcp() {
  return useExternalMcpHook({ port, useAdminLocaleHook: useAdminLocale });
}

beforeEach(() => {
  listExternalMcpServers.mockReset();
  saveExternalMcpServer.mockReset();
  deleteExternalMcpServer.mockReset();
  probeExternalMcpServer.mockReset();
  useAdminLocale.mockReturnValue("en");
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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
    hasAccessToken: false,
    accessTokenEnvName: null,
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

describe("stored credential summaries", () => {
  it("uses the default locale and reports no summary when nothing is stored", () => {
    expect(describeStoredCredentials({ server: server() })).toBeUndefined();
  });

  it("uses server-derived hints instead of the legacy variable-name fallback", () => {
    expect(describeStoredCredentials({ server: server({
      envNames: ["API_KEY"], envTokenHints: { API_KEY: { length: 16, last4: "abcd" } },
      hasAccessToken: true, accessTokenHint: { length: 20, last4: "wxyz" },
    }) }, { locale: "en" })).toBe("API_KEY: …abcd, 16 chars · Access token set (…wxyz, 20 chars)");
  });

  it("omits an absent static token and variable name from a write", () => {
    expect(toAccessTokenWriteBody({ authMode: "static_env" })).toEqual({});
  });
});

describe("useExternalMcp — saved-server verification", () => {
  it("keeps a successful remote save when its post-save probe fails", async () => {
    saveExternalMcpServer.mockResolvedValue({ server: server({ serverId: "remote", transport: "streamable_http", url: "https://mcp.example.com", hasAccessToken: true }) });
    probeExternalMcpServer.mockRejectedValue(new Error("The server rejected this token."));
    const { result } = renderHook(() => useExternalMcp());
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.dependencies.port.addSource({ fields: {
        id: "remote", transport: "streamable_http", url: "https://mcp.example.com", authMode: "static_env", accessToken: "test-token",
      } });
    });
    expect(outcome).toMatchObject({ ok: true, source: { statusMessage: "Access token set · The server rejected this token." } });
    expect(probeExternalMcpServer).toHaveBeenCalledExactlyOnceWith("remote");
    expect(result.current.restartRequired).toBe(true);
    // The verified row is also the merge base for later edits, including failed ones.
    saveExternalMcpServer.mockRejectedValue(new Error("write failed"));
    await expect(result.current.dependencies.port.updateSource!("remote", { enabled: false })).resolves.toMatchObject({
      id: "remote", statusMessage: "write failed", enabled: true,
    });
  });

  it("translates an opaque post-save probe failure without reporting a failed save", async () => {
    useAdminLocale.mockReturnValue("es");
    saveExternalMcpServer.mockResolvedValue({ server: server({ serverId: "remote", transport: "streamable_http", url: "https://mcp.example.com", authMode: "none" }) });
    probeExternalMcpServer.mockRejectedValue({});
    const { result } = renderHook(() => useExternalMcp());
    await act(async () => {
      await expect(result.current.dependencies.port.addSource({ fields: { id: "remote", transport: "streamable_http", url: "https://mcp.example.com", authMode: "none" } })).resolves.toMatchObject({
        ok: true, source: { statusMessage: "No se pudo contactar con el servidor." },
      });
    });
    expect(result.current.restartRequired).toBe(true);
  });

  it("reports a connected remote server after a successful post-save probe", async () => {
    saveExternalMcpServer.mockResolvedValue({ server: server({ serverId: "remote", transport: "streamable_http", url: "https://mcp.example.com", authMode: "none" }) });
    probeExternalMcpServer.mockResolvedValue({ tools: [], probedAt: "2026-10-16T00:00:00Z" });
    const { result } = renderHook(() => useExternalMcp());
    await act(async () => {
      await expect(result.current.dependencies.port.addSource({ fields: { id: "remote", transport: "streamable_http", url: "https://mcp.example.com", authMode: "none" } })).resolves.toMatchObject({
        ok: true, source: { statusMessage: "Connected." },
      });
    });
    expect(probeExternalMcpServer).toHaveBeenCalledExactlyOnceWith("remote");
  });

  it("leaves a disabled remote server saved but untested after replacing its token", async () => {
    listExternalMcpServers.mockResolvedValue({ servers: [server({ transport: "streamable_http", enabled: false })] });
    saveExternalMcpServer.mockResolvedValue({ server: server({ transport: "streamable_http", enabled: false, hasAccessToken: true }) });
    const { result } = renderHook(() => useExternalMcp());
    await result.current.dependencies.port.fetchSources();
    await act(async () => {
      await expect(result.current.dependencies.port.updateSource!("local-fs", { fields: { accessToken: "new-token" } })).resolves.toMatchObject({
        enabled: false, statusMessage: "Access token set · Saved, not tested.",
      });
    });
    expect(saveExternalMcpServer.mock.calls[0]![1]).toMatchObject({ enabled: false, accessToken: "new-token" });
    expect(probeExternalMcpServer).not.toHaveBeenCalled();
  });

  it("returns null when an update fails before any row has been fetched", async () => {
    saveExternalMcpServer.mockRejectedValue(new Error("not found"));
    const { result } = renderHook(() => useExternalMcp());
    await expect(result.current.dependencies.port.updateSource!("unknown", { enabled: false })).resolves.toBeNull();
    expect(result.current.restartRequired).toBe(false);
  });

  it("writes defaults for an uncached row without probing an unchanged token", async () => {
    saveExternalMcpServer.mockResolvedValue({ server: server({ serverId: "uncached", command: "", args: [], allowedToolNames: [] }) });
    const { result } = renderHook(() => useExternalMcp());
    await act(async () => {
      await expect(result.current.dependencies.port.updateSource!("uncached", { enabled: true })).resolves.toMatchObject({ id: "uncached", enabled: true });
    });
    expect(saveExternalMcpServer).toHaveBeenCalledExactlyOnceWith("uncached", {
      transport: "stdio", enabled: true, command: "", url: "", args: "", allowedToolNames: "", writeAllowedToolNames: "", authMode: "static_env",
    });
    expect(probeExternalMcpServer).not.toHaveBeenCalled();
    expect(result.current.restartRequired).toBe(true);
  });

  it("defaults to the real API and locale hook when called without dependencies", async () => {
    const base = "/api/admin/v1/workspaces/workspace-local";
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      expect(init?.method ?? "GET").toBe("GET");
      requests.push(url);
      if (url === `${base}/settings/effective?namespace=core.language`) return Response.json({ data: [{ key: "locale", value: "es", sourceLayer: "user", defVersion: 1 }] });
      if (url === `${base}/mcp-servers`) return Response.json({ servers: [server({ hasAccessToken: true })] });
      throw new Error(`Unexpected default MCP request: ${url}`);
    });
    const { result } = renderHook(() => useExternalMcpHook());
    const initialDependencies = result.current.dependencies;
    // The locale read changes the bound translator and its memoized port together.
    await waitFor(() => expect(result.current.dependencies).not.toBe(initialDependencies));
    const [item] = await result.current.dependencies.port.fetchSources();
    expect(item!.statusMessage).toBe("Token de acceso guardado");
    expect(requests).toEqual([`${base}/settings/effective?namespace=core.language`, `${base}/mcp-servers`]);
  });

  it("maps built-in flags and populated OAuth identity without disclosing secrets", async () => {
    listExternalMcpServers.mockResolvedValue({ servers: [server({ builtIn: true, url: "https://mcp.example.com", oauth: {
      providerId: "example", grant: "authorization_code", clientId: "client", scopes: ["read", "write"],
      status: "connected", expiresAt: null, tokenEnvName: "OAUTH_TOKEN", hasStoredToken: true,
    } })] });
    const { result } = renderHook(() => useExternalMcp());
    const [item] = await result.current.dependencies.port.fetchSources();
    expect(item!.fields).toMatchObject({ builtIn: "true", url: "https://mcp.example.com", oauthProviderId: "example",
      oauthGrant: "authorization_code", oauthClientId: "client", oauthScopes: "read write", oauthTokenEnvName: "OAUTH_TOKEN", oauthClientSecret: "", accessToken: "" });
  });
});

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
          builtIn: "false",
          id: "local-fs",
          transport: "stdio",
          command: "npx",
          url: "",
          args: "-y server-fs",
          allowedToolNames: "read_file",
          writeAllowedToolNames: "",
          authMode: "static_env",
          env: "",
          accessToken: "",
          accessTokenEnvName: "",
          ...BLANK_OAUTH_FIELDS,
        },
        statusMessage: "Credentials set: GITHUB_TOKEN",
      },
    ]);
  });

  it("double-quotes an arg containing a space so a re-save splits it back into ONE arg", async () => {
    // The desktop shell's win32 row: a username with a space in it. `parseArgs` on the server reads
    // `"..."` as one argument; a bare join would re-save it as two broken ones.
    listExternalMcpServers.mockResolvedValue({
      servers: [server({ args: ["C:\\Users\\John Smith\\bridge.ts", "--user-data-dir", "C:\\Users\\John Smith\\ud"] })],
    });
    const { result } = renderHook(() => useExternalMcp());

    const items = await result.current.dependencies.port.fetchSources();

    expect(items[0]!.fields.args).toBe('"C:\\Users\\John Smith\\bridge.ts" --user-data-dir "C:\\Users\\John Smith\\ud"');
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

  it("never echoes a stored access token: the field arrives blank, its variable name round-trips, and the status says one is set", async () => {
    listExternalMcpServers.mockResolvedValue({
      servers: [server({ envNames: ["BASE_URL"], hasAccessToken: true, accessTokenEnvName: "API_KEY" })],
    });
    const { result } = renderHook(() => useExternalMcp());

    const items = await result.current.dependencies.port.fetchSources();

    expect(items[0]!.fields.accessToken).toBe("");
    expect(items[0]!.fields.accessTokenEnvName).toBe("API_KEY");
    expect(items[0]!.statusMessage).toBe("Credentials set: BASE_URL · Access token set");
  });
});

describe("useExternalMcp — the static_env access token in a save", () => {
  async function addWith(fields: Record<string, string>) {
    saveExternalMcpServer.mockResolvedValue({ server: server(), restartRequired: true });
    const { result } = renderHook(() => useExternalMcp());
    await act(async () => {
      await result.current.dependencies.port.addSource({ fields: { id: "local-fs", command: "npx", ...fields } });
    });
    return saveExternalMcpServer.mock.calls[0]![1] as Record<string, unknown>;
  }

  it("sends a typed token and its variable name for static_env", async () => {
    const body = await addWith({ authMode: "static_env", accessToken: "tok-1", accessTokenEnvName: "API_KEY" });
    expect(body).toMatchObject({ accessToken: "tok-1", accessTokenEnvName: "API_KEY" });
  });

  it("omits a blank token, so saving without retyping it keeps the sealed one", async () => {
    const body = await addWith({ authMode: "static_env", accessToken: "", accessTokenEnvName: "API_KEY" });
    expect(body).not.toHaveProperty("accessToken");
  });

  it("sends neither token field for any other auth mode", async () => {
    const body = await addWith({ authMode: "none", accessToken: "tok-1", accessTokenEnvName: "API_KEY" });
    expect(body).not.toHaveProperty("accessToken");
    expect(body).not.toHaveProperty("accessTokenEnvName");
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

  // c7-rev-settings-deploy 2026-09-24: the write is a create-OR-replace PUT, so "Add" with an id
  // that is already configured silently replaced that server's command, tool allowlists and auth.
  it("rejects an id that is already configured, without calling the API", async () => {
    listExternalMcpServers.mockResolvedValue({ servers: [server()] });
    const { result } = renderHook(() => useExternalMcp());
    await result.current.dependencies.port.fetchSources();

    const outcome = await result.current.dependencies.port.addSource({
      fields: { id: " local-fs ", command: "other", args: "", allowedToolNames: "", env: "" },
    });

    expect(outcome).toEqual({ ok: false, message: "A server with this ID already exists. Edit that server instead." });
    expect(saveExternalMcpServer).not.toHaveBeenCalled();
  });

  it("translates the add-form rejections for the admin locale", async () => {
    useAdminLocale.mockReturnValue("es");
    listExternalMcpServers.mockResolvedValue({ servers: [server()] });
    const { result } = renderHook(() => useExternalMcp());
    await result.current.dependencies.port.fetchSources();

    await expect(result.current.dependencies.port.addSource({ fields: { id: "" } })).resolves.toEqual({ ok: false, message: "Se requiere un ID." });
    await expect(result.current.dependencies.port.addSource({ fields: { id: "local-fs" } })).resolves.toEqual({
      ok: false,
      message: "Ya existe un servidor con este ID. Edita ese servidor.",
    });
  });

  it("rejects the same way when the id key is missing from fields entirely (the ?? \"\" fallback)", async () => {
    const { result } = renderHook(() => useExternalMcp());

    const outcome = await result.current.dependencies.port.addSource({ fields: {} });

    expect(outcome).toEqual({ ok: false, message: "An ID is required." });
  });

  it("defaults absent non-secret fields to \"\" and omits untouched env", async () => {
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

  it.each([undefined, "", "   "])("rejects a remote static_env create with an absent or blank token (%j) before saving", async (accessToken) => {
    const { result } = renderHook(() => useExternalMcp());
    const outcome = await result.current.dependencies.port.addSource({
      fields: { id: "remote", transport: "streamable_http", authMode: "static_env", url: "https://example.test/mcp",
        ...(accessToken === undefined ? {} : { accessToken }) },
    });
    expect(outcome).toEqual({ ok: false, message: "Enter a token. Spaces alone are not a token." });
    expect(saveExternalMcpServer).not.toHaveBeenCalled();
    expect(probeExternalMcpServer).not.toHaveBeenCalled();
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

  it("a rejected update preserves the prior row with the failure message without throwing", async () => {
    listExternalMcpServers.mockResolvedValue({ servers: [server()] });
    saveExternalMcpServer.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useExternalMcp());
    const [previous] = await result.current.dependencies.port.fetchSources();

    const outcome = await result.current.dependencies.port.updateSource!("local-fs", { enabled: false });

    expect(outcome).toEqual({ ...previous, statusMessage: "network down" });
    expect(saveExternalMcpServer).toHaveBeenCalledTimes(1);
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

  it("an update for a DIFFERENT id is not held behind a still-pending update for another id", async () => {
    // Different ids are independent rows with no shared merge base, so each gets its own lane — a
    // slow save of one server must not delay a save of another.
    listExternalMcpServers.mockResolvedValue({
      servers: [server({ serverId: "alpha" }), server({ serverId: "beta" })],
    });
    let releaseAlpha!: () => void;
    saveExternalMcpServer.mockImplementation((id: string) => {
      if (id === "alpha") {
        return new Promise((resolve) => {
          releaseAlpha = () => resolve({ server: server({ serverId: "alpha", enabled: false }), restartRequired: true });
        });
      }
      return Promise.resolve({ server: server({ serverId: id, enabled: false }), restartRequired: true });
    });
    const { result } = renderHook(() => useExternalMcp());
    await result.current.dependencies.port.fetchSources();

    let alpha!: Promise<unknown>;
    let beta!: Promise<unknown>;
    act(() => {
      alpha = result.current.dependencies.port.updateSource!("alpha", { enabled: false });
      beta = result.current.dependencies.port.updateSource!("beta", { enabled: false });
    });

    // beta reaches the server, and settles, while alpha's save is still parked.
    await waitFor(() => expect(saveExternalMcpServer.mock.calls.map(([id]) => id)).toEqual(["alpha", "beta"]));
    await act(async () => {
      await expect(beta).resolves.toMatchObject({ id: "beta", enabled: false });
    });

    await act(async () => {
      releaseAlpha();
      await expect(alpha).resolves.toMatchObject({ id: "alpha", enabled: false });
    });
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
      expect(await result.current.dependencies.port.addSource({
        fields: { id: "hosted", transport: "streamable_http", url: "https://mcp.example.com/mcp", authMode: "oauth", oauthGrant: "authorization_code" },
      })).toMatchObject({ ok: true });
    });

    expect(saveExternalMcpServer).toHaveBeenCalledExactlyOnceWith("hosted", {
      transport: "streamable_http", enabled: true, command: "", url: "https://mcp.example.com/mcp",
      args: "", allowedToolNames: "", writeAllowedToolNames: "", authMode: "oauth",
      oauth: { grant: "authorization_code", clientId: "", scopes: "", tokenEnvName: "" },
    });
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

  it("falls back to the shared credential unreachable-server copy when the rejection carries no message", async () => {
    // Mirrors `describeApiError`'s own "no message on the error" branch — matches
    // `external-mcp-i18n.ts`'s established "Could not reach this server..." copy so the same
    // failure reads identically whether the operator hits it from the Test button or the picker.
    // C3 supersedes that copy with the shared credential verdict used for post-save probes too.
    probeExternalMcpServer.mockRejectedValue({});
    const { result } = renderHook(() => useExternalMcp());

    const outcome = await result.current.dependencies.port.testSource!("local-fs");

    expect(outcome).toEqual({ ok: false, message: "Could not reach the server." });
  });

  // Bug: this fallback is the exact same copy `external-mcp-i18n.ts` ships full translations for
  // (the comment on the test above says as much), but this call site built it with the raw English
  // literal instead of `t()` — a non-English operator saw English here even though the picker's own
  // "Could not reach this server" copy is fully translated.
  // Keep the original locale-regression rationale above; the shared verdict must also translate.
  it("translates the shared unreachable-server fallback for a non-English locale", async () => {
    useAdminLocale.mockReturnValue("es");
    probeExternalMcpServer.mockRejectedValue({});
    const { result } = renderHook(() => useExternalMcp());

    const outcome = await result.current.dependencies.port.testSource!("local-fs");

    expect(outcome).toEqual({
      ok: false,
      message: "No se pudo contactar con el servidor.",
    });
  });
});


describe("useExternalMcp — hosted token validation characterization (L294)", () => {
  function setup({ locale = "en" }: { locale?: string }, _options = {}) {
    const typedPort = {
      listExternalMcpServers: vi.fn<ExternalMcpPort["listExternalMcpServers"]>(),
      saveExternalMcpServer: vi.fn<ExternalMcpPort["saveExternalMcpServer"]>()
        .mockResolvedValue({ server: server(), restartRequired: true }),
      deleteExternalMcpServer: vi.fn<ExternalMcpPort["deleteExternalMcpServer"]>(),
      probeExternalMcpServer: vi.fn<ExternalMcpPort["probeExternalMcpServer"]>(),
    };
    const hook = renderHook(() => useExternalMcpHook({ port: typedPort, useAdminLocaleHook: () => locale }));
    return { ...hook, typedPort };
  }

  it.each<{ fields: Record<string, string>; message: string }>([
    { fields: {}, message: "Enter a token. Spaces alone are not a token." },
    { fields: { accessToken: "" }, message: "Enter a token. Spaces alone are not a token." },
    { fields: { accessToken: "   " }, message: "Enter a token. Spaces alone are not a token." },
    { fields: { accessToken: "x".repeat(8193) }, message: "The token exceeds the 8192-character limit. Copy only the token." },
    { fields: { accessToken: "café" }, message: "Hosted tokens must use visible ASCII characters (0x21–0x7E)." },
    { fields: { accessToken: "two words" }, message: "Hosted tokens must use visible ASCII characters (0x21–0x7E)." },
    { fields: { accessToken: "two\nlines" }, message: "Hosted tokens must use visible ASCII characters (0x21–0x7E)." },
  ])("rejects invalid hosted credentials before any write: $message", async ({ fields, message }) => {
    const { result, typedPort } = setup({});
    await expect(result.current.dependencies.port.addSource({ fields: {
      id: "remote", transport: "streamable_http", authMode: "static_env", ...fields,
    } })).resolves.toEqual({ ok: false, message });
    expect(typedPort.saveExternalMcpServer).not.toHaveBeenCalled();
    expect(typedPort.probeExternalMcpServer).not.toHaveBeenCalled();
    expect(result.current.restartRequired).toBe(false);
  });

  it("translates hosted credential rejection before saving", async () => {
    const { result, typedPort } = setup({ locale: "es" });
    await expect(result.current.dependencies.port.addSource({ fields: {
      id: "remote", transport: "streamable_http", authMode: "static_env", accessToken: "",
    } })).resolves.toEqual({ ok: false, message: "Introduce un token. Los espacios solos no son un token." });
    expect(typedPort.saveExternalMcpServer).not.toHaveBeenCalled();
  });

  it.each(["  opaque-token  ", "x".repeat(8192)])("preserves valid token bytes for a default static_env hosted draft (case %#)", async (accessToken) => {
    const { result, typedPort } = setup({});
    await act(async () => {
      await expect(result.current.dependencies.port.addSource({ fields: {
        id: "remote", transport: "streamable_http", accessToken,
      } })).resolves.toMatchObject({ ok: true });
    });
    expect(typedPort.saveExternalMcpServer).toHaveBeenCalledWith("remote", expect.objectContaining({
      authMode: "static_env", accessToken,
    }));
  });

  it.each([
    { transport: "stdio", authMode: "static_env" },
    { transport: "", authMode: "static_env" },
    { transport: "streamable_http", authMode: "none" },
    { transport: "streamable_http", authMode: "oauth" },
  ])("skips hosted token validation for $transport / $authMode", async (fields) => {
    const { result, typedPort } = setup({});
    await act(async () => {
      await expect(result.current.dependencies.port.addSource({ fields: {
        id: "local-fs", ...fields,
      } })).resolves.toMatchObject({ ok: true });
    });
    expect(typedPort.saveExternalMcpServer).toHaveBeenCalledOnce();
  });

  it("propagates unexpected credential access failures without saving", async () => {
    const { result, typedPort } = setup({});
    const failure = new Error("credential access failed");
    await expect(result.current.dependencies.port.addSource({ fields: {
      id: "remote", transport: "streamable_http", authMode: "static_env",
      get accessToken(): string { throw failure; },
    } })).rejects.toBe(failure);
    expect(typedPort.saveExternalMcpServer).not.toHaveBeenCalled();
  });
});
