/** Trusted bundled declarations, shared by namespace claims and site portability.
 * Never populate this registry from an imported archive or activate imported plugins. */
import { createNewsletterDataModule } from "@jini-ai/user-management/newsletter/data-module-manifest";
import { COMMENTS_DATA_MODULE } from "../../../features/comments/types.js";
import { STORE_MANIFEST } from "../../../features/plugins/store/manifest.js";
import { LIPAY_MANIFEST } from "../../../features/plugins/lipay/manifest.js";
import type { DataModuleDecl } from "@jini-ai/core/contracts/site/db-data-modules";

/** The stored provenance publisher of every bundled data module. `checkNamespaceAdoption` compares it
 * with the stored identity row on every boot, so changing it turns repeat boots into consent refusals. */
export const FIRST_PARTY_PUBLISHER = "tovu-core";

export const FIRST_PARTY_DATA_MODULES: readonly DataModuleDecl[] = [STORE_MANIFEST, LIPAY_MANIFEST, createNewsletterDataModule({ publisher: FIRST_PARTY_PUBLISHER }), COMMENTS_DATA_MODULE];
