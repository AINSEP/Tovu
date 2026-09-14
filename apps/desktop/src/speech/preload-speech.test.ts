/**
 * @file Static-analysis tests for `preload-speech.cjs`. This file's own `contextBridge`/`ipcRenderer`
 * bridging cannot be exercised under plain `node --test` — `require("electron")` outside a real
 * Electron process resolves to a path string, not the API, so `require`-ing the module and calling
 * it would just crash on that, not prove anything about the preload's real behavior. What IS
 * testable without Electron, and is exactly the property this file's own header says matters, is its
 * SOURCE TEXT: no `require()` of anything but `"electron"` (a sandboxed preload's `require` resolves
 * only `"electron"`/`"events"`/`"timers"`/`"url"` — a relative specifier throws), and its two inlined
 * channel-name literals never drifting from `speech-ipc.ts`'s own exports, which stay the source of
 * truth for both files.
 *
 * The one decision the file makes — which page gets `window.tovuFiles` — IS exercised, by running the
 * real source in a `vm` context with a stubbed `require("electron")` (`exposedGlobalsAt` below).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { IPC_CHANNEL_IS_AVAILABLE, IPC_CHANNEL_TRANSCRIBE } from "./speech-ipc.ts";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SOURCE_PATH = path.join(__dirname, "preload-speech.cjs");
const source = fs.readFileSync(SOURCE_PATH, "utf8");

/** Every top-level `require(...)` call's argument, in source order — block comments are stripped
 *  first so a doc comment merely MENTIONING a `require(...)` call (as this file's own header does,
 *  to explain why one is forbidden) is never mistaken for an actual one. */
function requiredSpecifiers(text: string): string[] {
  const withoutBlockComments = text.replace(/\/\*[\s\S]*?\*\//g, "");
  // Group 1 is not optional, so every match carries it.
  return [...withoutBlockComments.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1] as string);
}

test("preload-speech.cjs requires nothing but \"electron\" — a sandboxed preload's require resolves no relative specifier", () => {
  assert.deepEqual(requiredSpecifiers(source), ["electron"]);
});

test("preload-speech.cjs's inlined IPC_CHANNEL_IS_AVAILABLE literal matches speech-ipc.ts's own export", () => {
  const match = source.match(/IPC_CHANNEL_IS_AVAILABLE\s*=\s*["']([^"']+)["']/);
  assert.ok(match, "expected an inlined IPC_CHANNEL_IS_AVAILABLE string literal in preload-speech.cjs");
  assert.equal(match[1], IPC_CHANNEL_IS_AVAILABLE);
});

test("preload-speech.cjs's inlined IPC_CHANNEL_TRANSCRIBE literal matches speech-ipc.ts's own export", () => {
  const match = source.match(/IPC_CHANNEL_TRANSCRIBE\s*=\s*["']([^"']+)["']/);
  assert.ok(match, "expected an inlined IPC_CHANNEL_TRANSCRIBE string literal in preload-speech.cjs");
  assert.equal(match[1], IPC_CHANNEL_TRANSCRIBE);
});

/** Runs the preload's real source in a `vm` context whose `require("electron")` is a recording stub
 *  and whose `window.location.pathname` is `pathname`, returning every global it exposes to the page,
 *  in order. This exercises the one decision the file makes (which bridges a given page gets) without
 *  Electron; the bridged calls themselves stay untested here, as the header above says. */
function exposedGlobalsAt(pathname: string): string[] {
  const exposed: string[] = [];
  const electron = {
    contextBridge: { exposeInMainWorld: (key: string) => void exposed.push(key) },
    ipcRenderer: { invoke: async () => undefined },
    webUtils: { getPathForFile: () => "" },
  };
  const requireStub = (specifier: string) => {
    assert.equal(specifier, "electron");
    return electron;
  };
  vm.runInNewContext(source, { require: requireStub, window: { location: { pathname } } }, { filename: SOURCE_PATH });
  return exposed;
}

test("window.tovuFiles is exposed on the admin surface — /admin and every path under /admin/", () => {
  for (const pathname of ["/admin", "/admin/", "/admin/posts/42"]) {
    assert.deepEqual(exposedGlobalsAt(pathname), ["tovuVoice", "tovuFiles"], `at ${pathname}`);
  }
});

test("window.tovuFiles is NOT exposed to same-origin public pages, previews, or look-alike paths", () => {
  // Every one of these loads with this same preload: `createWindow`'s same-origin `allow` popups and
  // in-window navigation, and a `<webview>` guest confined only to its origin, all reach them.
  for (const pathname of ["/", "/about", "/blog/hello-world", "/theme-assets/site.css", "/administrator", "/admin-old/"]) {
    assert.deepEqual(exposedGlobalsAt(pathname), ["tovuVoice"], `at ${pathname}`);
  }
});
