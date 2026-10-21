import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { pagesAgentToolCatalog } from "../agent-tools.js";
import { DEFAULT_PAGE_SKELETON } from "../skeleton.js";

/**
 * Regression (demo video V1, 2026-10-05): the page-writing contract said "style with theme tokens"
 * but never named one, and the starter skeleton itself used `--text`/`--text-strong`/
 * `--surface-muted`/`--font-heading` — names no theme defines. The model copied that vocabulary
 * (`color: var(--text, #1f1f1f)`), so the light-mode fallback won on the dark theme and the page's
 * heading rendered dark gray on near-black.
 */

// Shipped theme tokens live in content/themes; a developer's site folder is not a fixture.
const THEMES_DIR = fileURLToPath(new URL("../../../../../../content/themes/", import.meta.url));

/** The token names every `--fg`-vocabulary theme in this repo defines in BOTH modes. */
function sharedThemeTokens(): Set<string> {
  const files = [
    "static/tovu-theme/tokens.json",
    "static/tovu-theme/tokens.light.json",
    "static/basic-2/tokens.json",
    "static/basic-2/tokens.light.json",
  ];
  const sets = files.map((file) => new Set(Object.keys(JSON.parse(fs.readFileSync(THEMES_DIR + file, "utf8")))));
  return new Set([...sets[0]].filter((name) => sets.every((set) => set.has(name))));
}

for (const toolName of ["pages_write_html", "pages_write_region"]) {
  test(`${toolName}: the colour contract uses the active theme vocabulary returned by a page read`, () => {
    const tool = pagesAgentToolCatalog.find((entry) => entry.name === toolName);
    assert.ok(tool, `${toolName} must exist`);
    assert.match(tool.description, /COLOURS FOLLOW THE THEME, in light AND dark mode/);
    assert.match(tool.description, /Let text inherit its colour/);
    assert.match(tool.description, /call pages_read_html FIRST, even for a new page/);
    assert.match(tool.description, /ONLY names present in `theme.tokens`/);
    assert.match(tool.description, /theme.tokensLight/);
    assert.match(tool.description, /If `theme` is null, inherit colours/);
    assert.doesNotMatch(tool.description, /use ONLY these theme tokens/);
  });
}

/**
 * Same page, same root cause (chat-written CSS): each section got its own `max-width` +
 * `padding: 3rem` wrapper inside the theme's article, which already sets width and padding — 48px +
 * 48px + the form card's 32px margin left a 128px hole between the intro and the form.
 */
const LAYOUT_RULE =
  "- LAYOUT: the theme's content area already sets the page width and the space around the content. " +
  "Do not wrap each section in its own max-width or padding container; separate sections with a " +
  "modest margin (at most about 2rem) so the page does not open large empty gaps.\n";

for (const toolName of ["pages_write_html", "pages_write_region"]) {
  test(`${toolName}: the contract tells the model not to stack its own section padding inside the theme's content area`, () => {
    const tool = pagesAgentToolCatalog.find((entry) => entry.name === toolName);
    assert.ok(tool?.description.includes(LAYOUT_RULE), `${toolName}'s description must carry the layout rule verbatim`);
  });
}

test("the starter skeleton only uses token names the shipped themes define, and sets no text colour of its own", () => {
  const shared = sharedThemeTokens();
  const used = [...DEFAULT_PAGE_SKELETON.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]);
  assert.deepEqual(used.filter((name) => !shared.has(name)), []);
  assert.doesNotMatch(DEFAULT_PAGE_SKELETON, /\.page-(hero h1|body)\s*\{[^}]*\bcolor:/);
});
