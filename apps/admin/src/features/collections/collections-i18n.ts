/**
 * @file STAYS-HOST: host binding of the Jini Collections dictionary (`@jini-ai/admin/screens/collections/collections-i18n/create-collections-dictionary`)
 * plus product copy. The neutral dictionary data, the lifecycle failure messages and the factory live in Jini; this
 * file only binds Tovu's own `COMMON_I18N` as the shared-words fallback and re-exports the host-facing names the
 * feature's importers already use. No entry of this dictionary names the product today — one that
 * does (K3) goes in `productEntries` below, never into the Jini package.
 */
import { COMMON_I18N } from "../../lib/i18n-common";
import { createCollectionsDictionary } from "@jini-ai/admin/screens/collections/collections-i18n/create-collections-dictionary";

/** `COLLECTIONS_DICT[locale]?.[key] ?? COMMON_I18N[locale]?.[key] ?? key` via
 *  `createDictionaryTranslator` (same fallback `trash-i18n.ts` uses). Exported so the feature's `.hooks.ts` files
 *  (which have no JSX and build their own `t` closure the way the `.tsx` screens in this feature do) can call it
 *  directly instead of duplicating the lookup; `lifecycleFailureMessage` / `entryLifecycleFailureMessage` are the
 *  lifecycle failure messages the collection hooks surface. */
export const {
  dictionary: COLLECTIONS_DICT,
  t,
  lifecycleFailureMessage,
  entryLifecycleFailureMessage,
} = createCollectionsDictionary({ commonDictionary: COMMON_I18N });
