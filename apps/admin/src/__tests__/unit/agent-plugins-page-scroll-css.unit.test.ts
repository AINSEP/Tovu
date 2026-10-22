import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * @file AP-3: the Agent Plugins page is one scroller at every width (owner report, 2026-10-21: the
 * Installed list was cut off around "Render" on desktop). The release used to sit inside the phone
 * media query only, so jsdom-free CSS text is the observable: the rule must be top level.
 */

/** From `process.cwd()` for the reason `sidebar-accordion-css.unit.test.ts` gives. */
const stylesheet = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Each rule's selector and body, with the brace depth it opens at (0 = not inside an at-rule). */
function rulesWithDepth(css: string): { selector: string; body: string; depth: number }[] {
  const rules: { selector: string; body: string; depth: number }[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < css.length; index += 1) {
    if (css[index] === "{") {
      const close = css.indexOf("}", index);
      const nextOpen = css.indexOf("{", index + 1);
      if (nextOpen === -1 || close < nextOpen) rules.push({ selector: css.slice(start, index).trim(), body: css.slice(index + 1, close), depth });
      depth += 1;
      start = index + 1;
    } else if (css[index] === "}") {
      depth -= 1;
      start = index + 1;
    }
  }
  return rules;
}

describe("Agent Plugins page scroll (AP-3)", () => {
  it("releases the shell's nested scroller at every width, not only on phones", () => {
    const release = rulesWithDepth(stylesheet).filter(
      (rule) => rule.selector.includes(".agent-plugins-section .jini-tabbed-dialog-content") && /overflow:\s*visible/.test(rule.body),
    );

    expect(release.map((rule) => rule.depth)).toEqual([0]);
  });

  it("adds no second bottom clearance to the page-flow list", () => {
    const clearance = rulesWithDepth(stylesheet).filter((rule) => rule.selector.includes(":not(.settings-ui-section--page-flow)"));

    expect(clearance.length).toBeGreaterThan(0);
    for (const rule of clearance) expect(rule.selector).toContain(".agent-plugins-section)");
  });
});
