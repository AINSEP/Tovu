import { createDictionaryTranslator } from "@jini-ai/core/text";
import { ADMIN_COMMON_I18N } from "@jini-ai/admin/core/i18n-common";
import { ADMIN_NAV_DICT } from "@jini-ai/admin/shell/lib/admin-nav-i18n";

/** The admin sidebar's label translator, bound here at module scope (rv-g FIX 3: Jini ships the
 *  dictionary and takes the callable). Same two-step fallback every other `t()` in this app uses:
 *  translated value, else the English source string itself — never a raw dictionary-miss placeholder. */
export const translateAdminNavLabel = createDictionaryTranslator({ featureDictionary: ADMIN_NAV_DICT }, { commonDictionary: ADMIN_COMMON_I18N });
