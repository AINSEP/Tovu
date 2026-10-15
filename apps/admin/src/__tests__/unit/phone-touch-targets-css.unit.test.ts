import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "postcss";
import { describe, expect, it } from "vitest";

/**
 * @file Regression (90f04f64a): the phone floor gave buttons a 40px `min-height` at a higher
 * specificity than Media's 44px action buttons, so it pulled them down to 40 on phones; modal
 * dialogs render in <body>, outside `.admin-content`, and got no floor at all (35-37px). jsdom has
 * no layout, so this pins the rule text; the 44px result was measured in Chrome at 375px.
 */

const stylesCss = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
const SCOPE = ":is(.admin-content, .jini-dialog)";

/** Declarations of `selector` inside `@media (max-width: 640px)`, last one winning. */
function phoneDeclarations(selector: string): Record<string, string> {
  const declarations: Record<string, string> = {};
  parse(stylesCss).walkRules((rule) => {
    const parent = rule.parent;
    if (parent?.type !== "atrule" || (parent as unknown as { params: string }).params !== "(max-width: 640px)") return;
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls((decl) => { declarations[decl.prop] = decl.value; });
  });
  return declarations;
}

describe("phone touch targets are 44px", () => {
  it("floors every button-like control in the page body and in dialogs at 44px tall", () => {
    const selector = `${SCOPE} :is(button, select, summary, [role="button"], a.btn-primary, a.btn-secondary, a.btn-ghost):not([role="switch"])`;
    expect(phoneDeclarations(selector)).toEqual({ "min-height": "44px" });
  });

  it("floors buttons at 44px wide", () => {
    expect(phoneDeclarations(`${SCOPE} :is(button, [role="button"]):not([role="switch"])`)).toEqual({ "min-width": "44px" });
  });

  it("gives text fields the same 44px floor so a field and its button stay one height", () => {
    const selector = `${SCOPE} input:not([type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"], [type="hidden"])`;
    expect(phoneDeclarations(selector)).toEqual({ "min-height": "44px" });
  });

  // Regression: the ring was `inset: -10px -4px`, which from the 36x20 / 34x20 padding boxes left
  // both switches 40px tall (measured 38x22 visible track at 375px on Add-ons). The AI Assistant
  // visitor switch (also a 36x20 padding box) had no ring at all until it joined the same list.
  it("rings the pill switches with an invisible hit area at least 44px each way", () => {
    const ring = phoneDeclarations(':is(.agent-plugin-switch, .theme-explore-switch, .assistant-toggle--switch input[role="switch"])::before');
    expect(ring).toEqual({ content: '""', position: "absolute", inset: "-12px -5px" });
    const [block, inline] = ring.inset!.split(" ").map((value) => -Number.parseFloat(value));
    // Smallest padding box the ring wraps: the theme-explore switch's 34x20.
    expect(20 + 2 * block!).toBeGreaterThanOrEqual(44);
    expect(34 + 2 * inline!).toBeGreaterThanOrEqual(44);
  });
});
