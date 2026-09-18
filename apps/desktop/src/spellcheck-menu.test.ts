/**
 * @file Coverage for `spellcheck-menu.ts`: the menu `buildSpellCheckMenuTemplate` builds for a
 * misspelling, for a plain editable field, for neither, and the registration that pops it.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildSpellCheckMenuTemplate, registerSpellCheckContextMenu, type SpellCheckContextMenuParams } from "./spellcheck-menu.ts";

const EDIT_FLAGS_FULL = { canCut: true, canCopy: true, canPaste: true, canSelectAll: true };
const EDIT_FLAGS_NONE = { canCut: false, canCopy: false, canPaste: false, canSelectAll: false };

function params(overrides: Partial<SpellCheckContextMenuParams> = {}): SpellCheckContextMenuParams {
  return { isEditable: false, misspelledWord: "", dictionarySuggestions: [], editFlags: EDIT_FLAGS_NONE, ...overrides };
}

function fakeHandlers() {
  const calls: unknown[][] = [];
  return {
    calls,
    replace: (word: string) => calls.push(["replace", word]),
    addToDictionary: (word: string) => calls.push(["addToDictionary", word]),
    cut: () => calls.push(["cut"]),
    copy: () => calls.push(["copy"]),
    paste: () => calls.push(["paste"]),
    selectAll: () => calls.push(["selectAll"]),
  };
}

/** Reduces a template to `[label-or-type, enabled]` pairs a test can `deepEqual` against. */
function shape(template: ReturnType<typeof buildSpellCheckMenuTemplate>) {
  return template.map((entry) => [
    "type" in entry ? entry.type : entry.label,
    "enabled" in entry ? entry.enabled : undefined,
  ]);
}

test("neither editable nor misspelled: no menu at all", () => {
  assert.deepEqual(buildSpellCheckMenuTemplate(params(), fakeHandlers()), []);
});

test("misspelled with suggestions: each suggestion, a separator, then Add to Dictionary", () => {
  const template = buildSpellCheckMenuTemplate(
    params({ misspelledWord: "teh", dictionarySuggestions: ["the", "ten"] }),
    fakeHandlers(),
  );
  assert.deepEqual(shape(template), [
    ["the", undefined],
    ["ten", undefined],
    ["separator", undefined],
    ["Add to Dictionary", undefined],
  ]);
});

test("misspelled with no suggestions: a disabled placeholder, still offers Add to Dictionary", () => {
  const template = buildSpellCheckMenuTemplate(params({ misspelledWord: "asdkjh" }), fakeHandlers());
  assert.deepEqual(shape(template), [
    ["No suggestions", false],
    ["separator", undefined],
    ["Add to Dictionary", undefined],
  ]);
});

test("suggestions are capped at 5, even when the dictionary offers more", () => {
  const suggestions = ["a", "b", "c", "d", "e", "f", "g"];
  const template = buildSpellCheckMenuTemplate(params({ misspelledWord: "x", dictionarySuggestions: suggestions }), fakeHandlers());
  const labels = shape(template).map(([label]) => label);
  assert.deepEqual(labels.slice(0, 5), ["a", "b", "c", "d", "e"]);
  assert.ok(!labels.includes("f") && !labels.includes("g"), "suggestions past the cap must not appear");
});

test("clicking a suggestion replaces the misspelling with THAT word", () => {
  const handlers = fakeHandlers();
  const template = buildSpellCheckMenuTemplate(params({ misspelledWord: "teh", dictionarySuggestions: ["the", "ten"] }), handlers);
  const tenItem = template.find((entry) => "label" in entry && entry.label === "ten");
  assert.ok(tenItem && "click" in tenItem && typeof tenItem.click === "function");
  (tenItem as { click: () => void }).click();
  assert.deepEqual(handlers.calls, [["replace", "ten"]]);
});

test("clicking Add to Dictionary adds the misspelled word, not a suggestion", () => {
  const handlers = fakeHandlers();
  const template = buildSpellCheckMenuTemplate(params({ misspelledWord: "teh", dictionarySuggestions: ["the"] }), handlers);
  const addItem = template.find((entry) => "label" in entry && entry.label === "Add to Dictionary");
  (addItem as { click: () => void }).click();
  assert.deepEqual(handlers.calls, [["addToDictionary", "teh"]]);
});

