/** P11 ST-18a.T — the desktop Storage sheet's main-process authority rules, against injected ports. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createStorageItemIds } from "./storage-item-ids.ts";
import {
  registerStorageSheetIpc, type RemovePartitionResult, type StorageIpcEvent, type StorageSheetRequired, type StorageTarget,
} from "./storage-sheet-ipc.ts";
import { STORAGE_SHEET_CHANNELS } from "../contracts/storage-sheet.ts";
import { bindTrashDismissedFolder, type TrashDismissedRequired } from "./trash-dismissed-folder.ts";

const SITES_URL = "file:///app/sites/index.html";
type Handler = (event: StorageIpcEvent, payload: unknown) => Promise<unknown>;

function harness(over: Partial<StorageSheetRequired> = {}) {
  const handlers = new Map<string, Handler>();
  const calls = { removed: [] as unknown[], trashed: [] as string[], dialogs: 0 };
  let n = 0;
  const deps: StorageSheetRequired = {
    ipcMain: { handle: (channel, listener) => { handlers.set(channel, listener as Handler); } },
    allowedSender: ({ sender }) => sender.getURL() === SITES_URL,
    listStrict: async () => ({ state: "ok", sites: [{ dir: "/sites/a", label: "Site A" }], dismissed: [{ dir: "/sites/old", label: "Old site" }] }),
    runReport: async () => ({ state: "ok", report: { totalBytes: 10, knownBytes: 10, classes: { automatic: { bytes: 4, files: 2 }, "owner-data": { bytes: 6, files: 1 } } } }),
    measureTree: async () => 7,
    partitionInventory: async () => ({ state: "ok", candidates: [{ name: "persist:site-x", path: "/profile/Partitions/site-x" }] }),
    labelForPartition: () => undefined,
    removePartition: async (input) => { calls.removed.push(input); return { state: "removed" }; },
    trashFolder: async ({ dir }) => { calls.trashed.push(dir); return { state: "trashed" }; },
    confirmDialog: async () => { calls.dialogs += 1; return true; },
    tidyActions: async () => [],
    itemIds: createStorageItemIds<StorageTarget>({ randomId: () => `id-${++n}`, now: () => 0 }),
    reportError: () => {},
    now: () => new Date(0),
    ...over,
  };
  registerStorageSheetIpc(deps);
  const frame = {};
  const sender = (id: number, url = SITES_URL) => ({ id, mainFrame: frame, isDestroyed: () => false, getURL: () => url });
  const call = (channel: string, payload: unknown = {}, event: StorageIpcEvent = { sender: sender(1), senderFrame: frame }) => handlers.get(channel)!(event, payload);
  return { call, calls, sender, frame };
}

type View = { signIns: { state: string; items: { id: string; label: string }[] }; otherFolders: { id: string }[]; sites: unknown[]; tidy: { actions: string[] } };
const list = async (h: ReturnType<typeof harness>) => await h.call(STORAGE_SHEET_CHANNELS.list) as View;
const removeSignIn = async (h: ReturnType<typeof harness>, id: string) => {
  const preview = await h.call(STORAGE_SHEET_CHANNELS.preview, { id, action: "remove-sign-in" }) as { confirmationId: string };
  return h.call(STORAGE_SHEET_CHANNELS.act, { confirmationId: preview.confirmationId });
};

test("T-18.1 listing never removes owner folders", async () => {
  const h = harness();
  const view = await list(h);
  assert.deepEqual(h.calls, { removed: [], trashed: [], dialogs: 0 });
  assert.equal(view.signIns.items[0]!.label, "Unknown website");
  assert.doesNotMatch(JSON.stringify(view), /\/sites|\/profile|persist:/, "no path or partition id crosses the bridge");
});

test("T-18.2 removing a sign-in asks first", async () => {
  const declined = harness({ confirmDialog: async () => false });
  const view = await list(declined);
  assert.deepEqual(await removeSignIn(declined, view.signIns.items[0]!.id), { state: "declined" });
  assert.deepEqual(declined.calls.removed, []);
  const h = harness();
  const id = (await list(h)).signIns.items[0]!.id;
  assert.deepEqual(await removeSignIn(h, id), { state: "done" });
  assert.equal(h.calls.dialogs, 1);
  assert.deepEqual(h.calls.removed, [{ partition: "persist:site-x", confirmed: true, evidence: "owner-dialog" }]);
});

test("T-18.3 stale or other-sender item ID is refused", async () => {
  const h = harness();
  const id = (await list(h)).signIns.items[0]!.id;
  const other = { sender: h.sender(2), senderFrame: h.frame };
  assert.deepEqual(await h.call(STORAGE_SHEET_CHANNELS.preview, { id, action: "remove-sign-in" }, other), { state: "relist" });
  const preview = await h.call(STORAGE_SHEET_CHANNELS.preview, { id, action: "remove-sign-in" }) as { confirmationId: string };
  assert.deepEqual(await h.call(STORAGE_SHEET_CHANNELS.act, { confirmationId: preview.confirmationId }, other), { state: "relist" });
  await list(h); // a relist retires every earlier ID of this sender
  assert.deepEqual(await h.call(STORAGE_SHEET_CHANNELS.act, { confirmationId: preview.confirmationId }), { state: "relist" });
  assert.deepEqual(await h.call(STORAGE_SHEET_CHANNELS.act, { partition: "persist:site-x", confirmed: true }), { state: "relist" }, "renderer target and flag are not authority");
  assert.deepEqual(h.calls.removed, []);
});

test("T-18.4 a sign-in reacquired after preview is kept (the interlock's answer is reported, never retried)", async () => {
  const kept: RemovePartitionResult = { state: "kept", reason: "busy" };
  const h = harness({ removePartition: async (input) => { h.calls.removed.push(input); return kept; } });
  const id = (await list(h)).signIns.items[0]!.id;
  assert.deepEqual(await removeSignIn(h, id), { state: "kept", reason: "in-use" });
  assert.equal(h.calls.removed.length, 1);
});

test("unknown claims or a damaged tracked list offers no sign-in action", async () => {
  assert.deepEqual((await list(harness({ partitionInventory: async () => ({ state: "unknown" }) }))).signIns, { state: "unknown" });
  assert.deepEqual((await list(harness({ listStrict: async () => ({ state: "unknown" }) }))).signIns, { state: "unknown" });
});

test("guest frame cannot call Storage IPC", async () => {
  const h = harness();
  assert.equal(await h.call(STORAGE_SHEET_CHANNELS.list, {}, { sender: h.sender(1), senderFrame: {} }), null);
  assert.equal(await h.call(STORAGE_SHEET_CHANNELS.list, {}, { sender: h.sender(1, `${SITES_URL}?x`), senderFrame: h.frame }), null);
});

test("T-18.7 no capability means no Clean or Compact", async () => {
  const h = harness();
  const view = await list(h);
  assert.deepEqual(view.tidy.actions, []);
  assert.deepEqual(await h.call(STORAGE_SHEET_CHANNELS.preview, { id: (view.sites[0] as { id: string }).id, action: "clean" }), { state: "relist" });
});

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "st18a-")));
function trashDeps(root: string, over: Partial<TrashDismissedRequired> = {}): TrashDismissedRequired & { trashed: string[] } {
  const trashed: string[] = [];
  return {
    readTrackedStrict: async () => ({ state: "ok", tracked: [], dismissed: [path.join(root, "old"), path.join(root, "link")] }),
    protectedRoots: [path.join(root, "profile")],
    fs: fs.promises,
    siteState: async () => "stopped",
    withAddOpenFence: (run) => run(),
    trashItem: async (target) => { trashed.push(target); },
    trashed,
    ...over,
  };
}

test("T-18.5 linked folder is refused", async () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, "real"));
  fs.symlinkSync(path.join(root, "real"), path.join(root, "link"));
  const deps = trashDeps(root);
  assert.deepEqual(await bindTrashDismissedFolder(deps)({ dir: path.join(root, "link") }), { state: "kept", reason: "changed" });
  assert.deepEqual(deps.trashed, []);
});

test("T-18.6 running or starting site is refused; a stopped dismissed folder goes to the OS Trash", async () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, "old"));
  const running = trashDeps(root, { siteState: async () => "running" });
  assert.deepEqual(await bindTrashDismissedFolder(running)({ dir: path.join(root, "old") }), { state: "kept", reason: "in-use" });
  const unknown = trashDeps(root, { siteState: async () => "unknown" });
  assert.deepEqual(await bindTrashDismissedFolder(unknown)({ dir: path.join(root, "old") }), { state: "kept", reason: "unknown" });
  const retracked = trashDeps(root, { readTrackedStrict: async () => ({ state: "ok", tracked: [path.join(root, "old")], dismissed: [path.join(root, "old")] }) });
  assert.deepEqual(await bindTrashDismissedFolder(retracked)({ dir: path.join(root, "old") }), { state: "kept", reason: "changed" });
  const stopped = trashDeps(root);
  assert.deepEqual(await bindTrashDismissedFolder(stopped)({ dir: path.join(root, "old") }), { state: "trashed" });
  assert.deepEqual(stopped.trashed, [path.join(root, "old")]);
  assert.ok(fs.existsSync(path.join(root, "old")), "only trashItem moves it; nothing is unlinked here");
});

test("the managed profile is never trashable even if dismissed", async () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, "profile"));
  const deps = trashDeps(root, { readTrackedStrict: async () => ({ state: "ok", tracked: [], dismissed: [path.join(root, "profile")] }) });
  assert.deepEqual(await bindTrashDismissedFolder(deps)({ dir: path.join(root, "profile") }), { state: "kept", reason: "changed" });
});

test("M18 a renderer-supplied target, path or confirmed flag is never what main acts on", async () => {
  const h = harness();
  const view = await list(h);
  const smuggled = { partition: "persist:someone-else", dir: "/etc", path: "/etc", target: "/etc", confirmed: true };
  assert.deepEqual(await h.call(STORAGE_SHEET_CHANNELS.preview, { id: "/sites/old", action: "trash-folder", ...smuggled }), { state: "relist" }, "a path is not an ID");
  const signIn = await h.call(STORAGE_SHEET_CHANNELS.preview, { id: view.signIns.items[0]!.id, action: "remove-sign-in", ...smuggled }) as { confirmationId: string };
  assert.deepEqual(await h.call(STORAGE_SHEET_CHANNELS.act, { confirmationId: signIn.confirmationId, ...smuggled }), { state: "done" });
  const folder = await h.call(STORAGE_SHEET_CHANNELS.preview, { id: view.otherFolders[0]!.id, action: "trash-folder", ...smuggled }) as { confirmationId: string };
  assert.deepEqual(await h.call(STORAGE_SHEET_CHANNELS.act, { confirmationId: folder.confirmationId, ...smuggled }), { state: "done" });
  assert.deepEqual(h.calls.removed, [{ partition: "persist:site-x", confirmed: true, evidence: "owner-dialog" }], "main's own partition, never the smuggled one");
  assert.deepEqual(h.calls.trashed, ["/sites/old"], "main's own folder, never the smuggled path");
});

test("a folder changed after confirmation is reported as kept and its confirmation cannot be replayed", async () => {
  const asked: unknown[] = [];
  const trashed: unknown[] = [];
  const h = harness({
    confirmDialog: async (request) => { asked.push(request); return true; },
    trashFolder: async (request) => { trashed.push(request); return { state: "kept", reason: "changed" }; },
  });
  const id = (await list(h)).otherFolders[0]!.id;
  const preview = await h.call(STORAGE_SHEET_CHANNELS.preview, { id, action: "trash-folder" }) as { confirmationId: string };
  assert.deepEqual(await h.call(STORAGE_SHEET_CHANNELS.act, { confirmationId: preview.confirmationId }), { state: "kept", reason: "changed" });
  assert.deepEqual(await h.call(STORAGE_SHEET_CHANNELS.act, { confirmationId: preview.confirmationId }), { state: "relist" });
  assert.deepEqual(asked, [{ action: "trash-folder", label: "Old site" }]);
  assert.deepEqual(trashed, [{ dir: "/sites/old" }]);
  assert.deepEqual(h.calls.removed, []);
});

test("a dismissed folder stays on disk when the OS refuses to trash it", async (t) => {
  const root = tmp();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, "old");
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "content.db"), "preserve these bytes");
  const attempts: string[] = [];
  const trash = bindTrashDismissedFolder(trashDeps(root, {
    trashItem: async (target) => { attempts.push(target); throw new Error("Trash on this volume is unavailable"); },
  }));
  assert.deepEqual(await trash({ dir }), { state: "kept", reason: "unknown" });
  assert.deepEqual(attempts, [dir]);
  assert.equal(fs.readFileSync(path.join(dir, "content.db"), "utf8"), "preserve these bytes");
});

test("a folder above a protected root is kept even when dismissed and stopped", async (t) => {
  const root = tmp();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "profile"));
  const deps = trashDeps(root, { readTrackedStrict: async () => ({ state: "ok", tracked: [], dismissed: [root] }) });
  assert.deepEqual(await bindTrashDismissedFolder(deps)({ dir: root }), { state: "kept", reason: "changed" });
  assert.deepEqual(deps.trashed, []);
});

test("an inconsistent registry entry cannot turn a listed website into a Trash target", async () => {
  let sequence = 0;
  const itemIds = createStorageItemIds<StorageTarget>({ randomId: () => `opaque-${++sequence}`, now: () => 0 });
  const h = harness({ itemIds });
  // Simulate a main-side producer attaching the wrong kind to a real registry entry.
  // The wire still carries only opaque IDs, so the handler must fail closed on the target's tag.
  const id = itemIds.issue({ senderId: 1, kind: "folder", target: { kind: "site", dir: "/sites/current", label: "Current site" } });
  const shown = await h.call(STORAGE_SHEET_CHANNELS.preview, { id, action: "trash-folder" }) as { confirmationId: string; state: string };
  assert.equal(shown.state, "ready");
  assert.deepEqual(await h.call(STORAGE_SHEET_CHANNELS.act, { confirmationId: shown.confirmationId }), { state: "relist" });
  assert.deepEqual(h.calls.trashed, []);
  assert.deepEqual(h.calls.removed, []);
});

/** The opaque ID is not under test here; the size fields are. */
const siteId = (view: View) => (view.sites[0] as { id: string }).id;

