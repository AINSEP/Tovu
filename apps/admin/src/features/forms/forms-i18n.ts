/**
 * @file STAYS-HOST: host binding of the Jini Forms dictionary (`@jini-ai/admin/screens/forms/create-forms-dictionary`)
 * plus product copy. The neutral dictionary data and its factory live in Jini; this file only binds
 * Tovu's own `COMMON_I18N` as the shared-words fallback and re-exports the host-facing names the
 * feature's importers already use. No entry of this dictionary names the product today — one that
 * does (K3) goes in `productEntries` below, never into the Jini package.
 */
import { COMMON_I18N } from "../../lib/i18n-common";
import { createFormsDictionary } from "@jini-ai/admin/screens/forms/create-forms-dictionary";

/** `FORMS_DICT` had no exported `t` at all before this fix — both `Jini forms/react/hooks/use-form-editor.hooks.ts` and
 *  `Jini forms/react/hooks/use-forms-list.hooks.ts` built their own no-fallback `FORMS_DICT[locale]?.[key] ?? key` inline,
 *  which is why the delete-confirm BUTTON ("Delete permanently", absent from `FORMS_DICT` in every
 *  locale) rendered English everywhere. `createDictionaryTranslator` falls through to `COMMON_I18N`
 *  before the raw English key, same as `trash-i18n.ts`. */
export const { dictionary: FORMS_DICT, t } = createFormsDictionary({ commonDictionary: COMMON_I18N });
