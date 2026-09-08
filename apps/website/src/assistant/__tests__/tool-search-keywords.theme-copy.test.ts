import assert from "node:assert/strict";
import test from "node:test";

import { TOOL_SEARCH_KEYWORDS } from "../tool-search-keywords.js";

/**
 * @file Regression coverage for `ADS-memory/reports/2026-09-07-assistant-tool-coverage-audit.md`'s
 * Gap #3: no `theme_*` search-keyword entry mentioned "copy"/"duplicate", so a model asked to
 * "duplicate this template" or "copy this theme file" had nothing to point it at composing
 * `theme_read_file` + `theme_write_file` — the audit's own confirmed compose-it-yourself path
 * (no `theme_copy_file` tool exists; the route-level `copyThemeFile` primitive is Explore-screen-only
 * and, unlike the page-copy case, carries no hidden row-scoped-placement coupling that composing by
 * hand could silently drop). Pins that the vocabulary now exists on `theme_write_file`, the tool this
 * composition ends at.
 */

const COPY_OR_DUPLICATE = /\b(copy|duplicate)\b/;

test("theme_write_file carries copy/duplicate vocabulary — the model's path to duplicating a theme file", () => {
  const keywords = TOOL_SEARCH_KEYWORDS["theme_write_file"];
  assert.ok(keywords, "expected theme_write_file to have a TOOL_SEARCH_KEYWORDS entry");
  assert.match(keywords!, COPY_OR_DUPLICATE);
});
