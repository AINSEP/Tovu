/**
 * @file Behavioural tests for `SiteGrid.hooks.ts`'s pure rules, plus one wiring guard that the
 * component actually routes through them. Run by the `*.test.ts` half of this package's `test`
 * script — see `App.hooks.test.ts`'s header for how that resolves `tsx`.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { closeMenuThen, isCardOpenKey } from "./SiteGrid.hooks.js";

/** Stand-ins for the two DOM nodes involved. Identity is all `isCardOpenKey` compares, so plain
 *  objects are a truthful model of it and no DOM is needed. */
const card = { id: "the <article> card" } as unknown as EventTarget;
// Named generically rather than after one control: the bug this guards against reaches any
// descendant of the card — the delete button originally, and the ⋮ trigger and its menu items
// (including the delete entry that moved inside the menu) equally today.
const descendantControl = { id: "a descendant <button>, e.g. the ⋮ trigger or a menu item" } as unknown as EventTarget;

test("Enter or Space on the card itself opens the project", () => {
  assert.equal(isCardOpenKey({ key: "Enter", target: card, currentTarget: card }), true);
  assert.equal(isCardOpenKey({ key: " ", target: card, currentTarget: card }), true);
});

test("any other key on the card does nothing", () => {
  for (const key of ["Tab", "Escape", "a", "ArrowDown", "Delete", "Backspace"]) {
    assert.equal(isCardOpenKey({ key, target: card, currentTarget: card }), false, key);
  }
});

test("Enter or Space on a control INSIDE the card does not open the project", () => {
  // The defect this originally caught. The control is a descendant of the card, so its keydown
  // bubbles to the card's handler; unguarded, that handler called `preventDefault()` — cancelling
  // the click the browser was about to synthesize from the key — and opened the project underneath
  // it. Keyboard users could not reach that control's own behaviour at all. Still exactly as true
  // for the ⋮ trigger and its menu items (delete included, now that it lives in the menu) as it was
  // for the delete button this test was first written against.
  assert.equal(isCardOpenKey({ key: "Enter", target: descendantControl, currentTarget: card }), false);
  assert.equal(isCardOpenKey({ key: " ", target: descendantControl, currentTarget: card }), false);
});

test("the card's keydown handler routes through isCardOpenKey rather than checking keys inline", () => {
  // Source text, because the component itself has no runner in this package (see
  // `rescan-wiring.test.ts`'s header). Without this, the predicate above could be correct and
  // simply not called — the exact shape of "correct primitive, unwired call site".
  //
  // The handler moved out of `SiteGrid.tsx`'s JSX and into `cardOpenProps` (this module) when the
  // card's five `openable ? … : undefined` ternaries were collapsed into one call. That put TWO
  // hops between the predicate and the DOM, so this checks both: the predicate is called, AND the
  // object carrying it actually reaches the card. Either half alone would pass while the card had
  // no keyboard behaviour at all.
  const hooks = fs.readFileSync(path.join(import.meta.dirname, "SiteGrid.hooks.ts"), "utf8");
  const tsx = fs.readFileSync(path.join(import.meta.dirname, "SiteGrid.tsx"), "utf8");

  // Hop 1: the predicate is the gate inside `cardOpenProps`, not a re-implementation.
  assert.match(hooks, /export function cardOpenProps\([\s\S]*?if \(!isCardOpenKey\(event\)\) return;/);

  // Hop 2: its result is spread onto the card element. A `cardOpenProps` call whose return value
  // went unused is precisely the "unwired call site" this test exists to catch.
  assert.match(tsx, /import \{[^}]*\bcardOpenProps\b[^}]*\} from '\.\/SiteGrid\.hooks\.js'/);
  assert.match(tsx, /const openProps = cardOpenProps\(openable, \(\) => onOpen\(project\.id\)\);/);
  // `status`, not `project.status`: the class carries the status the card is actually RENDERING,
  // which during this window's own start or stop is the transition rather than the polled record.
  // See `use-site-power.hooks.ts`, and `.card.is-stopping` in `app.css`.
  assert.match(tsx, /<article className=\{`card is-\$\{status\}[^`]*`\} \{\.\.\.openProps\}>/);

  // Neither file may go back to an inline key check.
  const sources: readonly (readonly [string, string])[] = [
    ["SiteGrid.tsx", tsx],
    ["SiteGrid.hooks.ts", hooks],
  ];
  for (const [name, source] of sources) {
    assert.doesNotMatch(
      source,
      /if \(event\.key === 'Enter' \|\| event\.key === ' '\)/,
      `an inline key check in ${name} is what swallowed the delete button's keyboard activation`,
    );
  }
});

test("a menu entry closes the menu BEFORE running its action", () => {
  // Acting first would leave an open menu floating over whatever the action changed.
  const calls: string[] = [];
  const choose = closeMenuThen((open) => calls.push(`setOpen:${open}`));
  const onClick = choose(() => calls.push("act"));
  assert.equal(calls.length, 0, "building an entry's handler must run nothing");
  onClick();
  assert.deepEqual(calls, ["setOpen:false", "act"]);
});

test("every entry built from one closeMenuThen runs only its own action", () => {
  const calls: string[] = [];
  const choose = closeMenuThen((open) => calls.push(`setOpen:${open}`));
  const rename = choose(() => calls.push("rename"));
  const start = choose(() => calls.push("start"));
  start();
  rename();
  assert.deepEqual(calls, ["setOpen:false", "start", "setOpen:false", "rename"]);
});
