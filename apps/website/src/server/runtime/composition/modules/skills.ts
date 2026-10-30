import { registerSkillsManagementRoutes } from "#src/server/inbound/admin-http/routes/skills/manage";
import { registerSkillsListRoute } from "#src/server/inbound/admin-http/routes/skills/list";
import { registerSkillFilesRoute } from "#src/server/inbound/admin-http/routes/skills/files";
import type { SkillsRouteDeps } from "#src/server/inbound/admin-http/routes/skills/deps";
import type { ServerModuleHandle } from "./types.js";
import { withExtensionApprovalPolicy } from "#src/assistant/assistant-tool-approval-policy";

/** Composes skill listings, file inspection, guidance, installation, enablement and removal behind admin sessions. */
export function createSkillsModule(deps: SkillsRouteDeps): ServerModuleHandle {
  return {
    name: "skills",
    registerRoutes: (app) => {
      registerSkillsListRoute(app, deps);
      registerSkillFilesRoute(app, deps);
      registerSkillsManagementRoutes(app, { ...deps, withExtensionApprovalPolicy });
    },
  };
}
