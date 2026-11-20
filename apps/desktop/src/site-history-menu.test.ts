/**
 * @file Coverage for the History binding in `main/boot/boot-sequence.ts`, plus the wiring that only
 * source text can show: that the preload subscribes to the same channel. That sites home installs this menu (with Settings) before its window opens
 * is behaviour now, in `main/boot/boot-sequence.test.ts`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SITE_HISTORY_CHANNEL } from "./contracts/project.ts";
import { appWideMenuTemplate } from "./main/boot/boot-sequence.ts";
import type { HistoryMenu } from "@jini-ai/desktop-host/electron/usability";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (...parts: string[]) => fs.readFileSync(path.join(__dirname, ...parts), "utf8");

/** A BrowserWindow stand-in that records what was sent to its renderer. */
function fakeWindow({ destroyed = false }: { destroyed?: boolean } = {}) {
  const sent: [string, string][] = [];
  return {
    sent,
    isDestroyed: () => destroyed,
    webContents: { send: (channel: string, payload: string) => sent.push([channel, payload]) },
  };
}

test("History has Back on CmdOrCtrl+[ and Forward on CmdOrCtrl+]", () => {
  const menu = appWideMenuTemplate({ platform: "darwin", settings: () => ({ label: "Settings" }) })
    .find((entry): entry is HistoryMenu => "label" in entry && entry.label === "History");
  assert.ok(menu && "submenu" in menu);
  assert.equal(menu.label, "History");
  assert.deepEqual(
    menu.submenu.map((entry) => "label" in entry ? [entry.label, entry.accelerator] : []),
    [
      ["Back", "CmdOrCtrl+["],
      ["Forward", "CmdOrCtrl+]"],
    ],
  );
});

test("clicking Back and Forward sends the command to the focused window's renderer", () => {
  const menu = appWideMenuTemplate({ platform: "darwin", settings: () => ({ label: "Settings" }) })
    .find((entry): entry is HistoryMenu => "label" in entry && entry.label === "History");
  assert.ok(menu && "submenu" in menu);
  const [back, forward] = menu.submenu;
  assert.ok(back && "click" in back);
  assert.ok(forward && "click" in forward);
  const window = fakeWindow();
  back.click(undefined, window);
  forward.click(undefined, window);
  assert.deepEqual(window.sent, [
    [SITE_HISTORY_CHANNEL, "back"],
    [SITE_HISTORY_CHANNEL, "forward"],
  ]);
});

test("with no focused window, a destroyed one, or one without webContents, nothing is sent", () => {
  const menu = appWideMenuTemplate({ platform: "darwin", settings: () => ({ label: "Settings" }) })
    .find((entry): entry is HistoryMenu => "label" in entry && entry.label === "History");
  assert.ok(menu && "submenu" in menu);
  const [back, forward] = menu.submenu;
  assert.ok(back && "click" in back);
  assert.ok(forward && "click" in forward);
  back.click(undefined, undefined);
  const destroyed = fakeWindow({ destroyed: true });
  back.click(undefined, destroyed);
  assert.deepEqual(destroyed.sent, []);
  forward.click(undefined, { isDestroyed: () => false });
  const window = fakeWindow();
  forward.click(undefined, window);
  assert.deepEqual(window.sent, [[SITE_HISTORY_CHANNEL, "forward"]]);
});

test("the sites-home menu keeps Electron's default menus and adds History and Find before Window", () => {
  const roles = (template: { role?: string; label?: string }[]) => template.map((entry) => entry.role ?? entry.label);
  assert.deepEqual(roles(appWideMenuTemplate({ platform: "darwin", settings: () => ({ label: "Settings" }) })), ["appMenu", "fileMenu", "editMenu", "View", "History", "Find", "windowMenu", "help", "Settings"]);
  assert.deepEqual(roles(appWideMenuTemplate({ platform: "linux", settings: () => ({ label: "Settings" }) })), ["fileMenu", "editMenu", "View", "History", "Find", "windowMenu", "help", "Settings"]);
});

test("the preload subscribes to that channel", () => {
  assert.match(read("preload", "preload.mts"), /onSiteHistory:[^\n]*\n?\s*subscribe\(\{ channel: SITE_HISTORY_CHANNEL, listener \}\)/);
});
