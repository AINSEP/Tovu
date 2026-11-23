import { createReadyLoginProviderList } from "#src/features/member-login/index";
import { memberDeleteRoute } from "@jini-ai/cms/admin-http/routes/members/delete";
import { memberDisableRoute } from "@jini-ai/cms/admin-http/routes/members/disable";
import { memberGetRoute } from "@jini-ai/cms/admin-http/routes/members/get-by-id";
import { memberListRoute } from "@jini-ai/cms/admin-http/routes/members/list";
import type { MemberErrorClassifier } from "@jini-ai/cms/admin-http/routes/members/shared";
import { registerAdminMemberRequestMagicLinkRoute } from "#src/server/inbound/admin-http/routes/members/request-magic-link";
import { toMembersWriteServiceDeps, type MembersRouteDeps } from "#src/server/inbound/admin-http/routes/members/deps";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps, type AdminRouteAuthorization } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { RouteRegistrar } from "#src/server/routes/types";
import { registerPublicMemberSignInRequestRoute } from "#src/server/inbound/public-http/routes/members/sign-in";
import { registerPublicMemberCompleteSignInRoute } from "#src/server/inbound/public-http/routes/members/complete-sign-in";
import { registerPublicMemberPasswordSignInRoute } from "#src/server/inbound/public-http/routes/members/password-sign-in";
import { registerPublicMemberForgotPasswordRoute } from "#src/server/inbound/public-http/routes/members/forgot-password";
import { registerPublicMemberResetPasswordRoute } from "#src/server/inbound/public-http/routes/members/reset-password";
import { registerPublicMemberSetPasswordRoute } from "#src/server/inbound/public-http/routes/members/set-password";
import { registerPublicMemberMeRoute } from "#src/server/inbound/public-http/routes/members/me";
import { registerPublicMemberSignOutRoute } from "#src/server/inbound/public-http/routes/members/sign-out";
import type { MemberPublicRouteDeps } from "#src/server/inbound/public-http/routes/members/deps";
import type { ServerModuleHandle } from "./types.js";
import { randomBytes } from "node:crypto";
import { resolveLoginCredentials } from "#src/features/member-login/index";
import { disableMember, MemberConflictError, MemberNotFoundError, MemberValidationError, SqlMemberExternalIdentityRepo, trashMember } from "#src/features/members/index";
import { bundledAgentPluginsDir } from "#src/server/runtime/composition/site-paths";
import { createTovuOAuthHttpPorts } from "#src/platform/oauth/endpoint-safety";
import { checkMemberWorkspace, toPublicMembersWriteServiceDeps } from "#src/server/inbound/public-http/routes/members/deps";
import { registerMemberLoginProvidersRoute, registerMemberOidcStartRoute } from "#src/server/inbound/public-http/routes/members/oidc-start";
import { registerMemberOidcCallbackRoute } from "#src/server/inbound/public-http/routes/members/oidc-callback";
import { registerMemberOidcVerifyEmailRoute } from "#src/server/inbound/public-http/routes/members/oidc-verify-email";
import { registerMemberUnlinkIdentityRoute } from "#src/server/inbound/public-http/routes/members/unlink-identity";
import { MEMBER_OIDC_PATH, memberOidcHeaders, type MemberOidcRouteDeps } from "#src/server/inbound/public-http/routes/members/oidc-deps";
import type { Express } from "express";

/** The two port fields every admin members mount passes. `authorize` is read per request, as the
 *  hand-written routes read `deps.authorize`, so a later reassignment of it is still honoured. */
function memberPortDeps({ deps }: { deps: MembersRouteDeps }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** The unexpected-failure copy key (`sendAdminFailure`'s operation) and authorization mode each route
 *  had: list/get never consulted the publishing-credential override (`"direct"`); disable and delete
 *  did (`"guarded"`). Switching either is an authorization change, not a move. */
function mountOptions(operation: string, authorization: AdminRouteAuthorization) {
  return { authorization, failure: { operation, code: "INTERNAL_ERROR" } };
}

/** The members library's error classes live in `features/members` (a Jini spec cannot import them), so the
 *  host names each class for the specs, which own the status each route answers it with. The classes are
 *  plain siblings: the order here is not significant. @complexity O(1). */
export const classifyMemberError: MemberErrorClassifier = ({ err }, _optional = {}) => {
  if (err instanceof MemberNotFoundError) return "not-found";
  if (err instanceof MemberConflictError) return "conflict";
  if (err instanceof MemberValidationError) return "validation";
  return undefined;
};

export const registerAdminMemberListRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as MembersRouteDeps;
  mountAdminJsonRoute({ app, spec: memberListRoute, deps: { ...memberPortDeps({ deps }), memberRepo: deps.memberRepo } }, mountOptions("routes/members/list", "direct"));
};

export const registerAdminMemberGetRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as MembersRouteDeps;
  mountAdminJsonRoute({ app, spec: memberGetRoute, deps: { ...memberPortDeps({ deps }), memberRepo: deps.memberRepo, classifyMemberError } }, mountOptions("routes/members/get-by-id", "direct"));
};

