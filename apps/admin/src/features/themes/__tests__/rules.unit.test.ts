import { describe, expect, it } from "vitest";

import { NO_THEME_ID, type PresentationSettings } from "@/lib/api";
import {
  defaultThemeTabGroup,
  groupThemesByTabGroup,
  isActiveTheme,
  isStrandedActiveTheme,
  isThemeDisabled,
  THEME_TAB_GROUPS,
  themeTabGroup,
  themeTier,
} from "../rules";

/**
 * @file Pure-logic coverage for `features/themes/rules.ts` — the active-theme status
 * derivation driving both a theme card's `.active` class and its Active-tag-vs-Activate-button
 * branch. `features/themes` was 3.6% covered with no dedicated test file before this pass.
 */

const SETTINGS: PresentationSettings = {
  workspaceId: "w1",
  activeThemeId: "signal",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("isActiveTheme", () => {
  it("is true for the currently active theme", () => {
    expect(isActiveTheme(SETTINGS, "signal")).toBe(true);
  });

  it("is false for any other theme", () => {
    expect(isActiveTheme(SETTINGS, "column")).toBe(false);
    expect(isActiveTheme(SETTINGS, "tovu-official")).toBe(false);
  });
});

describe("isStrandedActiveTheme", () => {
  it("is false when the active theme id is present in the discovered set", () => {
    expect(isStrandedActiveTheme(SETTINGS, ["tovu-official", "column", "signal"])).toBe(false);
  });

  it("is true when the active theme id resolves to nothing the server discovered — the stranded case", () => {
    expect(isStrandedActiveTheme(SETTINGS, ["tovu-official", "column"])).toBe(true);
  });

  it("is true against an empty theme catalogue (every theme id would be stranded)", () => {
    expect(isStrandedActiveTheme(SETTINGS, [])).toBe(true);
  });

  it("is false for an empty activeThemeId — nothing chosen yet is not the same as chosen-but-missing", () => {
    expect(isStrandedActiveTheme({ ...SETTINGS, activeThemeId: "" }, ["tovu-official"])).toBe(false);
  });
});

describe("themeTier", () => {
  it("returns the mapped tier for a known theme id", () => {
    expect(themeTier("basic", { basic: "static" })).toBe("static");
  });

  it("falls back to declarative for an id absent from the map — same as theme.json's own absent-tier default", () => {
    expect(themeTier("some-unknown-theme", {})).toBe("declarative");
    expect(themeTier("some-unknown-theme", { basic: "static" })).toBe("declarative");
  });
});

describe("themeTabGroup", () => {
  it("folds handlebars into the same 'templated' group as templated — a UI-only merge, ThemeTier itself keeps five values", () => {
    expect(themeTabGroup("h1", { h1: "handlebars" })).toBe("templated");
    expect(themeTabGroup("t1", { t1: "templated" })).toBe("templated");
  });

  it("maps declarative, static, and code 1:1", () => {
    expect(themeTabGroup("d1", { d1: "declarative" })).toBe("declarative");
    expect(themeTabGroup("s1", { s1: "static" })).toBe("static");
    expect(themeTabGroup("c1", { c1: "code" })).toBe("code");
  });
});

describe("groupThemesByTabGroup", () => {
  it("buckets every theme id under its tab group, in the four-group tab order", () => {
    const grouped = groupThemesByTabGroup(
      ["basic", "tovu-official", "gracious-timing"],
      { basic: "static", "gracious-timing": "static" },
    );
    expect(Object.keys(grouped)).toEqual([...THEME_TAB_GROUPS]);
    expect(grouped.static).toEqual(["basic", "gracious-timing"]);
    expect(grouped.declarative).toEqual(["tovu-official"]);
  });

  it("merges handlebars-tier and templated-tier themes into the same 'templated' bucket", () => {
    const grouped = groupThemesByTabGroup(
      ["hbs-theme", "liquid-theme"],
      { "hbs-theme": "handlebars", "liquid-theme": "templated" },
    );
    expect(grouped.templated).toEqual(["hbs-theme", "liquid-theme"]);
  });

  it("gives every group an array, including ones with zero themes — the empty-tab requirement", () => {
    const grouped = groupThemesByTabGroup(["signal"], {});
    expect(grouped.code).toEqual([]);
    expect(grouped.templated).toEqual([]);
  });

  it("only produces four groups, not five — handlebars/templated never get separate keys", () => {
    const grouped = groupThemesByTabGroup([], {});
    expect(Object.keys(grouped)).toHaveLength(4);
    expect(Object.keys(grouped)).not.toContain("handlebars");
  });
});

describe("defaultThemeTabGroup", () => {
  it("resolves to the active theme's own tab group", () => {
    expect(defaultThemeTabGroup(SETTINGS, { signal: "static" })).toBe("static");
  });

  it("resolves a handlebars-tier active theme to the merged 'templated' group", () => {
    expect(defaultThemeTabGroup(SETTINGS, { signal: "handlebars" })).toBe("templated");
  });

  it("falls back to declarative when the active theme has no mapped tier", () => {
    expect(defaultThemeTabGroup(SETTINGS, {})).toBe("declarative");
  });
});

describe("the no-theme sentinel", () => {
  const themeOff: PresentationSettings = { ...SETTINGS, activeThemeId: NO_THEME_ID };
  const installed = ["basic", "signal"];

  it("pins the exact literal the server uses — apps/admin mirrors it by hand", () => {
    // `apps/website/src/features/theme/active-theme.ts` owns the canonical `NO_THEME_ID` and pins
    // the same literal in its own suite. A browser bundle cannot import server internals, so this
    // value is mirrored; these two assertions are what stop the mirror from silently splitting.
    expect(NO_THEME_ID).toBe("none");
  });

  it("reads as deliberately themeless", () => {
    expect(isThemeDisabled(themeOff)).toBe(true);
  });

  it("does NOT read as deliberately themeless for an ordinary theme, or for an unwritten row", () => {
    expect(isThemeDisabled(SETTINGS)).toBe(false);
    expect(isThemeDisabled({ ...SETTINGS, activeThemeId: "" })).toBe(false);
  });

  it("is not reported as a stranded theme — the operator chose it", () => {
    // The sentinel is never in `themes` either (it is not a theme), so without an explicit guard
    // every deliberately-themeless site would raise the "your site cannot render" warning.
    expect(isStrandedActiveTheme(themeOff, installed)).toBe(false);
  });

  it("a genuinely stranded theme is STILL reported — the guard must not blanket-suppress", () => {
    expect(isStrandedActiveTheme({ ...SETTINGS, activeThemeId: "deleted-theme" }, installed)).toBe(true);
  });

  it("opens on the first tab, and does so independently of what `themeTiers` says about the sentinel", () => {
    // With an empty `themeTiers` this is indistinguishable from the accidental path: `themeTier`
    // defaults an unknown id to "declarative", which is also `THEME_TAB_GROUPS[0]` today. They
    // coincide — which is exactly the kind of coincidence this whole feature exists to stop relying
    // on, so the second case below supplies a `themeTiers` entry for the sentinel (a theme folder
    // literally named `none` would produce one) and pins the difference.
    expect(defaultThemeTabGroup(themeOff, {})).toBe(THEME_TAB_GROUPS[0]);

    const shadowed = { [NO_THEME_ID]: "code" } as const;
    expect(themeTabGroup(NO_THEME_ID, shadowed)).toBe("code");
    expect(defaultThemeTabGroup(themeOff, shadowed)).toBe(THEME_TAB_GROUPS[0]);
  });
});
