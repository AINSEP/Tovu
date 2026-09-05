import { describe, expect, it } from "vitest";

import { ApiError, type AdminSiteListEntry, type AdminSitesSnapshot } from "@/lib/api";
import {
  activationOutlook,
  readSnapshot,
  siteNameErrorKey,
  siteRowState,
  siteRowStateLabelKey,
  siteRowStateToneClass,
  siteWriteErrorKey,
  sitesInDisplayOrder,
} from "../rules";

/**
 * @file Pure logic for the Sites screen. Every assertion here is about the ONE property that makes
 * this screen honest: a saved activate choice is never reported as a switch that happened.
 */

function siteFixture(overrides: Partial<AdminSiteListEntry> = {}): AdminSiteListEntry {
  return {
    name: "alpha",
    dir: "/repo/sites/alpha",
    displayName: "Alpha",
    createdAt: "2026-01-01T00:00:00.000Z",
    active: false,
    ...overrides,
  };
}

function snapshotFixture(overrides: Partial<AdminSitesSnapshot> = {}): AdminSitesSnapshot {
  return {
    switchingEnabled: true,
    sites: [siteFixture()],
    currentSite: { dir: "/repo/sites/alpha", name: "alpha", dirOverridden: false, listed: true },
    persistedSiteName: null,
    ...overrides,
  };
}

describe("siteRowState", () => {
  it("reports the row whose dir the server actually resolved as serving", () => {
    expect(siteRowState(siteFixture(), snapshotFixture())).toBe("serving");
  });

  it("reports a persisted-but-not-yet-live row as pending-restart, NEVER as serving", () => {
    const snapshot = snapshotFixture({ persistedSiteName: "beta" });
    expect(siteRowState(siteFixture({ name: "beta", dir: "/repo/sites/beta" }), snapshot)).toBe("pending-restart");
  });

  it("reports an untouched row as idle", () => {
    expect(siteRowState(siteFixture({ name: "beta", dir: "/repo/sites/beta" }), snapshotFixture())).toBe("idle");
  });

  it("matches on dir, not name — a same-named folder elsewhere is not what is being served", () => {
    const snapshot = snapshotFixture({
      currentSite: { dir: "/elsewhere/alpha", name: "alpha", dirOverridden: true, listed: false },
    });
    expect(siteRowState(siteFixture(), snapshot)).toBe("idle");
  });

  it("still reports serving when TOVU_SITE_DIR happens to point at a listed row's own directory", () => {
    const snapshot = snapshotFixture({
      currentSite: { dir: "/repo/sites/alpha", name: "alpha", dirOverridden: true, listed: true },
    });
    expect(siteRowState(siteFixture(), snapshot)).toBe("serving");
  });

  it("reports idle, NEVER pending-restart, for the persisted choice when TOVU_SITE_DIR overrides it — the badge must agree with the banner's own 'will not pick it up' warning, not run a second guess", () => {
    const snapshot = snapshotFixture({
      persistedSiteName: "beta",
      currentSite: { dir: "/elsewhere/alpha", name: "alpha", dirOverridden: true, listed: false },
    });
    expect(siteRowState(siteFixture({ name: "beta", dir: "/repo/sites/beta" }), snapshot)).toBe("idle");
  });
});

describe("siteRowState presentation", () => {
  it("never labels a pending row with the serving copy", () => {
    expect(siteRowStateLabelKey("pending-restart")).toBe("Queued for next restart");
    expect(siteRowStateLabelKey("serving")).toBe("Serving now");
    expect(siteRowStateLabelKey("idle")).toBe("Not in use");
  });

  it("gives pending a warning tone, not the ok tone that would read as 'switched'", () => {
    expect(siteRowStateToneClass("pending-restart")).toBe("status-warning");
    expect(siteRowStateToneClass("serving")).toBe("status-ok");
    expect(siteRowStateToneClass("idle")).toBe("status-neutral");
  });
});

