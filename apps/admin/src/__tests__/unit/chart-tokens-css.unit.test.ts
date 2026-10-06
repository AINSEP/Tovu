import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { effectiveDeclarationsFor } from "./css-declarations.test-helper";

/**
 * @file The admin feeds Jini's recharts components its own chart palette.
 *
 * Jini charts paint with `--jini-chart-*`, falling back to `--jini-primary`, which this admin never
 * maps — so an assistant-drawn bar chart rendered Jini's near-black default, in dark mode too
 * ("the color is ugly", demo V3, 2026-10-05). A pure-CSS invariant (jsdom resolves no custom
 * properties), so it is asserted as text over the stylesheet, like `narrow-content-column-css`.
 */
const stylesheet = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
const CHART_TOKENS = ["1", "2", "3", "4", "5", "6", "grid", "axis", "cursor", "surface", "text"].map((slot) => `--jini-chart-${slot}`);

describe("admin chart tokens", () => {
  it("anchors the first series on the admin accent (the assistant button's --primary) in light mode", () => {
    expect(effectiveDeclarationsFor(stylesheet, ":root")).toMatch(/--jini-chart-1\s*:\s*var\(--primary\)\s*;/);
  });

  it.each([":root", ':root[data-theme="dark"]'])("declares every chart token for %s", (selector) => {
    const declarations = effectiveDeclarationsFor(stylesheet, selector);
    for (const token of CHART_TOKENS) expect(declarations, token).toMatch(new RegExp(`${token}\\s*:`));
  });
});
