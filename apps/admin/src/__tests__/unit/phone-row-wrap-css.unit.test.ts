import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { effectiveDeclarationsFor } from "./css-declarations.test-helper";

/**
 * @file Two phone-width wrap fixes (owner 2026-10-16), asserted as stylesheet text like
 * `select-panel-surface-css` (jsdom does no container queries or layout).
 */
const stylesheet = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("phone row wrapping", () => {
  it("sizes a plugin row's summary to its own text, so three actions wrap under it instead of squeezing the name", () => {
    expect(effectiveDeclarationsFor(stylesheet, ".plugin-row-summary")).toContain("flex-basis: auto;");
  });

  it("starts the open toolbar's character count at the left, clear of the floating chat button", () => {
    expect(effectiveDeclarationsFor(stylesheet, '.editor-toolbar[data-more-open="true"] .editor-toolbar-count')).toContain("margin-left: 0;");
  });
});
