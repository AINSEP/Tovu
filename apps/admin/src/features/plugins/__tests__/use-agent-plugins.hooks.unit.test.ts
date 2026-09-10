import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type AdminAgentPlugin } from "@/lib/api";
import { createFakeAgentPluginsPort } from "../hooks/agent-plugins-dependencies.hooks";
import { useAgentPlugins } from "../hooks/use-agent-plugins.hooks";

/**
 * @file `useAgentPlugins` driven against the injected `AgentPluginsPort`, no `fetch` stub and no
 * `vi.spyOn(api, ...)` for the load path — mirrors `use-plugins.hooks.unit.test.ts`'s identical
 * "injected port" proof for this feature's sibling screen.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

const SITE_COMPLIANCE: AdminAgentPlugin = {
  pluginId: "site-compliance",
  version: "1.0.0",
  description: "Evidence-based compliance screening.",
  keywords: ["compliance"],
  enabled: true,
  skills: [{ name: "site-compliance", summary: "Screens a site for compliance risk." }],
  mcpServerIds: [],
};

describe("useAgentPlugins — injected port (no fetch stub, no api spy)", () => {
  it("loads the list from the injected port and never touches the real api client", async () => {
    const listSpy = vi.spyOn(api, "listAgentPlugins");
    const port = createFakeAgentPluginsPort({ agentPlugins: [SITE_COMPLIANCE] });
    const { result } = renderHook(() => useAgentPlugins({ port, locale: "en", t: (key: string) => key }));

    await waitFor(() => expect(result.current.agentPlugins).toHaveLength(1));
    expect(result.current.agentPlugins?.[0]?.pluginId).toBe("site-compliance");
    expect(result.current.error).toBeNull();
    expect(listSpy).not.toHaveBeenCalled();
  });

  it("does not resolve `agentPlugins` while the injected port's list call is still pending", () => {
    const port = createFakeAgentPluginsPort();
    port.listAgentPlugins = () => new Promise(() => {});
    const { result } = renderHook(() => useAgentPlugins({ port, locale: "en", t: (key: string) => key }));
    expect(result.current.agentPlugins).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("surfaces a rejected load as `error`, leaving `agentPlugins` null", async () => {
    const port = createFakeAgentPluginsPort();
    port.listAgentPlugins = () => Promise.reject(new Error("boom"));
    const { result } = renderHook(() => useAgentPlugins({ port, locale: "en", t: (key: string) => key }));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.agentPlugins).toBeNull();
    expect(result.current.error).toBe("boom");
  });

  it("inspectPlugin/closeInspector track the open inspector without touching the port", async () => {
    const port = createFakeAgentPluginsPort({ agentPlugins: [SITE_COMPLIANCE] });
    const { result } = renderHook(() => useAgentPlugins({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.agentPlugins).toHaveLength(1));

    expect(result.current.inspectedPlugin).toBeNull();
    act(() => result.current.inspectPlugin({ id: "site-compliance", displayName: "Site Compliance" }));
    expect(result.current.inspectedPlugin).toEqual({ id: "site-compliance", displayName: "Site Compliance" });

    act(() => result.current.closeInspector());
    expect(result.current.inspectedPlugin).toBeNull();
  });
});
