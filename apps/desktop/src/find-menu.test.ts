/**
 * @file Coverage for the Find menu `main/boot/boot-sequence.ts` binds from
 * `@jini-ai/desktop-host/shell/find-menu` with Tovu's labels and `contracts/find-in-page.ts`'s
 * channel, plus the wiring that only source text can show: that the preload subscribes to the same
 * channel, and that the deployed channel literal has not drifted. Mirrors `site-history-menu.test.ts`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sendNativeFindToggle, type NativeFindMenu } from "@jini-ai/desktop-host/shell/find-menu";
import { FIND_TOGGLE_CHANNEL } from "./contracts/find-in-page.ts";
import { appWideMenuTemplate } from "./main/boot/boot-sequence.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (...parts: string[]) => fs.readFileSync(path.join(__dirname, ...parts), "utf8");

/** The Find entry exactly as the sites-home menu installs it. */
function findMenu(_requiredArgs: Record<string, never>): NativeFindMenu {
  const entry = appWideMenuTemplate({ platform: "darwin", settings: () => ({ label: "Settings" }) }).find((item) => "label" in item && item.label === "Find");
  assert.ok(entry, "the app-wide menu must contain Find");
  return entry as NativeFindMenu;
}
const sendFindToggle = ({ window }: { window: Parameters<typeof sendNativeFindToggle>[0]["window"] }) => sendNativeFindToggle({ window, channel: FIND_TOGGLE_CHANNEL });

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
  const menu = findMenu({});
  assert.equal(menu.label, "Find");
  assert.deepEqual(
    menu.submenu.map(({ label, accelerator }) => [label, accelerator]),
    [["Find in Page…", "CmdOrCtrl+F"]],
  );
});

test("clicking Find in Page… sends the toggle to the focused window's renderer", () => {
  const [findItem] = findMenu({}).submenu;
  const window = fakeWindow();
  findItem.click(undefined, window);
  assert.deepEqual(window.sent, [FIND_TOGGLE_CHANNEL]);
});

test("with no focused window, a destroyed one, or one without webContents, nothing is sent", () => {
  assert.equal(sendFindToggle({ window: undefined }), false);
  const destroyed = fakeWindow({ destroyed: true });
  assert.equal(sendFindToggle({ window: destroyed }), false);
  assert.deepEqual(destroyed.sent, []);
  assert.equal(sendFindToggle({ window: { isDestroyed: () => false } }), false);
  assert.equal(sendFindToggle({ window: fakeWindow() }), true);
});

test("the sites-home menu adds Find between History and Window", () => {
  const roles = (template: { role?: string; label?: string }[]) => template.map((entry) => entry.role ?? entry.label);
  assert.deepEqual(roles(appWideMenuTemplate({ platform: "darwin", settings: () => ({ label: "Settings" }) })), [
    "appMenu",
    "fileMenu",
    "editMenu",
    "View",
    "History",
    "Find",
    "windowMenu",
    "help",
    "Settings",
  ]);
});

test("the deployed toggle channel is still runner:find:toggle", () => {
  assert.equal(FIND_TOGGLE_CHANNEL, "runner:find:toggle");
});

test("the preload subscribes to that channel", () => {
  assert.match(read("preload", "preload.mts"), /onFindToggle:[^\n]*\n?\s*subscribe[^\n]*\{ channel: FIND_TOGGLE_CHANNEL, listener \}\)/);
});
