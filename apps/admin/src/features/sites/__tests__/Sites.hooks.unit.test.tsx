import { describe, expect, it } from "vitest";

import type { AdminSiteListEntry } from "@/lib/api";
import {
  resolveDatabaseOptionClassName,
  resolveSitesEmpty,
  resolveSitesTabId,
  resolveSitesTabs,
  SITES_TAB_IDS,
} from "../Sites.hooks";

/**
 * @file Direct tests for the derivations the tab redesign added (2026-09-05).
 *
 * The component suite already exercises each of these through rendered output; what it cannot
 * exercise directly is the INVARIANT on {@link resolveDatabaseOptionClassName} — that an
 * unavailable backend never renders as a selected one. `NewSiteTab.tsx` only ever calls it with the
 * two combinations it needs, so a regression that made `available: false, selected: true` return
 * `is-selected` would sail past every rendering assertion in the app while leaving the function one
 * careless call site away from painting Supabase as the chosen database.
 */

const fakeT = (key: string): string => key;

function entry(name: string): AdminSiteListEntry {
  return { name, dir: `/repo/sites/${name}`, displayName: name, createdAt: "2026-01-01T00:00:00.000Z", active: false };
}

describe("resolveSitesTabId", () => {
  it("returns each known tab id unchanged", () => {
    for (const id of SITES_TAB_IDS) expect(resolveSitesTabId(id)).toBe(id);
  });

  it("falls back to the list, not the form, for absent/unknown values", () => {
    expect(resolveSitesTabId(null)).toBe("all");
    expect(resolveSitesTabId(undefined)).toBe("all");
    expect(resolveSitesTabId("")).toBe("all");
    // A stale bookmark from the pre-tab layout, and a plausible near-miss for the real id.
    expect(resolveSitesTabId("create")).toBe("all");
    expect(resolveSitesTabId("New")).toBe("all");
  });
});

describe("resolveSitesTabs", () => {
  it("reports the listed count verbatim, including zero", () => {
    // Zero is the case this install actually hits, and the one a 'helpful' +1 would corrupt: the
    // served site is legitimately absent from `sites[]`, and a "1" here would contradict both the
    // empty grid below it and the unlisted-site notice above it.
    expect(resolveSitesTabs(fakeT, 0)[0].count).toBe(0);
    expect(resolveSitesTabs(fakeT, 3)[0].count).toBe(3);
  });

  it("puts the list first and gives the create tab no count of its own", () => {
    const tabs = resolveSitesTabs(fakeT, 2);
    expect(tabs.map((tab) => tab.id)).toEqual(["all", "new"]);
    expect(tabs[1].count).toBeUndefined();
  });
});

describe("resolveSitesEmpty", () => {
  it("is true only for an empty list", () => {
    expect(resolveSitesEmpty([])).toBe(true);
    expect(resolveSitesEmpty([entry("alpha")])).toBe(false);
  });
});

describe("resolveDatabaseOptionClassName", () => {
  it("marks the available, chosen backend as selected", () => {
    expect(resolveDatabaseOptionClassName({ selected: true, available: true })).toBe("site-db-option is-selected");
  });

  it("leaves an available but unchosen backend unmarked", () => {
    expect(resolveDatabaseOptionClassName({ selected: false, available: true })).toBe("site-db-option");
  });

  it("never paints an unavailable backend as selected, whatever it is asked", () => {
    // Both inputs, including the contradictory one. `is-unavailable` wins outright rather than
    // combining, so no call site can produce a Supabase card that looks like the chosen database.
    expect(resolveDatabaseOptionClassName({ selected: false, available: false })).toBe("site-db-option is-unavailable");
    expect(resolveDatabaseOptionClassName({ selected: true, available: false })).toBe("site-db-option is-unavailable");
  });
});
