/** Trusted bundled declarations, shared by namespace claims and site portability.
 * Never populate this registry from an imported archive or activate imported plugins. */
import { NEWSLETTER_DATA_MODULE } from "../../../features/newsletter/data-module-manifest.js";
import { COMMENTS_DATA_MODULE } from "../../../features/comments/types.js";
import { STORE_MANIFEST } from "../../../features/plugins/store/manifest.js";
import { LIPAY_MANIFEST } from "../../../features/plugins/lipay/manifest.js";
import type { DataModuleDecl } from "../../../features/plugins/data-module.js";

export const FIRST_PARTY_DATA_MODULES: readonly DataModuleDecl[] = [STORE_MANIFEST, LIPAY_MANIFEST, NEWSLETTER_DATA_MODULE, COMMENTS_DATA_MODULE];
