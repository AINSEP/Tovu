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

/*
 * Host-side notes on the newsletter module (`@jini-ai/user-management/newsletter/data-module-manifest`),
 * kept verbatim from its pre-move header:
 *
 * Scope: first-party bundled invocation only (ADR-034 Round-3 fold, sweep §A.2 sanction) — NOT a
 * general third-party plugin registration surface (ADR-023 §12 still rejects that in v1). Mirrors
 * `apps/website/src/features/plugins/store/manifest.ts` / `Jini packages/commerce/src/store/store-plugin.ts`'s `STORE_MANIFEST`/`activateStore` shape, which is
 * this repo's only other real caller of `declareDataModule()`.
 *
 * Boot-time invocation (T011 wires the CALL SITE into `server/seed.ts`/`apps/website/src/server/runtime/composition/deps.ts`; this
 * function is the callee). Idempotent — `declareDataModule()`'s own skip-if-existing-tables logic
 * makes repeated boot calls safe (W-010).
 */

export const FIRST_PARTY_DATA_MODULES: readonly DataModuleDecl[] = [STORE_MANIFEST, LIPAY_MANIFEST, createNewsletterDataModule({ publisher: FIRST_PARTY_PUBLISHER }), COMMENTS_DATA_MODULE];
