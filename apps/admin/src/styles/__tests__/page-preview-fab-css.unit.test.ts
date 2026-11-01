import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

/**
 * @file Edit page, collapsed preview (`styles/pages.css`), bug 11-01: the expand control is placed
 * against `.page-preview-stage`, which sits BELOW the "Cookie banner hidden in preview…" note, so it
 * landed on the note (375px: over its text; desktop: ~22px under the Save/Delete row) instead of at
 * the row's right end. jsdom computes no layout, so this reads the declared rule; the real check is
 * the Chrome look at 375px and desktop.
 */
const CSS = readFileSync(resolve(process.cwd(), "src/styles/pages.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

it("collapsed, the stage generates no box, so the control is placed against the surface above the note", () => {
  // Top level (every width), not inside a media block: the desktop `bottom: calc(100% + 9px)` and the
  // phone `order: -1` + negative-margin pull both assume the control's box starts right under the row.
  const topLevel = CSS.replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}/g, "");
  expect(topLevel).toMatch(/\.page-preview-host\s+\.page-preview-stage\s*\{[^}]*display:\s*contents/);
});

it("phones: the collapsed control is pulled up by its real 44px tap height, so it lines up with Save", () => {
  // Bug 11-01: the pull assumed a 40px control, but the phone tap floor (`styles.css`, 44px
  // min-height on every admin button) makes it 44px, so it sat 4px below Save and pushed the note
  // 4px down. The pull and the hand-back must use the same 44px.
  const phone = CSS.match(/@media \(max-width: 640px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const rule = phone.match(/\.page-preview-host\s+\.page-preview-stage\s*>\s*\.page-preview-fab\s*\{([^}]*)\}/)?.[1] ?? "";
  expect(rule).toMatch(/margin:\s*calc\(-44px - 15px\) 0 15px/);
});
