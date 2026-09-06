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

  /**
   * Regression coverage (2026-09-05 Gemini audit finding 17). `defaultId` is caller-supplied, same
   * as `tabId` — but unlike `tabId`, it was never checked against `validIds` before being returned.
   * The five fixed-constant callers (`Database.tsx` et al.) get this for free at compile time:
   * `resolveActiveTabId<T>`'s generic infers `T` from a literal `as const` tuple, so a typo'd
   * default there is a TypeScript error. `Themes.tsx`'s `resolveThemesActiveTabId` is the one
   * caller with a dynamically COMPUTED default (`defaultThemeTabGroup(settings, themeTiers)`) and
   * widens `validTabIds` to plain `readonly string[]` to hold it — `T` infers as `string` there, so
   * a `defaultThemeTabGroup`/`THEME_TAB_GROUPS` drift that produced an id absent from
   * `THEME_TAB_GROUPS` would type-check cleanly and silently return that invalid id at runtime.
   * Traced live (2026-09-05): today's `TIER_TAB_GROUP` covers every `ThemeTier` and always resolves
   * into `THEME_TAB_GROUPS`, so this is not currently triggered by any real caller — a real gap for
   * a future one, not an active bug. This test exercises the gap directly, independent of whether
   * any caller can reach it today.
   */
  it("falls back to the first entry of validIds — not the invalid defaultId itself — when defaultId is not a member of validIds", () => {
    const invalidDefault = "not-a-real-tab" as (typeof TAB_IDS)[number];
    expect(resolveActiveTabId(null, TAB_IDS, invalidDefault)).toBe("timeline");
    expect(resolveActiveTabId("bogus", TAB_IDS, invalidDefault)).toBe("timeline");
    // A genuinely valid requested tabId still wins over a broken default — this guard only ever
    // touches the fallback path, never the caller's real, recognized request.
    expect(resolveActiveTabId("restore-points", TAB_IDS, invalidDefault)).toBe("restore-points");
  });
});
