import { describe, expect, it } from "vitest";

import { t } from "../source-control-host-i18n";

/**
 * @file The strings this admin layers over `@jini-ai/admin/source-control/source-control-i18n`: the
 * ones that name Tovu. Every locale must still translate them after the package split, and the
 * package's own entries and this app's common words must still reach the same bound `t`.
 */

const ADMIN_LOCALES = ["es", "id", "de", "zh-CN", "zh-TW", "pt-BR", "ru", "fa", "ar", "ja", "ko", "pl", "hu", "fr", "uk", "tr", "th", "it", "hi", "ur", "bn"];

const HOST_KEYS = [
  "Connect an account so Tovu can read your repositories, and push to them later. This doesn't turn your content into git-versioned files — that's a separate feature, not built yet.",
  "Stored encrypted on the server. Once saved, Tovu never displays it again.",
];

describe("source control host dictionary", () => {
  it.each(ADMIN_LOCALES)("%s translates every Tovu-naming Source Control string", (locale) => {
    // Mutation: drop a locale's block (or the hostDictionary argument) from the host file.
    for (const key of HOST_KEYS) {
      const value = t({ locale, key });
      expect(value, `${locale}: ${key}`).not.toBe(key);
      expect(value.trim(), `${locale}: ${key}`).not.toBe("");
    }
  });

  it("keeps the package's own entries and the Access Tokens link copy on the same translator", () => {
    expect(t({ locale: "de", key: "Stored encrypted on the server. Once saved, Tovu never displays it again." })).toBe("Wird verschlüsselt auf dem Server gespeichert. Nach dem Speichern zeigt Tovu es nie wieder an.");
    expect(t({ locale: "de", key: "Replace token" })).toBe("Token ersetzen");
    expect(t({ locale: "de", key: "Create access token" })).toBe("Zugriffstoken erstellen");
  });

  it("falls back to the English key for an unsupported locale", () => {
    expect(t({ locale: "xx", key: HOST_KEYS[0] })).toBe(HOST_KEYS[0]);
  });
});
