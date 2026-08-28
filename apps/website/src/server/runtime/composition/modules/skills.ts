import { registerSkillsListRoute } from "#src/server/inbound/admin-http/routes/skills/list";
import type { RouteDeps } from "#src/server/routes/types";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file The `skills` server module — implementation-outline.md (skills-composer-typeahead), C-003.
 * ADR-046 Phase 3 server-module convention, mirroring `modules/plugins.ts`: one registrar today
 * (C-001), a full `RouteDeps` parameter structurally narrowed to `SkillsRouteDeps` at the call site
 * — no widened or narrowed local type is needed here, the same rationale `modules/plugins.ts`'s own
 * header gives for `PluginsRouteDeps`.
 */
export function createSkillsModule(deps: RouteDeps): ServerModuleHandle {
  return {
    name: "skills",
    registerRoutes: (app) => {
      registerSkillsListRoute(app, deps);
    },
  };
}
