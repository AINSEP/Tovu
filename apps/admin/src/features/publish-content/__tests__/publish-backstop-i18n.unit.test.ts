import { describe, expect, it } from "vitest";
import { BACKSTOP_DICT, BACKSTOP_KEYS, t } from "../publish-backstop-i18n";
import { COMMON_I18N } from "@/lib/i18n-common";

describe("send by hand translations", () => {
  it("translates every feature string in all 21 admin locales", () => {
    expect(Object.keys(BACKSTOP_DICT).sort()).toEqual(Object.keys(COMMON_I18N).sort());
    for (const [locale, dictionary] of Object.entries(BACKSTOP_DICT)) {
      for (const key of BACKSTOP_KEYS) {
        expect(dictionary[key], `${locale}: ${key}`).toBeTruthy();
        expect(t(locale, key), `${locale}: ${key}`).not.toBe(key);
      }
    }
  });
});
