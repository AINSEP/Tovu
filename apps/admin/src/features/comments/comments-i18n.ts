/**
 * @file STAYS-HOST: host binding of the Jini Comments dictionary (`@jini-ai/admin/comments/react/comments-i18n/create-comments-dictionary`)
 * plus product copy. The neutral dictionary data and its factory live in Jini; this file only binds
 * Tovu's own `COMMON_I18N` as the shared-words fallback and re-exports the host-facing names the
 * feature's importers already use. No entry of this dictionary names the product today — one that
 * does (K3) goes in `productEntries` below, never into the Jini package.
 */
import { COMMON_I18N } from "../../lib/i18n-common";
import { createCommentsDictionary } from "@jini-ai/admin/comments/react/comments-i18n/create-comments-dictionary";

export const { t } = createCommentsDictionary({ commonDictionary: COMMON_I18N });
