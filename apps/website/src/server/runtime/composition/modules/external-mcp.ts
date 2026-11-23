import { OAuthError } from "@jini-ai/oauth";
import { ApiConnectionError } from "@jini-ai/integrations/api-connections";
import { externalMcpAdmissionsRoute } from "@jini-ai/cms/admin-http/routes/external-mcp/admissions";
import { externalMcpDeleteRoute } from "@jini-ai/cms/admin-http/routes/external-mcp/delete";
import { externalMcpListRoute } from "@jini-ai/cms/admin-http/routes/external-mcp/list";
import { externalMcpOAuthDisconnectRoute } from "@jini-ai/cms/admin-http/routes/external-mcp/oauth-disconnect";
import { externalMcpPutRoute } from "@jini-ai/cms/admin-http/routes/external-mcp/put";
import { externalMcpToolApprovalRevokeRoute, externalMcpToolApprovalsListRoute } from "@jini-ai/cms/admin-http/routes/external-mcp/tool-approvals";
import {
  createRateLimiter,
  EXTERNAL_MCP_OAUTH_CALLBACK_PER_IP,
  EXTERNAL_MCP_OAUTH_PER_IP,
} from "#src/contracts/core/rate-limit/rate-limit";
import { ToolAccessLoweringError } from "#src/assistant/external-mcp-roster-change";
import { notifyExternalMcpRosterChanged } from "#src/assistant/index";
import { describeExternalMcpOwnership, isBuiltInExternalMcpServer } from "#src/features/external-mcp/built-in-connections";
import { readServerAdmissions } from "#src/features/external-mcp/external-mcp-admissions";
import { ExternalMcpReauthRequiredError } from "#src/features/external-mcp/external-mcp-oauth";
import {
  deleteExternalMcpServer, ExternalMcpSecretStoreUnconfiguredError, ExternalMcpValidationError, listExternalMcpServerViews, saveExternalMcpServer,
} from "#src/features/external-mcp/external-mcp-store";
import { mountAdminJsonRoute, type AdminJsonRouteMountOptions, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { ExternalMcpRouteDeps, ExternalMcpRouteRegistrar } from "#src/server/inbound/admin-http/routes/external-mcp/deps";
import {
  registerAdminExternalMcpOAuthConnectRoute,
  registerAdminExternalMcpOAuthDevicePollRoute,
  type ExternalMcpOAuthRouteDeps,
} from "#src/server/inbound/admin-http/routes/external-mcp/oauth";
import { createExternalMcpProbeLimiter, registerAdminExternalMcpProbeRoute } from "#src/server/inbound/admin-http/routes/external-mcp/probe";
import { registerExternalMcpOAuthCallbackRoute } from "#src/server/runtime/composition/public-oauth-callbacks";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file The `external-mcp` server module — the operator's roster of third-party MCP servers,
 * backing Settings → External MCP.
 *
 * This module configures external MCP servers that Tovu's agent daemon connects to and whose tools
 * the assistant may then call; `Jini packages/mcp/src/federation/trust.ts` is the separate trust tier for them.
 *
 * Eleven routes now, not three. Ten are behind `requireAdminSession` under `/api/admin`, and ONE is
 * PUBLIC — the OAuth callback, mounted outside that prefix because a `SameSite=Strict` cookie
 * cannot survive the cross-site redirect that reaches it. That is the same shape
 * the connectors module already has, and the same argument; see
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
/**
 * K1 (RT-K1-adm-external-mcp): list, put, delete, admissions, both tool-approval routes and the OAuth
 * disconnect are Jini route specs (`@jini-ai/cms/admin-http/routes/external-mcp/*`) mounted behind the
 * admin ports; the family's own `guardExternalMcpRequest` was exactly the workspace 404 + "direct"
 * `admin.integrations.manage` check those ports run. Probe, OAuth connect/sign-in, device poll and the
 * shared-connection routes stay hand-written in `routes/external-mcp/`: they key a rate limiter on
 * the client IP, redirect, set cookies or check the session credential, none of which a JSON spec sees.
 * `RouteDeps` is read only here; each mount builds that route's small deps, binding the host's store,
 * roster trigger, ownership list and error classes (as predicates) the specs cannot import.
 */

/** The two port fields every mount passes. `authorize` is read per request, as the hand-written
 *  routes read `deps.authorize`, so a later reassignment of it is still honoured. */
function externalMcpPortDeps({ deps }: { deps: ExternalMcpRouteDeps }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/**
 * Every route in this family authorized `direct` (never the publishing-credential override), with one
 * check each. None opts into `deferMissingPrincipal`: the hand-written `guardExternalMcpRequest` read
 * the session before any route looked at its params or body, so a missing session stays a 500 first.
 */
function mountOptions({ operation }: { operation: string }, _optional: Record<string, never> = {}): AdminJsonRouteMountOptions {
  return { authorization: "direct", failure: { operation, code: "INTERNAL_ERROR" } };
}

/** Tags a row with the runtime's built-in provenance list. */
function ownershipFor({ deps }: { deps: ExternalMcpRouteDeps }, _optional: Record<string, never> = {}) {
  return <T extends { serverId: string }>({ server }: { server: T }, _o: Record<string, never> = {}) => describeExternalMcpOwnership({ server, ids: deps.builtInExternalMcpServerIds });
}

/** The spec's error predicate for one host/other-package class: `instanceof` the real class, as a guard. */
function instanceOf<E>({ ErrorClass }: { ErrorClass: abstract new (...args: never[]) => E }, _optional: Record<string, never> = {}) {
  return (required: { err: unknown }, _o: Record<string, never> = {}): required is { err: E } => required.err instanceof ErrorClass;
}

const isValidationError = instanceOf({ ErrorClass: ExternalMcpValidationError });
const isSecretStoreUnconfiguredError = instanceOf({ ErrorClass: ExternalMcpSecretStoreUnconfiguredError });

export const registerAdminExternalMcpListRoute: ExternalMcpRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({
    app, spec: externalMcpListRoute,
    deps: {
      ...externalMcpPortDeps({ deps }), describeOwnership: ownershipFor({ deps }),
      listServers: ({ workspaceId }) => listExternalMcpServerViews({ deps: { repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer }, workspaceId }),
    },
  }, mountOptions({ operation: "routes/external-mcp/list" }));
};

export const registerAdminExternalMcpPutRoute: ExternalMcpRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({
    app, spec: externalMcpPutRoute,
    deps: {
      ...externalMcpPortDeps({ deps }), describeOwnership: ownershipFor({ deps }),
      saveServer: (input) => saveExternalMcpServer({ repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock }, input),
      notifyRosterChanged: (optional) => notifyExternalMcpRosterChanged(optional),
      isToolAccessLoweringError: instanceOf({ ErrorClass: ToolAccessLoweringError }),
      isValidationError, isSecretStoreUnconfiguredError,
    },
  }, mountOptions({ operation: "routes/external-mcp/put" }));
};

