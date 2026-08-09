import { afterEach, describe, expect, it, vi } from "vitest";

import * as router from "../router";
import { ADMIN_AGENT_PAGE_PATHS, buildAdminAgentPages } from "../agent-pages";

/**
 * @file `agent-pages.ts` — the allowlist behind `page.navigate` (`buildAdminAgentPages`) and the
 * map it is built from (`ADMIN_AGENT_PAGE_PATHS`). 75% before this pass.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ADMIN_AGENT_PAGE_PATHS", () => {
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

  it("excludes settings-raw even under the flipped default — the one panel with agentReachable: false set explicitly", () => {
    // The raw namespace/key ledger inspector: a human-only debugging surface over rows `/settings`
    // already exposes through a curated UI. Pinned so a future edit that deletes the explicit
    // `false` (assuming the default alone is enough) is caught here, not discovered live.
    expect(ADMIN_AGENT_PAGE_PATHS["settings-raw"]).toBeUndefined();
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
    // for, not just "appearance"/"settings-raw" leaving `nav` unset on an otherwise real panel.
    const pages = buildAdminAgentPages();
    expect(pages["widget-regions"]?.label).toBe("Widget Regions");
  });

  it("calling a page's navigate function calls router.navigate with exactly that page's route path", () => {
    const navigateSpy = vi.spyOn(router, "navigate").mockImplementation(() => {});
    const [pageId, routePath] = Object.entries(ADMIN_AGENT_PAGE_PATHS)[0]!;
    const pages = buildAdminAgentPages();

    pages[pageId]!.navigate();

    expect(navigateSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenCalledWith(routePath);
  });

  it("each page's navigate function is independent — invoking one does not navigate any other page's route", () => {
    const navigateSpy = vi.spyOn(router, "navigate").mockImplementation(() => {});
    const entries = Object.entries(ADMIN_AGENT_PAGE_PATHS);
    // Only meaningful with at least two distinct pages; if the allowlist ever shrinks to one, this
    // assertion has nothing to distinguish and is skipped rather than made to lie.
    if (entries.length < 2) return;
    const [, secondRoutePath] = entries[1]!;
    const [firstPageId] = entries[0]!;
    const pages = buildAdminAgentPages();

    pages[firstPageId]!.navigate();

    expect(navigateSpy).not.toHaveBeenCalledWith(secondRoutePath);
  });
});
