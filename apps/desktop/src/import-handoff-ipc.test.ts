/**
 * @file The web admin's hand-off to the desktop Import tab (owner, 2026-11-10), main's half: the
 * guest's request is refused from an untrusted page, its address is shape-checked, and the sites home
 * window is brought forward and told to open Import. Plus the source check that `main/index.ts`
 * registers it with the same shell-page sender check the speech channels use.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { IMPORT_HANDOFF_ADDRESS_MAX, IMPORT_HANDOFF_CHANNELS, importHandoffRequest } from "./contracts/import-handoff.ts";
import { registerImportHandoffIpc, type ImportHandoffWindow } from "./import-handoff-ipc.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN = "http://127.0.0.1:4100/admin/import-export?tab=import";

type Handler = (event: unknown, raw: unknown) => unknown;

function fakeWindow({ minimized = false }: { minimized?: boolean } = {}) {
  const calls: unknown[][] = [];
  const window: ImportHandoffWindow = {
    isMinimized: () => minimized,
    restore: () => { calls.push(["restore"]); },
    show: () => { calls.push(["show"]); },
    focus: () => { calls.push(["focus"]); },
    webContents: { send: (channel, payload) => { calls.push(["send", channel, payload]); } },
  };
  return { window, calls };
}

function register({ windows, trusted = () => true }: { windows: () => ImportHandoffWindow[]; trusted?: (url: string) => boolean }) {
  const handlers = new Map<string, Handler>();
  registerImportHandoffIpc({
    ipcMain: { handle: (channel: string, handler: Handler) => { handlers.set(channel, handler); } },
    isTrustedSender: trusted,
    sitesHomeWindows: windows,
  });
  const handler = handlers.get(IMPORT_HANDOFF_CHANNELS.request);
  assert.ok(handler, "the request channel has a handler");
  return (raw: unknown, url = ADMIN) => handler({ senderFrame: { url } }, raw);
}

test("a trusted admin page opens the sites home's Import tab with its address, and brings the window forward", async () => {
  const { window, calls } = fakeWindow({ minimized: true });
  const call = register({ windows: () => [window] });
  assert.deepEqual(await call({ address: "  example.com  " }), { opened: true });
  assert.deepEqual(calls, [["restore"], ["show"], ["focus"], ["send", IMPORT_HANDOFF_CHANNELS.open, { address: "example.com" }]]);
});

test("without an address the Import tab still opens, empty", async () => {
  const { window, calls } = fakeWindow();
  const call = register({ windows: () => [window] });
  assert.deepEqual(await call(undefined), { opened: true });
  assert.deepEqual(calls.at(-1), ["send", IMPORT_HANDOFF_CHANNELS.open, {}]);
  assert.ok(!calls.some(([name]) => name === "restore"), "a window that is not minimized is not restored");
});

test("with no sites home window open, nothing is sent and the admin hears it was not opened", async () => {
  const call = register({ windows: () => [] });
  assert.deepEqual(await call({ address: "https://example.com" }), { opened: false });
});

test("an untrusted page is refused in plain words and no window is touched", async () => {
  const { window, calls } = fakeWindow();
  const seen: string[] = [];
  const call = register({ windows: () => [window], trusted: (url) => { seen.push(url); return false; } });
  await assert.rejects(async () => call({ address: "https://example.com" }, "https://evil.test/admin"), /isn't part of Tovu/);
  assert.deepEqual(seen, ["https://evil.test/admin"]);
  assert.deepEqual(calls, []);
});

test("a request with no sender frame is refused", async () => {
  const handlers = new Map<string, Handler>();
  registerImportHandoffIpc({
    ipcMain: { handle: (channel: string, handler: Handler) => { handlers.set(channel, handler); } },
    isTrustedSender: () => true, sitesHomeWindows: () => [],
  });
  await assert.rejects(async () => handlers.get(IMPORT_HANDOFF_CHANNELS.request)!({}, {}), /isn't part of Tovu/);
});

test("the request keeps only a bounded, nonblank string address", () => {
  assert.deepEqual(importHandoffRequest({ raw: { address: " https://example.com/a " } }), { address: "https://example.com/a" });
  assert.deepEqual(importHandoffRequest({ raw: { address: "   " } }), {});
  assert.deepEqual(importHandoffRequest({ raw: { address: 42 } }), {});
  assert.deepEqual(importHandoffRequest({ raw: { address: "x".repeat(IMPORT_HANDOFF_ADDRESS_MAX + 1) } }), {});
  assert.deepEqual(importHandoffRequest({ raw: null }), {});
  assert.deepEqual(importHandoffRequest({ raw: "https://example.com" }), {});
  assert.deepEqual(importHandoffRequest({ raw: { address: "https://example.com", extra: "dropped" } }), { address: "https://example.com" });
});

test("main/index.ts registers the hand-off with the speech channels' shell-page sender check and the sites home windows", () => {
  const source = fs.readFileSync(path.join(__dirname, "main", "index.ts"), "utf8");
  const call = source.match(/registerImportHandoffIpc\(\{([\s\S]*?)\}\);/);
  assert.ok(call, "registerImportHandoffIpc is called");
  assert.match(call[1]!, /ipcMain/);
  assert.match(call[1]!, /isTrustedSender: isShellPage/);
  assert.match(call[1]!, /sitesHomeWindows/);
  const appWide = source.slice(source.indexOf("function registerAppWideIpc"), source.indexOf("function installAppWideMenu"));
  assert.match(appWide, /registerImportHandoffIpc\(/, "registered with the other app-wide IPC, before any window can call it");
});
