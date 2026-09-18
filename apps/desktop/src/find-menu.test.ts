/**
 * @file Coverage for `find-menu.ts`, plus the wiring that only source text can show: that
 * `site-history-menu.ts` splices the Find menu into `sitesHomeMenuTemplate`, that the preload
 * subscribes to the same channel, and that the inlined channel literal still matches
 * `contracts/find-in-page.ts`. Mirrors `site-history-menu.test.ts`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FIND_TOGGLE_CHANNEL, sendFindToggle, findMenu } from "./find-menu.ts";
import { sitesHomeMenuTemplate } from "./site-history-menu.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (...parts: string[]) => fs.readFileSync(path.join(__dirname, ...parts), "utf8");

/** A BrowserWindow stand-in that records what was sent to its renderer. */
function fakeWindow({ destroyed = false }: { destroyed?: boolean } = {}) {
  const sent: string[] = [];
  return {
    sent,
    isDestroyed: () => destroyed,
    webContents: { send: (channel: string) => sent.push(channel) },
  };
}

test("Find has one item, Find in Page… on CmdOrCtrl+F", () => {
  const menu = findMenu();
  assert.equal(menu.label, "Find");
  assert.deepEqual(
    menu.submenu.map(({ label, accelerator }) => [label, accelerator]),
    [["Find in Page…", "CmdOrCtrl+F"]],
  );
});

test("clicking Find in Page… sends the toggle to the focused window's renderer", () => {
  const [findItem] = findMenu().submenu;
  const window = fakeWindow();
  findItem.click(undefined, window);
  assert.deepEqual(window.sent, [FIND_TOGGLE_CHANNEL]);
});

test("with no focused window, a destroyed one, or one without webContents, nothing is sent", () => {
  assert.equal(sendFindToggle(undefined), false);
  const destroyed = fakeWindow({ destroyed: true });
  assert.equal(sendFindToggle(destroyed), false);
  assert.deepEqual(destroyed.sent, []);
  assert.equal(sendFindToggle({ isDestroyed: () => false }), false);
  assert.equal(sendFindToggle(fakeWindow()), true);
});

test("the sites-home menu adds Find between History and Window", () => {
  const roles = (template: { role?: string; label?: string }[]) => template.map((entry) => entry.role ?? entry.label);
  assert.deepEqual(roles(sitesHomeMenuTemplate("darwin")), [
    "appMenu",
    "fileMenu",
    "editMenu",
    "viewMenu",
    "History",
    "Find",
    "windowMenu",
    "help",
  ]);
});

test("the inlined channel literal matches contracts/find-in-page.ts", () => {
  const match = read("contracts", "find-in-page.ts").match(/export const FIND_TOGGLE_CHANNEL\s*=\s*'([^']+)'/);
  assert.ok(match, "contracts/find-in-page.ts must declare FIND_TOGGLE_CHANNEL");
  assert.equal(match[1], FIND_TOGGLE_CHANNEL);
});

test("the preload subscribes to that channel", () => {
  assert.match(read("preload", "preload.mts"), /onFindToggle:[^\n]*\n?\s*subscribe[^\n]*FIND_TOGGLE_CHANNEL, listener\)/);
});
