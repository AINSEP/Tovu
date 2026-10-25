import { registerAdminMemberDeleteRoute } from "#src/server/inbound/admin-http/routes/members/delete";
import { registerAdminMemberListRoute } from "#src/server/inbound/admin-http/routes/members/list";
import { registerAdminMemberGetRoute } from "#src/server/inbound/admin-http/routes/members/get-by-id";
import { registerAdminMemberDisableRoute } from "#src/server/inbound/admin-http/routes/members/disable";
import { registerAdminMemberRequestMagicLinkRoute } from "#src/server/inbound/admin-http/routes/members/request-magic-link";
import type { MembersRouteDeps } from "#src/server/inbound/admin-http/routes/members/deps";
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
import { loadBundledLoginProviders, loadLoginProviders, hasLoginCredentials, resolveLoginCredentials,
  type LoginProvider } from "#src/features/member-login/index";
import { SqlMemberExternalIdentityRepo } from "#src/features/members/index";
import { defaultBundledSourceRoot } from "#src/features/agent-plugins/supersession";
import { createTovuOAuthHttpPorts } from "#src/platform/oauth/endpoint-safety";
import { checkMemberWorkspace, toPublicMembersWriteServiceDeps } from "#src/server/inbound/public-http/routes/members/deps";
import { registerMemberLoginProvidersRoute, registerMemberOidcStartRoute } from "#src/server/inbound/public-http/routes/members/oidc-start";
import { registerMemberOidcCallbackRoute } from "#src/server/inbound/public-http/routes/members/oidc-callback";
import { registerMemberOidcVerifyEmailRoute } from "#src/server/inbound/public-http/routes/members/oidc-verify-email";
import { registerMemberUnlinkIdentityRoute } from "#src/server/inbound/public-http/routes/members/unlink-identity";
import { MEMBER_OIDC_PATH, memberOidcHeaders, type MemberOidcRouteDeps } from "#src/server/inbound/public-http/routes/members/oidc-deps";
import type { Express } from "express";

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
  const listProviders = async ({ workspaceId }: { workspaceId: string }): Promise<readonly LoginProvider[]> => {
    const bundledProviders = await loadBundledLoginProviders({ sourceRoot: defaultBundledSourceRoot({ env: process.env }) });
    const providers = await loadLoginProviders({ workspaceId, bundledProviders, loadContributions: admin.agentPluginLifecycle.loadPluginContributions });
    const configured = await Promise.all(providers.map(async provider =>
      await hasLoginCredentials({ deps: credentials, workspaceId, provider }) ? provider : null));
    return configured.filter(provider => provider !== null);
  };
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
 * Owns 18 registrations: 5 admin routes (list/get/disable/delete/request-magic-link), 8
 * public member auth routes and 5 member OIDC routes. The original registrations moved here
 * from `app.ts`'s `createApp()` retain their relative order. Owner 2026-10-24
 * adds DELETE-to-Trash alongside Disable.
 *
 * Genuinely needs TWO deps objects, not one: `MembersRouteDeps`/`MemberPublicRouteDeps` already
 * existed pre-slice as a deliberate split (`routes/admin/members/deps.ts`/`routes/members/deps.ts`)
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
    registerRoutes: (app) => {
      registerAdminMemberListRoute(app, deps.admin);
      registerAdminMemberGetRoute(app, deps.admin);
      registerAdminMemberDisableRoute(app, deps.admin);
      registerAdminMemberDeleteRoute(app, deps.admin);
      registerAdminMemberRequestMagicLinkRoute(app, deps.admin);
      registerPublicMemberSignInRequestRoute(app, deps.public);
      registerPublicMemberCompleteSignInRoute(app, deps.public);
      registerPublicMemberPasswordSignInRoute(app, deps.public);
      registerPublicMemberForgotPasswordRoute(app, deps.public);
      registerPublicMemberResetPasswordRoute(app, deps.public);
      registerPublicMemberSetPasswordRoute(app, deps.public);
      registerPublicMemberMeRoute(app, deps.public, { login: oidc });
      registerPublicMemberSignOutRoute(app, deps.public);
      registerOidcRoutes({ app, deps: oidc, members: deps.public });
    },
  };
}
