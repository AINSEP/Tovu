import type { Express } from "express";

import type { RouteDeps } from "../../types";

/**
 * @file ADR-046 Phase 3 (SPEC-034) — narrow `RouteDeps` slice for the `taxonomy` server module.
 *
 * Purpose:
 * The 5 plain taxonomy CRUD/list routes (list, create-taxonomy, create-term, rename-term,
 * assign-terms) only ever read `workspaceId`/`authorize`/`clock`/`idGen`/`outbox` plus the 4
 * taxonomy repo ports — this is a genuine narrowing (mirrors `routes/admin/media/deps.ts`'s
 * identical rationale), not a `RouteDeps`-widening extension.
 *
 * `postRepo` (2026-07-16, ADR-041/043/044/045 re-audit, TM-adr041-043-044-045-audit-001, Finding
 * 1 fix, reconciled into this branch post-merge): `assignTerms` now runs `validation-chain.ts`'s
 * `validateContentJoin` via `createPostBackedContentLookup`, which needs a workspace-scoped
 * content lookup — this is that lookup's real backing port.
 *
 * `registerAdminTaxonomyMergeTermRoutes` (the ADR-044 gated-mutation ceremony) is deliberately
 * NOT covered by this type — it also needs `gatedMutations.gatewayDeps`, and stays entangled with
 * the shared `core/gated-mutations` gateway construction the storage/recovery ceremonies use too.
 * See `modules/taxonomy.ts`'s file header for the full disclosure.
 */
export type TaxonomyRouteDeps = Pick<
  RouteDeps,
  | "workspaceId"
  | "authorize"
  | "clock"
  | "idGen"
  | "outbox"
  | "taxonomyRepo"
  | "termRepo"
  | "entryTermRepo"
  | "taxonomyRevisionRepo"
  | "postRepo"
>;

export type TaxonomyRouteRegistrar = (app: Express, deps: TaxonomyRouteDeps) => void;
