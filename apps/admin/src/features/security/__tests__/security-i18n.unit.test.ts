import { describe, expect, it } from "vitest";
import { t } from "../security-i18n";

/**
 * @file `security-i18n.ts` — scoped to the one key the site-key plan (2026-09-24) item 3 added (the
 * SiteTokenTab "no key yet" note), not a full cross-locale sweep of `SECURITY_DICT` (pre-existing
 * dictionary drift elsewhere is out of scope for this fix — same reasoning `roles-i18n.unit.test.ts`
 * gives for its own narrow scope).
 */
const LOCALES = [
  "es", "id", "de", "zh-CN", "zh-TW", "pt-BR", "ru", "fa", "ar", "ja", "ko",
  "pl", "hu", "fr", "uk", "tr", "th", "it", "hi", "ur", "bn",
];

describe('t(locale, "A key is created automatically when this site starts.")', () => {
  for (const locale of LOCALES) {
    it(`translates for ${locale}`, () => {
      const translated = t(locale, "A key is created automatically when this site starts.");
      expect(translated.length).toBeGreaterThan(0);
      expect(translated).not.toBe("A key is created automatically when this site starts.");
    });
  }

  it("falls back to the English copy for an unrecognized locale", () => {
    expect(t("xx", "A key is created automatically when this site starts.")).toBe("A key is created automatically when this site starts.");
  });
});
