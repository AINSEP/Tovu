import { observeMemberSignInFailure } from "./analytics.js";
import { captureVisitorEvent } from "../../visitor-analytics.js";
import type { Express } from "express";
import { beginOidcLogin, memberLoginCallbackUrl, MemberLoginError } from "#src/features/member-login/index";
import { checkMemberRequestLimits, checkMemberWorkspace } from "./deps.js";
import { MEMBER_OIDC_PATH, memberOidcContext, memberOidcCookie, memberOidcHeaders,
  redirectMemberOidcError, sendMemberOidcError, type MemberOidcRouteDeps } from "./oidc-deps.js";

/** Safe provider metadata only; configuration/pins and credentials never leave the server.
 * @complexity O(p*c), p admitted providers, c credential metadata rows; bounded bundled catalog.
 */
export function registerMemberLoginProvidersRoute({ app, deps }: { app: Express; deps: MemberOidcRouteDeps }, _options = {}): void {
  app.get("/api/members/v1/workspaces/:workspaceId/login-providers", async (req, res) => {
    memberOidcHeaders({ res });
    try {
      if (!checkMemberWorkspace({ req, res, deps: deps.members })) return;
      const providers = await deps.listProviders({ workspaceId: deps.members.workspaceId });
      res.json({ providers: providers.map(provider => ({ id: provider.id, label: provider.label })) });
    } catch (error) { sendMemberOidcError({ res, error }); }
  });
}

/** Plain-link entry point. Independent browser proof stays out of the authorization URL. A
 * refusal (cross-site, provider unavailable) sends the person back to /signin with its code.
 * @complexity O(1) limited protocol start; protocol owner bounds all external work.
 */
export function registerMemberOidcStartRoute({ app, deps }: { app: Express; deps: MemberOidcRouteDeps }, _options = {}): void {
  app.get(`${MEMBER_OIDC_PATH}/start`, async (req, res) => {
    memberOidcHeaders({ res });
    observeMemberSignInFailure({ deps: deps.members, request: req, response: res, method: "oidc" });
    try {
      if (!checkMemberWorkspace({ req, res, deps: deps.members })) return;
      if (!await checkMemberRequestLimits({ req, res, deps: deps.members, ipLimiter: deps.members.passwordSignInPerIpLimiter })) return;
      // A GET start reads the Lax member cookie as connect intent, and Google redirects silently
      // once consent exists: a cross-site page could otherwise relink an unlinked account or
      // create a member. Same-origin links and typed URLs still pass; old browsers omit the header.
      if (req.get("sec-fetch-site") === "cross-site") throw new MemberLoginError({ code: "LOGIN_INVALID" });
      const input = await memberOidcContext({ req, deps: deps.members });
      const callbackUrl = await memberLoginCallbackUrl({ origin: deps.protocol.origin, ...input });
      const result = await beginOidcLogin({ deps: deps.protocol, input });
      memberOidcCookie({ res, callbackUrl, kind: "callback", binding: result.browserBinding });
      void captureVisitorEvent({ deps: deps.members, request: req, name: "member_sign_in_requested", properties: { method: "oidc", realm: "member" } });
      res.redirect(303, result.authorizationUrl);
    } catch (error) { void captureVisitorEvent({ deps: deps.members, request: req, name: "member_sign_in_failed", properties: { method: "oidc", realm: "member", reasonClass: "authentication_failed" } }); redirectMemberOidcError({ res, error }); }
  });
}
