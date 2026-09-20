import { createDictionaryTranslator } from "../../lib/dictionary-translator";

/**
 * @file Dictionary for the Trash feature.
 *
 * Every copy string on this screen goes through `t(locale, key)` with the English copy AS the key,
 * which is this app's convention (`comments-i18n.ts`, `redirects-i18n.ts`, …). The feature
 * dictionary below is intentionally EMPTY for now: `createDictionaryTranslator` falls through to
 * the shared `COMMON_I18N` (which already carries "Trash", "Delete permanently", "Cancel",
 * "Delete", "Kind", "Title", "Status") and then to the English key itself, so nothing renders a
 * placeholder.
 *
 * Empty rather than partially filled on purpose: half a locale is worse than none — a Spanish
 * operator reading four translated column headers and an untranslated confirm dialog cannot tell
 * whether the screen is broken. The remaining strings are a translation pass, and the expensive
 * half of that work (wiring `t` at every call site) is already done here, so filling this in is
 * purely additive. See the handoff's open items.
 */
const TRASH_DICT: Record<string, Record<string, string>> = {};

export const t = createDictionaryTranslator(TRASH_DICT);
