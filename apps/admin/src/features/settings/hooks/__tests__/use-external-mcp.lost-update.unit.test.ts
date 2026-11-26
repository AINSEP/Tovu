import { credentialText, formatCredentialHint, formatCredentialHints, translateCredentialMessage } from "@tovu/contracts/credential-copy";
import { credentialDraftError } from "@/lib/credential-copy";
import { describeApiError } from "@/lib/admin-http/request";
import { isVersionConflict } from "@/lib/shell-collaborators";
import { useSerialWrites } from "@jini-ai/ui/panel-kit";
import { t as tExternalMcp } from "@jini-ai/admin/screens/settings/external-mcp-i18n";
import { mergeSourceUpdate, resolveExternalMcpEffectiveAuthMode, resolveExternalMcpEffectiveTransport, validateExternalMcpOAuthIdentity } from "@jini-ai/admin/screens/settings/rules";
import { renderHook } from "@/__tests__/fetch-query-render";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminExternalMcpServer } from "@jini-ai/core/contracts/site/cms-external-mcp";
import { ApiError } from "@/lib/admin-http/request";
import { VERSION_CONFLICT_MESSAGE } from "@jini-ai/admin/shell/lib/version-conflict";
import { useExternalMcp as useExternalMcpHook } from "@jini-ai/mcp/react/external-mcp/hooks/use-external-mcp.hooks";

/**
 * @file Lost updates on the External MCP tab (design S1): every save of a server sends the `version`
 * that tab last loaded or saved as `expectedVersion`, and a refused save says so in plain words
 * instead of the generic failure.
 */

const port = { listExternalMcpServers: vi.fn(), saveExternalMcpServer: vi.fn(), deleteExternalMcpServer: vi.fn(), probeExternalMcpServer: vi.fn() };
const deps = { port, credentialText, formatCredentialHint, formatCredentialHints, translateCredentialMessage,
  credentialDraftError, describeApiError, VERSION_CONFLICT_MESSAGE, isVersionConflict, translate: tExternalMcp,
  mergeSourceUpdate, resolveExternalMcpEffectiveAuthMode, resolveExternalMcpEffectiveTransport,
  validateExternalMcpOAuthIdentity, now: Date.now };

const useExternalMcp = () => useExternalMcpHook({ deps, hooks: { useAdminLocaleHook: () => "en", useSerialWrites } });

function server(overrides: Partial<AdminExternalMcpServer> = {}): AdminExternalMcpServer {
  return { serverId: "linear", label: "Linear", transport: "streamable_http", authMode: "none", enabled: true, command: "", url: "https://mcp.example/mcp", args: [],
    allowedToolNames: ["read"], writeAllowedToolNames: [], writeGrantsUpdatedByPrincipalId: null, writeGrantsUpdatedAt: null, envNames: [],
    oauth: { providerId: null, grant: null, clientId: null, scopes: [], status: "disconnected", expiresAt: null, tokenEnvName: null, hasStoredToken: false },
    hasAccessToken: false, accessTokenEnvName: null, provisionedByPluginId: null, version: 3, ...overrides } as AdminExternalMcpServer;
}

beforeEach(() => { for (const fn of Object.values(port)) fn.mockReset(); });

describe("useExternalMcp — lost updates", () => {
  it("sends the loaded version as expectedVersion and the saved version on the next save", async () => {
    port.listExternalMcpServers.mockResolvedValue({ servers: [server({ version: 3 })] });
    port.saveExternalMcpServer.mockImplementation(({ serverId }: { serverId: string }) => Promise.resolve({ server: server({ serverId, version: 4 }), restartRequired: true }));
    const { result } = renderHook(() => useExternalMcp());
    await result.current.dependencies.port.fetchSources();
    await result.current.dependencies.port.updateSource!("linear", { enabled: false });
    await result.current.dependencies.port.updateSource!("linear", { enabled: true });
    expect(port.saveExternalMcpServer.mock.calls.map(([{ body }]) => body.expectedVersion)).toEqual([3, 4]);
  });

  it("a refused save (409 VERSION_CONFLICT) says nothing was saved instead of the generic failure, and keeps the version it had", async () => {
    port.listExternalMcpServers.mockResolvedValue({ servers: [server({ version: 3 })] });
    port.saveExternalMcpServer.mockRejectedValueOnce(new ApiError({ message: "changed", status: 409 }, { code: "VERSION_CONFLICT", body: { details: { expectedVersion: 3, currentVersion: 4 } } }));
    const { result } = renderHook(() => useExternalMcp());
    await result.current.dependencies.port.fetchSources();
    const refused = await result.current.dependencies.port.updateSource!("linear", { enabled: false });
    expect(refused).toMatchObject({ id: "linear", enabled: true });
    expect(refused?.statusMessage).toBe(VERSION_CONFLICT_MESSAGE);
  });
});
