import { registerAdminSettingsClearRoute } from "#src/server/inbound/admin-http/routes/settings/clear";
import { registerAdminSettingsEventsRoute } from "#src/server/inbound/admin-http/routes/settings/events";
import { registerAdminSettingsGetEffectiveRoute } from "#src/server/inbound/admin-http/routes/settings/get-effective";
import { registerAdminSettingsGetRawRoute } from "#src/server/inbound/admin-http/routes/settings/get-raw";
import { registerAdminSettingsListDefinitionsRoute } from "#src/server/inbound/admin-http/routes/settings/list-definitions";
import { registerAdminSettingsRegisterDefinitionsRoute } from "#src/server/inbound/admin-http/routes/settings/register-definitions";
import { registerAdminSettingsResetRoute } from "#src/server/inbound/admin-http/routes/settings/reset";
import { registerAdminSettingsSetRoute } from "#src/server/inbound/admin-http/routes/settings/set";
import type { SettingsRouteDeps } from "#src/server/inbound/admin-http/routes/settings/deps";
import type { ServerModuleHandle } from "./types.js";

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
 * Owns all 5 pre-existing registrations (register-definitions, get-effective, set, clear, reset) —
 * moved here verbatim from `app.ts`'s `createApp()`, same registrar function bodies, no behavior
 * change, same relative order.
 *
 * SPEC-007 `SETTINGS_GET_RAW`/`SETTINGS_LIST_DEFINITIONS` (api.spec.md, drift-audit gap): added
 * `registerAdminSettingsGetRawRoute`/`registerAdminSettingsListDefinitionsRoute` — now 7
 * registrations total, no new `SettingsRouteDeps` fields required (both read from fields the
 * existing 5 registrars already use).
 *
 * `registerAdminSettingsEventsRoute` (8th) is the SSE change feed. It is the only registration here
 * that holds its response open, and the only one that reads the revision ledger — see its own file
 * header for why a cross-process poll of `setting_revisions` is what an in-process emitter cannot
 * be. It needs no new `SettingsRouteDeps` fields.
 */
export function createSettingsModule(deps: SettingsRouteDeps): ServerModuleHandle {
  return {
    name: "settings",
    registerRoutes: (app) => {
      registerAdminSettingsRegisterDefinitionsRoute(app, deps);
      registerAdminSettingsGetEffectiveRoute(app, deps);
      registerAdminSettingsGetRawRoute(app, deps);
      registerAdminSettingsListDefinitionsRoute(app, deps);
      registerAdminSettingsSetRoute(app, deps);
      registerAdminSettingsClearRoute(app, deps);
      registerAdminSettingsResetRoute(app, deps);
      registerAdminSettingsEventsRoute(app, deps);
    },
  };
}
