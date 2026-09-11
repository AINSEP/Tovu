/**
 * @file Behavioural tests for `ProjectGrid.hooks.ts`'s pure rules, plus one wiring guard that the
 * component actually routes through them. Run by the `*.test.ts` half of this package's `test`
 * script — see `App.hooks.test.ts`'s header for how that resolves `tsx`.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { isCardOpenKey } from "./ProjectGrid.hooks.js";

/** Stand-ins for the two DOM nodes involved. Identity is all `isCardOpenKey` compares, so plain
 *  objects are a truthful model of it and no DOM is needed. */
const card = { id: "the <article> card" } as unknown as EventTarget;
const deleteButton = { id: "the card__delete <button>" } as unknown as EventTarget;

test("Enter or Space on the card itself opens the project", () => {
  assert.equal(isCardOpenKey({ key: "Enter", target: card, currentTarget: card }), true);
  assert.equal(isCardOpenKey({ key: " ", target: card, currentTarget: card }), true);
});

test("any other key on the card does nothing", () => {
  for (const key of ["Tab", "Escape", "a", "ArrowDown", "Delete", "Backspace"]) {
    assert.equal(isCardOpenKey({ key, target: card, currentTarget: card }), false, key);
  }
});

test("Enter or Space on the DELETE BUTTON does not open the project", () => {
  // The defect. The button is a descendant of the card, so its keydown bubbles to the card's
  // handler; unguarded, that handler called `preventDefault()` — cancelling the click the browser
  // was about to synthesize from the key — and opened the project. Keyboard users could not reach
  // the delete confirmation at all.
  assert.equal(isCardOpenKey({ key: "Enter", target: deleteButton, currentTarget: card }), false);
  assert.equal(isCardOpenKey({ key: " ", target: deleteButton, currentTarget: card }), false);
});

test("the card's keydown handler routes through isCardOpenKey rather than checking keys inline", () => {
  // Source text, because the component itself has no runner in this package (see
  // `rescan-wiring.test.js`'s header). Without this, the predicate above could be correct and
  // simply not called — the exact shape of "correct primitive, unwired call site".
  const tsx = fs.readFileSync(path.join(import.meta.dirname, "ProjectGrid.tsx"), "utf8");
  assert.match(tsx, /import \{[^}]*\bisCardOpenKey\b[^}]*\} from '\.\/ProjectGrid\.hooks\.js'/);
  assert.match(tsx, /onKeyDown=\{[\s\S]{0,400}?if \(!isCardOpenKey\(event\)\) return;/);
  assert.doesNotMatch(
    tsx,
    /if \(event\.key === 'Enter' \|\| event\.key === ' '\)/,
    "an inline key check on the card is what swallowed the delete button's keyboard activation",
  );
});
