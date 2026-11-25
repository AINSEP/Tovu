/**
 * @file STAYS-HOST: host binding of the Jini Library dictionary (`@jini-ai/admin/screens/library/library-i18n/create-library-dictionary`)
 * plus product copy. The neutral dictionary data and its factory live in Jini; this file only binds
 * Tovu's own `COMMON_I18N` as the shared-words fallback and re-exports the host-facing `t` the
 * feature's importers already use. No entry of this dictionary names the product today — one that
 * does goes in `productEntries`, never into the Jini package.
 */
import { COMMON_I18N } from "../../lib/i18n-common";
import { createLibraryDictionary } from "@jini-ai/admin/screens/library/library-i18n/create-library-dictionary";

export const { t } = createLibraryDictionary({ commonDictionary: COMMON_I18N });
