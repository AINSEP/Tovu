import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

/** The editors' "Cookie banner hidden in preview…" note sat flush against the preview card's edge
 *  (Posts: inside the bordered pane with no padding; Pages: no gap above the frame). jsdom drops
 *  shorthands that carry a `var()`, so this reads the declared rules rather than computed styles. */
function declaredRule(selector: string): string {
  const style = document.createElement("style");
  style.textContent = readFileSync(resolve(process.cwd(), "src/styles/editor.css"), "utf8");
  document.head.append(style);
  try {
    const rule = [...style.sheet!.cssRules].find((r) => (r as CSSStyleRule).selectorText === selector);
    return rule?.cssText ?? "";
  } finally { style.remove(); }
}

it("pads the Posts preview note inside the bordered pane and rules it off from the frame", () => {
  const rule = declaredRule(".post-editor-pane > .editor-preview-note");
  expect(rule).toMatch(/padding: var\(--space-2\) var\(--space-3\)/);
  expect(rule).toMatch(/border-bottom: 1px solid var\(--border\)/);
});

it("gives the Pages preview note a gap above the separately bordered frame", () => {
  expect(declaredRule(".page-preview-surface > .editor-preview-note")).toMatch(/margin-bottom: var\(--space-2\)/);
});