/** The write service takes the member bundle built from this request's deps, so it is bound lazily here. */
export const registerAdminMemberDisableRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as MembersRouteDeps;
  const disable = { disableMember: (input: { workspaceId: string; memberId: string }) => disableMember({ deps: toMembersWriteServiceDeps(deps), input }), classifyMemberError };
  mountAdminJsonRoute({ app, spec: memberDisableRoute, deps: { ...memberPortDeps({ deps }), ...disable } }, mountOptions("routes/members/disable", "guarded"));
};

/** The trash move is the members library's, bound here to this request's repo, remover and clock. The
 *  shared adapter revokes sessions and links in the same transaction. */
export const registerAdminMemberDeleteRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as MembersRouteDeps;
  const remove = {
    trashMember: (input: Parameters<typeof trashMember>[0]) => trashMember(input, { members: deps.memberRepo, remove: deps.removeMember, clock: deps.clock }),
    classifyMemberError,
  };
  mountAdminJsonRoute({ app, spec: memberDeleteRoute, deps: { ...memberPortDeps({ deps }), ...remove } }, mountOptions("routes/members/delete", "guarded"));
};

/** Composition owns the only identity adapter and transaction binding. An in-memory-only boot
 * has no transactional member store: keep OIDC unavailable rather than mix durable identities
 * with unrelated memory members. Tests inject complete route deps at the HTTP boundary.
 * @complexity O(1) construction; providers/credentials are re-admitted on each protocol leg.
 */
export function createMemberOidcRouteDeps(required: { admin: MembersRouteDeps; public: MemberPublicRouteDeps }, _options = {}): MemberOidcRouteDeps | undefined {
  const { admin, public: members } = required;
  const kernel = admin.contentKernel;
  if (!kernel || !members.origin) return undefined;
  const credentials = { repo: admin.customCredentialSetRepo, sealer: admin.siteAssistantSecretSealer };
  const listProviders = createReadyLoginProviderList({ sourceRoot: bundledAgentPluginsDir(),
    loadContributions: admin.agentPluginLifecycle.loadPluginContributions, credentials });
  return { members, listProviders,
    protocol: { clock: members.clock, randomBytesFn: ({ byteLength }) => randomBytes(byteLength),
      httpPorts: createTovuOAuthHttpPorts({ http: admin.mediaGenerationHttpClient }),
      sealer: admin.siteAssistantSecretSealer, keyring: admin.siteAssistantSecretKeyring, origin: members.origin,
      resolveProvider: async ({ workspaceId, providerId }) => (await listProviders({ workspaceId })).find(provider => provider.id === providerId) ?? null,
      resolveClient: input => resolveLoginCredentials({ deps: credentials, ...input }) },
    links: { ...toPublicMembersWriteServiceDeps(members), identities: new SqlMemberExternalIdentityRepo({ kernel }),
      transaction: body => kernel.transaction(body), lockKey: key => kernel.lockKey(key) } };
}

/** Register the public-only dependency bundle. No admin capability reaches an OIDC handler.
 * @complexity O(1), fixed route count. Missing durable composition fails closed.
 */