describe("activationOutlook", () => {
  it("reports none when nothing is persisted", () => {
    expect(activationOutlook(snapshotFixture())).toEqual({ kind: "none" });
  });

  it("reports none when the persisted choice is already the live one — there is nothing to do", () => {
    expect(activationOutlook(snapshotFixture({ persistedSiteName: "alpha" }))).toEqual({ kind: "none" });
  });

  it("reports pending for a persisted choice awaiting a restart", () => {
    expect(activationOutlook(snapshotFixture({ persistedSiteName: "beta" }))).toEqual({ kind: "pending", name: "beta" });
  });

  it("reports pending-ignored when TOVU_SITE_DIR outranks the choice, so the copy cannot promise a switch", () => {
    const snapshot = snapshotFixture({
      persistedSiteName: "beta",
      currentSite: { dir: "/elsewhere/alpha", name: "alpha", dirOverridden: true, listed: false },
    });
    expect(activationOutlook(snapshot)).toEqual({ kind: "pending-ignored", name: "beta" });
  });
});

describe("sitesInDisplayOrder", () => {
  it("puts the served site first, then sorts the rest by name", () => {
    const snapshot = snapshotFixture({
      sites: [
        siteFixture({ name: "zeta", dir: "/repo/sites/zeta" }),
        siteFixture({ name: "alpha", dir: "/repo/sites/alpha" }),
        siteFixture({ name: "beta", dir: "/repo/sites/beta" }),
      ],
      currentSite: { dir: "/repo/sites/zeta", name: "zeta", dirOverridden: false, listed: true },
    });
    expect(sitesInDisplayOrder(snapshot).map((site) => site.name)).toEqual(["zeta", "alpha", "beta"]);
  });

  it("does not mutate the cached array it was handed", () => {
    const snapshot = snapshotFixture({
      sites: [siteFixture({ name: "zeta", dir: "/repo/sites/zeta" }), siteFixture()],
    });
    sitesInDisplayOrder(snapshot);
    expect(snapshot.sites.map((site) => site.name)).toEqual(["zeta", "alpha"]);
  });
});

describe("readSnapshot", () => {
  it("defaults switchingEnabled to FALSE before the first load, so nothing offers a write mid-load", () => {
    expect(readSnapshot(undefined)).toEqual({ sites: [], switchingEnabled: false, outlook: { kind: "none" } });
  });

  it("passes the loaded snapshot's own values through", () => {
    const view = readSnapshot(snapshotFixture({ persistedSiteName: "beta" }));
    expect(view.switchingEnabled).toBe(true);
    expect(view.outlook).toEqual({ kind: "pending", name: "beta" });
    expect(view.sites).toHaveLength(1);
  });
});

describe("siteNameErrorKey", () => {
  it("accepts a lowercase dashed name", () => {
    expect(siteNameErrorKey("my-second-site")).toBeNull();
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(siteNameErrorKey("")).toBe("Enter a folder name.");
    expect(siteNameErrorKey("   ")).toBe("Enter a folder name.");
  });

  it("rejects uppercase, spaces, and path separators", () => {
    expect(siteNameErrorKey("Bad Name!")).toBe("Use lowercase letters, digits, and dashes only.");
    expect(siteNameErrorKey("../escape")).toBe("Use lowercase letters, digits, and dashes only.");
  });

  it("rejects a name over 100 characters", () => {
    expect(siteNameErrorKey("a".repeat(101))).toBe("That name is too long (100 characters maximum).");
    expect(siteNameErrorKey("a".repeat(100))).toBeNull();
  });
});

describe("siteWriteErrorKey", () => {
  it("translates the capability refusal and the occupied-folder conflict", () => {
    expect(siteWriteErrorKey(new ApiError("nope", 403, "SITE_SWITCHING_DISABLED"))).toBe(
      "Site switching is turned off on this deployment.",
    );
    expect(siteWriteErrorKey(new ApiError("nope", 409, "SITE_ALREADY_EXISTS"))).toBe(
      "A folder with that name already exists under sites/.",
    );
  });

  it("defers to the shared fallback for any other failure", () => {
    expect(siteWriteErrorKey(new ApiError("boom", 500, "INTERNAL_ERROR"))).toBeNull();
    expect(siteWriteErrorKey(new Error("network down"))).toBeNull();
  });
});
