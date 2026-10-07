import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { publishContentRefresh, resetContentRefreshBus } from "@/lib/content-refresh-bus";
import { usePlugins } from "../hooks/use-plugins.hooks";
import { useAgentPlugins } from "../hooks/use-agent-plugins.hooks";
import { createFakePluginsPort } from "../hooks/plugins-dependencies.hooks";
import { createFakeAgentPluginsPort } from "../hooks/agent-plugins-dependencies.hooks";

afterEach(() => resetContentRefreshBus());
const t = (key: string) => key;
const siteRow = { id: "qa-fake-hello", name: "QA Hello", version: "1.0.0", source: "site" as const, tier: "tier-1" as const, status: "valid" as const, enabled: false, quarantine: null, errors: [] };
const agentRow = { pluginId: "qa-fake-agent", version: "1.0.0", enabled: false, description: null, keywords: [], skills: [], mcpServerIds: [] };

describe("plugin lists after assistant tool writes", () => {
  it("re-reads installs and uninstalls on the existing assistant refresh bridge without remounting", async () => {
    const sitePort = createFakePluginsPort();
    const agentPort = createFakeAgentPluginsPort();
    const siteRead = vi.spyOn(sitePort, "listPlugins").mockResolvedValue({ plugins: [] });
    const agentRead = vi.spyOn(agentPort, "listAgentPlugins").mockResolvedValue({ agentPlugins: [] });
    const site = renderHook(() => usePlugins({ port: sitePort, locale: "en", t }));
    const agent = renderHook(() => useAgentPlugins({ port: agentPort, locale: "en", t }));
    await waitFor(() => { expect(site.result.current.plugins).toEqual([]); expect(agent.result.current.agentPlugins).toEqual([]); });
    act(() => publishContentRefresh(["taxonomy"]));
    expect(siteRead).toHaveBeenCalledTimes(1); expect(agentRead).toHaveBeenCalledTimes(1);
    siteRead.mockResolvedValue({ plugins: [siteRow] }); agentRead.mockResolvedValue({ agentPlugins: [agentRow] });
    act(() => publishContentRefresh()); // The assistant publisher sends the unknown scope.
    await waitFor(() => { expect(site.result.current.plugins).toEqual([siteRow]); expect(agent.result.current.agentPlugins).toEqual([agentRow]); });
    siteRead.mockResolvedValue({ plugins: [] }); agentRead.mockResolvedValue({ agentPlugins: [] });
    act(() => publishContentRefresh(["plugins", "agent-plugins"]));
    await waitFor(() => { expect(site.result.current.plugins).toEqual([]); expect(agent.result.current.agentPlugins).toEqual([]); });
    site.unmount(); agent.unmount();
    act(() => publishContentRefresh());
    expect(siteRead).toHaveBeenCalledTimes(3); expect(agentRead).toHaveBeenCalledTimes(3);
  });

  it("an older Agent Plugins read cannot resurrect a plugin removed by a newer assistant write", async () => {
    const port = createFakeAgentPluginsPort();
    let finish!: (value: { agentPlugins: typeof agentRow[] }) => void;
    vi.spyOn(port, "listAgentPlugins").mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValue({ agentPlugins: [] });
    const { result } = renderHook(() => useAgentPlugins({ port, locale: "en", t }));
    act(() => publishContentRefresh());
    await waitFor(() => expect(result.current.agentPlugins).toEqual([]));
    await act(async () => finish({ agentPlugins: [agentRow] }));
    expect(result.current.agentPlugins).toEqual([]);
  });

  it("an older Agent Plugins refresh cannot hide a just-installed UI row", async () => {
    const port = createFakeAgentPluginsPort();
    let finish!: (value: { agentPlugins: typeof agentRow[] }) => void;
    vi.spyOn(port, "listAgentPlugins").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useAgentPlugins({ port, locale: "en", t }));
    act(() => result.current.onInstalled(agentRow));
    await act(async () => finish({ agentPlugins: [] }));
    expect(result.current.agentPlugins).toEqual([agentRow]);
  });
});
