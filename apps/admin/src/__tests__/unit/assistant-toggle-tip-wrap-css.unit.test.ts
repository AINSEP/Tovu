import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "postcss";
import { describe, expect, it } from "vitest";

/**
 * @file Regression (ui-46, 2026-10-15): at 375px the ⓘ after "Enable the AI assistant on the
 * public site" (and "Allow the admin assistant to spawn subagents") dropped onto a line of its own.
 * The 44px phone floor made the ⓘ wider than the room left beside the label, and the label-to-ⓘ
 * join was breakable. jsdom has no layout, so this pins the rule text; the result (ⓘ beside the
 * final word, one-line rows 40px tall) was measured in Chrome at 375px.
 */

const css = readFileSync(resolve(process.cwd(), "src/features/ai-assistant/ai-assistant.css"), "utf8");

/** Declarations of `selector` inside `@media (max-width: 640px)`, last one winning. */
function phoneDeclarations(selector: string): Record<string, string> {
  const declarations: Record<string, string> = {};
  parse(css).walkRules((rule) => {
    const parent = rule.parent;
    if (parent?.type !== "atrule" || (parent as unknown as { params: string }).params !== "(max-width: 640px)") return;
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls((decl) => { declarations[decl.prop] = decl.value; });
  });
  return declarations;
}

describe("AI Assistant toggle rows keep the ⓘ beside the label on phones", () => {
  it("makes the label-to-ⓘ join unbreakable while the label itself still wraps", () => {
    expect(phoneDeclarations(".assistant-toggle-copy")["white-space"]).toBe("nowrap");
    expect(phoneDeclarations(".assistant-toggle-copy > label")["white-space"]).toBe("normal");
  });

  it("takes the ⓘ's 44px hit area back to its icon size in the layout", () => {
    expect(phoneDeclarations(".assistant-toggle-copy > .info-tip > .info-tip-icon")).toEqual({ margin: "calc((1.1rem - 44px) / 2)" });
  });

  it("uses a 20px line so a wrapped label is not spaced 40px apart", () => {
    expect(phoneDeclarations(".assistant-toggle-copy")).toMatchObject({ "line-height": "20px", "min-height": "40px", "padding-block": "10px" });
  });

  it("takes the 44px floor's slack out of each visitor step head", () => {
    expect(phoneDeclarations(".visitor-step-head > :is(.info-tip, select)")).toEqual({ "margin-block": "calc((1.5rem - 44px) / 2)" });
  });
});
