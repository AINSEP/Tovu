/**
 * @file STAYS-HOST: host binding of the Jini Categories & Tags dictionary (`@jini-ai/admin/screens/taxonomy/taxonomy-i18n/create-taxonomy-dictionary`)
 * plus product copy. The neutral dictionary data and its factory live in Jini; this file only binds
 * Tovu's own `COMMON_I18N` as the shared-words fallback and re-exports the host-facing names the
 * feature's importers already use. No entry of this dictionary names the product today — one that
 * does (K3) goes in `productEntries` below, never into the Jini package.
 */
import { COMMON_I18N } from "../../lib/i18n-common";
import { createTaxonomyDictionary } from "@jini-ai/admin/screens/taxonomy/taxonomy-i18n/create-taxonomy-dictionary";

/** `TAXONOMY_DICT[locale]?.[key] ?? COMMON_I18N[locale]?.[key] ?? key` via
 *  `createDictionaryTranslator` (same fallback `trash-i18n.ts` uses) — a shared word this dict
 *  doesn't carry for a locale still renders translated instead of falling straight to English.
 *  Exported so the feature's `.hooks.ts` files (which have no JSX and build their own `t` closure
 *  the way `Taxonomy.tsx` does) can call it directly instead of duplicating the lookup. */
export const { dictionary: TAXONOMY_DICT, t } = createTaxonomyDictionary({ commonDictionary: COMMON_I18N });
