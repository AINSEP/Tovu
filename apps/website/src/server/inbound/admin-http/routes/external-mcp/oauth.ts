import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
import { withinRateLimit as checkRateLimit, externalMcpErrorStatus } from "@jini-ai/cms/admin-http/routes/external-mcp/route-helpers";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import type { Express, RequestHandler } from "express";
import { mountAdminJsonRoute } from "../../admin-json-route-ports.js";
import { mountAdminRawRoute } from "../../admin-raw-route-ports.js";
import { refuseUnlessSessionCredential } from "../../admin-request-facts.js";
import { externalMcpOAuthConnectRoute, externalMcpOAuthPollRoute, externalMcpSharedListRoute, externalMcpSharedLocalRoute, externalMcpSharedSelectRoute, createExternalMcpBrowserSignInRoute } from "@jini-ai/cms/admin-http/routes/external-mcp/oauth";
import { randomBytes } from 'node:crypto';
import { generateOAuthState } from '@jini-ai/oauth';
import { browserBindingCookie, EXTERNAL_MCP_BROWSER_BINDING, EXTERNAL_MCP_SIGN_IN_PATH } from '#src/features/api-connections/browser-binding';
import { ApiConnectionError } from "@jini-ai/integrations/api-connections";
import { rejectUnlessSessionCredential } from '#src/server/inbound/admin-http/dev-auth';

