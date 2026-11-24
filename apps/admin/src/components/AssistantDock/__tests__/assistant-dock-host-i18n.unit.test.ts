import { describe, expect, it } from "vitest";
import { ASSISTANT_DOCK_DICT, createChatI18nAdapter, t } from "@jini-ai/admin/shell/components/AssistantDock/assistant-dock-i18n";
import { ASSISTANT_DOCK_HOST_FIELDS, CHAT_I18N_HOST_FIELDS } from "@/app-i18n";

/**
 * @file The two dock strings that name Tovu left the reusable dock dictionaries and now live in
 * `app-i18n.ts`, which hands them to the package's `t` / `createChatI18nAdapter` as `hostDictionary`.
 * This pins that every locale still gets the exact copy it had before the move.
 */

const TITLE = "Tovu assistant";
const FOLDER_NOTICE = "Folder window opened on the computer running Tovu";

describe("Tovu's dock overlay", () => {
  it("translates the dock title in every dock locale, and leaves English as the key", () => {
    for (const locale of Object.keys(ASSISTANT_DOCK_DICT)) {
      expect(t({ locale, key: TITLE, ...ASSISTANT_DOCK_HOST_FIELDS })).not.toBe(TITLE);
      expect(ASSISTANT_DOCK_DICT[locale]).not.toHaveProperty(TITLE);
    }
    expect(t({ locale: "es", key: TITLE, ...ASSISTANT_DOCK_HOST_FIELDS })).toBe("Asistente de Tovu");
    expect(t({ locale: "ja", key: TITLE, ...ASSISTANT_DOCK_HOST_FIELDS })).toBe("Tovuアシスタント");
    expect(t({ locale: "bn", key: TITLE, ...ASSISTANT_DOCK_HOST_FIELDS })).toBe("Tovu সহকারী");
    expect(t({ locale: "en", key: TITLE, ...ASSISTANT_DOCK_HOST_FIELDS })).toBe(TITLE);
  });

  it("translates the folder-window notice through the chat adapter in every dock locale", () => {
    for (const locale of Object.keys(ASSISTANT_DOCK_DICT)) {
      expect(createChatI18nAdapter({ ...CHAT_I18N_HOST_FIELDS, locale }).t(FOLDER_NOTICE)).not.toBe(FOLDER_NOTICE);
    }
    expect(createChatI18nAdapter({ ...CHAT_I18N_HOST_FIELDS, locale: "es" }).t(FOLDER_NOTICE))
      .toBe("Se abrió una ventana de carpetas en el equipo donde se ejecuta Tovu");
    expect(createChatI18nAdapter({ ...CHAT_I18N_HOST_FIELDS, locale: "tr" }).t(FOLDER_NOTICE))
      .toBe("Klasör penceresi Tovu’nun çalıştığı bilgisayarda açıldı");
  });

  it("keeps the two overlays separate, as the two dictionaries were", () => {
    expect(createChatI18nAdapter({ ...CHAT_I18N_HOST_FIELDS, locale: "es" }).t(TITLE)).toBe(TITLE);
    expect(t({ locale: "es", key: FOLDER_NOTICE, ...ASSISTANT_DOCK_HOST_FIELDS })).toBe(FOLDER_NOTICE);
  });
});
