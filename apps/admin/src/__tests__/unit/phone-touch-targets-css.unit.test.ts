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
});
