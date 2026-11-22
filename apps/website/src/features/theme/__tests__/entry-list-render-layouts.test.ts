import assert from "node:assert/strict";
import test from "node:test";

import { ENTRY_LIST_DEFAULT_STYLE } from "../entry-list-markup.js";

test("the default style ships zero-specificity rules for both new layouts", () => {
  assert.ok(ENTRY_LIST_DEFAULT_STYLE.includes(":where([data-tovu-entry-list].entry-list--carousel)"));
  assert.ok(ENTRY_LIST_DEFAULT_STYLE.includes("scroll-snap-type:x mandatory"));
  assert.ok(ENTRY_LIST_DEFAULT_STYLE.includes(":where([data-tovu-entry-list].entry-list--accordion)"));
  assert.ok(ENTRY_LIST_DEFAULT_STYLE.includes(":where([data-tovu-entry-list] .entry-accordion__question)"));
});
