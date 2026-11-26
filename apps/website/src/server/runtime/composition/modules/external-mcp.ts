import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
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
import { ToolAccessLoweringError } from "@jini-ai/core/tool-access-change";
import { notifyExternalMcpRosterChanged } from "#src/assistant/index";
import { describeExternalMcpOwnership, isBuiltInExternalMcpServer } from "@jini-ai/mcp/external/built-in-connections";
import { readServerAdmissions } from "#src/features/external-mcp/external-mcp-host-copy";
import { ExternalMcpReauthRequiredError } from "#src/features/external-mcp/external-mcp-oauth";
import { deleteExternalMcpServer, ExternalMcpSecretStoreUnconfiguredError, ExternalMcpValidationError } from "@jini-ai/mcp/federation/hosted";
import { listExternalMcpServerViews, saveExternalMcpServer } from "#src/features/external-mcp/external-mcp-store";
import { mountAdminJsonRoute, type AdminJsonRouteMountOptions, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { ExternalMcpRouteDeps, ExternalMcpRouteRegistrar, ExternalMcpOAuthRouteDeps } from "#src/server/inbound/admin-http/routes/external-mcp/deps";
import {
  registerAdminExternalMcpOAuthConnectRoute,
  registerAdminExternalMcpOAuthDevicePollRoute,
} from "#src/server/inbound/admin-http/routes/external-mcp/oauth";
import { registerExternalMcpProbeRoute } from "@jini-ai/cms/admin-http/routes/external-mcp/probe";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { probeExternalMcpServer, type ExternalMcpProbeServiceDeps } from "#src/features/external-mcp/external-mcp-host-copy";
import { OUTBOUND_CALL_PER_IP, resolveClientIp, type RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { asyncRoute } from "#src/platform/express/async-route";
import type { Express, RequestHandler } from "express";
import { registerExternalMcpOAuthCallbackRoute } from "#src/server/runtime/composition/public-oauth-callbacks";
import type { RouteRegistration, ServerModuleHandle } from "./types.js";

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

export const registerAdminExternalMcpListRoute: ExternalMcpRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  mountAdminJsonRoute({ errors,
    app, spec: externalMcpListRoute,
    deps: {
      ...externalMcpPortDeps({ deps }), describeOwnership: ownershipFor({ deps }),
      listServers: ({ workspaceId }) => listExternalMcpServerViews({ deps: { repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer }, workspaceId }),
    },
  }, mountOptions({ operation: "routes/external-mcp/list" }));
};

export const registerAdminExternalMcpPutRoute: ExternalMcpRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  mountAdminJsonRoute({ errors,
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

export const registerAdminExternalMcpDeleteRoute: ExternalMcpRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  mountAdminJsonRoute({ errors,
    app, spec: externalMcpDeleteRoute,
    deps: {
      ...externalMcpPortDeps({ deps }),
      isBuiltInServer: ({ serverId }) => isBuiltInExternalMcpServer({ serverId, ids: deps.builtInExternalMcpServerIds }),
      deleteServer: (input) => deleteExternalMcpServer({ repo: deps.externalMcpServerRepo }, input),
    },
  }, mountOptions({ operation: "routes/external-mcp/delete" }));
};

export const registerAdminExternalMcpAdmissionsRoute: ExternalMcpRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  // No composed reader reads the server-owned federation directly (its own unavailable 503).
  const readAdmissions = () => deps.externalMcpAdmissions?.() ?? readServerAdmissions({}, {});
  mountAdminJsonRoute({ errors, app, spec: externalMcpAdmissionsRoute, deps: { ...externalMcpPortDeps({ deps }), readAdmissions } }, mountOptions({ operation: "routes/external-mcp/admissions" }));
};

/**
 * The "Always allow" list and revoke, each bound to its own port over the approval store. A
 * composition with no store (`externalMcpToolApprovalRepo` unset) can have saved nothing, so its
 * list is empty and every revoke is a 404 — the truthful answer, not an error.
 */
export const registerAdminExternalMcpToolApprovalsRoutes: ExternalMcpRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  mountAdminJsonRoute({ errors, app, spec: externalMcpToolApprovalsListRoute, deps: {
    ...externalMcpPortDeps({ deps }),
    listApprovals: async ({ workspaceId }) => (await deps.externalMcpToolApprovalRepo?.listByWorkspaceId(workspaceId)) ?? [],
  } }, mountOptions({ operation: "routes/external-mcp/tool-approvals" }));
  mountAdminJsonRoute({ errors, app, spec: externalMcpToolApprovalRevokeRoute, deps: {
    ...externalMcpPortDeps({ deps }),
    revokeApproval: async (input) => (await deps.externalMcpToolApprovalRepo?.delete(input)) ?? false,
  } }, mountOptions({ operation: "routes/external-mcp/tool-approvals" }));
};

