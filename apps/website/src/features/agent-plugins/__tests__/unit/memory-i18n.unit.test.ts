import assert from "node:assert/strict";
import test from "node:test";

import { ADMIN_LOCALES } from "#src/contracts/core/admin-locales";
import { memoryText } from "../../memory-i18n.js";

/** @file The Agent Plugin dialog copy (`memory-i18n.ts`): lookup, English fallback, and coverage of every offered admin locale. */

const KEYS = ["Save note", "Uninstall · keep memory", "Uninstall and delete memory", "Save plugin note?", "File", "Note"];
// Words that are spelled the same in the target language; everything else must actually be translated.
const SAME_WORD = new Set(["fr:Note", "it:File"]);

test("a known locale translates the key", () => {
  assert.equal(memoryText({ key: "Save note", locale: "es" }), "Guardar nota");
  assert.equal(memoryText({ key: "Uninstall and delete memory", locale: "de" }), "Deinstallieren und Speicher löschen");
});

test("English is the source: no locale, 'en', an unknown locale or an unknown key all return the key itself", () => {
  assert.equal(memoryText({ key: "Save note" }), "Save note");
  assert.equal(memoryText({ key: "Save note", locale: "en" }), "Save note");
  assert.equal(memoryText({ key: "Save note", locale: "xx-YY" }), "Save note");
  assert.equal(memoryText({ key: "Not a dialog string", locale: "es" }), "Not a dialog string");
});

test("every offered admin locale other than English translates every dialog string", () => {
  for (const { code } of ADMIN_LOCALES.filter(locale => locale.code !== "en")) {
    for (const key of KEYS) {
      const text = memoryText({ key, locale: code });
      assert.ok(text.trim().length > 0, `${code}:${key}`);
      if (!SAME_WORD.has(`${code}:${key}`)) assert.notEqual(text, key, `${code}:${key} is untranslated`);
    }
  }
});
