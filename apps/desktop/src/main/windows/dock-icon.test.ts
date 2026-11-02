/**
 * @file `dock-icon.ts`: the dock tile icon, with a fake `app.dock`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyDockIcon } from "./dock-icon.ts";

test("no dock (Windows, Linux): nothing is set and nothing is logged", () => {
  const logs: string[] = [];
  applyDockIcon({ dock: undefined, iconPath: "/icon.png", log: (m) => logs.push(m) });
  assert.deepEqual(logs, []);
});

test("a dock gets the Tovu mark", () => {
  const set: string[] = [];
  const logs: string[] = [];
  applyDockIcon({ dock: { setIcon: (p) => { set.push(p); } }, iconPath: "/brand/tovu-app-icon.png", log: (m) => logs.push(m) });
  assert.deepEqual(set, ["/brand/tovu-app-icon.png"]);
  assert.deepEqual(logs, []);
});

test("an unreadable icon is logged and the boot carries on", () => {
  const logs: string[] = [];
  assert.doesNotThrow(() => applyDockIcon({
    dock: { setIcon: () => { throw new Error("Failed to load image"); } },
    iconPath: "/missing.png",
    log: (m) => logs.push(m),
  }));
  assert.deepEqual(logs, ["tovu desktop: could not set the dock icon (Failed to load image) — using the default."]);
});