import { ExternalMcpReauthRequiredError } from "../../../../../features/external-mcp/external-mcp-oauth.js";
import { ExternalMcpSecretStoreUnconfiguredError, ExternalMcpValidationError } from "@jini-ai/mcp/federation/hosted";
import { OAuthError } from "@jini-ai/oauth";
import type { RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { externalMcpOAuthCallbackUrl } from "@jini-ai/cms/public-http/routes/external-mcp/oauth-callback-url";
import { resolvePublicOrigin } from "#src/platform/express/public-origin";
import type { ExternalMcpOAuthRouteDeps } from "./deps.js";
import { asyncRoute } from "../../../../../platform/express/async-route.js";

const SHARED_MCP_PERMISSION = 'admin.integrations.manage';

/**
 * @file The operator-facing half of external-MCP OAuth: start a connection, poll a device
 * authorization, drop a connection.
 *
 * Three routes, all behind `requireAdminSession` under `/api/admin` and all through
 * `guardExternalMcpRequest`'s `admin.integrations.manage` gate. The fourth route in this flow — the
 * callback — is public and lives in `routes/external-mcp/oauth-callback.ts`, because a
 * `SameSite=Strict` cookie cannot survive the cross-site redirect that reaches it.
 *
 * ## Rate limiting sits IN FRONT of the auth check
 *
 * Same ordering the connector connect route uses, and for the same reason restated for
 * this flow: every hit — even one that will be rejected — reaches a handler that mints sealed
 * `state` or makes a real outbound call to a third-party authorization server using the workspace's
 * own client id. `requireAdminSession` bounds WHO can call this, not how often. See
 * `EXTERNAL_MCP_OAUTH_PER_IP`'s doc for the self-DoS this closes.
 *
 * ## Nothing here retries
 *
 * A connect attempt is a foreground action with a human watching. Failures are reported with a
 * specific code and left in a re-clickable state; the operator retries with one click. The machine
 * does not, because an authorization code is single-use and the first response may have been lost
 * after the provider already redeemed it. `@jini-ai/oauth`'s `errors.ts` carries the full argument.
 */

function sendExternalMcpOAuthError({ res, error }: { res: import("express").Response; error: unknown }, _optional = {}): void {
  const reply = externalMcpErrorStatus({ error, deps: {
    apiConnection: ApiConnectionError, validation: ExternalMcpValidationError, reauth: ExternalMcpReauthRequiredError,
    secretStoreUnconfigured: ExternalMcpSecretStoreUnconfiguredError, oauth: OAuthError,
  } });
  if (reply) { res.status(reply.status).json(reply.body); return; }
  sendAdminFailure({ res, error }, { operation: "routes/external-mcp/oauth", code: "INTERNAL_ERROR" });
}

const withinRateLimit = (limiter: RateLimiter, req: import("express").Request, res: import("express").Response): Promise<boolean> => checkRateLimit({ deps: {
  check: () => limiter.check({ key: resolveClientIp(req) }),
  retryAfter: value => { res.setHeader("Retry-After", value); },
  json: (body, status) => { res.status(status).json(body); },
  message: "too many OAuth attempts",
} });

/**
 * `POST .../mcp-servers/:serverId/oauth/connect` — begins an authorization.
 *
 * The response shape is discriminated by `kind`, mirroring the connectors connect route's
 * `auth.kind`: `redirect_required` carries a URL the admin opens in a popup, `device_code` carries a
 * user code and verification URL the admin renders directly. The device variant never returns the
 * device code itself — that stays server-side and the poll route looks it up.
 *
 * The callback URL is built FROM THE REQUEST (`resolvePublicOrigin(req)` passed to
 * `externalMcpOAuthCallbackUrl`) so a reverse-proxied deployment gets the origin the browser
 * actually used, not the one this process thinks it has.
 */
export function registerAdminExternalMcpOAuthConnectRoute({ app, deps, limiter, errors }: { app: Express; deps: ExternalMcpOAuthRouteDeps; limiter: RateLimiter; errors: RouteErrorPorts }, _optional = {}): void {
  registerExternalMcpBrowserSignInRoute({ app, deps, limiter, errors });
  registerSharedMcpRoutes({ app, deps, limiter, errors });
  const limitedApp: Express = Object.create(app);
  limitedApp.post = ((path: string, handler: RequestHandler) => app.post(path, asyncRoute({ handler: async (req, res, next) => {
    if (!(await withinRateLimit(limiter, req, res))) return;
    return handler(req, res, next);
  } }))) as Express["post"];
  mountAdminJsonRoute({ errors, app: limitedApp, spec: externalMcpOAuthConnectRoute, deps: {
    workspaceId: deps.workspaceId, authorize: deps.authorize,
    beginConnect: (input) => deps.externalMcpOAuth.beginConnect(input),
    callbackUrl: (_input: { serverId: string }): string => { throw new Error("bound per request"); },
    requireSharedSession: (): void => { throw new Error("bound per request"); },
    invalidDestination: () => new ExternalMcpValidationError('Choose local sign-in or save the connection on this Mac.', 'destination'),
  } }, { authorization: "direct", failureWriter: ({ res, error }) => sendExternalMcpOAuthError({ res, error }),
    requestDeps: ({ req, res, deps: base }) => ({ ...base,
      callbackUrl: ({ serverId }) => externalMcpOAuthCallbackUrl({ origin: resolvePublicOrigin(req), serverId }),
      requireSharedSession: () => refuseUnlessSessionCredential({ res, gate: { message: 'Open Settings → External MCP in your signed-in owner browser to save a shared connection.', permission: SHARED_MCP_PERMISSION } }),
    }),
  });
}

/** Authenticated, user-opened host hop: one cookie and redirect, never proof in a link.
 * @complexity O(1) plus the existing bounded connect/discovery work for one connection.
 */
function registerExternalMcpBrowserSignInRoute({ app, deps, limiter, errors }: { app: Express; deps: ExternalMcpOAuthRouteDeps; limiter: RateLimiter; errors: RouteErrorPorts }, _optional = {}): void {
  const browserApp: Express = Object.create(app);
  browserApp.get = ((path: string, handler: RequestHandler) => app.get(path, asyncRoute({ handler: async (req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    if (!(await withinRateLimit(limiter, req, res))) return;
    if (!rejectUnlessSessionCredential({ res, message: 'Open this sign-in link from your signed-in Tovu browser, then try again.', permission: SHARED_MCP_PERMISSION })) return;
    return handler(req, res, next);
  } }))) as Express["get"];
  mountAdminRawRoute({ errors, app: browserApp, spec: createExternalMcpBrowserSignInRoute({ path: EXTERNAL_MCP_SIGN_IN_PATH }), deps: {
    workspaceId: deps.workspaceId, authorize: deps.authorize,
    beginConnect: (input) => deps.externalMcpOAuth.beginConnect(input),
    makeBinding: () => generateOAuthState({ randomBytesFn: ({ byteLength }) => randomBytes(byteLength) }, { stateBytes: 32 }),
    callbackUrl: (_input: { serverId: string }): string => { throw new Error("bound per request"); },
    bindingCookie: ({ browserBinding }) => browserBindingCookie({ browserBinding }, EXTERNAL_MCP_BROWSER_BINDING),
    deviceSignInRefusal: { error: 'This connection uses a device code. Close this window and start again from Settings → External MCP.', code: 'MCP_DEVICE_SIGN_IN_REQUIRED' as const },
  } }, { authorization: "direct", failureWriter: ({ res, error }) => sendExternalMcpOAuthError({ res, error }),
    requestDeps: ({ req, deps: base }) => ({ ...base, callbackUrl: ({ serverId }) => externalMcpOAuthCallbackUrl({ origin: resolvePublicOrigin(req), serverId }) }),
  });
}

/**
 * `POST .../mcp-servers/:serverId/oauth/device/poll` — one poll of a device authorization.
 *
 * ONE poll per request, deliberately. The loop belongs to the admin client, which already has a
 * timer and a visible cancel affordance; a server-side loop would hold a request open for minutes,
 * hide the RFC 8628 `slow_down` contract inside a catch block, and give the operator nothing to
 * cancel. `status: "pending"` carries the interval to wait before calling again.
 */
export function registerAdminExternalMcpOAuthDevicePollRoute({ app, deps, limiter, errors }: { app: Express; deps: ExternalMcpOAuthRouteDeps; limiter: RateLimiter; errors: RouteErrorPorts }, _optional = {}): void {
  const limitedApp: Express = Object.create(app);
  limitedApp.post = ((path: string, handler: RequestHandler) => app.post(path, asyncRoute({ handler: async (req, res, next) => {
    if (!(await withinRateLimit(limiter, req, res))) return;
    return handler(req, res, next);
  } }))) as Express["post"];
  mountAdminJsonRoute({ errors, app: limitedApp, spec: externalMcpOAuthPollRoute, deps: {
    workspaceId: deps.workspaceId, authorize: deps.authorize,
    pollDeviceAuthorization: (input) => deps.externalMcpOAuth.pollDeviceAuthorization(input),
  } }, { authorization: "direct", failureWriter: ({ res, error }) => sendExternalMcpOAuthError({ res, error }) });
}

/** Saved selection is a session-only owner act; a site reference alone cannot grant itself access. */
function registerSharedMcpRoutes({ app, deps, limiter, errors }: { app: Express; deps: ExternalMcpOAuthRouteDeps; limiter: RateLimiter; errors: RouteErrorPorts }, _optional = {}): void {
  const limitedApp: Express = Object.create(app);
  for (const method of ["delete", "post"] as const) {
    limitedApp[method] = ((path: string, handler: RequestHandler) => app[method](path, asyncRoute({ handler: async (req, res, next) => {
      if (!(await withinRateLimit(limiter, req, res))) return;
      return handler(req, res, next);
    } }))) as Express[typeof method];
  }
  mountAdminJsonRoute({ errors, app, spec: externalMcpSharedListRoute, deps: {
    workspaceId: deps.workspaceId, authorize: deps.authorize,
    requireSharedSession: (): void => { throw new Error("bound per request"); },
    listSharedConnections: undefined as ExternalMcpOAuthService["listSharedConnections"],
  } }, { authorization: "direct", failureWriter: ({ res, error }) => sendExternalMcpOAuthError({ res, error }),
    requestDeps: ({ res, deps: base }) => ({ ...base, get listSharedConnections() { return deps.externalMcpOAuth.listSharedConnections?.bind(deps.externalMcpOAuth); }, requireSharedSession: () => refuseUnlessSessionCredential({ res, gate: { message: 'Open saved connections from your signed-in owner browser.', permission: SHARED_MCP_PERMISSION } }) }),
  });
  mountAdminJsonRoute({ errors, app: limitedApp, spec: externalMcpSharedLocalRoute, deps: {
    workspaceId: deps.workspaceId, authorize: deps.authorize,
    requireSharedSession: (): void => { throw new Error("bound per request"); },
    useLocalConnection: undefined as ExternalMcpOAuthService["useLocalConnection"],
    unavailable: () => new ExternalMcpValidationError('Shared connections are unavailable in this profile.', 'credentialId'),
  } }, { authorization: "direct", failureWriter: ({ res, error }) => sendExternalMcpOAuthError({ res, error }),
    requestDeps: ({ res, deps: base }) => ({ ...base, get useLocalConnection() { return deps.externalMcpOAuth.useLocalConnection?.bind(deps.externalMcpOAuth); }, requireSharedSession: () => refuseUnlessSessionCredential({ res, gate: { message: 'Choose the local connection from your signed-in owner browser.', permission: SHARED_MCP_PERMISSION } }) }),
  });
  mountAdminJsonRoute({ errors, app: limitedApp, spec: externalMcpSharedSelectRoute, deps: {
    workspaceId: deps.workspaceId, authorize: deps.authorize,
    requireSharedSession: (): void => { throw new Error("bound per request"); },
    useSharedConnection: undefined as ExternalMcpOAuthService["useSharedConnection"],
    invalidCredential: () => new ExternalMcpValidationError('Choose an existing saved connection.', 'credentialId'),
    unavailable: () => new ExternalMcpValidationError('Shared connections are available only in this Mac owner profile.', 'credentialId'),
  } }, { authorization: "direct", failureWriter: ({ res, error }) => sendExternalMcpOAuthError({ res, error }),
    requestDeps: ({ res, deps: base }) => ({ ...base, get useSharedConnection() { return deps.externalMcpOAuth.useSharedConnection?.bind(deps.externalMcpOAuth); }, requireSharedSession: () => refuseUnlessSessionCredential({ res, gate: { message: 'Choose a saved connection from your signed-in owner browser.', permission: SHARED_MCP_PERMISSION } }) }),
  });
}
