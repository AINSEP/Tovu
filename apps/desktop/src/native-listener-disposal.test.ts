/** Native registration disposers must withdraw only their own channels and listeners. */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { registerFindInPageIpc, relayFindResults } from "./find-in-page-ipc.ts";
import { FIND_IN_PAGE_CHANNELS, FIND_RESULT_CHANNEL } from "./contracts/find-in-page.ts";
import { registerSpellCheckContextMenu } from "./spellcheck-menu.ts";
import type { MenuBuilder } from "./spellcheck-menu.ts";

test("disposing Find IPC removes both native channels and leaves unrelated registrations usable", () => {
  type Handler = Parameters<Parameters<typeof registerFindInPageIpc>[0]["ipcMain"]["handle"]>[1];
  const unrelated = () => "unrelated response";
  const handlers = new Map<string, Handler>([["another-feature", unrelated]]);
  const calls: unknown[] = [];
  const dispose = registerFindInPageIpc({
    ipcMain: {
      handle: (channel, listener) => { handlers.set(channel, listener); },
      removeHandler: (channel) => { handlers.delete(channel); },
    },
    browserWindow: { fromWebContents: () => ({ webContents: {
      findInPage: (text, options) => { calls.push(["find", text, options]); return 1; },
      stopFindInPage: (action) => { calls.push(["stop", action]); },
    } }) },
  });
  const find = handlers.get(FIND_IN_PAGE_CHANNELS.find);
  const stop = handlers.get(FIND_IN_PAGE_CHANNELS.stop);
  assert.ok(find && stop);
  // The native handler ignores the rest of Electron's event; use its own untyped boundary.
  find({} as Parameters<Handler>[0], { text: "website", forward: true, findNext: false });
  stop({} as Parameters<Handler>[0]);
  assert.deepEqual(calls, [["find", "website", { forward: true, findNext: false }], ["stop", "clearSelection"]]);
  dispose();
  assert.deepEqual([...handlers.keys()], ["another-feature"]);
  assert.equal(handlers.get("another-feature"), unrelated);
  assert.equal(unrelated(), "unrelated response");
});

test("disposing result relay detaches the native listener and preserves other found-in-page observers", () => {
  const events = new EventEmitter();
  const sent: unknown[] = [];
  const observed: unknown[] = [];
  events.on("found-in-page", (_event, result) => { observed.push(result); });
  const webContents = Object.assign(events, { send: (channel: string, payload: unknown) => { sent.push([channel, payload]); } });
  const dispose = relayFindResults({ window: { webContents, isDestroyed: () => false } });
  const result = { activeMatchOrdinal: 2, matches: 8 };
  events.emit("found-in-page", {}, result);
  assert.deepEqual(sent, [[FIND_RESULT_CHANNEL, result]]);
  assert.equal(events.listenerCount("found-in-page"), 2);
  dispose();
  assert.equal(events.listenerCount("found-in-page"), 1);
  events.emit("found-in-page", {}, { activeMatchOrdinal: 3, matches: 8 });
  assert.equal(sent.length, 1, "a detached window must receive no later search results");
  assert.equal(observed.length, 2, "another feature's observer must remain installed");
});

test("disposing a spelling menu stops later popups without removing another guest observer", () => {
  const events = new EventEmitter();
  let observed = 0;
  events.on("context-menu", () => { observed += 1; });
  const replacements: string[] = [];
  const webContents = Object.assign(events, {
    replaceMisspelling: (text: string) => { replacements.push(text); },
    cut: () => {}, copy: () => {}, paste: () => {}, selectAll: () => {},
    session: { addWordToSpellCheckerDictionary: (_word: string) => {} },
  });
  const templates: Parameters<MenuBuilder["buildFromTemplate"]>[0][] = [];
  let popups = 0;
  const dispose = registerSpellCheckContextMenu({ webContents, menuBuilder: {
    buildFromTemplate: (template) => { templates.push(template); return { popup: () => { popups += 1; } }; },
  } });
  const params = { isEditable: true, misspelledWord: "teh", dictionarySuggestions: ["the"],
    editFlags: { canCut: true, canCopy: true, canPaste: true, canSelectAll: true } };
  events.emit("context-menu", {}, params);
  assert.equal(popups, 1);
  const suggestion = templates[0]?.find((item) => item.label === "the");
  assert.ok(suggestion?.click);
  suggestion.click();
  assert.deepEqual(replacements, ["the"]);
  assert.equal(events.listenerCount("context-menu"), 2);
  dispose();
  assert.equal(events.listenerCount("context-menu"), 1);
  events.emit("context-menu", {}, params);
  assert.equal(popups, 1, "disposing the menu must stop native popup effects");
  assert.equal(observed, 2);
});
