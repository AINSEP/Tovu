import type { Express } from "express";

import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file ADR-046 Phase 3 (SPEC-040) — narrow `RouteDeps` slice for the `settings` server module
 * (SPEC-007 Phase 5 admin settings HTTP surface).
 *
 * Purpose:
 * The 5 settings registrars (register-definitions, get-effective, set, clear, reset) only ever
 * read a fixed subset of `RouteDeps` — this is a genuine narrowing (mirrors
 * `routes/admin/taxonomy/deps.ts`'s/`routes/admin/content/deps.ts`'s identical rationale from
 * SPEC-034/038), not a widening extension.
 *
 * Each field's real reader, confirmed by reading all 5 registrar files directly:
 * - `workspaceId`/`authorize`: every one of the 5 registrars (the shared 404/403 dance).
 * - `settingsReady`: every one of the 5, awaited before touching the settings ledger.
 * - `settingsRepo`: `get-effective.ts`/`reset.ts` directly, plus `shared.ts`'s
 *   `toWriteServiceDeps` (used by `register-definitions.ts`/`set.ts`/`clear.ts`/`reset.ts`).
 * - `clock`/`idGen`/`principalRepo`: `shared.ts`'s `toWriteServiceDeps` only.
 *
 * `toWriteServiceDeps` (in `shared.ts`, pre-existing, unrelated helper) is retyped from
 * `RouteDeps` to this same `SettingsRouteDeps` — a pure narrowing, since it already only ever
 * reads fields this type includes — so the 5 registrar files below (now typed
 * `SettingsRouteRegistrar` instead of the generic `RouteRegistrar`) can still call it.
 */
export type SettingsRouteDeps = Pick<
  RouteDeps,
  "workspaceId" | "authorize" | "settingsReady" | "settingsRepo" | "clock" | "idGen" | "principalRepo"
>;

/** Registrar signature for the settings route modules (mirrors `RouteRegistrar`). */
export type SettingsRouteRegistrar = (app: Express, deps: SettingsRouteDeps) => void;
