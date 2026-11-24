/**
 * @file STAYS-HOST: host binding of the Jini Posts dictionary (`@jini-ai/admin/posts/posts-i18n/create-posts-dictionary`)
 * plus product copy. The neutral dictionary data and its factory live in Jini; this file only binds
 * Tovu's own `COMMON_I18N` as the shared-words fallback and re-exports the host-facing names the
 * feature's importers already use. No entry of this dictionary names the product today — one that
 * does (K3) goes in `productEntries` below, never into the Jini package.
 */
import { COMMON_I18N } from "../../lib/i18n-common";
import { createPostsDictionary } from "@jini-ai/admin/posts/posts-i18n/create-posts-dictionary";

/** `POSTS_DICT[locale]?.[key] ?? COMMON_I18N[locale]?.[key] ?? key` via `createDictionaryTranslator`
 *  (same fallback `trash-i18n.ts` uses); `Posts.tsx`, `rules.ts`'s `postRowMenuItems` and
 *  `use-post-editor.hooks.ts` call `t` directly. */
export const { dictionary: POSTS_DICT, t } = createPostsDictionary({ commonDictionary: COMMON_I18N });
