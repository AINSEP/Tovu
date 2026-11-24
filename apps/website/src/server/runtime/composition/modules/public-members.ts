import type { Express, RequestHandler } from "express";
import { orFallback } from "@jini-ai/core/errors/idioms";
import { nowIso } from "@jini-ai/core/primitives";
import { memberForgotPasswordRoute } from "@jini-ai/cms/public-http/routes/members/forgot-password";
import { memberLoginProvidersRoute } from "@jini-ai/cms/public-http/routes/members/login-providers";
import { memberMeRoute } from "@jini-ai/cms/public-http/routes/members/me";
import { memberResetPasswordRoute } from "@jini-ai/cms/public-http/routes/members/reset-password";
import { memberSetPasswordRoute } from "@jini-ai/cms/public-http/routes/members/set-password";
import { memberSignOutRoute } from "@jini-ai/cms/public-http/routes/members/sign-out";
import { MemberLoginError, NodeSessionTokens } from "@jini-ai/user-management/server";
import { createMemberAccessResolver, MemberAuthError, prepareMemberChallenge, resetPassword, resolveMemberSession, setMemberPassword, type MemberRecord } from "#src/features/members/index";
import { readRequestCookie } from "#src/server/http/request-cookie";
import { mountPublicJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { mountPublicRawRoute } from "#src/server/inbound/admin-http/admin-raw-route-ports";
import { toPublicMemberResponse } from "#src/server/inbound/public-http/http/members";
import { checkMemberPost, toPublicMembersWriteServiceDeps, type MemberPublicRouteDeps } from "#src/server/inbound/public-http/routes/members/deps";
import { clearedMemberSessionCookie, MEMBER_AUTH_FAILURE, MEMBER_SESSION_COOKIE, memberAuthRefusal } from "#src/server/inbound/public-http/routes/members/complete-sign-in";
import { memberOidcRefusal, uniqueMemberCookie, type MemberOidcRouteDeps } from "#src/server/inbound/public-http/routes/members/oidc-deps";
import { MEMBER_SIGN_IN_FAILURE, memberSignInRefusal, reportMemberDeliveryFailure } from "#src/server/inbound/public-http/routes/members/sign-in";

/**
 * @file Registrars of the PUBLIC member routes converted to Jini specs (`@jini-ai/cms/public-http/routes/members/*`).
 * The specs own each route's steps; Tovu binds its policy here: the member cookie (name, attributes,
 * reader), the credential error copy (`memberAuthRefusal`, `memberSignInRefusal`, `memberOidcRefusal`), the
 * redacted 500s (`MEMBER_AUTH_FAILURE`, `MEMBER_SIGN_IN_FAILURE`), the shared limiters, the members service
 * calls, and the member POST gates (`checkMemberPost`), which run at the mount on the Express request.
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

type MemberLimiterName = "magicLinkCompleteAttemptLimiter" | "passwordSignInPerIpLimiter" | "passwordSetPerMemberLimiter" | "magicLinkPerEmailLimiter" | "magicLinkPerIpLimiter";

/** A limiter port that reads the named shared limiter per request, as the hand-written routes did:
 * tests swap the limiter instances on `deps` after registration. O(1) plus the limiter. */
function liveLimiter({ deps, name }: { deps: MemberPublicRouteDeps; name: MemberLimiterName }, _optional: Record<string, never> = {}): Pick<MemberPublicRouteDeps[MemberLimiterName], "check"> {
  return { check: (input) => deps[name].check(input) };
}

/** `POST …/reset-password`: consume a link-only reset; a reset never creates a session. O(1) plus the service. */
export function registerPublicMemberResetPasswordRoute({ app, deps }: { app: Express; deps: MemberPublicRouteDeps }, _optional: Record<string, never> = {}): void {
  mountPublicJsonRoute({
    app: memberPostApp({ app, deps }),
    spec: memberResetPasswordRoute,
    deps: {
      workspaceId: deps.workspaceId,
      attemptLimiter: liveLimiter({ deps, name: "magicLinkCompleteAttemptLimiter" }),
      resetPassword: (input) => resetPassword({ deps: toPublicMembersWriteServiceDeps(deps), input }),
      refusalFor: ({ error }) => memberAuthRefusal({ error }, { reset: true }),
    },
    failure: MEMBER_AUTH_FAILURE,
    workspaceId: deps.workspaceId,
  });
}

/** `POST …/password/set`: member self-service behind /me's session check and both strict counters.
 * @complexity O(n + s) in password size n and affected sessions s; service owns the write lifecycle.
 */
export function registerPublicMemberSetPasswordRoute({ app, deps }: { app: Express; deps: MemberPublicRouteDeps }, _optional: Record<string, never> = {}): void {
  mountPublicJsonRoute({
    app: memberPostApp({ app, deps }),
    spec: memberSetPasswordRoute,
    deps: {
      workspaceId: deps.workspaceId,
      ipLimiter: liveLimiter({ deps, name: "passwordSignInPerIpLimiter" }),
      perMemberLimiter: liveLimiter({ deps, name: "passwordSetPerMemberLimiter" }),
      readSessionToken: ({ cookieHeader }) => readRequestCookie({ request: { headers: { cookie: cookieHeader } }, name: MEMBER_SESSION_COOKIE }),
      requireSessionMemberId: async ({ sessionToken }) => {
        const session = await resolveMemberSession({ sessions: deps.memberSessionRepo, workspaceId: deps.workspaceId,
          sessionToken, nowIso: nowIso({ clock: deps.clock }) });
        if (!session) throw new MemberAuthError("INVALID_CREDENTIALS");
        return session.memberId;
      },
      setPassword: (input) => setMemberPassword({ deps: toPublicMembersWriteServiceDeps(deps), input }),
      refusalFor: ({ error }) => memberAuthRefusal({ error }, { reset: true }),
    },
    failure: MEMBER_AUTH_FAILURE,
    workspaceId: deps.workspaceId,
  });
}

/** `POST …/forgot-password`: link-only reset requests share the magic-link counters and the detached
 * delivery owner. O(1) setup I/O.
 */
export function registerPublicMemberForgotPasswordRoute({ app, deps }: { app: Express; deps: MemberPublicRouteDeps }, _optional: Record<string, never> = {}): void {
  mountPublicJsonRoute({
    app: memberPostApp({ app, deps }),
    spec: memberForgotPasswordRoute,
    deps: {
      workspaceId: deps.workspaceId,
      emailLimiter: liveLimiter({ deps, name: "magicLinkPerEmailLimiter" }),
      ipLimiter: liveLimiter({ deps, name: "magicLinkPerIpLimiter" }),
      prepareReset: (input) => prepareMemberChallenge({ deps: toPublicMembersWriteServiceDeps(deps), purpose: "password_reset", input }),
      // Per-address lookup and mail latency must never delay public acceptance.
      deliverInBackground: ({ deliver }) => { setImmediate(() => { void deliver().catch((error: unknown) => reportMemberDeliveryFailure({ error })); }); },
      refusalFor: ({ error }) => memberSignInRefusal({ error }),
    },
    failure: MEMBER_SIGN_IN_FAILURE,
    workspaceId: deps.workspaceId,
  });
}

/** `GET …/me`: never cache identity; resolver validates sessions, then the member row enforces current status. */
export function registerPublicMemberMeRoute({ app, deps }: { app: Express; deps: MemberPublicRouteDeps }, options: { login?: MemberOidcRouteDeps } = {}): void {
  const resolver = createMemberAccessResolver({ deps });
  mountPublicJsonRoute({
    app,
    spec: memberMeRoute,
    deps: {
      workspaceId: deps.workspaceId,
      readSessionToken: ({ cookieHeader }) => uniqueMemberCookie({ req: { headers: { cookie: cookieHeader } }, name: MEMBER_SESSION_COOKIE }),
      resolveMemberId: async ({ sessionToken }) => (await resolver.resolveContext({ workspaceId: deps.workspaceId,
        nowIso: nowIso({ clock: deps.clock }), sessionToken })).memberId ?? null,
      findMember: ({ id }) => deps.memberRepo.findById({ workspaceId: deps.workspaceId, id }),
      // The spec hands back the very row `findMember` returned, so it is this repository's record.
      toPublicMember: ({ member }) => toPublicMemberResponse(member as MemberRecord),
      listPublicIdentities: ({ memberId }) => publicMemberIdentities({ memberId, deps: options.login }),
      refusalFor: ({ error }) => error instanceof MemberLoginError ? memberOidcRefusal({ error }) : memberAuthRefusal({ error }),
    },
    failure: MEMBER_AUTH_FAILURE,
    workspaceId: deps.workspaceId,
  });
}

/** Expose labels/IDs only, including a disconnected provider so members can still unlink it.
 * Subjects, issuer, timestamps and unlinked markers stay internal. O(p) member providers.
 */
async function publicMemberIdentities({ memberId, deps }: { memberId: string; deps?: MemberOidcRouteDeps }, _options = {}) {
  if (!deps) return [];
  const identities = await deps.links.identities.listByMember({ workspaceId: deps.members.workspaceId, memberId });
  const linked = identities.filter(identity => !identity.unlinkedAt);
  if (!linked.length) return [];
  // Provider availability must not prevent account access/unlink after a plugin is disabled.
  const providersPromise = deps.listProviders({ workspaceId: deps.members.workspaceId });
  const providers = await orFallback({ work: () => providersPromise, fallback: [], step: "Read member sign-in provider labels" });
  const labels = new Map(providers.map(provider => [provider.id, provider.label]));
  return linked.map(identity => ({ providerId: identity.providerId, label: labels.get(identity.providerId) ?? identity.providerId }));
}

/** `GET …/login-providers`: safe provider metadata only; configuration/pins and credentials never leave the server.
 * @complexity O(p*c), p admitted providers, c credential metadata rows; bounded bundled catalog.
 */
export function registerMemberLoginProvidersRoute({ app, deps }: { app: Express; deps: MemberOidcRouteDeps }, _options = {}): void {
  mountPublicJsonRoute({
    app,
    spec: memberLoginProvidersRoute,
    deps: {
      workspaceId: deps.members.workspaceId,
      listProviders: (input) => deps.listProviders(input),
      refusalFor: ({ error }) => memberOidcRefusal({ error }),
    },
    failure: MEMBER_AUTH_FAILURE,
    workspaceId: deps.members.workspaceId,
  });
}
