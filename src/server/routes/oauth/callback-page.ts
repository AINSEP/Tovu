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

export interface CallbackPageOptions {
  /** Chooses which of the two FIXED copy variants is rendered. Never derived from request data. */
  readonly ok: boolean;
  /**
   * The `postMessage` type this page announces. A compile-time constant from the calling route —
   * never a request value, or the "nothing from the request is interpolated" property above would
   * stop being true.
   */
  readonly messageType: string;
}

/**
 * Renders the popup's landing page.
 *
 * @returns A complete HTML document. Safe to serve to anyone who can guess the URL, because it
 * contains no request-derived content and no provider error text.
 * @complexity O(1).
 */
export function renderOAuthCallbackPage(options: CallbackPageOptions): string {
  const heading = options.ok ? "Connected" : "Couldn’t finish connecting";
  const body = options.ok
    ? "You can close this window and return to Tovu."
    : "Something went wrong finishing the connection. Close this window and try again from Tovu.";
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
          window.opener.postMessage({ type: ${JSON.stringify(options.messageType)} }, window.location.origin);
        }
      } catch (e) { /* opener gone or cross-origin — the bridge's refocus listener covers it */ }
      setTimeout(function () { try { window.close(); } catch (e) {} }, ${options.ok ? 400 : 2500});
    })();
  </script>
</body>
</html>`;
}
