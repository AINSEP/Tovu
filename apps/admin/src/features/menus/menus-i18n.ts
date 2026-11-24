/**
 * @file STAYS-HOST: host binding of the Jini Menus dictionary (`@jini-ai/admin/screens/menus/menus-i18n/create-menus-dictionary`)
 * plus product copy. The neutral dictionary data and its factory live in Jini; this file only binds
 * Tovu's own `COMMON_I18N` as the shared-words fallback and re-exports the host-facing names the
 * feature's importers already use. No entry of this dictionary names the product today — one that
 * does (K3) goes in `productEntries` below, never into the Jini package.
 */
import { COMMON_I18N } from "../../lib/i18n-common";
import { createMenusDictionary } from "@jini-ai/admin/screens/menus/menus-i18n/create-menus-dictionary";

/** `MENUS_DICT[locale]?.[key] ?? COMMON_I18N[locale]?.[key] ?? key` via `createDictionaryTranslator`
 *  (same fallback `trash-i18n.ts` uses); `use-menus.hooks.ts` and `use-menu-editor.hooks.ts` call `t` directly. */
export const { dictionary: MENUS_DICT, t } = createMenusDictionary({ commonDictionary: COMMON_I18N });
