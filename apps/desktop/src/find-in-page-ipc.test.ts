/**
 * @file Direct tests for `find-in-page-ipc.ts`. No real Electron `ipcMain`/`BrowserWindow` — tiny
 * fakes that record calls, mirroring `speech/speech-ipc.test.ts`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { registerFindInPageIpc, relayFindResults } from "./find-in-page-ipc.ts";
import { FIND_IN_PAGE_CHANNELS, FIND_RESULT_CHANNEL } from "./contracts/find-in-page.ts";

/** A handler as the fake records it. */
type RecordedHandler = (...args: any[]) => unknown; // any: Electron's own IpcMain listener signature is untyped at the call site

function fakeIpcMain() {
  const handlers = new Map<string, RecordedHandler>();
  return {
    handlers,
    handle: (channel: string, fn: RecordedHandler) => handlers.set(channel, fn),
  };
}

/** Records every `findInPage`/`stopFindInPage` call one fake window's `webContents` receives. */
function fakeWebContents() {
  const calls: { method: string; args: unknown[] }[] = [];
  return {
    calls,
    findInPage: (...args: unknown[]) => calls.push({ method: "findInPage", args }),
    stopFindInPage: (...args: unknown[]) => calls.push({ method: "stopFindInPage", args }),
  };
}

/** What a real `found-in-page` event's `result` carries — more fields than `relayFindResults`
 *  reads, matching Electron's own `Result` shape. */
type FindInPageResultLike = { activeMatchOrdinal: number; matches: number; [key: string]: unknown };

function fakeBrowserWindowLookup(webContentsByEvent: Map<unknown, ReturnType<typeof fakeWebContents> | null>) {
  return {
    fromWebContents: (sender: unknown) => {
      const webContents = webContentsByEvent.get(sender);
      return webContents ? { webContents } : null;
    },
  };
}

test("registerFindInPageIpc registers both channels", () => {
  const ipcMain = fakeIpcMain();
  registerFindInPageIpc({ ipcMain, browserWindow: fakeBrowserWindowLookup(new Map()) });
  assert.equal(typeof ipcMain.handlers.get(FIND_IN_PAGE_CHANNELS.find), "function");
  assert.equal(typeof ipcMain.handlers.get(FIND_IN_PAGE_CHANNELS.stop), "function");
});

test("the find handler runs findInPage on the CALLING window, with the query's forward/findNext", () => {
  const ipcMain = fakeIpcMain();
  const sender = {};
  const webContents = fakeWebContents();
  registerFindInPageIpc({ ipcMain, browserWindow: fakeBrowserWindowLookup(new Map([[sender, webContents]])) });

  ipcMain.handlers.get(FIND_IN_PAGE_CHANNELS.find)!({ sender }, { text: "hello", forward: false, findNext: true });

  assert.deepEqual(webContents.calls, [{ method: "findInPage", args: ["hello", { forward: false, findNext: true }] }]);
});

test("the stop handler stops findInPage on the calling window with clearSelection", () => {
  const ipcMain = fakeIpcMain();
  const sender = {};
  const webContents = fakeWebContents();
  registerFindInPageIpc({ ipcMain, browserWindow: fakeBrowserWindowLookup(new Map([[sender, webContents]])) });

  ipcMain.handlers.get(FIND_IN_PAGE_CHANNELS.stop)!({ sender });

  assert.deepEqual(webContents.calls, [{ method: "stopFindInPage", args: ["clearSelection"] }]);
});

test("a sender with no resolvable window is a no-op, not a throw", () => {
  const ipcMain = fakeIpcMain();
  registerFindInPageIpc({ ipcMain, browserWindow: fakeBrowserWindowLookup(new Map()) });
  assert.doesNotThrow(() => ipcMain.handlers.get(FIND_IN_PAGE_CHANNELS.find)!({ sender: {} }, { text: "x", forward: true, findNext: true }));
  assert.doesNotThrow(() => ipcMain.handlers.get(FIND_IN_PAGE_CHANNELS.stop)!({ sender: {} }));
});

/** Records every channel + payload one fake window's `webContents.send` receives. */
function fakeRelayWindow({ destroyed = false }: { destroyed?: boolean } = {}) {
  const sent: [string, unknown][] = [];
  const listeners = new Map<string, (event: unknown, result: FindInPageResultLike) => void>();
  return {
    sent,
    isDestroyed: () => destroyed,
    webContents: {
      on: (event: string, listener: (event: unknown, result: FindInPageResultLike) => void) => listeners.set(event, listener),
      send: (channel: string, payload: unknown) => sent.push([channel, payload]),
    },
    fireFoundInPage: (result: FindInPageResultLike) => listeners.get("found-in-page")?.(undefined, result),
  };
}

test("relayFindResults forwards found-in-page to the renderer, narrowed to activeMatchOrdinal/matches", () => {
  const window = fakeRelayWindow();
  relayFindResults(window);

  window.fireFoundInPage({ requestId: 1, activeMatchOrdinal: 2, matches: 5, selectionArea: {}, finalUpdate: true });

  assert.deepEqual(window.sent, [[FIND_RESULT_CHANNEL, { activeMatchOrdinal: 2, matches: 5 }]]);
});

test("relayFindResults sends nothing once the window is destroyed", () => {
  const window = fakeRelayWindow({ destroyed: true });
  relayFindResults(window);

  window.fireFoundInPage({ activeMatchOrdinal: 1, matches: 1 });

  assert.deepEqual(window.sent, []);
});
