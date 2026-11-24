import { COMMON_I18N } from "../../lib/i18n-common";
import { createPageEditorTranslator } from "@jini-ai/admin/pages/page-editor-i18n";

import { t as postT } from "../posts/posts-i18n";

/**
 * @file Binds `@jini-ai/admin/pages/page-editor-i18n`'s Page editor translator to this app: the
 * fallback is this app's `COMMON_I18N`, and the editor vocabulary shared with the Posts editor
 * (`postEditorKeys` there) is routed to `features/posts/posts-i18n.ts`'s `t`. The dictionaries
 * themselves (`PAGE_EDITOR_DICT`, `SCRIPT_BLOCK_DICT`, markup and control copy) live in that module.
 */

/**
 * The Page editor owns its hook/error dictionary while reusing the established Posts editor
 * translator for identical editor controls.
 */
export const t = createPageEditorTranslator({ commonDictionary: COMMON_I18N }, { sharedEditorTranslator: postT });