/** `DELETE .../mcp-servers/:serverId/oauth`; registered only when an OAuth service is wired. */
export function registerAdminExternalMcpOAuthDisconnectRoute({ errors, app, deps }: { errors: RouteErrorPorts; app: import("express").Express; deps: ExternalMcpOAuthRouteDeps }, _optional = {}): void {
  mountAdminJsonRoute({ errors,
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

export function createExternalMcpModule(deps: ExternalMcpRouteDeps | ExternalMcpOAuthRouteDeps, _optional: Record<string, never> = {}): ServerModuleHandle<RouteRegistration> {
  const oauthDeps = "externalMcpOAuth" in deps && deps.externalMcpOAuth !== undefined ? (deps as ExternalMcpOAuthRouteDeps) : null;
  // Separate instances per family (not one shared limiter) so a device-poll burst does not eat the
  // callback's budget — the same reasoning the connectors module records for its four.
  const oauthLimiter = createRateLimiter({ profile: EXTERNAL_MCP_OAUTH_PER_IP, clock: deps.clock });
  const callbackLimiter = createRateLimiter({ profile: EXTERNAL_MCP_OAUTH_CALLBACK_PER_IP, clock: deps.clock });
/** Builds this route's own probe rate limiter. Reuses {@link OUTBOUND_CALL_PER_IP} rather than
 *  a new profile: a probe is the same self-DoS shape that profile already names — a real outbound
 *  call using the workspace's own credentials — with its own instance so a burst on one connector
 *  family never eats another's budget. */
  const probeLimiter = createRateLimiter({ profile: OUTBOUND_CALL_PER_IP, clock: deps.clock });

  return {
    name: "external-mcp",
    registerRoutes: ({ errors, app }, _options = {}) => {
      // No ordering hazard of the kind the connectors module documents: the collection route, the
      // `:serverId` routes, and the two new fixed-suffix routes (`/admissions`, `/:serverId/probe`)
      // all differ by HTTP method or by segment count, so no literal path can be swallowed as an id.
      registerAdminExternalMcpListRoute({ errors, app, deps });
      registerAdminExternalMcpPutRoute({ errors, app, deps });
      registerAdminExternalMcpDeleteRoute({ errors, app, deps });
      registerAdminExternalMcpAdmissionsRoute({ errors, app, deps });
      registerAdminExternalMcpProbeRoute({ errors, app, deps, limiter: probeLimiter });
      // `GET /tool-approvals` is registered before nothing it could be mistaken for: there is no
      // `GET /:serverId`, and the revoke path has four segments past `mcp-servers`.
      registerAdminExternalMcpToolApprovalsRoutes({ errors, app, deps });

      if (!oauthDeps) return;
      registerAdminExternalMcpOAuthConnectRoute({ errors, app, deps: oauthDeps, limiter: oauthLimiter });
      registerAdminExternalMcpOAuthDevicePollRoute({ errors, app, deps: oauthDeps, limiter: oauthLimiter });
      registerAdminExternalMcpOAuthDisconnectRoute({ errors, app, deps: oauthDeps });

      // PUBLIC — deliberately outside `/api/admin`, so `requireAdminSession` never sees it.
      registerExternalMcpOAuthCallbackRoute({ app, deps: { oauth: oauthDeps.externalMcpOAuth, callbackLimiter } });
    },
  };
}

/**
 * @file `POST .../mcp-servers/:serverId/probe` (C-007) — connects to ONE configured server, once,
 * lists its tools, describes the surface, and closes. Registers nothing into any `ToolRegistry`, so
 * R5 (`Jini packages/mcp/src/federation/trust.ts`'s "frozen at connect") is untouched by this route — see the
 * write-tools implementation outline §3.1/C-4 for the full argument that a probe run in the admin
 * web server cannot un-freeze anything the daemon holds.
 *
 * ## D-7: hosted connections only
 *
 * A `stdio` row is refused before anything is attempted, rather than spawned. The daemon already
 * pays the cost of a local-command child process at boot, with its own timeout and its own
 * catch-and-close (`mcp-federation/bootstrap.ts`); this on-demand admin action is a strictly worse
 * place for that risk to live a second time — a leaked child here is a leaked child in the process
 * serving the whole admin UI, not a subprocess the daemon already knows how to reap. The motivating
 * connection (Higgsfield) is hosted, so this is not a regression for the case that exists today; a
 * `stdio` operator keeps the plain text-field path exactly as it works now.
 *
 * ## Rate limiting sits IN FRONT of the guard
 *
 * Same ordering `oauth.ts` uses and for the same reason: a hit that will be rejected by the
 * permission check has still made this process reach for an outbound socket on the operator's own
 * credentials if the limiter did not run first.
 *
 * ## INV-006 — no secret in the response
 *
 * The response body is built ONLY from `describeRemoteToolSurface`'s output — a pure function over
 * the remote's `tools/list` reply and the two operator name lists (`Jini packages/mcp/src/federation/trust.ts`). It
 * never touches the resolved launch spec's headers/env, so there is no code path by which a bearer
 * token, a client secret, or an env value could reach this route's response. Any other error this
 * route can raise is either fixed, Tovu-authored copy, or a stored failure REASON string that
 * `external-mcp-store.ts` itself already guarantees is secret-free (it exists specifically to be
 * shown to the operator). See this file's test for the direct property assertion.
 */

export type ExternalMcpProbeRouteDeps = ExternalMcpRouteDeps & ExternalMcpProbeServiceDeps;

export const registerAdminExternalMcpProbeRoute = ({ app, deps, limiter, errors }: { app: Express; deps: ExternalMcpProbeRouteDeps; limiter: RateLimiter; errors: RouteErrorPorts }, _optional = {}): void =>
  registerExternalMcpProbeRoute({
    probe: ({ serverId }) => probeExternalMcpServer({ deps, serverId }), operation: "routes/external-mcp/probe",
    mount: ({ spec, deps: probe, authorization, before, failure }) => mountAdminJsonRoute({
      app: { post: (path: string, handler: RequestHandler) => app.post(path, asyncRoute({ handler: (req, res, next) => before({ rate: {
        check: () => limiter.check({ key: resolveClientIp(req) }),
        retryAfter: value => { res.setHeader("Retry-After", value); },
        json: (body, status) => res.status(status).json(body), message: "too many probe attempts",
      } }, async () => { await handler(req, res, next); }) })) } as unknown as Express,
      errors, spec, deps: { workspaceId: deps.workspaceId, authorize: deps.authorize, ...probe },
    }, { authorization, failureWriter: ({ res, error }) => failure({ error, incident: (error, options) => sendAdminFailure({ res, error }, options) }) }),
  });
