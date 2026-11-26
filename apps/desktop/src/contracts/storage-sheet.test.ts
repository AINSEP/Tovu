/** P11 ST-18a.T — the Storage sheet's fixed bridge forwards only named fields on named channels. */
import assert from "node:assert/strict";
import test from "node:test";
import { STORAGE_SHEET_CHANNELS, STORAGE_SHEET_ENABLED, createStorageSheetBridge } from "./storage-sheet.js";

test("the Storage sheet ships dark", () => {
  assert.equal(STORAGE_SHEET_ENABLED, false);
});

test("each bridge call goes to its own channel with only its named fields", async () => {
  const invokes: unknown[][] = [];
  const bridge = createStorageSheetBridge({ invoke: async (...args) => { invokes.push(args); return "reply"; } });
  assert.deepEqual(Object.keys(bridge), ["list", "preview", "act"], "no generic passthrough method");
  await bridge.list();
  await bridge.preview({ id: "i1", action: "remove-sign-in", path: "/etc", partition: "persist:x" } as never);
  await bridge.act({ confirmationId: "c1", confirmed: true, dir: "/etc" } as never);
  assert.deepEqual(invokes, [
    [STORAGE_SHEET_CHANNELS.list],
    [STORAGE_SHEET_CHANNELS.preview, { id: "i1", action: "remove-sign-in" }],
    [STORAGE_SHEET_CHANNELS.act, { confirmationId: "c1" }],
  ]);
});
