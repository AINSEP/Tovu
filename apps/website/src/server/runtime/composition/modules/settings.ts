import { settingsClearRoute } from "@jini-ai/cms/admin-http/routes/settings/clear";
import { settingsGetEffectiveRoute } from "@jini-ai/cms/admin-http/routes/settings/get-effective";
import { settingsGetRawRoute } from "@jini-ai/cms/admin-http/routes/settings/get-raw";
import { settingsListDefinitionsRoute } from "@jini-ai/cms/admin-http/routes/settings/list-definitions";
import { settingsRegisterDefinitionsRoute } from "@jini-ai/cms/admin-http/routes/settings/register-definitions";
import { settingsResetRoute } from "@jini-ai/cms/admin-http/routes/settings/reset";
import { settingsSetRoute } from "@jini-ai/cms/admin-http/routes/settings/set";
import { registerAdminSettingsEventsRoute } from "#src/server/inbound/admin-http/routes/settings/events";
import type { SettingsRouteDeps, SettingsRouteRegistrar } from "#src/server/inbound/admin-http/routes/settings/deps";
import {
  CROSS_PRINCIPAL_SETTINGS_READ_PERMISSION, SETTINGS_WRITE_FENCE, createTovuSettingsService, resolveUserLayerReadTarget, toWriteServiceDeps,
} from "#src/server/inbound/admin-http/routes/settings/shared";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-040) — the `settings` server module (SPEC-007 Phase 5 admin
 * settings HTTP surface, ADR-028 Settings Layered Ledger).
 *
 * `SettingsRouteDeps` (new this pass, `apps/website/src/server/inbound/admin-http/routes/settings/deps.ts`) is a genuine
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
 *
 * K1 (RT-K1-adm-settings): the seven JSON routes are Jini route specs
 * (`@jini-ai/cms/admin-http/routes/settings/*`) mounted behind the admin ports in `"direct"` mode
 * (the settings routes never consulted the publishing-credential override) with the fixed
 * `routes/settings` 500 copy. `RouteDeps` is read only here: each mount gets readiness, the ledger,
 * Tovu's protected-namespace fence and the host-composed settings service (comments-provider
 * refusal, site-title bounds, mail-cache invalidation — `createTovuSettingsService`). The SSE change
 * feed (`events.ts`) is still hand-written.
 */
/** The unexpected-failure options every settings route had (`sendAdminFailure`'s operation + copy). */
const SETTINGS_MOUNT = {
  authorization: "direct" as const,
  failure: { operation: "routes/settings", message: "The settings request could not finish." },
};

/** The port fields plus readiness, the ledger and Tovu's protected-namespace fence. `authorize` is
 *  read per request, as the hand-written routes read `deps.authorize`. */
function settingsBaseDeps({ deps }: { deps: SettingsRouteDeps }, _optional: Record<string, never> = {}) {
  const authorize: AdminJsonRoutePortDeps["authorize"] = (params) => deps.authorize(params);
  return { workspaceId: deps.workspaceId, authorize, settingsReady: deps.settingsReady, settingsRepo: deps.settingsRepo, writeFence: SETTINGS_WRITE_FENCE };
}

/** Base deps plus the host-composed settings service, built per request like the old handlers did. */
function settingsServiceDeps({ deps }: { deps: SettingsRouteDeps }, _optional: Record<string, never> = {}) {
  return { ...settingsBaseDeps({ deps }), settingsService: () => createTovuSettingsService({ deps }) };
}

/** Reads also get the cross-principal read policy (second grant check + its permission name). */
function settingsReadDeps({ deps }: { deps: SettingsRouteDeps }, _optional: Record<string, never> = {}) {
  return {
    ...settingsServiceDeps({ deps }),
    resolveReadTarget: (input: { requestedPrincipalId: string | undefined; callerPrincipalId: string }) => resolveUserLayerReadTarget({ deps, input }),
    crossPrincipalReadPermission: CROSS_PRINCIPAL_SETTINGS_READ_PERMISSION,
  };
}

export const registerAdminSettingsRegisterDefinitionsRoute: SettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  const writeDeps = { ...settingsBaseDeps({ deps }), writeServiceDeps: () => toWriteServiceDeps(deps) };
  mountAdminJsonRoute({ app, spec: settingsRegisterDefinitionsRoute, deps: writeDeps }, SETTINGS_MOUNT);
};

export const registerAdminSettingsGetEffectiveRoute: SettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: settingsGetEffectiveRoute, deps: settingsReadDeps({ deps }) }, SETTINGS_MOUNT);
};

export const registerAdminSettingsGetRawRoute: SettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: settingsGetRawRoute, deps: settingsReadDeps({ deps }) }, SETTINGS_MOUNT);
};

export const registerAdminSettingsListDefinitionsRoute: SettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: settingsListDefinitionsRoute, deps: settingsServiceDeps({ deps }) }, SETTINGS_MOUNT);
};

export const registerAdminSettingsSetRoute: SettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: settingsSetRoute, deps: settingsServiceDeps({ deps }) }, SETTINGS_MOUNT);
};

export const registerAdminSettingsClearRoute: SettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: settingsClearRoute, deps: settingsServiceDeps({ deps }) }, SETTINGS_MOUNT);
};

export const registerAdminSettingsResetRoute: SettingsRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: settingsResetRoute, deps: settingsServiceDeps({ deps }) }, SETTINGS_MOUNT);
};

export function createSettingsModule(deps: SettingsRouteDeps): ServerModuleHandle {
  return {
    name: "settings",
    registerRoutes: ({ app }, _options = {}) => {
      registerAdminSettingsRegisterDefinitionsRoute({ app, deps });
      registerAdminSettingsGetEffectiveRoute({ app, deps });
      registerAdminSettingsGetRawRoute({ app, deps });
      registerAdminSettingsListDefinitionsRoute({ app, deps });
      registerAdminSettingsSetRoute({ app, deps });
      registerAdminSettingsClearRoute({ app, deps });
      registerAdminSettingsResetRoute({ app, deps });
      registerAdminSettingsEventsRoute({ app, deps });
    },
  };
}
