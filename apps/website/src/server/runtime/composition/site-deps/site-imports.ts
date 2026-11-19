import type { composeAgentPluginBootstrap } from "./agent-plugin-bootstrap.js";
import type { providerPluginBoot } from "./provider-identity.js";
import type { ByokToolSurfaceDeps } from "#src/assistant/index";
import type { NewsletterRouteDeps } from "../../../inbound/admin-http/routes/newsletter/deps.js";
import type { composeSiteSavedKeys } from "#src/server/runtime/composition/site-portability";
import { composeSiteImportBackend } from "../site-import-backend.js";
import { createSitesWorkspace } from "#src/platform/site-dir/sites-home";
import { localSiteSupervisorForHost } from "../../lifecycle/local-site-host.js";
import { siteCreationBaseForBinding } from "#src/platform/site-dir/index";
import { startLocalSiteWhenRunning } from "#src/platform/site-dir/local-site-supervisor";

interface ConfigureSiteImportsRequired {
  resolvedSiteBinding: ReturnType<typeof composeAgentPluginBootstrap>["resolvedSiteBinding"];
  workspaceId: string;
  observability: Awaited<ReturnType<ReturnType<typeof providerPluginBoot>>>["observability"];
  tracker: Awaited<ReturnType<ReturnType<typeof providerPluginBoot>>>["tracker"];
  routeDeps: NewsletterRouteDeps & ByokToolSurfaceDeps;
  savedKeys: ReturnType<typeof composeSiteSavedKeys>;
}

export function configureSiteImports(required: ConfigureSiteImportsRequired, _optional = {}): void {
  const { resolvedSiteBinding, workspaceId, observability, tracker, routeDeps, savedKeys } = required;
  // Import needs local site creation and a known sites home, not the switcher: desktop serves
  // `<home>/<name>` pinned and starts its own sites, so it has no supervisor here.
  const importBase = siteCreationBaseForBinding({ binding: resolvedSiteBinding });
  if (importBase !== null) {
    const importSupervisor = localSiteSupervisorForHost({ binding: resolvedSiteBinding, workspaceId });
    const workspace = createSitesWorkspace({}, { cwd: importBase });
    routeDeps.siteImportBackend = composeSiteImportBackend({ workspaceId, workspace, savedKeys,
      // Wait for the new site to answer, so the import's "Open" link never points at a port still booting.
      startSite: async input => importSupervisor ? startLocalSiteWhenRunning({ supervisor: importSupervisor, name: input.name }) : { adminUrl: null, status: "stopped" },
    }, { tracker, observability,
      setupBase: "/api/admin/v1/workspaces/" + encodeURIComponent(workspaceId) + "/site-imports",
      report: ({ importId, status }) => console.info("[site-import]", importId, status) });
  }
}
