import {
  createRateLimiter,
  EXTERNAL_MCP_OAUTH_CALLBACK_PER_IP,
  EXTERNAL_MCP_OAUTH_PER_IP,
} from "#src/contracts/core/rate-limit/rate-limit";
import { registerAdminExternalMcpAdmissionsRoute } from "../routes/admin/external-mcp/admissions.js";
import { registerAdminExternalMcpDeleteRoute } from "../routes/admin/external-mcp/delete.js";
import type { ExternalMcpRouteDeps } from "../routes/admin/external-mcp/deps.js";
import { registerAdminExternalMcpListRoute } from "../routes/admin/external-mcp/list.js";
import {
  registerAdminExternalMcpOAuthConnectRoute,
  registerAdminExternalMcpOAuthDevicePollRoute,
  registerAdminExternalMcpOAuthDisconnectRoute,
  type ExternalMcpOAuthRouteDeps,
} from "../routes/admin/external-mcp/oauth.js";
import { createExternalMcpProbeLimiter, registerAdminExternalMcpProbeRoute } from "../routes/admin/external-mcp/probe.js";
import { registerAdminExternalMcpPutRoute } from "../routes/admin/external-mcp/put.js";
import { registerExternalMcpOAuthCallbackRoute } from "../routes/external-mcp/oauth-callback.js";
import type { ServerModuleHandle } from "./types.js";

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
 * Nine routes now, not three. Eight are behind `requireAdminSession` under `/api/admin`, and ONE is
 * PUBLIC — the OAuth callback, mounted outside that prefix because a `SameSite=Strict` cookie
 * cannot survive the cross-site redirect that reaches it. That is the same shape
 * `modules/connectors.ts` already has, and the same argument; see
 * `routes/external-mcp/oauth-callback.ts`.
 *
 * The OAuth routes are registered only when a service is wired. A deployment that never configures
 * an OAuth connection therefore serves exactly the routes it did before, including the public one —
 * an unauthenticated endpoint that can complete nothing should not exist at all. The probe and
 * admissions routes (C-007/C-008) are NOT gated the same way: a probe only NEEDS an OAuth service
 * for a connection whose own `authMode` is `"oauth"` (`probe.ts`'s `externalMcpOAuth` field is
 * optional for exactly that reason), and the admissions route never touches OAuth at all — it asks
 * the daemon, not a vendor. Gating either behind `oauthDeps` would take away a `none`/`static_env`
 * server's probe on a deployment that has never configured ANY OAuth connection, for no reason.
 */
export function createExternalMcpModule(deps: ExternalMcpRouteDeps | ExternalMcpOAuthRouteDeps): ServerModuleHandle {
  const oauthDeps = "externalMcpOAuth" in deps && deps.externalMcpOAuth !== undefined ? (deps as ExternalMcpOAuthRouteDeps) : null;
  // Separate instances per family (not one shared limiter) so a device-poll burst does not eat the
  // callback's budget — the same reasoning `modules/connectors.ts` records for its four.
  const oauthLimiter = createRateLimiter({ profile: EXTERNAL_MCP_OAUTH_PER_IP, clock: deps.clock });
  const callbackLimiter = createRateLimiter({ profile: EXTERNAL_MCP_OAUTH_CALLBACK_PER_IP, clock: deps.clock });
  const probeLimiter = createExternalMcpProbeLimiter(deps);

  return {
    name: "external-mcp",
    registerRoutes: (app) => {
      // No ordering hazard of the kind `modules/connectors.ts` documents: the collection route, the
      // `:serverId` routes, and the two new fixed-suffix routes (`/admissions`, `/:serverId/probe`)
      // all differ by HTTP method or by segment count, so no literal path can be swallowed as an id.
      registerAdminExternalMcpListRoute(app, deps);
      registerAdminExternalMcpPutRoute(app, deps);
      registerAdminExternalMcpDeleteRoute(app, deps);
      registerAdminExternalMcpAdmissionsRoute(app, deps);
      registerAdminExternalMcpProbeRoute(app, deps, probeLimiter);

      if (!oauthDeps) return;
      registerAdminExternalMcpOAuthConnectRoute(app, oauthDeps, oauthLimiter);
      registerAdminExternalMcpOAuthDevicePollRoute(app, oauthDeps, oauthLimiter);
      registerAdminExternalMcpOAuthDisconnectRoute(app, oauthDeps);

      // PUBLIC — deliberately outside `/api/admin`, so `requireAdminSession` never sees it.
      registerExternalMcpOAuthCallbackRoute(app, { oauth: oauthDeps.externalMcpOAuth, callbackLimiter });
    },
  };
}
