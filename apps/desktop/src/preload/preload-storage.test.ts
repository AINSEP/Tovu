import assert from "node:assert/strict";
import test from "node:test";
import * as storage from "../contracts/storage-sheet.ts";
import type { StorageSheetBridge } from "../contracts/storage-sheet.ts";

test("when Storage is enabled, the preload exposes only the frozen Storage capabilities", async (t) => {
  const exposed = new Map<string, unknown>();
  const calls: unknown[][] = [];
  // Change only the release decision for this isolated preload process. The bridge factory
  // and all of its channel/payload decisions are the real ones.
  t.mock.module(new URL("../contracts/storage-sheet.ts", import.meta.url).href, {
    namedExports: { ...storage, STORAGE_SHEET_ENABLED: true },
  });
  t.mock.module("electron", { namedExports: {
    contextBridge: { exposeInMainWorld: (name: string, bridge: unknown) => {
      assert.equal(exposed.has(name), false, "a binding cannot overwrite another one");
      exposed.set(name, bridge);
    } },
    ipcRenderer: { invoke: async (...args: unknown[]) => {
      calls.push(args);
      switch (args[0]) {
        case "tovu:storage-sheet:list": return null;
        case "tovu:storage-sheet:preview": return { state: "ready", confirmationId: "confirm-1", label: "Bakery", action: "trash-folder" };
        case "tovu:storage-sheet:act": return { state: "done" };
        default: return assert.fail(`Unexpected IPC channel: ${String(args[0])}`);
      }
    } },
    webFrame: {}, webUtils: {},
  } });
  await import("./preload.mts");
  const bridge = exposed.get("tovuStorageSheet") as StorageSheetBridge | undefined;
  assert.ok(bridge);
  assert.equal(Object.isFrozen(bridge), true);
  assert.deepEqual(Object.keys(bridge).sort(), ["act", "list", "preview"]);
  assert.equal(await bridge.list(), null);
  const input = { id: "folder-1", action: "trash-folder" as const, path: "/must-not-cross-ipc" };
  assert.deepEqual(await bridge.preview(input), { state: "ready", confirmationId: "confirm-1", label: "Bakery", action: "trash-folder" });
  const action = { confirmationId: "confirm-1", confirmed: true };
  assert.deepEqual(await bridge.act(action), { state: "done" });
  assert.deepEqual(calls, [
    ["tovu:storage-sheet:list", undefined],
    ["tovu:storage-sheet:preview", { id: "folder-1", action: "trash-folder" }],
    ["tovu:storage-sheet:act", { confirmationId: "confirm-1" }],
  ]);
});
