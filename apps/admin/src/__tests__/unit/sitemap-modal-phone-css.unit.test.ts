import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "postcss";
import { describe, expect, it } from "vitest";

/**
 * @file Regression: at 375px the sitemap modal's two-column table cut "Last modified" off at the
 * dialog's right edge. On phones each row now stacks its date under its URL. jsdom has no layout,
 * so this pins the rule text; the single-column result was checked in Chrome at 375px.
 */

const stylesCss = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

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

describe("sitemap modal on a phone", () => {
  it("stacks each row's cells into one column and drops the header row", () => {
    expect(phoneDeclarations(".sitemap-modal .list-table td")).toMatchObject({ display: "block" });
    expect(phoneDeclarations(".sitemap-modal .list-table tr")).toEqual({ display: "block" });
    expect(phoneDeclarations(".sitemap-modal .list-table thead")).toEqual({ display: "none" });
  });

  it("lets a long URL wrap instead of widening the column", () => {
    expect(phoneDeclarations(".sitemap-modal .list-table td")).toMatchObject({ "overflow-wrap": "anywhere" });
  });

  // Regression: each row's URL link was a text-height tap target (admin phone rule: >=44px).
  it("gives each row's URL link an invisible tap area at least 44px tall over its cell", () => {
    expect(phoneDeclarations(".sitemap-modal .list-table td:first-child a")).toEqual({ display: "block", position: "relative" });
    expect(phoneDeclarations(".sitemap-modal .list-table td:first-child a::after")).toMatchObject({
      content: '""',
      position: "absolute",
      top: "calc(-1 * var(--space-3))",
      left: "calc(-1 * var(--space-4))",
      right: "calc(-1 * var(--space-4))",
      "min-height": "44px",
    });
  });
});
