/** Trusted bundled declarations, shared by namespace claims and site portability.
 * Never populate this registry from an imported archive or activate imported plugins. */
import { NEWSLETTER_DATA_MODULE } from "../../../features/newsletter/data-module-manifest.js";
import { commentsDataModule } from "@jini-ai/cms/comments/site/types";
import { STORE_MANIFEST } from "../../../features/plugins/store/manifest.js";
import { LIPAY_MANIFEST } from "../../../features/plugins/lipay/manifest.js";
import type { DataModuleDecl } from "@jini-ai/core/contracts/site/db-data-modules";

/** The bundled comments declaration's provenance: this host's own publisher identity. */
export const COMMENTS_DATA_MODULE_PROVENANCE = { sourceUrl: "builtin://comments", publisher: "tovu-core" };
const COMMENTS_DATA_MODULE = commentsDataModule({ provenance: COMMENTS_DATA_MODULE_PROVENANCE });

export const FIRST_PARTY_DATA_MODULES: readonly DataModuleDecl[] = [STORE_MANIFEST, LIPAY_MANIFEST, NEWSLETTER_DATA_MODULE, COMMENTS_DATA_MODULE];
