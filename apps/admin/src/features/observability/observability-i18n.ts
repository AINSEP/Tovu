import { createDictionaryTranslator } from "../../lib/dictionary-translator";

/**
 * @file Translations for the Observability page (`/admin/observability`). Same shape as
 * `security/security-i18n.ts`: a flat `DICT[locale][englishKey] = translation` map, `t =
 * createDictionaryTranslator(DICT)`.
 *
 * KNOWN GAP, disclosed rather than silent, same as `security-i18n.ts`'s own note: English-only for
 * v1. `createDictionaryTranslator`'s own fallback chain (`featureDict[locale]?.[key] ??
 * COMMON_I18N[locale]?.[key] ?? key`) is what makes this a legible degrade rather than a broken one
 * — a non-English reader sees this page's own copy in English inside an otherwise-translated
 * admin. Follow-up: translate into the same locale set `source-control-i18n.ts` carries.
 */

const OBSERVABILITY_DICT: Record<string, Record<string, string>> = {};

export const t = createDictionaryTranslator(OBSERVABILITY_DICT);