export const registerAdminExternalMcpDeleteRoute: ExternalMcpRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({
    app, spec: externalMcpDeleteRoute,
    deps: {
      ...externalMcpPortDeps({ deps }),
      isBuiltInServer: ({ serverId }) => isBuiltInExternalMcpServer({ serverId, ids: deps.builtInExternalMcpServerIds }),
      deleteServer: (input) => deleteExternalMcpServer({ repo: deps.externalMcpServerRepo }, input),
    },
  }, mountOptions({ operation: "routes/external-mcp/delete" }));
};

export const registerAdminExternalMcpAdmissionsRoute: ExternalMcpRouteRegistrar = ({ app, deps }, _options = {}) => {
  // No composed reader reads the server-owned federation directly (its own unavailable 503).
  const readAdmissions = () => deps.externalMcpAdmissions?.() ?? readServerAdmissions({}, {});
  mountAdminJsonRoute({ app, spec: externalMcpAdmissionsRoute, deps: { ...externalMcpPortDeps({ deps }), readAdmissions } }, mountOptions({ operation: "routes/external-mcp/admissions" }));
};

export const registerAdminExternalMcpToolApprovalsRoutes: ExternalMcpRouteRegistrar = ({ app, deps }, _options = {}) => {
  const approvalDeps = { ...externalMcpPortDeps({ deps }), toolApprovalRepo: deps.externalMcpToolApprovalRepo };
  mountAdminJsonRoute({ app, spec: externalMcpToolApprovalsListRoute, deps: approvalDeps }, mountOptions({ operation: "routes/external-mcp/tool-approvals" }));
  mountAdminJsonRoute({ app, spec: externalMcpToolApprovalRevokeRoute, deps: approvalDeps }, mountOptions({ operation: "routes/external-mcp/tool-approvals" }));
};

