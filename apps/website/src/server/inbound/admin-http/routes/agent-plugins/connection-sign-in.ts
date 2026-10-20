/** Hosted sign-in start. Mounted beneath the existing /api/admin session middleware.
 * A provider link can be forwarded; the browser binding must only go to the authenticated starter.
 */
import type { Express } from "express";
import type { ApiConnectionHost } from "#src/features/api-connections/host";
import { API_CONNECTION_SIGN_IN_PATH, browserBindingCookie } from "#src/features/api-connections/browser-binding";
import { getAuthedPrincipal, rejectUnlessSessionCredential } from "#src/server/inbound/admin-http/dev-auth";
import { renderOAuthCallbackPage } from "#src/server/inbound/public-http/routes/oauth/callback-page";

/** One cache consume and redirect; no provider call. Wrong workspace, actor, expiry and replay refuse.
 * @complexity O(1) time and space per request.
 */
export function registerApiConnectionSignInRoute(app: Express, deps: { readonly workspaceId: string; readonly host: ApiConnectionHost }): void {
  app.get(API_CONNECTION_SIGN_IN_PATH, (req, res) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    if (!rejectUnlessSessionCredential(res, { message: "Sign-in links need a signed-in admin session.", permission: "admin.assistant.use" })) return;
    const handoff = String(req.params.workspaceId) === deps.workspaceId
      ? deps.host.signInHandoffs.take({ handoffId: String(req.params.handoffId), actorId: getAuthedPrincipal(res).id }) : null;
    if (!handoff) {
      res.status(400).type("html").send(renderOAuthCallbackPage({ ok: false, reason: "state_expired", messageType: "tovu:api-connection-connected" }));
      return;
    }
    res.append("Set-Cookie", browserBindingCookie({ browserBinding: handoff.browserBinding }));
    res.redirect(302, handoff.authorizationUrl);
  });
}
