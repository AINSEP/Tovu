import { renderHook, waitFor } from "@/__tests__/render-with-jini-kits";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminRemoteToolSurfaceEntry } from "@jini-ai/core/contracts/hosted-mcp";
import { useWiredExternalMcpToolPicker } from "../hooks/use-external-mcp-tool-picker.hooks";

function tool(remoteName: string, overrides: Partial<AdminRemoteToolSurfaceEntry> = {}): AdminRemoteToolSurfaceEntry {
  return { remoteName, description: `${remoteName} description`, writeDeclared: false, destructiveDeclared: false, hintsAbsent: false, allowlisted: false, writeAllowed: false, admitted: false, refusalReason: null, ...overrides };
}

const initial = { serverId: "atlas", active: true, allowedToolNames: "read, write", writeAllowedToolNames: "write" };
const tools = [tool("read"), tool("write", { writeDeclared: true }), tool("erase", { destructiveDeclared: true })];
const t = (key: string) => key;

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// The picker's own transport/draft behaviour lives (and is tested) in Jini beside the hook; this suite
// pins only what the HOST binding adds: the integrations route and the host's request-error vocabulary.
describe("host binding of the MCP picker transport", () => {
  it("routes the host's coded unsupported-transport ApiError through the supplied translator", async () => {
    // F2.4: failing to bind the host's ApiError guard (or to forward t) leaves server prose or English
    // workaround copy in a translated dialog.
    const translate = (key: string) => `translated:${key}`;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "server prose", code: "PROBE_UNSUPPORTED_TRANSPORT" }, { status: 400 })));
    const { result } = renderHook(() => useWiredExternalMcpToolPicker({ ...initial, t: translate }));
    await waitFor(() => expect(result.current.unreachable).toBe("translated:This server runs as a local command and can't be probed yet — type its tool names into 'Allowed tools' on the server's own card instead."));
  });

  it("uses the wired API port with the selected server ID", async () => {
    // F2.6/F3.6: strict fetch rejects the wrong server, path or method; subject stays real.
    const fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (url !== "/api/admin/v1/workspaces/workspace-local/mcp-servers/atlas/probe" || init?.method !== "POST") throw new Error(`unexpected request ${String(url)} ${init?.method}`);
      return Response.json({ tools, probedAt: "2026-09-30T00:00:00.000Z" });
    });
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useWiredExternalMcpToolPicker({ ...initial, t }));
    await waitFor(() => expect(result.current.advertisedCount).toBe(3));
    expect(result.current.unreachable).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.fieldValues()).toEqual({ allowedToolNames: "read, write", writeAllowedToolNames: "write" });
  });

});
