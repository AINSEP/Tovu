/**
 * @file The data-model admin registrations of `createApp`: content types/entries, taxonomy, the three gated-mutation ceremonies,
 * SEO and `GET /api/search`. Registration order is behaviour. Moved verbatim out of `app.ts`.
 */

import { registerAdminTaxonomyMergeTermRoutes } from "../../../inbound/admin-http/routes/taxonomy/merge-term.js";
import { registerAdminDatabaseMigrateForwardRoutes } from "../../../inbound/admin-http/routes/database/migrate-forward.js";
import { registerAdminRecoveryRestoreRoutes } from "../../../inbound/admin-http/routes/recovery/restore.js";
import { createTaxonomyModule } from "../modules/taxonomy.js";
import { createContentTypesModule } from "../modules/content-types.js";
import { createSeoModule } from "../modules/seo.js";
import { registerSiteSearchRoute } from "#src/server/inbound/public-http/routes/site/search";
import { mountRoutes } from "./module-handles.js";
import type { MountInput } from "./module-handles.js";

/** Content types, taxonomy, the gated-mutation ceremonies, SEO and site search, in registration order. */
export function mountAdminData({ app, routeDeps }: MountInput, _optional = {}): void {
  // ADR-046 Phase 3 (SPEC-042, final slice): the `content-types` server module (ADR-043
  // Collections backend) — all 8 registrations (content-types' list/register/update-fields/
  // lifecycle, entries' list/create/update/lifecycle). Admin-UI backend-gap closure (design-
  // spec.md §0.4) — the read-side domain functions + admin routes the Web Design pass found
  // missing across Collections, Categories & Tags (taxonomy), and the rest of Database/Recovery.
  // `mergeTerm`'s plan/confirm/execute ceremony and the migrate-forward/restore-ceremony routes
  // were deferred at the time this block was first written; see the gated-mutation route
  // registrations below for where they now live.
  mountRoutes({ app, mod: createContentTypesModule(routeDeps) });
  // ADR-046 Phase 3 (SPEC-034): the `taxonomy` server module — the 5 plain CRUD/list routes.
  // `registerAdminTaxonomyMergeTermRoutes` (the gated-mutation ceremony) stays inline below,
  // alongside the unrelated database/recovery ceremonies it shares a gateway pattern with.
  mountRoutes({ app, mod: createTaxonomyModule(routeDeps) });

  // SPEC-016 (`core/gated-mutations`'s gateway composed into a real composition root, this
  // dispatch) — the 3 deferred gated-mutation ceremonies: taxonomy `mergeTerm`, database
  // `migrate-forward`, recovery `restore`. Each registers 3 endpoints (`/plan`, `/confirm`,
  // `/execute`) mirroring `gateway.ts`'s own 3-method shape.
  registerAdminTaxonomyMergeTermRoutes(app, routeDeps);
  registerAdminDatabaseMigrateForwardRoutes(app, routeDeps);
  registerAdminRecoveryRestoreRoutes(app, routeDeps);

  // ADR-046 Phase 3 (SPEC-042, final slice): the `seo` server module (SPEC-008 SEO) — 6 admin
  // routes gated by `admin.seo.manage`, plus the 2 public site routes (sitemap.xml/robots.txt),
  // which must register before `registerSiteRoutes`'s `/:slug` catch-all below. This call site
  // sits at the exact same position the 8 inline registrations previously occupied — well before
  // `registerSiteRoutes` — so that ordering constraint is unchanged. See `modules/seo.ts`'s file
  // header for the full disclosure and the re-run `route-class-precedence.unit.test.ts` evidence.
  mountRoutes({ app, mod: createSeoModule(routeDeps) });
  // `GET /api/search` (site search, lot S4): public, audiences from the visitor's own member cookie
  // only; answers 503 `not_configured` in a composition without `siteSearch`.
  registerSiteSearchRoute(app, routeDeps);
}
