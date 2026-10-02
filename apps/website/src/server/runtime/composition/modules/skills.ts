import { registerSkillsManagementRoutes } from "#src/server/inbound/admin-http/routes/skills/manage";
import { registerSkillsListRoute } from "#src/server/inbound/admin-http/routes/skills/list";
import { registerSkillFilesRoute } from "#src/server/inbound/admin-http/routes/skills/files";
import type { RouteDeps } from "#src/server/routes/types";
import type { ServerModuleHandle } from "./types.js";

/** Composes skill listings, file inspection, guidance, installation, enablement and removal behind admin sessions. */
export function createSkillsModule(deps: RouteDeps): ServerModuleHandle {
  return {
    name: "skills",
    registerRoutes: (app) => {
      registerSkillsListRoute(app, deps);
      registerSkillFilesRoute(app, deps);
      registerSkillsManagementRoutes(app, deps);
    },
  };
}
