import { registerAdminSettingsClearRoute } from "../routes/admin/settings/clear";
import { registerAdminSettingsGetEffectiveRoute } from "../routes/admin/settings/get-effective";
import { registerAdminSettingsRegisterDefinitionsRoute } from "../routes/admin/settings/register-definitions";
import { registerAdminSettingsResetRoute } from "../routes/admin/settings/reset";
import { registerAdminSettingsSetRoute } from "../routes/admin/settings/set";
import type { SettingsRouteDeps } from "../routes/admin/settings/deps";
import type { ServerModuleHandle } from "./types";

/**
 * @file ADR-046 Phase 3 (SPEC-040) — the `settings` server module (SPEC-007 Phase 5 admin
 * settings HTTP surface, ADR-028 Settings Layered Ledger).
 *
 * `SettingsRouteDeps` (new this pass, `routes/admin/settings/deps.ts`) is a genuine
 * `Pick<RouteDeps, ...>` narrowing — see that file's header for the confirmed field set, and for
 * why `shared.ts`'s pre-existing `toWriteServiceDeps` helper was retyped from `RouteDeps` to this
 * same narrow type rather than left untouched: it already only ever reads fields
 * `SettingsRouteDeps` includes, so the retype is pure narrowing, needed so the 5 registrars below
 * (now typed `SettingsRouteRegistrar` instead of the generic `RouteRegistrar`) can still call it.
 *
 * Owns all 5 registrations (register-definitions, get-effective, set, clear, reset) — moved here
 * verbatim from `app.ts`'s `createApp()`, same registrar function bodies, no behavior change,
 * same relative order.
 */
export function createSettingsModule(deps: SettingsRouteDeps): ServerModuleHandle {
  return {
    name: "settings",
    registerRoutes: (app) => {
      registerAdminSettingsRegisterDefinitionsRoute(app, deps);
      registerAdminSettingsGetEffectiveRoute(app, deps);
      registerAdminSettingsSetRoute(app, deps);
      registerAdminSettingsClearRoute(app, deps);
      registerAdminSettingsResetRoute(app, deps);
    },
  };
}
