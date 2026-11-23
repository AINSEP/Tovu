/** Trusted bundled declarations, shared by namespace claims and site portability.
 * Never populate this registry from an imported archive or activate imported plugins. */
import { NEWSLETTER_DATA_MODULE } from "../../../features/newsletter/data-module-manifest.js";
import { COMMENTS_DATA_MODULE } from "../../../features/comments/types.js";
import { STORE_MANIFEST } from "@jini-ai/plugins/site/store/manifest";
import { LIPAY_MANIFEST } from "@jini-ai/plugins/site/lipay/manifest";
import type { DataModuleDecl } from "@jini-ai/core/contracts/site/db-data-modules";

export const FIRST_PARTY_DATA_MODULES: readonly DataModuleDecl[] = [STORE_MANIFEST, LIPAY_MANIFEST, NEWSLETTER_DATA_MODULE, COMMENTS_DATA_MODULE];
