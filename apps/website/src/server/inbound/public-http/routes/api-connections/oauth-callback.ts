import type { Express, Request } from "express";

import { ApiConnectionError } from "@jini-ai/integrations/api-connections";
import type { RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { API_CONNECTION_OAUTH_CALLBACK_PATH, type ApiConnectionHost } from "#src/features/api-connections/host";
import { renderOAuthCallbackPage, type OAuthCallbackFailureReason } from "../oauth/callback-page.js";
import { resolvePublicOrigin } from "../oauth/public-origin.js";

/**
 * @file The PUBLIC OAuth callback for plugin-declared API connections (hosted runtime). Separate from
 * the external-MCP callback on purpose: a different lifecycle (Jini api-connections), one fixed path
 * every provider registers once.
 *
 * Cookie-less for the reason `external-mcp/oauth-callback.ts` documents (`tovu_session` is
 * `SameSite=Strict`; the provider's redirect is a cross-site navigation). What authenticates the
 * request is the single-use, expiring attempt its `state` names, bound to workspace, actor, plugin
 * connection, scopes and this exact callback URL, plus the provider's one-time code. The attempt is
 * peeked only to route the request to its connection; Jini consumes it and checks every binding.
 *
 * After a successful exchange, the plugin's declared callback fields (never the code or state) are
 * left in the host's consume-once inbox for that plugin's admin-surface handler.
 *
 * Nothing from the request or the provider reaches the page: failures map onto the shared page's
 * closed reason vocabulary by error CODE, and full detail goes to the server log only.
 */

export const API_CONNECTION_CALLBACK_MESSAGE_TYPE = "tovu:api-connection-connected";
const MAX_STATE_LENGTH = 512;

export interface ApiConnectionOAuthCallbackRouteDeps {
  readonly host: ApiConnectionHost;
  readonly callbackLimiter: RateLimiter;
  /** Injectable for tests; production logs to the console. */
  readonly log?: (line: string) => void;
}

/** Only string query values, as the provider sent them; Jini picks the OAuth names and declared fields. */
function stringParams(query: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

/** Code-only classification: never reads `message`, so no provider text can be rendered. @complexity O(1). */
function classify(error: unknown): OAuthCallbackFailureReason {
  if (!(error instanceof ApiConnectionError)) return "exchange_failed";
  if (error.code === "invalid-attempt" || error.code === "attempt-superseded") return "state_expired";
  if (error.code === "access-denied") return "provider_denied";
  return "exchange_failed";
}

function send(res: Parameters<Parameters<Express["get"]>[1]>[1], status: number, reason?: OAuthCallbackFailureReason): void {
  res.status(status).set("Cache-Control", "no-store").type("html")
    .send(renderOAuthCallbackPage(reason ? { ok: false, reason, messageType: API_CONNECTION_CALLBACK_MESSAGE_TYPE } : { ok: true, messageType: API_CONNECTION_CALLBACK_MESSAGE_TYPE }));
}

/** The exact URL this request arrived on, as the attempt recorded it. */
function callbackUrl(req: Request): string {
  return `${resolvePublicOrigin(req)}${API_CONNECTION_OAUTH_CALLBACK_PATH}`;
}

/** The attempt's connection in this workspace, or null; the attempt itself is not consumed here. */
async function routeAttempt(host: ApiConnectionHost, state: string) {
  const attempt = await host.records.peekAttempt({ state });
  if (!attempt || attempt.workspaceId !== host.workspaceId) return null;
  const connection = (await host.listConnections({ pluginId: attempt.pluginId })).find((candidate) => candidate.descriptor.connectionId === attempt.connectionId);
  return connection ? { attempt, connection } : null;
}

/**
 * Only after a successful exchange: the plugin's declared callback fields wait in the host's inbox
 * for that plugin's surface handler, keyed by the attempt's own workspace, plugin and connection and
 * by the service's attempt id (what the surface was given, never the state), so no other plugin or
 * second read gets them.
 */
function depositCallbackFields(host: ApiConnectionHost, input: { readonly attempt: { readonly workspaceId: string; readonly pluginId: string; readonly connectionId: string }; readonly attemptId: string; readonly fields: Readonly<Record<string, string>> }): void {
  if (Object.keys(input.fields).length === 0) return;
  const { workspaceId, pluginId, connectionId } = input.attempt;
  host.callbackInbox.deposit({ workspaceId, pluginId, connectionId, attemptId: input.attemptId, fields: input.fields });
}

/** Codes are closed vocabularies; messages and causes may carry provider text and stay out of logs. */
function safeErrorLabel(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  const code = (error as { code?: unknown }).code;
  return `${error.name} ${typeof code === "string" ? code : "unknown"}`;
}

/**
 * Mounts `GET {API_CONNECTION_OAUTH_CALLBACK_PATH}`.
 * @complexity O(1) per request plus one bounded token exchange and one contribution load.
 */
export function registerApiConnectionOAuthCallbackRoute(app: Express, deps: ApiConnectionOAuthCallbackRouteDeps): void {
  const log = deps.log ?? ((line: string) => { console.error(line); }); // eslint-disable-line no-console
  app.get(API_CONNECTION_OAUTH_CALLBACK_PATH, async (req, res) => {
    // First: the route is anonymous and each hit can cost an outbound token exchange.
    if (!(await deps.callbackLimiter.check({ key: resolveClientIp(req) })).allowed) return send(res, 429, "rate_limited");
    const params = stringParams(req.query as Record<string, unknown>);
    const state = params.state ?? "";
    if (state === "" || state.length > MAX_STATE_LENGTH) return send(res, 400, "no_state");
    try {
      const routed = await routeAttempt(deps.host, state);
      // Unknown, used, foreign-workspace or no-longer-declared: the same answer for each.
      if (!routed) return send(res, 400, "state_expired");
      const { attempt, connection } = routed;
      const done = await deps.host.serviceFor({ connection }).complete({ workspaceId: attempt.workspaceId, actorId: attempt.actorId, redirectUri: callbackUrl(req), callbackParams: params });
      depositCallbackFields(deps.host, { attempt, attemptId: done.attemptId, fields: done.callbackFields });
      return send(res, 200);
    } catch (error) {
      log(`api-connection oauth callback failed: ${safeErrorLabel(error)}`);
      return send(res, 400, classify(error));
    }
  });
}
