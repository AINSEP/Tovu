import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { effectiveDeclarationsFor } from "./css-declarations.test-helper";

/**
 * @file The sidebar showed "Sites (luvira)" twice after any route change (owner, 2026-10-08): the
 * hide rule keyed on a JS-added `cms-sites-item` row class, and React rewrites the shared row's
 * className whenever its active state flips. Stylesheet guard like `selection-ring-css.unit.test.ts`;
 * jsdom resolves no cascade, so the live check was done in Chrome.
 */

/** From `process.cwd()` for the reason `sidebar-accordion-css.unit.test.ts` gives. */
const stylesheet = readFileSync(resolve(process.cwd(), "src", "styles.css"), "utf8");

describe("Sites sidebar split label", () => {
  it("clips the shared full label whenever the split visual label is present, keyed on markup not a row class", () => {
    expect(effectiveDeclarationsFor(stylesheet, ".cms-item:has(> span.cms-sites-label) > span:first-of-type")).toBe(
      "position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;",
    );
    expect(effectiveDeclarationsFor(stylesheet, ".cms-item:has(> span.cms-sites-label)")).toBe("flex-wrap: nowrap;");
  });

  it("no rule depends on a class the React-rendered row cannot keep", () => {
    expect(stylesheet).not.toMatch(/cms-sites-item/);
  });

  it("lays the split label out at a specificity the collapsed rail's clip rule still beats", () => {
    expect(effectiveDeclarationsFor(stylesheet, ".cms-item > span.cms-sites-label")).toBe(
      "display: flex; flex: 1 1 0; min-width: 0; white-space: nowrap;",
    );
    expect(effectiveDeclarationsFor(stylesheet, ".cms-nav.is-rail .cms-item > span")).toMatch(/clip: rect\(0, 0, 0, 0\);/);
  });
});
