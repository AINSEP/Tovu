import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { effectiveDeclarationsFor } from "./css-declarations.test-helper";

/**
 * @file Jini's admin-widgets `Select` panel follows this admin's surface, not Jini's grey default.
 *
 * The portaled `.select-panel` (and its search box) paint with `--jini-bg-elevated`, which this
 * admin never maps globally, so it resolved to Jini's #f5f5f5 under a white page (owner
 * 2026-10-16: "It should be white, right?"). A pure-CSS invariant (jsdom resolves no custom
 * properties), asserted as text over the stylesheet like `chart-tokens-css`.
 */
const stylesheet = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("Select panel surface tokens", () => {
  it("re-points the panel's Jini surface and text tokens at the admin's own", () => {
    const declarations = effectiveDeclarationsFor(stylesheet, ".select-panel.select-panel");
    expect(declarations).toContain("--jini-bg-elevated: var(--surface);");
    expect(declarations).toContain("--jini-bg-subtle: var(--surface-2);");
    expect(declarations).toContain("--jini-text: var(--fg);");
  });
});
