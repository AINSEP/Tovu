import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useProviders } from "../use-providers.hooks";

afterEach(() => vi.unstubAllGlobals());

function stubTransport() {
  const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(
    String(url).endsWith("/mcp-servers") ? { servers: [] } : { data: [] },
  ), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/**
 * @file `useProviders` — the Providers page's controller.
 *
 * The "composed sub-controllers are present" case below MOVED here unchanged (2026-09-10) from
 * `features/settings/hooks/__tests__/use-settings-ui.unit.test.ts`, when the External MCP tab
 * (and the since-removed Composio tab) left the Settings page for their own nav row. Same assertion, same guarantee — only its
 * owner changed.
 */

describe("useProviders — composed sub-controllers are present", () => {
  it("wires externalMcp as a real controller, not a stub", async () => {
    const fetchMock = stubTransport();
    const { result } = renderHook(() => useProviders());
    expect(result.current.externalMcp).toHaveProperty("dependencies");
    expect(result.current.externalMcp).toHaveProperty("restartRequired");
    await act(async () => {
      expect(await result.current.externalMcp.dependencies.port.fetchSources()).toEqual([]);
    });
    const mcpCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/mcp-servers"));
    expect(mcpCalls).toHaveLength(1);
    expect(mcpCalls[0][0]).toBe("/api/admin/v1/workspaces/workspace-local/mcp-servers");
    expect(result.current.externalMcp.restartRequired).toBe(false);
  });
});

describe("useProviders — mounts ONLY what the Providers page reads", () => {
  it("exposes no settings-ledger slices", async () => {
    const fetchMock = stubTransport();
    // The reason this hook exists rather than reusing `useSettingsUi` (see its own doc comment):
    // that hook mounts six `useSettingsSlice` instances — execution, instructions, notifications,
    // privacy, appearance, language — none of which any tab on this page displays. Reusing it
    // would have made opening Providers fetch five namespaces it never shows AND gated the render
    // on `areAnySlicesLoading`, so one slow unrelated namespace would hold the External MCP panel
    // blank. This asserts that separation rather than trusting the comment.
    const { result } = renderHook(() => useProviders());

    expect(Object.keys(result.current).sort()).toEqual(["externalMcp"]);
    for (const sliceField of ["execution", "instructions", "notifications", "privacy", "appearance", "language", "save", "loading"]) {
      expect(result.current).not.toHaveProperty(sliceField);
    }
    await act(async () => {});
    // The controller's translator legitimately reads its locale; no other ledger slice belongs here.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
    expect(url.pathname).toBe("/api/admin/v1/workspaces/workspace-local/settings/effective");
    expect(url.searchParams.get("namespace")).toBe("core.language");
  });
});
