import { describe, expect, it } from "vitest";

import { THEMES_DICT } from "../themes-i18n";

/** Every string the "Held back on import" section introduced (A452), with the placeholders each must keep. */
const HELD_BACK_KEYS: Record<string, string[]> = {
  "Held back on import": [],
  "These themes did not pass the safety checks when your site was imported, so they were set aside instead of going live. Nothing was deleted. Check a theme again, and restore it if you trust it.": [],
  "Loading held-back themes…": [],
  "failed to load held-back themes": [],
  "Retry": [],
  "Check": [],
  "Check again": [],
  "Checking…": [],
  "Restore…": [],
  "Restoring…": [],
  "{files} files, {size}": ["{files}", "{size}"],
  "1 file, {size}": ["{size}"],
  "From your original themes": [],
  "Passed the safety checks. You can restore it.": [],
  "Still fails the safety checks, so it stays held back:": [],
  "A theme with this name is already installed, so this one can't be restored.": [],
  "Restore {name}?": ["{name}"],
  "It becomes a normal theme and stays switched off until you activate it. Nothing is deleted.": [],
  "Restore": [],
  "Restored \"{name}\". It is switched off until you activate it.": ["{name}"],
  "Restoring needs your approval. Check the theme, then confirm again.": [],
  "This theme still fails the safety checks, so it stays held back.": [],
  "This theme changed since you checked it — check again.": [],
  "This theme is no longer held back. The list was refreshed.": [],
  "failed to check theme": [],
  "failed to restore theme": [],
  "Your site's chosen theme “{name}” was held back on import, so visitors see the default theme “{fallback}”. Check it under Held back on import below and restore it if you trust it.": ["{name}", "{fallback}"],
};

describe("themes-i18n: held back on import", () => {
  it.each(Object.keys(THEMES_DICT))("locale %s translates every key and keeps its placeholders", (locale) => {
    for (const [key, placeholders] of Object.entries(HELD_BACK_KEYS)) {
      const value = THEMES_DICT[locale]![key];
      expect(value, `${locale}: ${key}`).toBeTruthy();
      for (const placeholder of placeholders) expect(value, `${locale}: ${key} keeps ${placeholder}`).toContain(placeholder);
    }
  });
});
