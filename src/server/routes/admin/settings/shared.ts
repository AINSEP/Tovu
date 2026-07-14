import type { SettingsWriteServiceDeps } from "../../../../features/settings/write-service";
import type { RouteDeps } from "../../../routes/types";

/**
 * @file Shared plumbing for the `settings` admin route registrars
 * (SPEC-007 Phase 5).
 *
 * Purpose:
 * `write-service.ts` declares its own smaller `SettingsWriteServiceDeps`
 * shape (`repo`/`clock`/`ids`/`authorize`/`principals`) rather than reusing
 * `RouteDeps` directly (see that file's header) — this adapter maps the
 * flat `RouteDeps` fields onto it once so every settings route file doesn't
 * repeat the same five-field object literal.
 */
export function toWriteServiceDeps(deps: RouteDeps): SettingsWriteServiceDeps {
  return {
    repo: deps.settingsRepo,
    clock: deps.clock,
    ids: deps.idGen,
    authorize: deps.authorize,
    principals: deps.principalRepo,
  };
}
