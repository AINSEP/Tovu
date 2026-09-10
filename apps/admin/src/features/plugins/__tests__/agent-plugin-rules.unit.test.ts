import { describe, expect, it } from "vitest";

import { agentPluginGlyphKind, agentPluginToggleAriaLabel, humanizeAgentPluginId } from "../rules";

/**
 * @file The Agent Plugins row's two pure derivations — which glyph identifies a package, and how
 * its id becomes a display name. Both are `rules.ts` functions with no React, so they are tested
 * directly rather than through a render (`posts/rules.ts` convention).
 *
 * These exist because the redesign asked for per-plugin icons "so each row is identifiable at a
 * glance". That is only true if two different packages get two different glyphs — which is the one
 * property a render test would happily pass while failing, since it would see two icons either way.
 */

/** Only the three fields `agentPluginGlyphKind` reads. */
function pkg(pluginId: string, keywords: string[] = [], skills: string[] = []) {
  return { pluginId, keywords, skills: skills.map((name) => ({ name })) };
}

describe("agentPluginGlyphKind", () => {
  it("gives the three really-installed packages three DIFFERENT glyphs", () => {
    // The real installed set, with the fields `AGENT_PLUGINS_LIST` actually reports for each
    // (verified against the live route, 2026-09-09). Asserted as a set, not one at a time: the
    // requirement is that they can be told apart, and three identical-but-correct-looking glyphs
    // would satisfy three separate equality assertions.
    const kinds = [
      agentPluginGlyphKind(pkg("site-compliance", ["compliance", "privacy", "gdpr", "accessibility", "wcag"], ["site-compliance"])),
      agentPluginGlyphKind(pkg("tovu-deploy-fly", ["deploy", "fly.io", "hosting"], ["tovu-deploy-fly"])),
      agentPluginGlyphKind(pkg("ui-ux-design", [], ["frontend-accessibility", "interface-design", "shadcn-ui", "ui-ux-design"])),
    ];

    expect(kinds).toEqual(["compliance", "deploy", "design"]);
    expect(new Set(kinds).size).toBe(3);
  });

  it("prefers the package's own id over a skill it merely bundles", () => {
    // The regression this tiering exists for: `ui-ux-design` bundles a `frontend-accessibility`
    // skill, and a flat one-bag match classified it as a COMPLIANCE package — the same shield as
    // `site-compliance`, on the two rows the list most needs to tell apart.
    expect(agentPluginGlyphKind(pkg("ui-ux-design", [], ["frontend-accessibility"]))).toBe("design");
    // ...and the tier below the id still works when the id itself says nothing.
    expect(agentPluginGlyphKind(pkg("acme-toolkit", ["accessibility"], []))).toBe("compliance");
    expect(agentPluginGlyphKind(pkg("acme-toolkit", [], ["frontend-accessibility"]))).toBe("compliance");
  });

  it("falls back to the generic package glyph rather than guessing a category", () => {
    expect(agentPluginGlyphKind(pkg("acme-widget", ["widgets", "things"], ["do-stuff"]))).toBe("package");
    expect(agentPluginGlyphKind(pkg("x", [], []))).toBe("package");
  });

  it("matches whole words only, so an id that merely contains a keyword is not miscategorised", () => {
    // "guide" contains "ui"; "shipping" contains "ship"; neither is a design or deploy package.
    expect(agentPluginGlyphKind(pkg("style-guide", [], []))).toBe("package");
    expect(agentPluginGlyphKind(pkg("shipping-labels", [], []))).toBe("package");
  });
});

describe("humanizeAgentPluginId", () => {
  it("title-cases word segments", () => {
    expect(humanizeAgentPluginId("site-compliance")).toBe("Site Compliance");
  });

  it("uppercases acronym segments instead of title-casing them", () => {
    // Rendered as "Ui Ux Design" before this, on the one screen whose job is recognizing a package
    // at a glance.
    expect(humanizeAgentPluginId("ui-ux-design")).toBe("UI UX Design");
    expect(humanizeAgentPluginId("mcp-bridge")).toBe("MCP Bridge");
    expect(humanizeAgentPluginId("seo-api-tools")).toBe("SEO API Tools");
  });

  it("does not uppercase a word that merely starts with an acronym's letters", () => {
    expect(humanizeAgentPluginId("uid-generator")).toBe("Uid Generator");
    expect(humanizeAgentPluginId("apiary-sync")).toBe("Apiary Sync");
  });

  it("returns the hand-curated override for tovu-deploy-fly instead of the id-derived title-case", () => {
    // Owner correction, 2026-09-10: the id-derived "Tovu Deploy Fly" neither led with nor spelled
    // the actual product (Fly.io) this plugin deploys to.
    expect(humanizeAgentPluginId("tovu-deploy-fly")).toBe("Fly.io Deploy");
  });

  it("leaves an id resembling but not matching an override to the generic transform", () => {
    expect(humanizeAgentPluginId("tovu-deploy-fly-v2")).toBe("Tovu Deploy Fly V2");
  });
});

describe("agentPluginToggleAriaLabel", () => {
  it("names the target action and the plugin, so two rows' switches are distinguishable", () => {
    expect(agentPluginToggleAriaLabel({ pluginId: "site-compliance", enabled: true }, "en")).toBe("Disable Site Compliance");
    // The overridden display name, not the id-derived "Tovu Deploy Fly" — see
    // `humanizeAgentPluginId`'s own override map.
    expect(agentPluginToggleAriaLabel({ pluginId: "tovu-deploy-fly", enabled: false }, "en")).toBe("Enable Fly.io Deploy");
  });

  it("uses the locale's own verb", () => {
    expect(agentPluginToggleAriaLabel({ pluginId: "site-compliance", enabled: true }, "es")).toBe("Desactivar Site Compliance");
  });
});
