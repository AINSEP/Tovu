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
});

describe("buildAdminAgentPages", () => {
  it("returns exactly one navigation thunk per published page id", () => {
    const pages = buildAdminAgentPages();

    expect(Object.keys(pages).sort()).toEqual(Object.keys(ADMIN_AGENT_PAGE_PATHS).sort());
    for (const thunk of Object.values(pages)) {
      expect(typeof thunk).toBe("function");
    }
  });

  it("calling a page's thunk navigates via router.navigate to exactly that page's route path", () => {
    const navigateSpy = vi.spyOn(router, "navigate").mockImplementation(() => {});
    const [pageId, routePath] = Object.entries(ADMIN_AGENT_PAGE_PATHS)[0]!;
    const pages = buildAdminAgentPages();

    pages[pageId]!();

    expect(navigateSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenCalledWith(routePath);
  });

  it("each page's thunk is independent — invoking one does not navigate any other page's route", () => {
    const navigateSpy = vi.spyOn(router, "navigate").mockImplementation(() => {});
    const entries = Object.entries(ADMIN_AGENT_PAGE_PATHS);
    // Only meaningful with at least two distinct pages; if the allowlist ever shrinks to one, this
    // assertion has nothing to distinguish and is skipped rather than made to lie.
    if (entries.length < 2) return;
    const [, secondRoutePath] = entries[1]!;
    const [firstPageId] = entries[0]!;
    const pages = buildAdminAgentPages();

    pages[firstPageId]!();

    expect(navigateSpy).not.toHaveBeenCalledWith(secondRoutePath);
  });
});
