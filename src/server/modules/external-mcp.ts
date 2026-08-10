import { registerAdminExternalMcpDeleteRoute } from "../routes/admin/external-mcp/delete";
import type { ExternalMcpRouteDeps } from "../routes/admin/external-mcp/deps";
import { registerAdminExternalMcpListRoute } from "../routes/admin/external-mcp/list";
import { registerAdminExternalMcpPutRoute } from "../routes/admin/external-mcp/put";
import type { ServerModuleHandle } from "./types";

/**
 * @file The `external-mcp` server module — the operator's roster of third-party MCP servers,
 * backing Settings → External MCP.
 *
 * Distinct from `modules/connectors.ts` despite both being "third-party integrations" and both
 * gating on `admin.integrations.manage`: connectors reach external ACCOUNTS through Composio's
 * hosted API, while this module configures external PROCESSES that Tovu's agent daemon launches and
 * whose tools the assistant may then call. The trust questions are different enough that
 * `mcp-federation/trust.ts` exists as a separate tier for the second one.
 *
 * Three routes, all behind `requireAdminSession` under `/api/admin`. No public route — unlike
 * connectors, nothing here is reached by an external redirect.
 */
export function createExternalMcpModule(deps: ExternalMcpRouteDeps): ServerModuleHandle {
  return {
    name: "external-mcp",
    registerRoutes: (app) => {
      // No ordering hazard of the kind `modules/connectors.ts` documents: the collection route and
      // the two `:serverId` routes differ by HTTP method or by segment count, so no literal path
      // can be swallowed as an id.
      registerAdminExternalMcpListRoute(app, deps);
      registerAdminExternalMcpPutRoute(app, deps);
      registerAdminExternalMcpDeleteRoute(app, deps);
    },
  };
}
