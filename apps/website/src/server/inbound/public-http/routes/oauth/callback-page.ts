/**
 * @file Tovu's copy and message types for the shared OAuth popup landing page, whose markup, XSS
 * and origin protections live in `@jini-ai/oauth/callback-page`. Every flow that serves a popup
 * (external MCP, API connections, agent-plugin sign-in) renders through {@link renderOAuthCallbackPage}.
 *
 * The failure reason is a closed vocabulary ({@link OAuthCallbackFailureReason}) for the same reason
 * `messageType` is a constant: a caller classifies its caught failure FIRST
 * (see `routes/external-mcp/oauth-callback.ts`'s classifier) and only the resulting closed value
 * reaches the page, never a provider's own error text.
 *
 * Each flow has its own message type so one flow's completion cannot make another flow's bridge
 * think it finished: `@jini-ai/ui`'s `createBrowserConnectorAuthBridge` listens for its own
 * `jini:connector-connected`; the external-MCP tab listens for {@link EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE}.
 */
import { renderOAuthCallbackPage as renderPopupPage, type OAuthCallbackPageCopy } from "@jini-ai/oauth/callback-page";

/** Posted by the external-MCP OAuth callback. Distinct from the connectors one on purpose. */
export const EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE = "tovu:external-mcp-connected";

/**
 * Closed, Tovu-authored vocabulary for why an OAuth callback failed. A provider's own response text
 * (its `error`, `error_description`, or anything else it sent) is NEVER a member of this type and
 * must never become one — a caller maps a caught failure onto one of these fixed values before
 * this file ever sees it. See `routes/external-mcp/oauth-callback.ts`'s classifier for the mapping
 * from `OAuthError.code` / error class to reason.
 */
export type OAuthCallbackFailureReason =
  | "rate_limited"
  | "no_state"
  | "state_expired"
  | "browser_mismatch"
  | "provider_denied"
  | "exchange_failed"
  | "server_unknown"
  | "account_unchanged";

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

export interface CallbackPageOptions {
  /** Chooses which of the two FIXED copy variants is rendered. Never derived from request data. */
  readonly ok: boolean;
  /** The `postMessage` type this page announces. A compile-time constant from the calling route. */
  readonly messageType: string;
  /** Which closed-vocabulary reason to render when `ok` is `false`; defaults to `"exchange_failed"`,
   *  the original generic failure copy, so an unclassifying caller is unchanged. */
  readonly reason?: OAuthCallbackFailureReason;
}

/** Renders the popup's landing page with Tovu's copy. @complexity O(1). */
export function renderOAuthCallbackPage({ ok, messageType, reason }: CallbackPageOptions, _optional = {}): string {
  return renderPopupPage({ ok, messageType, reason, copy: COPY });
}
