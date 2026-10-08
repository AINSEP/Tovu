import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { AdminRemoteToolSurfaceEntry } from "@/lib/api";
import { FetchQueryProvider } from "@jini-ai/ui/fetch-query";
import { useExternalMcpToolPicker } from "../hooks/use-external-mcp-tool-picker.hooks";

function wrapper({ children }: { children: ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

// Author Checklist: F2.3/F2.4/F3.4 real hook, effects, rules and query cache;
// F3.6 strict server ID; F4.1/F4.5 literal saved/draft outputs differ;
// F6.2/F7.1 held refresh, settled signal; F7.5 fresh provider for each case.
// Faults to reject: omit description/writeDeclared/hintsAbsent from the refresh
// signature, or re-seed saved permissions when only those declarations change.
// No source mutation: this dispatch prohibits all product-code edits.
it.each([
  ["description", { description: "Search archived documents" }],
  ["write declaration", { writeDeclared: true }],
  ["missing hints", { hintsAbsent: true }],
] as const)("refreshes the %s of a cached tool without dropping unsaved permissions", async (_label, change) => {
  const tool: AdminRemoteToolSurfaceEntry = {
    remoteName: "search", description: "Search documents", writeDeclared: false,
    destructiveDeclared: false, hintsAbsent: false, allowlisted: true,
    writeAllowed: false, admitted: true, refusalReason: null,
  };
  let resolveRefresh!: (value: { tools: AdminRemoteToolSurfaceEntry[] }) => void;
  const refresh = new Promise<{ tools: AdminRemoteToolSurfaceEntry[] }>((resolve) => { resolveRefresh = resolve; });
  let requests = 0;
  const probe = vi.fn((serverId: string) => {
    if (serverId !== "atlas") throw new Error(`unexpected server ${serverId}`);
    return ++requests === 1 ? Promise.resolve({ tools: [tool] }) : refresh;
  });
  const { result } = renderHook(() => useExternalMcpToolPicker({
    port: { probe }, serverId: "atlas", active: true, allowedToolNames: "search",
    writeAllowedToolNames: "", t: (key) => key,
  }), { wrapper });

  await waitFor(() => expect(result.current.advertisedCount).toBe(1));
  act(() => result.current.setMayWrite("search", true));
  expect(result.current.fieldValues()).toEqual({ allowedToolNames: "search", writeAllowedToolNames: "search" });
  expect(result.current.dirty).toBe(true);
  try {
    act(() => result.current.refresh());
    await waitFor(() => expect(probe.mock.calls).toEqual([["atlas"], ["atlas"]]));
    expect(result.current.refreshing).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.rows).toEqual([{
      remoteName: "search", description: "Search documents", enabled: true,
      mayWrite: true, writeDeclared: false, destructiveDeclared: false,
      hintsAbsent: false, kind: "advertised",
    }]);
  } finally {
    // Release held work even if the in-flight assertions detect a regression.
    await act(async () => { resolveRefresh({ tools: [{ ...tool, ...change }] }); await refresh; });
  }
  await waitFor(() => expect(result.current.refreshing).toBe(false));
  expect(result.current.rows).toEqual([{
    remoteName: "search", description: "Search documents", enabled: true,
    mayWrite: true, writeDeclared: false, destructiveDeclared: false,
    hintsAbsent: false, kind: "advertised", ...change,
  }]);
  expect(result.current.fieldValues()).toEqual({ allowedToolNames: "search", writeAllowedToolNames: "search" });
  expect(result.current.enabledCount).toBe(1);
  expect(result.current.dirty).toBe(true);
});
