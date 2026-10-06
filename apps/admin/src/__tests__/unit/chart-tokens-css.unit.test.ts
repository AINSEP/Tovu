import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { effectiveDeclarationsFor } from "./css-declarations.test-helper";

/**
 * @file The admin feeds Jini's recharts components its own chart surface and ink tokens.
 *
 * Jini charts paint with `--jini-chart-*`, once falling back to `--jini-primary`, which this admin
 * never maps — so an assistant-drawn bar chart rendered Jini's near-black default, in dark mode too
 * ("the color is ugly", demo V3, 2026-10-05). The series colors are now Jini's default palette (this
 * admin's validated orange palette, promoted into Jini — owner 2026-10-05: "Claude orange should be
 * the default color"), so the admin no longer overrides them; it still maps the neutral tokens to its
 * own surface and ink. A pure-CSS invariant (jsdom resolves no custom properties), so it is asserted
 * as text over the stylesheet, like `narrow-content-column-css`.
 */
const stylesheet = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
const NEUTRAL_TOKENS = ["grid", "axis", "cursor", "surface", "text"].map((slot) => `--jini-chart-${slot}`);
const SERIES_TOKENS = ["1", "2", "3", "4", "5", "6"].map((slot) => `--jini-chart-${slot}`);

describe("admin chart tokens", () => {
  it.each([":root", ':root[data-theme="dark"]'])("maps every neutral chart token for %s", (selector) => {
    const declarations = effectiveDeclarationsFor(stylesheet, selector);
    for (const token of NEUTRAL_TOKENS) expect(declarations, token).toMatch(new RegExp(`${token}\\s*:`));
  });

  // An override here would shadow Jini's validated default palette (orange series 1, light + dark).
  it.each([":root", ':root[data-theme="dark"]'])("leaves the series colors to Jini's default palette for %s", (selector) => {
    const declarations = effectiveDeclarationsFor(stylesheet, selector);
    for (const token of SERIES_TOKENS) expect(declarations, token).not.toMatch(new RegExp(`${token}\\s*:`));
  });
});
