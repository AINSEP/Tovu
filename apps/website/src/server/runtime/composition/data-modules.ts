/** Trusted bundled declarations, shared by namespace claims and site portability.
 * Never populate this registry from an imported archive or activate imported plugins. */
import { NEWSLETTER_DATA_MODULE } from "../../../features/newsletter/data-module-manifest.js";
import { COMMENTS_DATA_MODULE } from "../../../features/comments/types.js";
import { createStoreManifest } from "@jini-ai/plugins/site/store/manifest";
import { createLipayManifest } from "@jini-ai/plugins/site/lipay/manifest";
import type { DataModuleDecl } from "@jini-ai/core/contracts/site/db-data-modules";

/** The host's first-party publisher id. It is persisted in each built-in's `_plugin_identity` row and compared
 *  strictly on every boot, so sites that already minted `store`/`lipay` under it keep working: the engine
 *  manifests take it from here and never declare their own. Changing it is a data migration. */
const FIRST_PARTY_PUBLISHER = "tovu-core";

export const FIRST_PARTY_DATA_MODULES: readonly DataModuleDecl[] = [
  createStoreManifest({ publisher: FIRST_PARTY_PUBLISHER }),
  createLipayManifest({ publisher: FIRST_PARTY_PUBLISHER }),
  NEWSLETTER_DATA_MODULE,
  COMMENTS_DATA_MODULE,
];
