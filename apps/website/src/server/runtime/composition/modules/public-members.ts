import type { Express, RequestHandler } from "express";
import { memberSignOutRoute } from "@jini-ai/cms/public-http/routes/members/sign-out";
import { NodeSessionTokens } from "@jini-ai/user-management/server";
import { readRequestCookie } from "#src/server/http/request-cookie";
import { mountPublicRawRoute } from "#src/server/inbound/admin-http/admin-raw-route-ports";
import { checkMemberPost, type MemberPublicRouteDeps } from "#src/server/inbound/public-http/routes/members/deps";
import { clearedMemberSessionCookie, MEMBER_AUTH_FAILURE, MEMBER_SESSION_COOKIE, memberAuthRefusal } from "#src/server/inbound/public-http/routes/members/complete-sign-in";

/**
 * @file Registrars of the PUBLIC member routes converted to Jini specs (`@jini-ai/cms/public-http/routes/members/*`).
 * The specs own each route's steps; Tovu binds its policy here: the member cookie (name, attributes,
 * reader), the credential error copy (`memberAuthRefusal`), the redacted 500 (`MEMBER_AUTH_FAILURE`), and
 * the member POST gates (`checkMemberPost`), which run at the mount on the Express request.
 */

/** The app view a member POST spec is mounted on. Each handler registered through it first runs
 * `checkMemberPost` (workspace 404, the comments same-origin 403, the 4 KiB post-parse 413) on the Express
 * request, in the hand-written order, then the mounted handler.
 * @returns An `app` whose `post` still makes ONE `app.post(path, handler)` registration (route table unchanged).
 * @complexity O(1) setup; per request as `checkMemberPost`.
 */
function memberPostApp({ app, deps }: { app: Express; deps: MemberPublicRouteDeps }, _optional: Record<string, never> = {}): Express {
  // The origin policy and the post-parse cap read the whole Express request (`req.is`, trust-proxy
  // protocol, the configured public origin), which a spec cannot see, so they stay a host gate.
  const view: Express = Object.create(app);
  const post = (path: string, handler: RequestHandler) => app.post(path, (req, res, next) => {
    if (!checkMemberPost({ req, res, deps })) return;
    return handler(req, res, next);
  });
  view.post = post as unknown as Express["post"];
  return view;
}

/** `POST …/sign-out`: revoke only the member session; an absent/already-revoked cookie still succeeds. O(1) I/O. */
export function registerPublicMemberSignOutRoute({ app, deps }: { app: Express; deps: MemberPublicRouteDeps }, _optional: Record<string, never> = {}): void {
  const tokens = new NodeSessionTokens({});
  mountPublicRawRoute({
    app: memberPostApp({ app, deps }),
    spec: memberSignOutRoute,
    // Read per request, as the hand-written route did: tests swap repository methods after registration.
    deps: {
      workspaceId: deps.workspaceId,
      clock: { nowMs: () => deps.clock.nowMs() },
      sessions: {
        findByTokenHash: (input) => deps.memberSessionRepo.findByTokenHash(input),
        revoke: (input) => deps.memberSessionRepo.revoke(input),
      },
      hashToken: ({ rawToken }) => tokens.hashToken({ rawToken }),
      readSessionToken: ({ cookieHeader }) => readRequestCookie({ request: { headers: { cookie: cookieHeader } }, name: MEMBER_SESSION_COOKIE }),
      clearedSessionCookie: () => clearedMemberSessionCookie(),
      refusalFor: ({ error }) => memberAuthRefusal({ error }),
    },
    failure: MEMBER_AUTH_FAILURE,
    workspaceId: deps.workspaceId,
  });
}
