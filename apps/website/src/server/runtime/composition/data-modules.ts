/** Trusted bundled declarations, shared by namespace claims and site portability.
 * Never populate this registry from an imported archive or activate imported plugins. */
import { createNewsletterDataModule } from "@jini-ai/user-management/newsletter/data-module-manifest";
import { commentsDataModule } from "@jini-ai/cms/comments/site/types";
import { createStoreManifest } from "@jini-ai/plugins/site/store/manifest";
import { createLipayManifest } from "@jini-ai/plugins/site/lipay/manifest";
import type { DataModuleDecl } from "@jini-ai/core/contracts/site/db-data-modules";

/** The host's first-party publisher id. It is persisted in each built-in's `_plugin_identity` row and compared
 *  strictly on every boot, so sites that already minted `store`/`lipay` under it keep working: the engine
 *  manifests take it from here and never declare their own. Changing it is a data migration. */
export const FIRST_PARTY_PUBLISHER = "tovu-core";

// Host-side notes on the newsletter module (`@jini-ai/user-management/newsletter/data-module-manifest`),
// kept verbatim from its pre-move header and its boot-time installer's doc.

/**
 * @file Newsletter's `DataModuleDecl` for the 5 relational `p_newsletter__*` tables (ADR-PIPE-011
 * Decision §2/§3; state.spec.md §2).
 *
 * `declareDataModule()` (`@jini-ai/db/data-modules`) now implements ADR-023's full
 * accepted T1-T8 safety mechanics (SPEC-032, 2026-07-16) — exclusive-lock-guarded DDL, a durable
 * crash-recovery phase journal with mandatory boot-time restore, disk-headroom preflight, tier
 * gating, and the namespace-adoption guard — closing the gap this comment used to warn about
 * (this file was, until SPEC-032, this engine's only real production consumer running against
 * pre-acceptance spike code). `__tests__/data-module-manifest.failure-rollback.test.ts` (T010) is
 * the REQUIRED, dedicated integration test proving the snapshot-before-DDL mechanism behaves
 * correctly against THIS real manifest; it gates every task that writes to a `p_newsletter__*`
 * table (lists.ts, confirmation.ts, unsubscribe.ts, subscriptions.ts,
 * send-pipeline.ts's `freezeAudience`/`recordResult`).
 *
 * Scope: first-party bundled invocation only (ADR-034 Round-3 fold, sweep §A.2 sanction) — NOT a
 * general third-party plugin registration surface (ADR-023 §12 still rejects that in v1). Mirrors
 * `apps/website/src/features/plugins/store/manifest.ts` / `Jini packages/commerce/src/store/store-plugin.ts`'s `STORE_MANIFEST`/`activateStore` shape, which is
 * this repo's only other real caller of `declareDataModule()`.
 */

/**
 * Boot-time invocation (T011 wires the CALL SITE into `server/seed.ts`/`apps/website/src/server/runtime/composition/deps.ts`; this
 * function is the callee). Idempotent — `declareDataModule()`'s own skip-if-existing-tables logic
 * makes repeated boot calls safe (W-010).
 *
 * @throws if `declareDataModule()` reports `ok: false` — boot must NOT silently continue with a
 * half-installed Newsletter; the caller (composition root) surfaces this as a startup failure.
 *
 * Now: the callee is `installNewsletterDataModule` in that Jini module; `site-deps/boot-data.ts` binds its
 * `declareDataModule` and {@link FIRST_PARTY_PUBLISHER}, and `createNewsletterDataModule` is in {@link FIRST_PARTY_DATA_MODULES}.
 */

/** The bundled comments declaration's provenance: this host's own publisher identity. */
export const COMMENTS_DATA_MODULE_PROVENANCE = { sourceUrl: "builtin://comments", publisher: "tovu-core" };
const COMMENTS_DATA_MODULE = commentsDataModule({ provenance: COMMENTS_DATA_MODULE_PROVENANCE });

export const FIRST_PARTY_DATA_MODULES: readonly DataModuleDecl[] = [
  createStoreManifest({ publisher: FIRST_PARTY_PUBLISHER }),
  createLipayManifest({ publisher: FIRST_PARTY_PUBLISHER }),
  createNewsletterDataModule({ publisher: FIRST_PARTY_PUBLISHER }),
  COMMENTS_DATA_MODULE,
];
