import { afterEach, expect, it, vi } from "vitest";
import { api, type AdminAgentPlugin, type AdminPost } from "../api";
import { buildAdminAgentPages } from "../agent-pages";
import * as router from "../router";

afterEach(() => { vi.restoreAllMocks(); window.history.replaceState({}, "", "/admin"); });

it("resolves the real plugin id, correct tab and a discovery query without clicking a made-up details handle", async () => {
  vi.spyOn(api, "listAgentPlugins").mockResolvedValue({ agentPlugins: [{ pluginId: "ui-ux-design", enabled: false } as AdminAgentPlugin] });
  const navigate = vi.spyOn(router, "navigate");
  const result = await buildAdminAgentPages()["agent-plugins"]!.navigate({ entity: { type: "agent-plugin", id: "ui-ux-design" } });
  expect(navigate).toHaveBeenCalledExactlyOnceWith("/addons/agent-plugins?tab=downloaded");
  expect(result).toEqual({ path: "/addons/agent-plugins?tab=downloaded", nextAction: { query: "ui-ux-design", role: "button", intent: "details" } });
});

it("a missing plugin cannot navigate to a guessed destination", async () => {
  vi.spyOn(api, "listAgentPlugins").mockResolvedValue({ agentPlugins: [] });
  const navigate = vi.spyOn(router, "navigate");
  await expect(buildAdminAgentPages()["agent-plugins"]!.navigate({ entity: { type: "agent-plugin", id: "absent" } })).rejects.toThrow("not found");
  expect(navigate).not.toHaveBeenCalled();
});

it("uses the kind-guarded page read and the actual encoded slug", async () => {
  const getPage = vi.spyOn(api, "getPage").mockResolvedValue({ post: { id: "page-id", slug: "hello / 世界" } as AdminPost });
  const navigate = vi.spyOn(router, "navigate");
  await buildAdminAgentPages()["pages"]!.navigate({ entity: { type: "page", id: "page-id" } });
  expect(getPage).toHaveBeenCalledWith("page-id");
  expect(navigate).toHaveBeenCalledExactlyOnceWith("/pages/hello%20%2F%20%E4%B8%96%E7%95%8C");
});


it("opens an enabled package on Installed using the current server state", async () => {
  vi.spyOn(api, "listAgentPlugins").mockResolvedValue({ agentPlugins: [{ pluginId: "ui-ux-design", enabled: true } as AdminAgentPlugin] });
  const navigate = vi.spyOn(router, "navigate");
  await buildAdminAgentPages()["agent-plugins"]!.navigate({ entity: { type: "agent-plugin", id: "ui-ux-design" } });
  expect(navigate).toHaveBeenCalledExactlyOnceWith("/addons/agent-plugins?tab=installed");
});
