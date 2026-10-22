import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "postcss";
import { expect, it } from "vitest";

/**
 * @file Regression (2026-10-18): in a 390px Chat settings dialog the Tool calls pill wrapped onto
 * two rows and each switch's ⓘ sat 11px below its label. The ≤640px phone floor in styles.css
 * gives every `[role="button"]` inside `.jini-dialog` a 44×44 minimum, ⓘ icons included. jsdom has
 * no layout, so this pins the rule text; the result (one-row pill, 18px icons) was measured in
 * Chrome with the dialog forced to 390px. Radio groups now carry one ⓘ beside their legend (and the
 * gear's heading) rather than one per option, so those selectors replace the per-option ones.
 */

const css = readFileSync(resolve(process.cwd(), "src/styles/assistant.css"), "utf8");

/** Declarations of `selector` inside the at-rule whose params equal `params`, last one winning. */
function declarationsIn(params: string, selector: string): Record<string, string> {
  const declarations: Record<string, string> = {};
  parse(css).walkRules((rule) => {
    const parent = rule.parent;
    if (parent?.type !== "atrule" || (parent as unknown as { params: string }).params !== params) return;
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls((decl) => { declarations[decl.prop] = decl.value; });
  });
  return declarations;
}

const MEDIA = "(pointer: coarse), (max-width: 640px)";

it.each([
  ".jini-dialog .jini-chat-settings-legend .info-tip-icon[role=\"button\"]",
  ".jini-dialog .jini-chat-settings-label-row > .info-tip .info-tip-icon[role=\"button\"]",
])("lifts the 44px phone floor off %s", (selector) => {
  expect(declarationsIn(MEDIA, selector)).toEqual({ "min-width": "0", "min-height": "0" });
});

it.each([
  ".jini-chat-settings-legend .info-tip-icon::before",
  ".dock-settings-menu-heading-row .info-tip-icon::before",
])("keeps the invisible 44px hit area on %s at phone width, not only on coarse pointers", (selector) => {
  expect(declarationsIn(MEDIA, selector)).toMatchObject({ inset: "-13px" });
});
