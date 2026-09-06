import { describe, expect, it } from "vitest";

import type { AdminSiteListEntry, AdminSitesSnapshot } from "@/lib/api";
import {
  resolveDatabaseOptionClassName,
  resolveSiteCardTitle,
  resolveSiteDatabaseOptions,
  resolveSiteRegistrationBadge,
  resolveSitesEmpty,
  resolveSitesHeading,
  resolveSitesViewId,
  resolveSiteSubtitle,
  SITES_VIEW_IDS,
} from "../Sites.hooks";

/**
 * @file Direct tests for the derivations behind the Runner port (2026-09-05).
 *
 * The component suite exercises each of these through rendered output; what it cannot exercise is
 * the INVARIANT on {@link resolveDatabaseOptionClassName} — that an unavailable backend never
 * renders as a selected one. `CreateSiteOnboarding.tsx` only ever calls it with `selected` and
 * `available` set to the same value, so a regression making `available: false, selected: true`
 * return `is-selected` would sail past every rendering assertion in the app while leaving the
 * function one careless call site away from painting Supabase as the chosen database.
 */

const fakeT = (key: string): string => key;

function entry(name: string): AdminSiteListEntry {
  return { name, dir: `/repo/sites/${name}`, displayName: name, createdAt: "2026-01-01T00:00:00.000Z", active: false };
}

describe("resolveSitesViewId", () => {
  it("returns each known view id unchanged", () => {
    for (const id of SITES_VIEW_IDS) expect(resolveSitesViewId(id)).toBe(id);
  });

  it("falls back to the list, not the form, for absent/unknown values", () => {
    expect(resolveSitesViewId(null)).toBe("all");
    expect(resolveSitesViewId(undefined)).toBe("all");
    expect(resolveSitesViewId("")).toBe("all");
    // A stale bookmark from the pre-tab layout, and a plausible near-miss for the real id.
    expect(resolveSitesViewId("create")).toBe("all");
    expect(resolveSitesViewId("New")).toBe("all");
  });
});

describe("resolveSitesHeading", () => {
  it("names the create screen on the create view, the way Runner's header does", () => {
    expect(resolveSitesHeading("new", fakeT).title).toBe("Create a site");
  });

  it("keeps the section title on the list view", () => {
    const heading = resolveSitesHeading("all", fakeT);
    expect(heading.title).toBe("Sites");
    expect(heading.description).toContain("takes a restart");
  });
});

describe("resolveSitesEmpty", () => {
  it("is true only for an empty list", () => {
    expect(resolveSitesEmpty([])).toBe(true);
    expect(resolveSitesEmpty([entry("alpha")])).toBe(false);
  });
});

describe("resolveSiteDatabaseOptions", () => {
  it("offers all three of Runner's backends, in Runner's order", () => {
    expect(resolveSiteDatabaseOptions(fakeT).map((option) => option.id)).toEqual(["sqlite", "supabase", "custom"]);
  });

  it("marks exactly one available, and it is the one initSite can actually produce", () => {
    const options = resolveSiteDatabaseOptions(fakeT);
    // Asserting on WHICH is available, not merely that one is: a regression flipping the flags
    // would still leave "exactly one available" true while offering a backend that does not exist.
    expect(options.filter((option) => option.available).map((option) => option.id)).toEqual(["sqlite"]);
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
    // combining, so no call site can produce a vendor card that looks like the chosen database.
    expect(resolveDatabaseOptionClassName({ selected: false, available: false })).toBe("site-db-option is-unavailable");
    expect(resolveDatabaseOptionClassName({ selected: true, available: false })).toBe("site-db-option is-unavailable");
  });
});

function snapshotFor(entryName: string, listed: boolean): AdminSitesSnapshot {
  return {
    switchingEnabled: true,
    sites: [entry(entryName)],
    currentSite: { dir: `/repo/sites/${entryName}`, name: entryName, dirOverridden: false, listed },
    persistedSiteName: null,
  };
}

describe("resolveSiteCardTitle", () => {
  it("is the absolute path, which the card carries as its hover tooltip", () => {
    expect(resolveSiteCardTitle(entry("alpha"))).toBe("/repo/sites/alpha");
  });
});

describe("resolveSiteSubtitle", () => {
  it("is null when the display name only repeats the folder name — initSite's own default", () => {
    // `initSite` defaults `config.json.name` to the folder basename, so this is the common case and
    // rendering it would spend a line of the compact card saying the same word twice.
    expect(resolveSiteSubtitle(entry("alpha"))).toBeNull();
  });

  it("is the display name when an operator has actually set a different one", () => {
    expect(resolveSiteSubtitle({ ...entry("alpha"), displayName: "Alpha Client Site" })).toBe("Alpha Client Site");
  });
});

describe("resolveSiteRegistrationBadge", () => {
  it("is null for a normal row, so no badge is rendered", () => {
    expect(resolveSiteRegistrationBadge(entry("alpha"), snapshotFor("alpha", true))).toBeNull();
  });

  it("names the two missing files and what refuses without them, not just 'invalid'", () => {
    const badge = resolveSiteRegistrationBadge(entry("alpha"), snapshotFor("alpha", false));
    expect(badge?.labelKey).toBe("Not initialized");
    // Asserting the tooltip's actual content, not merely that one exists: a badge saying only
    // "Not initialized" reads as a defect rather than a specific, fixable state.
    expect(badge?.titleKey).toContain("config.json");
    expect(badge?.titleKey).toContain(".site-meta.json");
    expect(badge?.titleKey).toContain("tovu serve would refuse it");
  });
});