function registerOidcRoutes({ app, deps, members }: { app: Express; deps?: MemberOidcRouteDeps; members: MemberPublicRouteDeps }, _options = {}): void {
  if (!deps) {
    app.get("/api/members/v1/workspaces/:workspaceId/login-providers", (req, res) => {
      memberOidcHeaders({ res });
      if (!checkMemberWorkspace({ req, res, deps: members })) return;
      res.json({ providers: [] });
    });
    app.all([`${MEMBER_OIDC_PATH}/start`, `${MEMBER_OIDC_PATH}/callback`, `${MEMBER_OIDC_PATH}/verify-email`,
      "/api/members/v1/workspaces/:workspaceId/identities/:providerId/unlink"], (req, res) => {
      memberOidcHeaders({ res });
      if (!checkMemberWorkspace({ req, res, deps: members })) return;
      res.status(503).json({ error: "member login failed", code: "LOGIN_UNAVAILABLE" });
    });
    return;
  }
  registerMemberLoginProvidersRoute({ app, deps });
  registerMemberOidcStartRoute({ app, deps });
  registerMemberOidcCallbackRoute({ app, deps });
  registerMemberOidcVerifyEmailRoute({ app, deps });
  registerMemberUnlinkIdentityRoute({ app, deps });
}

/**
 * @file ADR-046 Phase 3 (SPEC-038) — the `members` server module (ADR-030 Members admin CRUD +
 * ADR-PIPE-013 public sign-in).
 *
 * K1 (RT-K1-adm-members): list, get-by-id, disable and delete are Jini route specs
 * (`@jini-ai/cms/admin-http/routes/members/*`) mounted behind the admin ports; `RouteDeps` is read only
 * here, at registration, so each spec sees its own small deps. The members library is not in Jini yet,
 * so the specs take its collaborators as injected deps: the disable write service, the trash move and
 * `classifyMemberError` (the library's error classes). `request-magic-link` stays hand-written: it
 * answers 429 with a `Retry-After` header, which the JSON-route refusal cannot carry.
 *
 * Owns 18 registrations: 5 admin routes (list/get/disable/delete/request-magic-link), 8
 * public member auth routes and 5 member OIDC routes. The original registrations moved here
 * from `app.ts`'s `createApp()` retain their relative order. Owner 2026-10-24
 * adds DELETE-to-Trash alongside Disable.
 *
 * Genuinely needs TWO deps objects, not one: `MembersRouteDeps`/`MemberPublicRouteDeps` already
 * existed pre-slice as a deliberate split (`apps/website/src/server/inbound/admin-http/routes/members/deps.ts`/`routes/members/deps.ts`)
 * — the public sign-in family must never carry an `authorize`/session field (ADR-PIPE-013
 * Enforcement: "no route in either family may read the other's cookie"), while the admin family
 * needs the full session-gated surface. This module does not force them into one shape; see those
 * two files' own headers for the full split rationale.
 *
 * `MembersRouteDeps extends RouteDeps` (a widening, not a narrowing — see that file's header, which
 * documents this as a historical artifact awaiting `RouteDeps` to carry the fields directly), so
 * `deps.admin` is passed straight through to each admin registrar's existing `RouteRegistrar`
 * (`(app, deps: RouteDeps) => void`) signature unchanged; no retyping of those 4 route files was
 * needed or done, unlike `media`/`taxonomy` in SPEC-034 (which were genuine narrowings).
 */
export function createMembersModule(deps: {
  admin: MembersRouteDeps;
  public: MemberPublicRouteDeps;
}, options: { oidc?: MemberOidcRouteDeps } = {}): ServerModuleHandle {
  const oidc = options.oidc ?? createMemberOidcRouteDeps(deps);
  return {
    name: "members",
    registerRoutes: ({ app }, _options = {}) => {
      registerAdminMemberListRoute({ app, deps: deps.admin });
      registerAdminMemberGetRoute({ app, deps: deps.admin });
      registerAdminMemberDisableRoute({ app, deps: deps.admin });
      registerAdminMemberDeleteRoute({ app, deps: deps.admin });
      registerAdminMemberRequestMagicLinkRoute({ app, deps: deps.admin });
      registerPublicMemberSignInRequestRoute({ app, deps: deps.public });
      registerPublicMemberCompleteSignInRoute({ app, deps: deps.public });
      registerPublicMemberPasswordSignInRoute({ app, deps: deps.public });
      registerPublicMemberForgotPasswordRoute({ app, deps: deps.public });
      registerPublicMemberResetPasswordRoute({ app, deps: deps.public });
      registerPublicMemberSetPasswordRoute({ app, deps: deps.public });
      registerPublicMemberMeRoute({ app, deps: deps.public }, { login: oidc });
      registerPublicMemberSignOutRoute({ app, deps: deps.public });
      registerOidcRoutes({ app, deps: oidc, members: deps.public });
    },
  };
}
