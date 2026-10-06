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

const THEMES_DIR = fileURLToPath(new URL("../../../sites/tovu-dev/themes/", import.meta.url));

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

const COLOUR_RULE =
  "- COLOURS FOLLOW THE THEME, in light AND dark mode. Let text inherit its colour: do not set `color` " +
  "on headings, paragraphs or lists, and do not give a section a `background` unless the design needs " +
  "one — the theme already colours them for both modes. When you do need a colour, font or border, " +
  "use ONLY these theme tokens, each with a literal fallback: `var(--fg, #111)` text, " +
  "`var(--muted, #666)` secondary text, `var(--bg, #fff)` page background, `var(--surface, #f5f5f5)` " +
  "and `var(--surface-2, #eee)` panels, `var(--border, #ddd)` lines, `var(--accent, #8a4b2a)` with " +
  "`var(--accent-fg, #fff)` for buttons, `var(--font-display, inherit)` and `var(--font-body, inherit)` " +
  "fonts. Never a bare hex and never a bare `var(--accent)`. Do not guess other names (`--text`, " +
  "`--text-strong`, `--surface-muted`...): a token the theme lacks silently uses its fallback, and a " +
  "literal fallback is right in only ONE mode — dark text vanishes on the dark theme. A <style> " +
  "block inside the content is fine and is the expected way to style a bespoke page.\n";

for (const toolName of ["pages_write_html", "pages_write_region"]) {
  test(`${toolName}: the contract names the theme's real colour tokens and tells the model to inherit text colour`, () => {
    const tool = pagesAgentToolCatalog.find((entry) => entry.name === toolName);
    assert.ok(tool, `${toolName} must exist`);
    assert.ok(tool.description.includes(COLOUR_RULE), `${toolName}'s description must carry the colour rule verbatim`);
    assert.ok(!tool.description.includes("STYLE WITH THEME TOKENS"), "the old unnamed-token rule must be gone");
  });
}

test("every token the colour rule names is one the shipped themes actually define, in both modes", () => {
  const shared = sharedThemeTokens();
  const named = [...COLOUR_RULE.matchAll(/`var\((--[a-z0-9-]+),/g)].map((match) => match[1]);
  assert.deepEqual(
    named.filter((name) => !shared.has(name)),
    [],
    "a token the contract tells the model to use must exist in every theme it is checked against"
  );
  assert.equal(named.length, 10);
});

test("the starter skeleton only uses token names the shipped themes define, and sets no text colour of its own", () => {
  const shared = sharedThemeTokens();
  const used = [...DEFAULT_PAGE_SKELETON.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]);
  assert.deepEqual(used.filter((name) => !shared.has(name)), []);
  assert.doesNotMatch(DEFAULT_PAGE_SKELETON, /\.page-(hero h1|body)\s*\{[^}]*\bcolor:/);
});
