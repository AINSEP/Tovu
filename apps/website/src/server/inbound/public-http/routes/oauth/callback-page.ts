/**
 * @file Tovu's copy and message types for the shared OAuth popup landing page, whose markup, XSS
 * and origin protections live in `@jini-ai/oauth/callback-page`. Every flow that serves a popup
 * (external MCP, API connections, agent-plugin sign-in) renders through {@link renderOAuthCallbackPage};
 * the two public callback routes (Jini `@jini-ai/cms/public-http/routes/*`) get it injected by
 * `public-oauth-callbacks.ts`, since the copy is product wording the engine must not own.
 *
 * The failure reason is a closed vocabulary (`OAuthCallbackFailureReason`, Jini) for the same reason
 * `messageType` is a constant: a caller classifies its caught failure FIRST
 * (see the Jini external-MCP callback's classifier) and only the resulting closed value
 * reaches the page, never a provider's own error text.
 *
 * Each flow has its own message type so one flow's completion cannot make another flow's bridge
 * think it finished: `@jini-ai/ui`'s `createBrowserConnectorAuthBridge` listens for its own
 * `jini:connector-connected`; the external-MCP tab listens for {@link EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE}.
 */
import { renderOAuthCallbackPage as renderPopupPage, type OAuthCallbackPageCopy } from "@jini-ai/oauth/callback-page";
import type { OAuthCallbackFailureReason, OAuthCallbackPageArgs } from "@jini-ai/cms/public-http/routes/oauth/callback-page";

/** Posted by the external-MCP OAuth callback. Distinct from the connectors one on purpose. */
export const EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE = "tovu:external-mcp-connected";

/** Posted by the API-connection OAuth callback. */
export const API_CONNECTION_CALLBACK_MESSAGE_TYPE = "tovu:api-connection-connected";

/** One fixed heading/body pair. Every failure reason shares the same heading the page has always
 *  used — `admin-external-mcp-oauth-routes.test.ts` already pins `/Couldn’t finish connecting/` for
 *  two of these reasons, and there is no product reason for the heading to differ when the body
 *  already carries the specific explanation. `exchange_failed` is also the copy an `ok: false` call
 *  with no `reason` at all renders (see {@link renderOAuthCallbackPage}). */
const FAILURE_HEADING = "Couldn’t finish connecting";
const FAILURE_BODY: Record<OAuthCallbackFailureReason, string> = {
  rate_limited: "Too many attempts too quickly. Wait a moment, then try connecting again from Tovu.",
  no_state: "This page wasn’t reached from a connection Tovu started, so there’s nothing to finish here. Close this window and start again from Tovu.",
  state_expired: "This connection attempt is no longer valid — it may have expired, already been used, or been started from another window. Close this window and try again from Tovu in the same browser, with cookies enabled. Details: OAUTH_INVALID_STATE.",
  browser_mismatch: "This sign-in did not return to the browser that started it, or its cookie is missing. Close this window, return to Tovu in the same browser with cookies enabled, and start connecting again. Details: MCP_OAUTH_BROWSER_BINDING.",
  provider_denied: "The request was declined on the provider’s side. Approve the request on their consent screen, then try again from Tovu.",
  exchange_failed: "Something went wrong finishing the connection. Close this window and try again from Tovu.",
  server_unknown: "This connection could not be found. Close this window and check Settings → External MCP.",
  account_unchanged: "This account is already connected to Tovu, so there is nothing to switch. Close this window and use Reconnect in Tovu instead.",
};

const COPY: OAuthCallbackPageCopy<OAuthCallbackFailureReason> = {
  successHeading: "Connected",
  successBody: "You can close this window and return to Tovu.",
  failureHeading: FAILURE_HEADING,
  failureBodies: FAILURE_BODY,
  defaultReason: "exchange_failed",
};

/**
 * Renders the popup's landing page with Tovu's copy. `reason` defaults to `"exchange_failed"`, the
 * original generic failure copy, so an unclassifying caller is unchanged. Satisfies Jini's
 * `OAuthCallbackPageRenderer`. @complexity O(1).
 */
export function renderOAuthCallbackPage({ ok, messageType, reason }: OAuthCallbackPageArgs, _optional = {}): string {
  return renderPopupPage({ ok, messageType, reason, copy: COPY });
}
