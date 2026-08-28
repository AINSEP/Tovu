/**
 * @file The HTML an OAuth popup lands on — extracted verbatim from
 * `routes/connectors/composio-callback.ts` so a second OAuth flow inherits its properties instead of
 * re-deriving them.
 *
 * ## Why this page is safe, restated because it is the reason it can be shared
 *
 * NOTHING from the request is interpolated. Not a connector id, not a server id, not an error, not
 * any query parameter. The two variants are fixed strings chosen by a boolean, and the ONE
 * parameterized value ({@link CallbackPageOptions.messageType}) is a compile-time constant chosen by
 * the calling route and passed through `JSON.stringify` into a script literal. That is the whole XSS
 * story for every endpoint that serves this page: no code path here concatenates request data into
 * markup, so an attacker-controlled `state` or `status` cannot reach the document.
 *
 * `postMessage` targets `window.location.origin` rather than `"*"`, so the message cannot be read by
 * a cross-origin opener, and the receiving bridge independently checks `event.origin`.
 *
 * ## The failure reason is a second parameter, and it is closed for the same reason `messageType` is
 *
 * {@link CallbackPageOptions.reason} chooses which of a fixed set of Tovu-authored copy blocks
 * renders, and is included in the `postMessage` payload so the opener tab can react to it. It is
 * never a raw error, never a provider's `error`/`error_description`, and never anything read off the
 * request — a caller classifies its caught failure into {@link OAuthCallbackFailureReason} FIRST
 * (see `routes/external-mcp/oauth-callback.ts`'s classifier), and only the resulting closed-vocabulary
 * value reaches this file. That is what keeps the XSS property above true for `reason` as well as for
 * `messageType`: both are compile-time-enumerable values chosen by trusted code, never untrusted text.
 *
 * ## Why the message type is a parameter
 *
 * Each flow gets its own type string so one flow's completion cannot make another flow's bridge
 * think it finished. `@jini-ai/ui`'s `createBrowserConnectorAuthBridge` listens for
 * {@link CONNECTOR_CALLBACK_MESSAGE_TYPE}; the external-MCP tab listens for
 * {@link EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE}. A shared constant would couple two unrelated screens.
 *
 * ## The focus fallback is not optional
 *
 * `window.opener` is absent in a system browser opened without an opener relationship, and the
 * `try/catch` around `postMessage` swallows the cross-origin case. Both are real and both leave the
 * message undelivered, which is why every bridge that consumes this page ALSO re-checks connection
 * status when the admin tab regains focus. An operator who abandons the popup must resolve as
 * "still not connected", not as an error — see `apps/admin`'s connectors port for the precedent.
 */

/** Posted to `window.opener` by the Composio callback. Must match `@jini-ai/ui`'s own constant. */
export const CONNECTOR_CALLBACK_MESSAGE_TYPE = "jini:connector-connected";

/** Posted by the external-MCP OAuth callback. Distinct from the connectors one on purpose. */
export const EXTERNAL_MCP_CALLBACK_MESSAGE_TYPE = "tovu:external-mcp-connected";

/**
 * Closed, Tovu-authored vocabulary for why an OAuth callback failed. A provider's own response text
 * (its `error`, `error_description`, or anything else it sent) is NEVER a member of this type and
 * must never become one — a caller maps a caught failure onto one of these six fixed values before
 * this file ever sees it. See `routes/external-mcp/oauth-callback.ts`'s classifier for the mapping
 * from `OAuthError.code` / error class to reason.
 */
export type OAuthCallbackFailureReason =
  | "rate_limited"
  | "no_state"
  | "state_expired"
  | "provider_denied"
  | "exchange_failed"
  | "server_unknown";

/** One fixed heading/body pair. Every failure reason shares the same heading the page has always
 *  used — `admin-external-mcp-oauth-routes.test.ts` already pins `/Couldn’t finish connecting/` for
 *  two of these reasons, and there is no product reason for the heading to differ when the body
 *  already carries the specific explanation. `exchange_failed` is also the copy an `ok: false` call
 *  with no `reason` at all renders (see {@link renderOAuthCallbackPage}), so `composio-callback.ts` —
 *  which predates this vocabulary and never classifies — keeps its original, unchanged text. */
const FAILURE_HEADING = "Couldn’t finish connecting";
const FAILURE_BODY: Record<OAuthCallbackFailureReason, string> = {
  rate_limited: "Too many attempts too quickly. Wait a moment, then try connecting again from Tovu.",
  no_state: "This page wasn’t reached from a connection Tovu started, so there’s nothing to finish here. Close this window and start again from Tovu.",
  state_expired: "This connection attempt is no longer valid — it may have expired, already been used, or been started from another window. Close this window and try again from Tovu.",
  provider_denied: "The request was declined on the provider’s side. Approve the request on their consent screen, then try again from Tovu.",
  exchange_failed: "Something went wrong finishing the connection. Close this window and try again from Tovu.",
  server_unknown: "This connection could not be found. Close this window and check Settings → External MCP.",
};

export interface CallbackPageOptions {
  /** Chooses which of the two FIXED copy variants is rendered. Never derived from request data. */
  readonly ok: boolean;
  /**
   * The `postMessage` type this page announces. A compile-time constant from the calling route —
   * never a request value, or the "nothing from the request is interpolated" property above would
   * stop being true.
   */
  readonly messageType: string;
  /**
   * Which closed-vocabulary reason to render when `ok` is `false`. Ignored when `ok` is `true`.
   * Optional so a caller that does not classify (`composio-callback.ts`) keeps rendering the page's
   * original generic failure copy — defaults to `"exchange_failed"`, whose text is that original copy
   * verbatim, so an unclassifying caller's behavior is unchanged by this field's addition.
   */
  readonly reason?: OAuthCallbackFailureReason;
}

/**
 * Renders the popup's landing page.
 *
 * @returns A complete HTML document. Safe to serve to anyone who can guess the URL, because it
 * contains no request-derived content and no provider error text.
 * @complexity O(1).
 */
export function renderOAuthCallbackPage(options: CallbackPageOptions): string {
  const heading = options.ok ? "Connected" : FAILURE_HEADING;
  const body = options.ok ? "You can close this window and return to Tovu." : FAILURE_BODY[options.reason ?? "exchange_failed"];
  // Built as one object and serialized once, rather than hand-assembling a JS object literal string,
  // so `reason` gets the same JSON-encoding safety `messageType` already had. `reason` is omitted
  // entirely on success — there is nothing to react to — matching `options.reason` being meaningless
  // when `ok` is `true`.
  const payload = options.ok ? { type: options.messageType } : { type: options.messageType, reason: options.reason ?? "exchange_failed" };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${heading}</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    text-align: center; padding: 24px;
  }
  h1 { font-size: 17px; margin: 0 0 6px; }
  p { margin: 0; opacity: 0.7; font-size: 13px; }
</style>
</head>
<body>
  <main>
    <h1>${heading}</h1>
    <p>${body}</p>
  </main>
  <script>
    (function () {
      try {
        if (window.opener) {
          window.opener.postMessage(${JSON.stringify(payload)}, window.location.origin);
        }
      } catch (e) { /* opener gone or cross-origin — the bridge's refocus listener covers it */ }
      setTimeout(function () { try { window.close(); } catch (e) {} }, ${options.ok ? 400 : 2500});
    })();
  </script>
</body>
</html>`;
}
