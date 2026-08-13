import { afterEach, describe, expect, it, vi } from "vitest";

import { buildAgentPageMap } from "@jini-ai/admin/core";
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

  it("still honors an explicit agentReachable: false under the flipped default", () => {
    // No panel in `panels.tsx` sets `agentReachable: false` today — `settings-raw`, the raw
    // namespace/key ledger inspector, was the last one and was deleted once `/settings` covered
    // the same rows through a curated UI. Asserting against the live `ADMIN_AGENT_PAGE_PATHS`
    // would therefore pin nothing: every id is absent from a map that never had it. Feeding
    // `buildAgentPageMap` a panel that sets it explicitly is what actually proves the opt-out
    // still overrides `defaultReachable: true`, so the next panel that needs it works.
    const map = buildAgentPageMap(
      [{ id: "opted-out", render: () => null, agentReachable: false }],
      { defaultReachable: true },
    );

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
