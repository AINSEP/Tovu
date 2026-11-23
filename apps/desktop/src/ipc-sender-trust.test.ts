/**
 * @file `isTrustedMainFrame` — the shared "who sent this IPC message" check (B115). Fake events
 * stand in for Electron's `IpcMainInvokeEvent`: only its `sender.getURL()` and `senderFrame` matter.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { isTrustedMainFrame } from "./ipc-sender-trust.ts";

const SHELL = "file:///app/dist/renderer/index.html";
const isTrustedUrl = ({ url }: { url: string }) => url === SHELL;
const event = ({ pageUrl = SHELL, frame }: { pageUrl?: string; frame: { url: string; parent: unknown } | null | undefined }) =>
  ({ sender: { getURL: () => pageUrl }, senderFrame: frame });

test("the app's own renderer, sending from its main frame, is trusted", () => {
  assert.equal(isTrustedMainFrame({ event: event({ frame: { url: SHELL, parent: null } }), isTrustedUrl }), true);
});

test("a site page in an iframe inside the trusted window is refused, even though the window's URL is trusted", () => {
  const parent = { url: SHELL, parent: null };
  assert.equal(isTrustedMainFrame({ event: event({ frame: { url: "http://127.0.0.1:4000/", parent } }), isTrustedUrl }), false);
  // Same URL as the shell but nested: still not the shell document.
  assert.equal(isTrustedMainFrame({ event: event({ frame: { url: SHELL, parent } }), isTrustedUrl }), false);
});

test("a site page loaded as its own guest page (webview) is refused", () => {
  const site = "http://127.0.0.1:4000/";
  assert.equal(isTrustedMainFrame({ event: event({ pageUrl: site, frame: { url: site, parent: null } }), isTrustedUrl }), false);
});

test("a missing or torn-down frame reads as untrusted instead of throwing", () => {
  assert.equal(isTrustedMainFrame({ event: event({ frame: null }), isTrustedUrl }), false);
  assert.equal(isTrustedMainFrame({ event: event({ frame: undefined }), isTrustedUrl }), false);
  const torn = { sender: { getURL: () => { throw new Error("Object has been destroyed"); } }, senderFrame: { url: SHELL, parent: null } };
  assert.equal(isTrustedMainFrame({ event: torn, isTrustedUrl }), false);
});
