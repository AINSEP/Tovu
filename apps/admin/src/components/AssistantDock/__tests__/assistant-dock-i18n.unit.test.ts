import { describe, expect, it } from "vitest";

import { createChatI18nAdapter } from "../assistant-dock-i18n";

/**
 * @file Coverage-gap-fill (2026-09-05). `createChatI18nAdapter`'s `t()` is exercised end-to-end
 * through every component/hook test that renders the assistant dock, but none of those ever call
 * `t()` with both a `{token}`-bearing template AND a `vars` object — the delete-confirmation string
 * is the one entry in `CHAT_PANE_I18N_DICT` that takes a `{title}` placeholder, and every test that
 * triggers a delete only asserts the confirm dialog appeared, never its literal interpolated text.
 * This drives `interpolate()` (private to `assistant-dock-i18n.ts`) directly through the one public
 * entry point that reaches it.
 */

const DELETE_TEMPLATE = 'Delete "{title}"? This cannot be undone.';

describe("createChatI18nAdapter — interpolation", () => {
  it("substitutes a {token} present in vars", () => {
    const t = createChatI18nAdapter("es").t;
    expect(t(DELETE_TEMPLATE, { title: "My Post" })).toBe('¿Eliminar "My Post"? Esta acción no se puede deshacer.');
  });

  it("leaves an unknown {token} visible rather than silently dropping it", () => {
    const t = createChatI18nAdapter("es").t;
    // `vars` is supplied but does not carry the `title` key the template asks for.
    expect(t(DELETE_TEMPLATE, {})).toBe('¿Eliminar "{title}"? Esta acción no se puede deshacer.');
  });

  it("returns the template unchanged when no vars are given at all", () => {
    const t = createChatI18nAdapter("es").t;
    expect(t(DELETE_TEMPLATE, undefined)).toBe('¿Eliminar "{title}"? Esta acción no se puede deshacer.');
  });

  it("falls back to the raw English key for an unrecognized locale, then still interpolates it", () => {
    const t = createChatI18nAdapter("xx-unknown").t;
    expect(t(DELETE_TEMPLATE, { title: "My Post" })).toBe('Delete "My Post"? This cannot be undone.');
  });
});

const CHAT_LOCALES = [
  "ar", "bn", "de", "es", "fa", "fr", "hi", "hu", "id", "it",
  "ja", "ko", "pl", "pt-BR", "ru", "th", "tr", "uk", "ur", "zh-CN", "zh-TW",
];

describe("createChatI18nAdapter — the approval card's countdown and expired label", () => {
  it.each(CHAT_LOCALES)("%s translates the countdown and keeps the time in it", (locale) => {
    const text = createChatI18nAdapter(locale).t("Expires in {time}", { time: "4:59" });
    expect(text).not.toBe("Expires in 4:59");
    expect(text).toContain("4:59");
  });

  it.each(CHAT_LOCALES)("%s translates the expired label", (locale) => {
    expect(createChatI18nAdapter(locale).t("This question expired")).not.toBe("This question expired");
  });
});

describe("createChatI18nAdapter — the typed-answer notices", () => {
  const NOTICES = [
    "That question is no longer waiting for an answer, so your message was not sent.",
    "Your answer could not be delivered. Try sending it again.",
  ];

  it.each(CHAT_LOCALES)("%s translates both notices", (locale) => {
    for (const notice of NOTICES) expect(createChatI18nAdapter(locale).t(notice)).not.toBe(notice);
  });
});