test("a site whose report cannot be read lists unknown sizes; a report without an automatic class lists no automatic bytes", async () => {
  const unread = await list(harness({ runReport: async () => ({ state: "unknown" }) }));
  assert.deepEqual(unread.sites, [{ id: siteId(unread), label: "Site A", totalBytes: null, automaticBytes: null, files: 0 }]);
  const ownerOnly = await list(harness({ runReport: async () => ({ state: "ok", report: { totalBytes: 6, knownBytes: 6, classes: { "owner-data": { bytes: 6, files: 3 } } } }) }));
  assert.deepEqual(ownerOnly.sites, [{ id: siteId(ownerOnly), label: "Site A", totalBytes: 6, automaticBytes: null, files: 3 }]);
});

test("a sign-in kept for a reason other than busy is reported as unknown, not in use", async () => {
  const h = harness({ removePartition: async () => ({ state: "kept", reason: "protected" }) });
  const view = await list(h);
  assert.deepEqual(await removeSignIn(h, view.signIns.items[0]!.id), { state: "kept", reason: "unknown" });
});

test("a payload that is not an object is relisted without resolving anything", async () => {
  const h = harness();
  assert.deepEqual(await h.call(STORAGE_SHEET_CHANNELS.preview, null), { state: "relist" });
  assert.deepEqual(await h.call(STORAGE_SHEET_CHANNELS.act, "confirmation"), { state: "relist" });
  assert.equal(h.calls.dialogs, 0);
});

test("a handler that throws reports the error in main and answers with the refusal, never the error text", async () => {
  const reported: { where: string; error: unknown }[] = [];
  const failure = new Error("registry unreadable at /sites");
  const h = harness({ listStrict: async () => { throw failure; }, reportError: (entry) => { reported.push(entry); } });
  assert.equal(await h.call(STORAGE_SHEET_CHANNELS.list), null);
  assert.deepEqual(reported, [{ where: "list", error: failure }]);
});
