import { describe, expect, it } from "vitest";

import { t } from "../deployment-host-i18n";

/**
 * @file The strings this admin layers over `@jini-ai/admin/deployment/deployment-i18n`: the ones that
 * name Tovu, its server or `TOVU_ADMIN_PASSWORD`. Every locale must still translate them after the
 * package split, and the package's own entries must still reach the same bound `t`.
 */

const ADMIN_LOCALES = ["es", "id", "de", "zh-CN", "zh-TW", "pt-BR", "ru", "fa", "ar", "ja", "ko", "pl", "hu", "fr", "uk", "tr", "th", "it", "hi", "ur", "bn"];

const HOST_KEYS = [
  "Still the default — set TOVU_ADMIN_PASSWORD.",
  "Stored encrypted on the server. Once saved, Tovu never displays it again.",
  "The complete Tovu server — admin, assistant, checkout, everything works.",
  "Tovu writes every published post, the home page, products and theme pages into the folder you name.",
  "token. Pick which one Tovu publishes with.",
  "Save your {credential} so Tovu can publish on your behalf.",
];

describe("deployment host dictionary", () => {
  it.each(ADMIN_LOCALES)("%s translates every Tovu-naming Deployment string", (locale) => {
    for (const key of HOST_KEYS) {
      const value = t({ locale, key });
      expect(value, `${locale}: ${key}`).not.toBe(key);
      expect(value.trim(), `${locale}: ${key}`).not.toBe("");
    }
  });

  it("keeps the package's own entries on the same translator", () => {
    expect(t({ locale: "es", key: "{host} connected" })).toBe("{host} conectado");
    expect(t({ locale: "es", key: "Still the default — set TOVU_ADMIN_PASSWORD." })).toBe("Sigue siendo la predeterminada — configura TOVU_ADMIN_PASSWORD.");
  });

  it("falls back to the English key for an unsupported locale", () => {
    expect(t({ locale: "xx", key: HOST_KEYS[0] })).toBe(HOST_KEYS[0]);
  });
});
