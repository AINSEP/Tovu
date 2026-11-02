import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * @file Edit post / Edit page header layout (`styles/editor.css`, `.content-editor-*`), owner bugs
 * 11-01. jsdom computes no layout and drops `@container` rules, so this reads the declared rules
 * out of the stylesheet text; the real check is the Chrome look at 375px and desktop.
 */
const CSS = readFileSync(resolve(process.cwd(), "src/styles/editor.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Every `@container admin-content (<query>) { … }` block body for the query, joined. */
function containerBlocks(query: string): string {
  return atRuleBlocks(`@container admin-content (${query})`);
}

/** Every `<prelude> { … }` block body (e.g. `@media (max-width: 640px)`), joined. */
function atRuleBlocks(prelude: string): string {
  const bodies: string[] = [];
  let from = 0;
  for (;;) {
    const start = CSS.indexOf(prelude, from);
    if (start < 0) return bodies.join("\n");
    let depth = 0;
    let index = CSS.indexOf("{", start);
    const open = index;
    for (; index < CSS.length; index++) {
      if (CSS[index] === "{") depth++;
      if (CSS[index] === "}" && --depth === 0) break;
    }
    bodies.push(CSS.slice(open + 1, index));
    from = index;
  }
}

/** The declarations of `selector`'s rule inside `block` (exact selector text), or "". */
function declarations(block: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
  return new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`).exec(block)?.[1] ?? "";
}

describe("phone pane: the settings gear stays on the action row", () => {
  const phone = containerBlocks("max-width: 620px");

  it("lets the status/Publish/Save/Delete group shrink and wrap inside itself instead of pushing the gear to its own row", () => {
    const group = declarations(phone, ".content-action-row > .content-action-group");
    expect(group).toMatch(/flex:\s*1 1 0/);
    expect(group).toMatch(/flex-wrap:\s*wrap/);
  });

  it("tightens the group's buttons so Draft + Publish + Save + Delete + gear fit one 375px row", () => {
    expect(declarations(phone, ".content-action-group > button")).toMatch(/padding-inline:\s*9px/);
    expect(declarations(phone, ".page > .editor-action-row.content-action-row")).toMatch(/column-gap:\s*var\(--space-2\)/);
  });

  it("puts the Saved / error message on its own line above the buttons so it never splits the group from the gear", () => {
    const message = declarations(phone, ".content-action-row > .save-ok, .content-action-row > .save-error");
    expect(message).toMatch(/order:\s*-1/);
    expect(message).toMatch(/flex-basis:\s*100%/);
  });

  it("keeps the gear on the group's last line, where the collapsed Preview control sits", () => {
    expect(declarations(phone, ".content-action-row > .post-settings-trigger")).toMatch(/align-self:\s*flex-end/);
  });
});

describe("desktop pane: the slug box is as wide as the slug", () => {
  it("keeps the content-sized slug input (capped at 16rem) instead of a fixed 16rem box", () => {
    const desktop = containerBlocks("min-width: 621px");
    const input = declarations(desktop, ".content-editor-header > .editor-slug input");
    expect(input).not.toMatch(/field-sizing:\s*fixed/);
    expect(input).not.toMatch(/width:\s*var\(--editor-slug-max-width\)/);
    const base = declarations(CSS, ".content-editor-header > .editor-slug input");
    expect(base).toMatch(/field-sizing:\s*content/);
    expect(base).toMatch(/max-width:\s*min\(100%, var\(--editor-slug-max-width\)\)/);
  });
});

/** A declared length in px: `Npx`, `Nrem` (16px root) or a `--space-N` token (`admin.css`). */
function lengthPx(rule: string, property: string): number {
  const value = new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+)`).exec(rule)?.[1]?.trim() ?? "";
  const SPACE: Record<string, number> = { "1": 4, "2": 8, "3": 12 };
  const token = /^var\(--space-(\d)\)$/.exec(value)?.[1];
  if (token) return SPACE[token] ?? Number.NaN;
  const px = /^([\d.]+)px$/.exec(value)?.[1];
  if (px) return Number(px);
  const rem = /^([\d.]+)rem$/.exec(value)?.[1];
  return rem ? Number(rem) * 16 : Number.NaN;
}

describe("phone: the view tabs and the device icons share one row (bug 11-01, Edit page header at 375px)", () => {
  // Bug class: a phone toolbar row whose controls, at the 44px tap floor, need more than the row.
  // Measured 11-01 at 375px (a 351px row) with the then-declared values: three tabs at 8px
  // padding-inline, both segmented groups at a 0.25rem gap and 0.2rem padding — tabs + 3px +
  // devices = 378px, so the device icons took a row of their own (6 header rows). The device
  // buttons are 44px wide whatever their padding (phone tap floor), so only the tabs' padding and
  // the two groups' gap and padding can give. This recomputes that row from what is declared now.
  const MEASURED_ROW = 378;
  const ROW = 351;
  it("declares phone paddings and gaps that bring tabs + devices under the 351px row", () => {
    const phone = atRuleBlocks("@media (max-width: 640px)");
    const tabPadding = lengthPx(declarations(phone, ".content-editor-toolbar-start .segmented button"), "padding-inline");
    const group = declarations(phone, ".content-editor-toolbar-start .segmented");
    const gap = lengthPx(group, "gap");
    const padding = lengthPx(group, "padding");
    // 3 tabs × 2 sides; 2 groups × 2 gaps (3 buttons each); 2 groups × 2 sides.
    const saved = 3 * 2 * (8 - tabPadding) + 2 * 2 * (4 - gap) + 2 * 2 * (3.2 - padding);
    expect(MEASURED_ROW - saved).toBeLessThanOrEqual(ROW);
  });

  it("keeps every tab at least the 44px tap width: the tighter padding never shrinks a target", () => {
    // The 44px floor lives in `styles.css` (phone tap targets); editor.css must not lower it.
    expect(CSS).not.toMatch(/\.content-editor-toolbar-start[^{]*\{[^}]*min-(?:width|height):\s*(?:[0-3]?\d|4[0-3])px/);
  });
});
