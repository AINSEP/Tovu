import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { effectiveDeclarationsFor } from "./css-declarations.test-helper";

/**
 * @file The Plugins page's Enable/Disable buttons share one width, so the eye and the button sit in
 * the same columns on every row instead of drifting by the label's width.
 */
const stylesheet = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("plugin row action width", () => {
  it("gives the Enable/Disable button a fixed minimum width", () => {
    const rule = effectiveDeclarationsFor(stylesheet, ".plugin-rows .plugin-row .plugin-row-actions > button:not(.plugin-icon-btn, .plugin-settings-btn)");
    expect(rule).toMatch(/min-width:\s*5\.5rem;/);
  });
});
