/**
 * @file Registrars for the two PUBLIC OAuth callbacks (API connections, external MCP). The routes
 * themselves are Jini's (`@jini-ai/cms/public-http/routes/{api-connections,external-mcp}/oauth-callback`,
 * server-neutral `ServerRoute`s); this file is composition only: it binds Tovu's copy, callback path,
 * binding-cookie rules, error classes, roster fan-out, origin policy and log lines, and mounts each route
 * in place (`mountJiniRouteInPlace`) so the app's route table keeps its rows. Each page is written with
 * Express `res.send` (`expressSendResponse`), as the hand-written routes wrote it: same weak ETag,
 * same 304 on a matching If-None-Match. The registrar names and
 * their deps types are the ones the composition modules and tests already call.
 */
import { createConsoleLogger } from "@jini-ai/core/primitives";
import { ApiConnectionError } from "@jini-ai/integrations/api-connections";
import { OAuthError } from "@jini-ai/oauth";
import type { RequestFacts } from "@jini-ai/core/contracts/site/request-facts";
import { apiConnectionOAuthCallbackRoute, type ApiConnectionCallbackFailureFacts } from "@jini-ai/cms/public-http/routes/api-connections/oauth-callback";
import { externalMcpOAuthCallbackRoute } from "@jini-ai/cms/public-http/routes/external-mcp/oauth-callback";
import type { Express } from "express";

import type { RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { API_CONNECTION_OAUTH_CALLBACK_PATH, type ApiConnectionHost } from "#src/features/api-connections/host";
import { clearedBrowserBindingCookie, readBrowserBinding, EXTERNAL_MCP_BROWSER_BINDING } from "#src/features/api-connections/browser-binding";
import { ExternalMcpValidationError } from "@jini-ai/mcp/federation/hosted";
import type { ExternalMcpOAuthService } from "@jini-ai/integrations/api-connections/hosted-mcp";
import { notifyExternalMcpRosterChanged } from "#src/assistant/index";
import { resolvePublicOriginFor } from "#src/platform/express/public-origin";
import { API_CONNECTION_CALLBACK_MESSAGE_TYPE, EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE, renderOAuthCallbackPage } from "#src/server/inbound/public-http/routes/oauth/callback-page";
import { expressSendResponse, mountJiniRouteInPlace } from "./jini-routes.js";

const consoleLogger = createConsoleLogger({ prefix: "" });

/** Tovu's origin policy (`TOVU_PUBLIC_URL`, else the request's protocol + Host), from the facts the route holds. @complexity O(1). */
function publicOriginOf({ request, facts }: { readonly request: Request; readonly facts: RequestFacts }, _optional: Record<string, never> = {}): string {
  return resolvePublicOriginFor({ protocol: facts.servingProtocol, host: request.headers.get("host") ?? undefined });
}

/**
 * The log line for a failed API-connection callback, as the hand-written route wrote it: the error's
 * name and code (`unknown` for whichever is missing), never its message — the facts Jini hands over
 * carry only those two closed-vocabulary fields. @complexity O(1).
 */
export function apiConnectionCallbackFailureLine(facts: ApiConnectionCallbackFailureFacts, _optional: Record<string, never> = {}): string {
  const label = facts.errorName === undefined ? "unknown" : `${facts.errorName} ${facts.errorCode ?? "unknown"}`;
  return `api-connection oauth callback failed: ${label}`;
}

/**
 * The log line for a failed external-MCP callback, as the hand-written route wrote it: the full
 * message (server log only; the page never shows it), or a non-Error's string form. @complexity O(1).
 */
export function externalMcpCallbackFailureLine({ error }: { readonly error: unknown }, _optional: Record<string, never> = {}): string {
  return `external-mcp oauth callback failed: ${error instanceof Error ? error.message : String(error)}`;
}

/** What the composition passes for the API-connection callback; `log` is injectable for tests. */
export interface ApiConnectionOAuthCallbackRouteDeps {
  readonly host: ApiConnectionHost;
  readonly callbackLimiter: RateLimiter;
  /** Injectable for tests; production logs to the console. */
  readonly log?: (line: string) => void;
}

/**
 * Mounts `GET {API_CONNECTION_OAUTH_CALLBACK_PATH}` (Jini `apiConnectionOAuthCallbackRoute`).
 * @complexity O(1) setup.
 */
export function registerApiConnectionOAuthCallbackRoute({ app, deps }: { app: Express; deps: ApiConnectionOAuthCallbackRouteDeps }, _optional: Record<string, never> = {}): void {
  const log = deps.log ?? ((line: string) => { consoleLogger.error({ message: line }); });
  mountJiniRouteInPlace({ app, route: apiConnectionOAuthCallbackRoute({
    path: API_CONNECTION_OAUTH_CALLBACK_PATH,
    messageType: API_CONNECTION_CALLBACK_MESSAGE_TYPE,
    host: deps.host,
    callbackLimiter: deps.callbackLimiter,
    readBrowserBinding: ({ cookieHeader }) => readBrowserBinding({ cookieHeader }),
    clearedBrowserBindingCookie: () => clearedBrowserBindingCookie(),
    isApiConnectionError: (error): error is ApiConnectionError => error instanceof ApiConnectionError,
    renderPage: renderOAuthCallbackPage,
    publicOrigin: publicOriginOf,
    reportCallbackFailure: (facts) => { log(apiConnectionCallbackFailureLine(facts)); },
  }) }, { writeResponse: expressSendResponse });
}

/** What the composition passes for the external-MCP callback. */
export interface ExternalMcpOAuthCallbackRouteDeps {
  readonly oauth: ExternalMcpOAuthService;
  readonly callbackLimiter: RateLimiter;
}

/**
 * Mounts `GET {EXTERNAL_MCP_OAUTH_CALLBACK_PATH}/:serverId` (Jini `externalMcpOAuthCallbackRoute`).
 * @complexity O(1) setup.
 */
export function registerExternalMcpOAuthCallbackRoute({ app, deps }: { app: Express; deps: ExternalMcpOAuthCallbackRouteDeps }, _optional: Record<string, never> = {}): void {
  mountJiniRouteInPlace({ app, route: externalMcpOAuthCallbackRoute({
    messageType: EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE,
    oauth: deps.oauth,
    callbackLimiter: deps.callbackLimiter,
    readBrowserBinding: ({ cookieHeader }) => readBrowserBinding({ cookieHeader }, EXTERNAL_MCP_BROWSER_BINDING),
    clearedBrowserBindingCookie: () => clearedBrowserBindingCookie({}, EXTERNAL_MCP_BROWSER_BINDING),
    notifyRosterChanged: () => notifyExternalMcpRosterChanged(),
    isOAuthError: (error): error is OAuthError => error instanceof OAuthError,
    isUnknownServerError: (error) => error instanceof ExternalMcpValidationError,
    renderPage: renderOAuthCallbackPage,
    publicOrigin: publicOriginOf,
    reportCallbackFailure: (failure) => { consoleLogger.error({ message: externalMcpCallbackFailureLine(failure) }); },
  }) }, { writeResponse: expressSendResponse });
}
