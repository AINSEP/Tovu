/**
 * @file Coverage for `zoom-menu.ts`, plus the wiring that only source text can show: that
 * `site-history-menu.ts` splices the Zoom items into its View menu, that the preload subscribes to
 * the same channel, and that the inlined channel literal still matches `contracts/zoom.ts`. Mirrors
 * `find-menu.test.ts`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ZOOM_COMMAND_CHANNEL, sendZoomCommand, zoomMenuItems } from "./zoom-menu.ts";
import { viewMenu } from "./site-history-menu.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (...parts: string[]) => fs.readFileSync(path.join(__dirname, ...parts), "utf8");

/** A BrowserWindow stand-in that records what was sent to its renderer. */
function fakeWindow({ destroyed = false }: { destroyed?: boolean } = {}) {
  const sent: Array<[string, unknown]> = [];
  return {
    sent,
    isDestroyed: () => destroyed,
    webContents: { send: (channel: string, direction: unknown) => sent.push([channel, direction]) },
  };
}

test("four items: Actual Size, Zoom In, a hidden Zoom In alias, Zoom Out", () => {
  const items = zoomMenuItems();
  assert.deepEqual(
    items.map(({ label, accelerator, visible }) => [label, accelerator, visible]),
    [
      ["Actual Size", "CmdOrCtrl+0", undefined],
      ["Zoom In", "CmdOrCtrl+Plus", undefined],
      ["Zoom In", "CmdOrCtrl+=", false],
      ["Zoom Out", "CmdOrCtrl+-", undefined],
    ],
  );
});

test("each item sends its own direction to the focused window's renderer", () => {
  const items = zoomMenuItems();
  const window = fakeWindow();
  for (const item of items) item.click(undefined, window);
  assert.deepEqual(window.sent, [
    [ZOOM_COMMAND_CHANNEL, "reset"],
    [ZOOM_COMMAND_CHANNEL, "in"],
    [ZOOM_COMMAND_CHANNEL, "in"],
    [ZOOM_COMMAND_CHANNEL, "out"],
  ]);
});

test("with no focused window, a destroyed one, or one without webContents, nothing is sent", () => {
  assert.equal(sendZoomCommand(undefined, "in"), false);
  const destroyed = fakeWindow({ destroyed: true });
  assert.equal(sendZoomCommand(destroyed, "in"), false);
  assert.deepEqual(destroyed.sent, []);
  assert.equal(sendZoomCommand({ isDestroyed: () => false }, "in"), false);
  assert.equal(sendZoomCommand(fakeWindow(), "in"), true);
});

test("the View menu is Reload, Force Reload, Toggle Dev Tools, a separator, the four Zoom items, a separator, then Toggle Full Screen", () => {
  const menu = viewMenu();
  assert.equal(menu.label, "View");
  assert.deepEqual(
    menu.submenu.map((entry) => ("role" in entry ? entry.role : "type" in entry ? entry.type : entry.label)),
    ["reload", "forceReload", "toggleDevTools", "separator", "Actual Size", "Zoom In", "Zoom In", "Zoom Out", "separator", "togglefullscreen"],
  );
});

test("the inlined channel literal matches contracts/zoom.ts", () => {
  const match = read("contracts", "zoom.ts").match(/export const ZOOM_COMMAND_CHANNEL\s*=\s*'([^']+)'/);
  assert.ok(match, "contracts/zoom.ts must declare ZOOM_COMMAND_CHANNEL");
  assert.equal(match[1], ZOOM_COMMAND_CHANNEL);
});

test("the preload subscribes to that channel", () => {
  assert.match(read("preload", "preload.mts"), /onZoomCommand:[^\n]*\n?\s*subscribe[^\n]*ZOOM_COMMAND_CHANNEL, listener\)/);
});