test("editable, not misspelled: Cut/Copy/Paste, a separator, Select All — no suggestions section", () => {
  const template = buildSpellCheckMenuTemplate(params({ isEditable: true, editFlags: EDIT_FLAGS_FULL }), fakeHandlers());
  assert.deepEqual(shape(template), [
    ["Cut", true],
    ["Copy", true],
    ["Paste", true],
    ["separator", undefined],
    ["Select All", true],
  ]);
});

test("edit commands respect editFlags — a read-only selection has Copy enabled but not Cut/Paste", () => {
  const template = buildSpellCheckMenuTemplate(
    params({ isEditable: true, editFlags: { canCut: false, canCopy: true, canPaste: false, canSelectAll: true } }),
    fakeHandlers(),
  );
  const enabled = Object.fromEntries(shape(template));
  assert.equal(enabled.Cut, false);
  assert.equal(enabled.Copy, true);
  assert.equal(enabled.Paste, false);
  assert.equal(enabled["Select All"], true);
});

test("misspelled AND editable: suggestions section, a separator, then the edit commands", () => {
  const template = buildSpellCheckMenuTemplate(
    params({ isEditable: true, misspelledWord: "teh", dictionarySuggestions: ["the"], editFlags: EDIT_FLAGS_FULL }),
    fakeHandlers(),
  );
  assert.deepEqual(shape(template), [
    ["the", undefined],
    ["separator", undefined],
    ["Add to Dictionary", undefined],
    ["separator", undefined],
    ["Cut", true],
    ["Copy", true],
    ["Paste", true],
    ["separator", undefined],
    ["Select All", true],
  ]);
});

test("clicking an edit command calls the matching webContents method", () => {
  const handlers = fakeHandlers();
  const template = buildSpellCheckMenuTemplate(params({ isEditable: true, editFlags: EDIT_FLAGS_FULL }), handlers);
  const paste = template.find((entry) => "label" in entry && entry.label === "Paste");
  (paste as { click: () => void }).click();
  assert.deepEqual(handlers.calls, [["paste"]]);
});

/** A `webContents` stand-in that records imperative calls and lets a test fire its own `context-menu`. */
function fakeWebContents() {
  const calls: unknown[][] = [];
  let fire: ((event: unknown, params: SpellCheckContextMenuParams) => void) | null = null;
  return {
    calls,
    on: (_event: "context-menu", listener: typeof fire) => {
      fire = listener;
    },
    fireContextMenu: (p: SpellCheckContextMenuParams) => fire?.(undefined, p),
    replaceMisspelling: (text: string) => calls.push(["replaceMisspelling", text]),
    cut: () => calls.push(["cut"]),
    copy: () => calls.push(["copy"]),
    paste: () => calls.push(["paste"]),
    selectAll: () => calls.push(["selectAll"]),
    session: { addWordToSpellCheckerDictionary: (word: string) => calls.push(["addWordToSpellCheckerDictionary", word]) },
  };
}

/** A `Menu.buildFromTemplate` stand-in that records the template it was given and whether `popup` fired. */
function fakeMenuBuilder() {
  const templates: unknown[][] = [];
  let popped = 0;
  return {
    templates,
    poppedCount: () => popped,
    buildFromTemplate: (template: unknown[]) => {
      templates.push(template);
      return { popup: () => void popped++ };
    },
  };
}

test("registerSpellCheckContextMenu: a click with nothing to offer shows no menu", () => {
  const webContents = fakeWebContents();
  const menuBuilder = fakeMenuBuilder();
  registerSpellCheckContextMenu(webContents, menuBuilder);
  webContents.fireContextMenu(params());
  assert.equal(menuBuilder.poppedCount(), 0);
});

test("registerSpellCheckContextMenu: a misspelling pops the built menu, and its handlers reach the real webContents", () => {
  const webContents = fakeWebContents();
  const menuBuilder = fakeMenuBuilder();
  registerSpellCheckContextMenu(webContents, menuBuilder);
  webContents.fireContextMenu(params({ misspelledWord: "teh", dictionarySuggestions: ["the"] }));
  assert.equal(menuBuilder.poppedCount(), 1);

  const [template] = menuBuilder.templates;
  const theItem = (template as { label?: string; click?: () => void }[]).find((entry) => entry.label === "the");
  theItem?.click?.();
  assert.deepEqual(webContents.calls, [["replaceMisspelling", "the"]]);
});
