import { act, renderHook, waitFor } from "@/__tests__/render-with-jini-kits";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import type { AdminRemoteToolSurfaceEntry } from "@jini-ai/core/contracts/hosted-mcp";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { useExternalMcpToolPicker, type ExternalMcpToolPickerPort } from "@jini-ai/admin/screens/settings/hooks/use-external-mcp-tool-picker.hooks";
import type { ExternalMcpProbeErrors } from "@jini-ai/admin/screens/settings/external-mcp-tool-picker-rules";

/**
 * @file B239 picker subclaim, verification only: a recommended tool the operator deliberately
 * declined must stay declined when the picker is reopened, in what the operator sees AND in the
 * payload a Save would send. Recommended defaults are meant for a never-configured connection only
 * (`seedToolPickerRows`: applied when the saved allowlist is empty).
 */

function wrapper({ children }: { children: ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

function tool(remoteName: string): AdminRemoteToolSurfaceEntry {
  return { remoteName, description: `${remoteName} description`, writeDeclared: false, destructiveDeclared: false, hintsAbsent: false, allowlisted: false, writeAllowed: false, admitted: false, refusalReason: null };
}

type Input = Omit<Parameters<typeof useExternalMcpToolPicker>[0], "port" | "t" | "errors">;
const t = (key: string) => key;
const errors: ExternalMcpProbeErrors = { isApiError: (_error): _error is never => false, describeApiError: ({ fallback }) => fallback };

function mount({ tools, input }: { tools: AdminRemoteToolSurfaceEntry[]; input: Input }) {
  const port: ExternalMcpToolPickerPort = { probe: vi.fn(async () => ({ tools })) };
  return renderHook((props: Input) => useExternalMcpToolPicker({ ...props, port, t, errors }), { initialProps: input, wrapper });
}

const enabledNames = (rows: readonly { remoteName: string; enabled: boolean }[]) => rows.filter((row) => row.enabled).map((row) => row.remoteName);

describe("reopening the MCP tool picker", () => {
  it("reopening the picker preserves a deliberately unticked recommended tool", async () => {
    const tools = [tool("read_a"), tool("read_b")];
    const first = mount({ tools, input: { serverId: "atlas", active: true, allowedToolNames: "", writeAllowedToolNames: "" } });
    await waitFor(() => expect(enabledNames(first.result.current.rows)).toEqual(["read_a", "read_b"]));
    act(() => first.result.current.setEnabled("read_a", false));
    const saved = first.result.current.fieldValues();
    expect(saved).toEqual({ allowedToolNames: "read_b", writeAllowedToolNames: "" });

    // Closing and reopening the same tab keeps the draft rather than re-applying recommendations.
    first.rerender({ serverId: "atlas", active: false, allowedToolNames: "", writeAllowedToolNames: "" });
    first.rerender({ serverId: "atlas", active: true, allowedToolNames: "", writeAllowedToolNames: "" });
    expect(enabledNames(first.result.current.rows)).toEqual(["read_b"]);
    first.unmount();

    // A fresh mount over the saved value (a reopen after Save) shows and sends the same selection.
    const reopened = mount({ tools, input: { serverId: "atlas", active: true, allowedToolNames: saved.allowedToolNames, writeAllowedToolNames: saved.writeAllowedToolNames } });
    await waitFor(() => expect(reopened.result.current.advertisedCount).toBe(2));
    expect(enabledNames(reopened.result.current.rows)).toEqual(["read_b"]);
    expect(reopened.result.current.fieldValues()).toEqual(saved);
    expect(reopened.result.current.dirty).toBe(false);
  });

  // RED today (B239, ledger): declining the ONLY recommended tool saves an empty allowlist, and an
  // empty allowlist is indistinguishable from "never configured", so the next open re-ticks it.
  // Repro: tools=[read_a]; mount allowed="" -> read_a ticked; setEnabled("read_a", false);
  // fieldValues().allowedToolNames === ""; remount with allowed="" -> rows[0].enabled === true
  // (expected false) and fieldValues().allowedToolNames === "read_a" (expected "").
  it.todo("reopening after declining every recommended tool keeps them unticked");
});
