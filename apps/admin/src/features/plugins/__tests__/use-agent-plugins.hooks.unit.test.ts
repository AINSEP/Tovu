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

/** Seeded DISABLED, so the two-row tests assert two different post-toggle values rather than one
 *  value twice — a bug that wrote every row the same way would still pass against two `true`s. */
const OTHER_PLUGIN: AdminAgentPlugin = {
  pluginId: "tovu-deploy-fly",
  version: "1.0.0",
  description: "Deploys a Tovu instance to fly.io.",
  keywords: ["deploy"],
  enabled: false,
  skills: [{ name: "tovu-deploy-fly", summary: "Deploys to fly.io." }],
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

/**
 * `onToggleEnabled` — the enable/disable switch's wiring. The activation write it drives is a real
 * gate (a disabled plugin refuses an assistant run), so these cover the two properties that make
 * the rendered switch trustworthy: it never shows a position the server did not confirm, and two
 * rows toggled in quick succession cannot overwrite each other's answer.
 */
describe("useAgentPlugins — onToggleEnabled", () => {
  it("flips the row through the port and replaces that row with the server's answer", async () => {
    const port = createFakeAgentPluginsPort({ agentPlugins: [SITE_COMPLIANCE] });
    const { result } = renderHook(() => useAgentPlugins({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.agentPlugins).toHaveLength(1));

    await act(async () => {
      await result.current.onToggleEnabled(result.current.agentPlugins![0]!);
    });

    expect(result.current.agentPlugins?.[0]?.enabled).toBe(false);
    expect(result.current.toggleError).toBeNull();
    // The rest of the row survives the replacement — a toggle must not blank the description or
    // skills the row is also rendering.
    expect(result.current.agentPlugins?.[0]?.skills).toHaveLength(1);
    expect(result.current.agentPlugins?.[0]?.description).toBe(SITE_COMPLIANCE.description);
  });

  it("marks only the toggling row as in-flight, and clears it when the request settles", async () => {
    const port = createFakeAgentPluginsPort({ agentPlugins: [SITE_COMPLIANCE, OTHER_PLUGIN], deferToggles: true });
    const { result } = renderHook(() => useAgentPlugins({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.agentPlugins).toHaveLength(2));

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.onToggleEnabled(result.current.agentPlugins![0]!);
    });

    await waitFor(() => expect(result.current.togglingIds.has("site-compliance")).toBe(true));
    expect(result.current.togglingIds.has("tovu-deploy-fly")).toBe(false);

    await act(async () => {
      port.pendingToggles.forEach((settle) => settle());
      await pending;
    });
    expect(result.current.togglingIds.size).toBe(0);
  });

  it("keeps the server-confirmed position when the toggle is refused, and reports it separately from a load failure", async () => {
    const port = createFakeAgentPluginsPort({ agentPlugins: [SITE_COMPLIANCE], failToggleWith: new Error("forbidden") });
    const { result } = renderHook(() => useAgentPlugins({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.agentPlugins).toHaveLength(1));

    await act(async () => {
      await result.current.onToggleEnabled(result.current.agentPlugins![0]!);
    });

    expect(result.current.agentPlugins?.[0]?.enabled).toBe(true);
    expect(result.current.toggleError).toBe("forbidden");
    expect(result.current.error).toBeNull();
    expect(result.current.togglingIds.size).toBe(0);
  });

  it("ignores a second activation of a row whose own request is still in flight", async () => {
    const port = createFakeAgentPluginsPort({ agentPlugins: [SITE_COMPLIANCE], deferToggles: true });
    const toggleSpy = vi.spyOn(port, "setAgentPluginEnabled");
    const { result } = renderHook(() => useAgentPlugins({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.agentPlugins).toHaveLength(1));

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.onToggleEnabled(result.current.agentPlugins![0]!);
    });
    await waitFor(() => expect(result.current.togglingIds.has("site-compliance")).toBe(true));

    await act(async () => {
      await result.current.onToggleEnabled(result.current.agentPlugins![0]!);
    });
    expect(toggleSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      port.pendingToggles.forEach((settle) => settle());
      await pending;
    });
  });

  it("two rows settling out of order each keep their own answer", async () => {
    // The stale-settlement case a `reload()`-after-PATCH shape gets wrong: the SECOND toggle
    // settles FIRST, so the first row's later settlement is holding a list snapshot that predates
    // it. Both answers must survive.
    const port = createFakeAgentPluginsPort({ agentPlugins: [SITE_COMPLIANCE, OTHER_PLUGIN], deferToggles: true });
    const { result } = renderHook(() => useAgentPlugins({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.agentPlugins).toHaveLength(2));

    let firstRow!: Promise<void>;
    let secondRow!: Promise<void>;
    act(() => {
      firstRow = result.current.onToggleEnabled(result.current.agentPlugins![0]!);
      secondRow = result.current.onToggleEnabled(result.current.agentPlugins![1]!);
    });
    await waitFor(() => expect(port.pendingToggles).toHaveLength(2));

    await act(async () => {
      port.pendingToggles[1]!();
      await secondRow;
      port.pendingToggles[0]!();
      await firstRow;
    });

    const byId = new Map(result.current.agentPlugins!.map((plugin) => [plugin.pluginId, plugin.enabled]));
    expect(byId.get("site-compliance")).toBe(false);
    expect(byId.get("tovu-deploy-fly")).toBe(true);
  });
});
