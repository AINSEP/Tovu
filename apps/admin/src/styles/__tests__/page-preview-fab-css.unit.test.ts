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