/** `DELETE .../mcp-servers/:serverId/oauth`; registered only when an OAuth service is wired. */
export function registerAdminExternalMcpOAuthDisconnectRoute({ app, deps }: { app: import("express").Express; deps: ExternalMcpOAuthRouteDeps }, _optional = {}): void {
  mountAdminJsonRoute({
    app, spec: externalMcpOAuthDisconnectRoute,
    deps: {
      ...externalMcpPortDeps({ deps }),
      disconnect: (input) => deps.externalMcpOAuth.disconnect(input),
      isApiConnectionError: instanceOf({ ErrorClass: ApiConnectionError }),
      isValidationError,
      isReauthRequiredError: instanceOf({ ErrorClass: ExternalMcpReauthRequiredError }),
      isSecretStoreUnconfiguredError,
      isOAuthError: instanceOf({ ErrorClass: OAuthError }),
    },
  }, mountOptions({ operation: "routes/external-mcp/oauth" }));
}

export function createExternalMcpModule(deps: ExternalMcpRouteDeps | ExternalMcpOAuthRouteDeps, _optional: Record<string, never> = {}): ServerModuleHandle {
  const oauthDeps = "externalMcpOAuth" in deps && deps.externalMcpOAuth !== undefined ? (deps as ExternalMcpOAuthRouteDeps) : null;
  // Separate instances per family (not one shared limiter) so a device-poll burst does not eat the
  // callback's budget — the same reasoning the connectors module records for its four.
  const oauthLimiter = createRateLimiter({ profile: EXTERNAL_MCP_OAUTH_PER_IP, clock: deps.clock });
  const callbackLimiter = createRateLimiter({ profile: EXTERNAL_MCP_OAUTH_CALLBACK_PER_IP, clock: deps.clock });
  const probeLimiter = createExternalMcpProbeLimiter(deps);

  return {
    name: "external-mcp",
    registerRoutes: ({ app }, _options = {}) => {
      // No ordering hazard of the kind the connectors module documents: the collection route, the
      // `:serverId` routes, and the two new fixed-suffix routes (`/admissions`, `/:serverId/probe`)
      // all differ by HTTP method or by segment count, so no literal path can be swallowed as an id.
      registerAdminExternalMcpListRoute({ app, deps });
      registerAdminExternalMcpPutRoute({ app, deps });
      registerAdminExternalMcpDeleteRoute({ app, deps });
      registerAdminExternalMcpAdmissionsRoute({ app, deps });
      registerAdminExternalMcpProbeRoute({ app, deps, limiter: probeLimiter });
      // `GET /tool-approvals` is registered before nothing it could be mistaken for: there is no
      // `GET /:serverId`, and the revoke path has four segments past `mcp-servers`.
      registerAdminExternalMcpToolApprovalsRoutes({ app, deps });

      if (!oauthDeps) return;
      registerAdminExternalMcpOAuthConnectRoute({ app, deps: oauthDeps, limiter: oauthLimiter });
      registerAdminExternalMcpOAuthDevicePollRoute({ app, deps: oauthDeps, limiter: oauthLimiter });
      registerAdminExternalMcpOAuthDisconnectRoute({ app, deps: oauthDeps });

      // PUBLIC — deliberately outside `/api/admin`, so `requireAdminSession` never sees it.
      registerExternalMcpOAuthCallbackRoute({ app, deps: { oauth: oauthDeps.externalMcpOAuth, callbackLimiter } });
    },
  };
}
