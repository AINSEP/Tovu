import { afterEach, expect, it, vi } from "vitest";
import { integrationsApi } from "@/features/integrations/integrations-host-ports";
import type { AdminPost } from "@jini-ai/admin/posts/api/posts-api.types";
import type { AgentPluginListRow } from "@jini-ai/admin/agent-plugins/models";
import { pagesApi } from "../../features/pages/api/pages-api";
import { lookupAdminNavigationEntity } from "../agent-navigation-entities";
import { buildAdminAgentPages } from "../agent-pages";
import * as router from "@jini-ai/admin/shell/lib/router";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/admin"); });

it("resolves the real plugin id, correct tab and a discovery query without clicking a made-up details handle", async () => {
  vi.spyOn(integrationsApi, "listAgentPlugins").mockResolvedValue({ agentPlugins: [{ pluginId: "ui-ux-design", enabled: false } as AgentPluginListRow] });
  const navigate = vi.spyOn(router, "navigate");
  const result = await buildAdminAgentPages()["agent-plugins"]!.navigate({ entity: { type: "agent-plugin", id: "ui-ux-design" } });
  expect(navigate).toHaveBeenCalledExactlyOnceWith({ routePath: "/addons/agent-plugins?tab=downloaded" });
  expect(result).toEqual({ path: "/addons/agent-plugins?tab=downloaded", nextAction: { query: "ui-ux-design", role: "button", intent: "details" } });
});

it("a missing plugin cannot navigate to a guessed destination", async () => {
  vi.spyOn(integrationsApi, "listAgentPlugins").mockResolvedValue({ agentPlugins: [] });
  const navigate = vi.spyOn(router, "navigate");
  await expect(buildAdminAgentPages()["agent-plugins"]!.navigate({ entity: { type: "agent-plugin", id: "absent" } })).rejects.toThrow("not found");
  expect(navigate).not.toHaveBeenCalled();
});

it("uses the kind-guarded page read and the actual encoded slug", async () => {
  const getPage = vi.spyOn(pagesApi, "getPage").mockResolvedValue({ post: { id: "page-id", slug: "hello / 世界" } as AdminPost });
  const navigate = vi.spyOn(router, "navigate");
  await buildAdminAgentPages()["pages"]!.navigate({ entity: { type: "page", id: "page-id" } });
  expect(getPage).toHaveBeenCalledWith({ id: "page-id" });
  expect(navigate).toHaveBeenCalledExactlyOnceWith({ routePath: "/pages/hello%20%2F%20%E4%B8%96%E7%95%8C" });
});


it("opens an enabled package on Installed using the current server state", async () => {
  vi.spyOn(integrationsApi, "listAgentPlugins").mockResolvedValue({ agentPlugins: [{ pluginId: "ui-ux-design", enabled: true } as AgentPluginListRow] });
  const navigate = vi.spyOn(router, "navigate");
  await buildAdminAgentPages()["agent-plugins"]!.navigate({ entity: { type: "agent-plugin", id: "ui-ux-design" } });
  expect(navigate).toHaveBeenCalledExactlyOnceWith({ routePath: "/addons/agent-plugins?tab=installed" });
});

it.each([
  ["post", "posts", { postId: "canonical-17" }],
  ["menu", "menus", { menuId: "canonical-17" }],
  ["widget", "widgets", { widgetId: "canonical-17" }],
] as const)("resolves a %s using the authenticated endpoint's canonical id", async (type, endpoint, params) => {
  const path = `/api/admin/v1/workspaces/workspace-local/${endpoint}/old%2Fslug`;
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    if (input === path && (init?.method ?? "GET") === "GET") {
      return Response.json({ [type]: { id: "canonical-17", slug: "different-slug" } });
    }
    return Response.json({ error: "wrong entity request" }, { status: 400 });
  });
  vi.stubGlobal("fetch", fetch);

  await expect(lookupAdminNavigationEntity({ page: endpoint, type, id: "old/slug" })).resolves.toEqual({ params });
  expect(fetch).toHaveBeenCalledExactlyOnceWith(path, expect.objectContaining({ credentials: "same-origin" }));
});

it("propagates a denied menu read rather than constructing a destination from the supplied id", async () => {
  vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>(async (input) =>
    input === "/api/admin/v1/workspaces/workspace-local/menus/private-menu"
      ? Response.json({ code: "FORBIDDEN", error: "Read access denied." }, { status: 403 })
      : new Response(null, { status: 404 }),
  ));
  await expect(lookupAdminNavigationEntity({ page: "menus", type: "menu", id: "private-menu" }))
    .rejects.toMatchObject({ status: 403, code: "FORBIDDEN", message: "Read access denied." });
});

it("does not resolve inherited property names as entity types", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  await expect(lookupAdminNavigationEntity({ page: "pages", type: "constructor", id: "page-17" })).resolves.toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
