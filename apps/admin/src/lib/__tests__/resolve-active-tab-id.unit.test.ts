import { describe, expect, it } from "vitest";
import { resolveActiveTabId } from "../resolve-active-tab-id";

/**
 * @file Covers the guard extracted from `Database.tsx`/`Security.tsx`/`SourceControl.tsx`/
 * `Deployment.tsx`/`Themes.tsx`'s five near-identical `resolveActiveTabId` functions. Each
 * screen's own component test still asserts the same behavior end-to-end through its `tabId`
 * prop (e.g. `Database.unit.test.tsx`'s "falls back to Timeline for an unrecognized tabId") —
 * these are the direct, DI-free unit assertions on the shared guard itself.
 */
describe("resolveActiveTabId", () => {
  const TAB_IDS = ["timeline", "restore-points", "migrate-forward"] as const;

  it("returns the requested tab id when it is a member of validIds", () => {
    expect(resolveActiveTabId("restore-points", TAB_IDS, "timeline")).toBe("restore-points");
  });

  it("falls back to defaultId when tabId is null", () => {
    expect(resolveActiveTabId(null, TAB_IDS, "timeline")).toBe("timeline");
  });

  it("falls back to defaultId when tabId is undefined", () => {
    expect(resolveActiveTabId(undefined, TAB_IDS, "timeline")).toBe("timeline");
  });

  it("falls back to defaultId when tabId is the empty string", () => {
    expect(resolveActiveTabId("", TAB_IDS, "timeline")).toBe("timeline");
  });

  it("falls back to defaultId for an unrecognized tabId (stale link or typo)", () => {
    expect(resolveActiveTabId("bogus", TAB_IDS, "timeline")).toBe("timeline");
  });

  it("supports a single-entry validIds list (SourceControl/Security's one-tab shape)", () => {
    const ONE_TAB = ["providers"] as const;
    expect(resolveActiveTabId("providers", ONE_TAB, "providers")).toBe("providers");
    expect(resolveActiveTabId("not-a-real-tab", ONE_TAB, "providers")).toBe("providers");
  });

  it("supports a caller-computed dynamic default (Themes' defaultThemeTabGroup shape)", () => {
    const THEME_TABS = ["free", "premium", "marketplace"] as const;
    // Themes.tsx computes its default at the call site, not from a fixed constant — proving the
    // function itself stays agnostic to how the caller derived defaultId.
    const dynamicallyComputedDefault = "premium";
    expect(resolveActiveTabId("bogus", THEME_TABS, dynamicallyComputedDefault)).toBe("premium");
    expect(resolveActiveTabId("free", THEME_TABS, dynamicallyComputedDefault)).toBe("free");
  });
});
