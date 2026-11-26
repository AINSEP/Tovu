import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import type { Express } from "express";
import { mountAdminJsonRoute } from "../../admin-json-route-ports.js";
import { mountAdminRawRoute } from "../../admin-raw-route-ports.js";
import { refuseUnlessSessionCredential } from "../../admin-request-facts.js";
import { registerExternalMcpOAuthConnectRoutes, registerExternalMcpOAuthPollRoute } from "@jini-ai/cms/admin-http/routes/external-mcp/oauth";
import { randomBytes } from 'node:crypto';
import { generateOAuthState } from '@jini-ai/oauth';
import { browserBindingCookie, EXTERNAL_MCP_BROWSER_BINDING, EXTERNAL_MCP_SIGN_IN_PATH } from '#src/features/api-connections/browser-binding';
import { ApiConnectionError } from "@jini-ai/integrations/api-connections";

import { ExternalMcpReauthRequiredError } from "../../../../../features/external-mcp/external-mcp-oauth.js";
import { ExternalMcpSecretStoreUnconfiguredError, ExternalMcpValidationError } from "@jini-ai/mcp/federation/hosted";
import { OAuthError } from "@jini-ai/oauth";
import type { RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { externalMcpOAuthCallbackUrl } from "@jini-ai/cms/public-http/routes/external-mcp/oauth-callback-url";
import { resolvePublicOrigin } from "#src/platform/express/public-origin";
import type { ExternalMcpOAuthRouteDeps } from "./deps.js";
import { registeringWithOAuthAdmission } from "#src/server/inbound/shared/admin-route-mount-support";

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

export function registerAdminExternalMcpOAuthConnectRoute({ app, deps, limiter, errors }: { app: Express; deps: ExternalMcpOAuthRouteDeps; limiter: RateLimiter; errors: RouteErrorPorts }, _optional = {}): void {
  return registerExternalMcpOAuthConnectRoutes({
    mountJson: route => mountAdminJsonRoute({
      errors, app: registeringWithOAuthAdmission({ app, method: route.spec.method, limiter, before: route.before }), spec: route.spec,
      depsForRequest: ({ req, res }) => ({ workspaceId: deps.workspaceId, authorize: deps.authorize,
        ...route.requestDeps({
          callbackUrl: ({ serverId }) => externalMcpOAuthCallbackUrl({ origin: resolvePublicOrigin(req), serverId }),
          requireSharedSession: gate => refuseUnlessSessionCredential({ res, gate }),
        }),
      }),
    }, { authorization: route.authorization, failureWriter: ({ res, error }) => route.failure({ error,
      json: (body, status) => { res.status(status).json(body); },
      incident: (error, options) => { sendAdminFailure({ res, error, reporter: errors.reporter }, options); },
    }) }),
    mountRaw: route => mountAdminRawRoute({
      errors, app: registeringWithOAuthAdmission({ app, method: route.spec.method, limiter, before: route.before }), spec: route.spec,
      depsForRequest: ({ req }) => ({ workspaceId: deps.workspaceId, authorize: deps.authorize,
        ...route.requestDeps({ callbackUrl: ({ serverId }) => externalMcpOAuthCallbackUrl({ origin: resolvePublicOrigin(req), serverId }) }),
      }),
    }, { authorization: route.authorization, failureWriter: ({ res, error }) => route.failure({ error,
      json: (body, status) => { res.status(status).json(body); },
      incident: (error, options) => { sendAdminFailure({ res, error, reporter: errors.reporter }, options); },
    }) }),
    service: deps.externalMcpOAuth, browserPath: EXTERNAL_MCP_SIGN_IN_PATH, sharedPermission: SHARED_MCP_PERMISSION,
    operation: "routes/external-mcp/oauth",
    errors: { apiConnection: ApiConnectionError, validation: ExternalMcpValidationError, reauth: ExternalMcpReauthRequiredError,
      secretStoreUnconfigured: ExternalMcpSecretStoreUnconfiguredError, oauth: OAuthError },
    makeBinding: () => generateOAuthState({ randomBytesFn: ({ byteLength }) => randomBytes(byteLength) }, { stateBytes: 32 }),
    bindingCookie: required => browserBindingCookie(required, EXTERNAL_MCP_BROWSER_BINDING),
    invalidDestination: () => new ExternalMcpValidationError('Choose local sign-in or save the connection on this Mac.', 'destination'),
    invalidCredential: () => new ExternalMcpValidationError('Choose an existing saved connection.', 'credentialId'),
    localUnavailable: () => new ExternalMcpValidationError('Shared connections are unavailable in this profile.', 'credentialId'),
    sharedUnavailable: () => new ExternalMcpValidationError('Shared connections are available only in this Mac owner profile.', 'credentialId'),
    copy: {
      browserSession: 'Open this sign-in link from your signed-in Tovu browser, then try again.',
      connectSession: 'Open Settings → External MCP in your signed-in owner browser to save a shared connection.',
      sharedListSession: 'Open saved connections from your signed-in owner browser.',
      sharedLocalSession: 'Choose the local connection from your signed-in owner browser.',
      sharedSelectSession: 'Choose a saved connection from your signed-in owner browser.',
      deviceSignInRefusal: { error: 'This connection uses a device code. Close this window and start again from Settings → External MCP.', code: 'MCP_DEVICE_SIGN_IN_REQUIRED' },
    },
  });
}

export function registerAdminExternalMcpOAuthDevicePollRoute({ app, deps, limiter, errors }: { app: Express; deps: ExternalMcpOAuthRouteDeps; limiter: RateLimiter; errors: RouteErrorPorts }, _optional = {}): void {
  return registerExternalMcpOAuthPollRoute({
    mountJson: route => mountAdminJsonRoute({
      errors, app: registeringWithOAuthAdmission({ app, method: route.spec.method, limiter, before: route.before }), spec: route.spec,
      depsForRequest: ({ req, res }) => ({ workspaceId: deps.workspaceId, authorize: deps.authorize,
        ...route.requestDeps({
          callbackUrl: ({ serverId }) => externalMcpOAuthCallbackUrl({ origin: resolvePublicOrigin(req), serverId }),
          requireSharedSession: gate => refuseUnlessSessionCredential({ res, gate }),
        }),
      }),
    }, { authorization: route.authorization, failureWriter: ({ res, error }) => route.failure({ error,
      json: (body, status) => { res.status(status).json(body); },
      incident: (error, options) => { sendAdminFailure({ res, error, reporter: errors.reporter }, options); },
    }) }),
    service: deps.externalMcpOAuth,
    operation: "routes/external-mcp/oauth",
    errors: { apiConnection: ApiConnectionError, validation: ExternalMcpValidationError, reauth: ExternalMcpReauthRequiredError,
      secretStoreUnconfigured: ExternalMcpSecretStoreUnconfiguredError, oauth: OAuthError },
  });
}
