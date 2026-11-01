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
  const bodies: string[] = [];
  let from = 0;
  for (;;) {
    const start = CSS.indexOf(`@container admin-content (${query})`, from);
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
