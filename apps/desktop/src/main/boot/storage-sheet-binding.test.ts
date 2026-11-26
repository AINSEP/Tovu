/** P11 ST-18a.T — the Storage sheet's main-process mount: dark by default, exact sender, real removal binding. */
import assert from "node:assert/strict";
import test from "node:test";
import { STORAGE_SHEET_ENABLED } from "../../contracts/storage-sheet.ts";
import type { StorageSheetRequired } from "../../storage/storage-sheet-ipc.ts";
import { bindStorageSignInRemoval, isSitesHomeMainFrame, mountStorageSheet, storageConfirmDialog } from "./storage-sheet-binding.ts";

const SHELL = "file:///app/dist/renderer/index.html";

test("with the flag off no Storage IPC is registered and no deps are built", () => {
  assert.equal(STORAGE_SHEET_ENABLED, false, "the feature ships dark");
  const calls = { built: 0, registered: 0 };
  const deps = {} as StorageSheetRequired;
  const off = mountStorageSheet({ enabled: STORAGE_SHEET_ENABLED, buildDeps: () => { calls.built += 1; return deps; }, register: () => { calls.registered += 1; } });
  assert.deepEqual(off, { mounted: false });
  assert.deepEqual(calls, { built: 0, registered: 0 });
  const on = mountStorageSheet({ enabled: true, buildDeps: () => { calls.built += 1; return deps; }, register: (bound) => { assert.equal(bound, deps); calls.registered += 1; } });
  assert.deepEqual(on, { mounted: true });
  assert.deepEqual(calls, { built: 1, registered: 1 });
});

test("guest frame cannot call Storage IPC: only the exact sites-home window URL is allowed", () => {
  const sender = (url: string, type = "window", destroyed = false) => ({ getURL: () => url, getType: () => type, isDestroyed: () => destroyed });
  assert.equal(isSitesHomeMainFrame({ sender: sender(SHELL), shellUrl: SHELL }), true);
  assert.equal(isSitesHomeMainFrame({ sender: sender(`${SHELL}?x`), shellUrl: SHELL }), false, "not a prefix");
  assert.equal(isSitesHomeMainFrame({ sender: sender(`${SHELL}#storage`), shellUrl: SHELL }), false, "not a prefix");
  assert.equal(isSitesHomeMainFrame({ sender: sender(SHELL.slice(0, -5)), shellUrl: SHELL }), false);
  assert.equal(isSitesHomeMainFrame({ sender: sender(SHELL, "webview"), shellUrl: SHELL }), false, "a guest is never the sites home");
  assert.equal(isSitesHomeMainFrame({ sender: sender(SHELL, "window", true), shellUrl: SHELL }), false);
});

test("sign-in removal hands the real interlock a main-built owner-dialog confirmation", async () => {
  const seen: unknown[] = [];
  const ports = { interlock: { tag: "interlock" }, ledger: { tag: "ledger" }, fs: { tag: "fs" }, root: { tag: "root" }, newToken: () => "t" };
  const remove = bindStorageSignInRemoval({
    removeAmbiguousPartition: async (required: unknown) => { seen.push(required); return { state: "removed" }; },
    ...ports,
  } as unknown as Parameters<typeof bindStorageSignInRemoval>[0]);
  assert.deepEqual(await remove({ partition: "tovu-site-a", confirmed: true, evidence: "owner-dialog" }), { state: "removed" });
  assert.deepEqual(seen, [{ partition: "tovu-site-a", ...ports, confirmation: { partition: "tovu-site-a", confirmed: true, evidence: "owner-dialog" } }]);
});

test("the sign-in confirm says website files are not touched", () => {
  const removal = storageConfirmDialog({ action: "remove-sign-in", label: "Blog" });
  assert.deepEqual([removal.buttons, removal.cancelId, removal.defaultId], [["Cancel", "Remove sign-in"], 0, 0]);
  assert.match(removal.detail, /Website files are not touched/);
  assert.doesNotMatch(storageConfirmDialog({ action: "trash-folder", label: "Old" }).detail, /not touched/);
});
