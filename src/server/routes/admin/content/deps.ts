import type { Express } from "express";

import type { RouteDeps } from "../../types";

/**
 * @file ADR-046 Phase 3 (SPEC-038) — narrow `RouteDeps` slice for the `content` server module
 * (posts/pages/change-sets/presentation — NOT the ADR-043 Collections `content-types`/`entries`
 * domain; see `modules/content.ts`'s file header for the disambiguation).
 *
 * Purpose:
 * The 11 posts/pages/change-sets/presentation registrars only ever read a fixed subset of
 * `RouteDeps` — this is a genuine narrowing (mirrors `routes/admin/media/deps.ts`'s/
 * `routes/admin/taxonomy/deps.ts`'s identical rationale from SPEC-034), not a widening extension.
 *
 * Each field's real reader, confirmed by reading all 11 registrar files directly rather than
 * guessing:
 * - `workspaceId`/`authorize`/`clock`/`idGen`: every one of the 11 registrars.
 * - `postRepo`: posts list/create/get/update, pages list/create, and `change-sets/revert.ts`'s
 *   `reverterDeps.postRepo` (the post-entity reverter needs the same repo).
 * - `changeSets`: posts create/update, pages create (the SPEC-001 command gateway's audit trail),
 *   plus `change-sets/list.ts`/`get.ts`/`revert.ts` themselves.
 * - `outbox`: posts create/update, pages create (command-gateway side-effect queue), plus
 *   `change-sets/revert.ts`'s own `outbox` (both the gateway argument and
 *   `reverterDeps.outbox` for the settings-ledger applier).
 * - `bus`: `posts/update.ts`'s `processOutbox({ outbox, bus, clock })` drain call — SEO's
 *   sitemap-cache-invalidation subscriber needs the entry-lifecycle event delivered synchronously
 *   within the same request, mirroring the `/workspaces` route's identical inline drain.
 * - `settingsRepo`: `change-sets/revert.ts`'s `reverterDeps.settingsRepo` — the SPEC-007
 *   settings-ledger applier `core.commands.appliers` reverts through this port (ADR-PIPE-007
 *   Migration Safety), not `PresentationSettingsRepoPort`.
 * - `presentationRepo`/`themes`: `presentation/get.ts`/`presentation/patch-active-theme.ts`
 *   (`themes` via `validThemeIds(deps.themes)`).
 */
export type ContentRouteDeps = Pick<
  RouteDeps,
  | "workspaceId"
  | "authorize"
  | "clock"
  | "idGen"
  | "postRepo"
  | "changeSets"
  | "outbox"
  | "bus"
  | "settingsRepo"
  | "presentationRepo"
  | "themes"
>;

export type ContentRouteRegistrar = (app: Express, deps: ContentRouteDeps) => void;
