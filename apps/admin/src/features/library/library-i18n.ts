/**
 * @file STAYS-HOST: host binding of the Jini Library dictionary (`@jini-ai/admin/screens/library/library-i18n/create-library-dictionary`)
 * plus product copy. The neutral dictionary data and its factory live in Jini; this file only binds
 * Tovu's own `COMMON_I18N` as the shared-words fallback and re-exports the host-facing `t` the
 * feature's importers already use. The base upload-size refusal sentence is bound here as a product entry
 * (translated once in `features/media/media-i18n.ts`); an entry that names the product goes in `productEntries` too, never into the Jini package.
 */
import { COMMON_I18N } from "../../lib/i18n-common";
import { UPLOAD_SIZE_PRODUCT_ENTRIES } from "../media/media-i18n";
import { createLibraryDictionary } from "@jini-ai/admin/screens/library/library-i18n/create-library-dictionary";

export const { t } = createLibraryDictionary({ commonDictionary: COMMON_I18N, productEntries: UPLOAD_SIZE_PRODUCT_ENTRIES });
