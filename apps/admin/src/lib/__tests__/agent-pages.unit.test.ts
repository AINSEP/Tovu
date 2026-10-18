import { afterEach, describe, expect, it, vi } from "vitest";

import { buildAgentPageMap } from "@jini-ai/admin/core";
import * as router from "../router";
import { ADMIN_AGENT_PAGE_PATHS, buildAdminAgentPages, listAdminAgentScreens } from "../agent-pages";
import { resetContentRefreshBus, subscribeToContentRefresh } from "@/lib/content-refresh-bus";

/**
 * @file `agent-pages.ts` — the allowlist behind `page.navigate` (`buildAdminAgentPages`) and the
 * map it is built from (`ADMIN_AGENT_PAGE_PATHS`). 75% before this pass.
 */

afterEach(() => {
  vi.restoreAllMocks();
  resetContentRefreshBus();
  window.history.replaceState({}, "", "/admin");
});

describe("ADMIN_AGENT_PAGE_PATHS", () => {
  it("publishes Admin UI without advertising its redirect-only aliases as screens", () => {
    expect(ADMIN_AGENT_PAGE_PATHS["admin-ui"]).toBe("/admin-ui");
    const pages = buildAdminAgentPages();
    const screens = listAdminAgentScreens();
    expect(screens).toContainEqual({ id: "admin-ui", label: "Admin UI", path: "/admin-ui" });
    for (const id of ["admin-themes", "admin-appearance", "design-system"]) {
      expect(ADMIN_AGENT_PAGE_PATHS).not.toHaveProperty(id);
      expect(pages).not.toHaveProperty(id);
      expect(screens.some((screen) => screen.id === id)).toBe(false);
    }
  });

  it("keeps Add-ons page IDs while publishing their canonical paths", () => {
    expect(ADMIN_AGENT_PAGE_PATHS).toMatchObject({
      plugins: "/addons/plugins",
      "agent-plugins": "/addons/agent-plugins",
      skills: "/addons/skills",
      providers: "/addons/integrations",
      integrations: "/addons/integrations?tab=webhooks",
    });
  });
  it("is a non-empty map of page id -> route path, derived from ADMIN_PANELS", () => {
    const entries = Object.entries(ADMIN_AGENT_PAGE_PATHS);
    expect(entries.length).toBeGreaterThan(0);
    for (const [pageId, routePath] of entries) {
      expect(typeof pageId).toBe("string");
      expect(routePath.startsWith("/")).toBe(true);
    }
  });

  it("includes ai-assistant — a panel that leaves agentReachable unset, reachable only because Tovu opts into buildAgentPageMap's defaultReachable", () => {
    // Regression pin: an earlier version of `panels.tsx` excluded this panel on the mistaken
    // premise that it WAS the assistant's own chat dock. It isn't — it's an operator control panel
    // (visitor-assistant kill switch, execution mode, BYOK credentials) that happens to share the
    // name. Reported live: asking the assistant to go there from another page failed with "no such
    // page" because nothing had opted it in.
    expect(ADMIN_AGENT_PAGE_PATHS["ai-assistant"]).toBe("/ai-assistant");
  });

  it("still honors an explicit agentReachable: false under the flipped default", () => {
    // Keep the package's opt-out contract pinned independently of which live panels use it.
    const map = buildAgentPageMap({ panels: [{ id: "opted-out", render: () => null, agentReachable: false }] }, { defaultReachable: true });

    expect(map["opted-out"]).toBeUndefined();
  });
});

describe("buildAdminAgentPages", () => {
  it("returns exactly one {label, navigate} pair per published page id, every label non-empty", () => {
    const pages = buildAdminAgentPages();

    expect(Object.keys(pages).sort()).toEqual(Object.keys(ADMIN_AGENT_PAGE_PATHS).sort());
    for (const page of Object.values(pages)) {
      expect(typeof page.navigate).toBe("function");
      expect(typeof page.label).toBe("string");
      expect(page.label.length).toBeGreaterThan(0);
    }
  });

  it("labels a panel with its own nav.label, so the site map never drifts from the sidebar", () => {
    // "posts" has a real `nav.label` ("Posts") in panels.tsx — pins that the label actually comes
    // from there, not just that some non-empty string exists.
    const pages = buildAdminAgentPages();
    expect(pages["posts"]?.label).toBe("Posts");
  });

  it("falls back to a humanized id for a page with no nav.label to read", () => {
    // "widget-regions" is a per-route agent page id (panels.tsx's `widgets` panel), never a panel
    // id itself, so it has no `nav` entry to look up at all — this is the case the fallback exists
    // for, not just "appearance" leaving `nav` unset on an otherwise real panel.
    const pages = buildAdminAgentPages();
    expect(pages["widget-regions"]?.label).toBe("Widget Regions");
  });

  it("calling a page's navigate function calls router.navigate with exactly that page's route path", () => {
    window.history.replaceState({}, "", "/admin/unrelated");
    const navigateSpy = vi.spyOn(router, "navigate");
    const [pageId, routePath] = Object.entries(ADMIN_AGENT_PAGE_PATHS)[0]!;
    const pages = buildAdminAgentPages();

    pages[pageId]!.navigate({});

    expect(navigateSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenCalledWith(routePath);
    expect(router.currentRoutePath()).toBe(routePath);
  });

  it("each page's navigate function is independent — invoking one does not navigate any other page's route", () => {
    window.history.replaceState({}, "", "/admin/unrelated");
    const navigateSpy = vi.spyOn(router, "navigate");
    const entries = Object.entries(ADMIN_AGENT_PAGE_PATHS);
    expect(entries.length).toBeGreaterThanOrEqual(2);
    const [, secondRoutePath] = entries[1]!;
    const [firstPageId, firstRoutePath] = entries[0]!;
    const pages = buildAdminAgentPages();

    pages[firstPageId]!.navigate({});

    expect(navigateSpy).not.toHaveBeenCalledWith(secondRoutePath);
    expect(navigateSpy).toHaveBeenCalledExactlyOnceWith(firstRoutePath);
    expect(router.currentRoutePath()).toBe(firstRoutePath);
  });

  it("publishes a content refresh when the agent navigates to the route already displayed", () => {
    vi.spyOn(router, "navigate").mockImplementation(() => {});
    vi.spyOn(router, "currentRoutePath").mockReturnValue(ADMIN_AGENT_PAGE_PATHS["posts"]!);
    const seen = vi.fn();
    subscribeToContentRefresh(seen);

    buildAdminAgentPages()["posts"]!.navigate({});

    // Same-route navigate remounts nothing (`router.ts`'s `useSyncExternalStore` snapshot is an
    // unchanged string), so without this the agent is shown the list as it was at mount.
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledWith(null);
  });

  it("does not publish when navigating to a different route, which mounts and fetches on its own", () => {
    vi.spyOn(router, "navigate").mockImplementation(() => {});
    vi.spyOn(router, "currentRoutePath").mockReturnValue("/some-other-route");
    const seen = vi.fn();
    subscribeToContentRefresh(seen);

    buildAdminAgentPages()["posts"]!.navigate({});

    expect(seen).not.toHaveBeenCalled();
  });
});
