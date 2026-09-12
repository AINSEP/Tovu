/**
 * @file The ⋮ overflow menu's wiring, checked as source text — this repo has no DOM runner for
 * `.tsx` (see `use-add-site.hooks.test.ts`'s own header). The behaviour behind the menu IS covered
 * directly where it lives: `use-site-rename.hooks.ts`'s rule in `site-config.test.ts`, and the
 * whole rename guard in `project-ipc.test.js`. What only this file can check is that the component
 * actually wires them together, and does not reintroduce the two bugs the card already fixed once.
 *
 * Every assertion runs against COMMENT-STRIPPED source. The doc comments in `SiteGrid.tsx` discuss
 * `stopPropagation`, `role="menu"` and "Stop" by name, so a naive substring match would pass on the
 * prose explaining a thing rather than the thing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function withoutComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const gridSource = fs.readFileSync(path.join(here, "SiteGrid.tsx"), "utf8");
const grid = withoutComments(gridSource);

/** `SiteCardMenu`'s own body, so a match cannot be satisfied by a sibling component. */
function menuBody() {
  const start = grid.indexOf("function SiteCardMenu(");
  assert.notEqual(start, -1, "SiteCardMenu is gone");
  const rest = grid.slice(start + 1);
  const end = rest.indexOf("\nfunction ");
  return end === -1 ? rest : rest.slice(0, end);
}

test("the menu stops BOTH clicks and keydowns, or it opens the site underneath itself", () => {
  // The exact pair `CardConfirmOverlay` carries, for the exact reason its own doc gives: the card
  // is a click target AND a keyboard-activated open target, so an unstopped event inside the menu
  // opens the site instead of running the menu item. The delete button shipped with only the click
  // half once already; this is the regression guard for repeating that.
  const body = menuBody();
  assert.match(body, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/, "menu must stop click propagation");
  assert.match(body, /onKeyDown=\{\(event\) => event\.stopPropagation\(\)\}/, "menu must stop keydown propagation");
});

test("the menu reuses useDismissibleDropdown rather than hand-rolling outside-click dismissal", () => {
  // That hook exists BECAUSE this behaviour was duplicated inline in the top nav's two dropdowns.
  // A third copy here is how a menu becomes a menu bug.
  assert.match(grid, /import \{[^}]*useDismissibleDropdown[^}]*\} from '\.\/App\.hooks\.js'/);
  assert.match(menuBody(), /useDismissibleDropdown<HTMLDivElement>\(\)/);
});

test("the trigger carries the same a11y contract SettingsControl uses", () => {
  const body = menuBody();
  assert.match(body, /aria-expanded=\{open\}/);
  assert.match(body, /aria-haspopup="true"/);
  assert.match(body, /role="menu"/);
  assert.match(body, /role="menuitem"/);
  // Icon-only, so the accessible name cannot come from its text.
  assert.match(body, /aria-label=\{`More actions for \$\{project\.displayName\}`\}/);
});

test("Stop is NOT offered — runner:sites:stop is a throwing stub with no handler", () => {
  // Not a design preference: `project-ipc.js` registers no handler for it. An entry here, even a
  // disabled one, would imply it is coming.
  assert.doesNotMatch(menuBody(), />\s*Stop\s*</);
});

test("Start shows only for a stopped site and Open in browser only for a running one", () => {
  // An entry that is present but inert teaches the operator that this menu's items sometimes do
  // nothing, which is worse than a shorter menu.
  const body = menuBody();
  assert.match(body, /\{!running && \([\s\S]*?Start[\s\S]*?\)\}/, "Start must be gated on !running");
  assert.match(body, /\{running && \([\s\S]*?Open in browser[\s\S]*?\)\}/, "Open in browser must be gated on running");
  assert.match(body, /const running = project\.status === 'running';/);
});

test("every menu item closes the menu before acting, never after", () => {
  // Acting first leaves an open menu floating over whatever the action changed.
  const body = menuBody();
  assert.match(body, /const choose = \(act: \(\) => void\) => \(\) => \{\s*setOpen\(false\);\s*act\(\);/);
  // And every item goes through it, rather than some calling their action directly.
  const items = body.match(/role="menuitem"[\s\S]*?onClick=\{([^}]*)\}/g) ?? [];
  assert.equal(items.length, 3, `expected 3 menu items, found ${items.length}`);
  for (const item of items) assert.match(item, /choose\(/, `a menu item bypasses choose(): ${item}`);
});

test("the rename overlay makes the card inert, the same way the delete confirmation does", () => {
  // Both overlays are one value rather than two booleans precisely so this cannot drift — see
  // `cardOverlay`'s own doc.
  assert.match(grid, /const openable = isCardOpenable\(project, overlay !== null\);/);
  assert.match(grid, /overlay === 'rename' && <CardRenameOverlay/);
  assert.match(grid, /overlay === 'confirm' && \(/);
});

test("the rename input is bounded and its Save refuses what Tovu would refuse", () => {
  // maxLength is the courtesy half; `canSave` is the one that reflects the real rule, and
  // `site-config.ts` re-applies it on the other side of the wire regardless.
  assert.match(grid, /maxLength=\{200\}/);
  assert.match(grid, /disabled=\{!rename\.canSave\}/);
  // Escape cancels and Enter submits — a text field must own both, or the card interprets them.
  assert.match(grid, /event\.key === 'Escape'/);
  assert.match(grid, /event\.key === 'Enter' && rename\.canSave/);
});

test("main's refusal is surfaced verbatim, never paraphrased", () => {
  // Every message main raises names the fix ("remove this card and add the site again from its new
  // location"). Rewording it here would drop exactly the half the operator needs.
  assert.match(grid, /\{rename\.renameError && <p className="card__confirmerror">\{rename\.renameError\}<\/p>\}/);
});
