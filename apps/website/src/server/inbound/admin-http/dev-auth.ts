import { registerOwnerPasskeyRoutes } from './owner-passkey-routes.js';
import { ownerMfaDepsFrom } from "./owner-mfa-deps.js";
import { registerOwnerMfaRoutes } from "./owner-mfa-routes.js";
import { registerOwnerRecoveryRoutes } from "./owner-recovery-routes.js";
import { readRequestCookie } from "#src/server/http/request-cookie";
import type { Express, NextFunction, Request, Response } from "express";
import { mountJsonRoute } from "@jini-ai/http-kit";
import { RouteRefusalError } from "@jini-ai/core/errors/route-refusal";
import {
  createPasswordStatusRoute, currentUserRoute, bootSessionRoute, localBootSessionRoute, logoutRoute, mfaLoginRoute, OwnerAuthFailure, passwordLoginRoute,
  type AuthRequest, type AuthSessionOptions, type BootRedemption,
} from "@jini-ai/user-management/admin-http/auth";

import {
  type IdentityRepos,
  type PrincipalKind as IdentityPrincipalKind,
  type PrincipalRecord,
} from "@jini-ai/user-management";
import {
  beginOwnerLogin,
  beginPrincipalSignIn,
  completeOwnerLogin,
  createSessionForPrincipal,
  getEffectivePermissions,
  login,
  logout,
  NodeSessionTokens,
  validateSession,
  type AuthServiceDeps,
} from "@jini-ai/user-management/server";
import type { PrincipalKind } from "#src/contracts/core/gated-mutations/ports";
import { parseAuthenticatedJsonBody } from "../shared/json-body-parsers.js";
import type { ClockDeps, IdentityDeps, RouteDeps } from "../../routes/types.js";
import { authenticateApiKey, type ApiKeyServiceDeps } from "#src/features/identity/api-key-service";
import { createRateLimiter, LOGIN_STRICT, resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { createBootSessionTokenStore, redeemBootSessionToken } from "@jini-ai/user-management/identity/boot-session-token";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { describeErrorForLog } from "#src/contracts/core/model-facing-tool-errors";
import { allowsLocalOwnerSignInRequest, bootLocalOwnerSignIn, type LocalOwnerSignInPolicy } from "../../runtime/boot/local-owner-signin.js";
import { DEFAULT_OWNER_PASSWORD } from "#src/features/identity/wiring";
import { callerMayManageUserTrash, principalHoldsBuiltinAdminRole, principalHoldsOwnerWildcard } from "#src/features/identity/delete-user-service";
import { canPublishToLive } from "@jini-ai/cms/publish/content/live-site-policy";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";

/**
 * @file Real session auth for the admin origin (ADR-021 / SPEC-006).
 *
 * Purpose:
 * Gates /api/admin/* behind a server-side session backed by the `identity`
 * library's principal/RBAC model. This REPLACES the pre-SPEC-006
 * hardcoded-credential HMAC-cookie scheme (stateless signed `{userId, exp}`
 * token, a single env-var username/password pair, always resolving to the
 * literal actor `"user-local"`) with real argon2id password verification
 * against the seeded `users` table and a real, server-side, revocable
 * `sessions` row per login (REQ-06).
 *
 * How it relates to the project:
 * - Registered by `apps/website/src/server/runtime/composition/app.ts` ahead of admin routes.
 * - `TOVU_ADMIN_USER`/`TOVU_ADMIN_PASSWORD` still set the *seeded* owner's
 *   username/password at first boot (`Jini packages/user-management/src/server/seed.ts`) — same env vars as
 *   before, but they now seed a real hashed credential rather than being
 *   compared directly on every login.
 * - Route handlers that need "who is calling" read `getAuthedPrincipal(res)`
 *   (set here once per request) rather than re-parsing the cookie.
 * - The login route is additionally guarded by the `LOGIN_STRICT` rate-limit
 *   profile (REQ-14/AC-18, `core/rate-limit/rate-limit.ts`) before credentials are checked.
 *
 * SPEC-006 REQ-08 (2026-08-24): the gate now accepts a SECOND credential type — an issued API key
 * presented as `Authorization: Bearer <raw-key>` (or `ApiKey <raw-key>`, the spelling api.spec §2
 * uses; both are accepted so an ordinary HTTP client's bearer-token support works unchanged). Both
 * credentials resolve to the same thing — a `PrincipalRecord` on `res.locals` — so every existing
 * `getAuthedPrincipal`/`authorize()` call downstream is untouched by the addition: an api_key
 * principal's grants come from its issuance snapshot and are evaluated by the same `authorize()`.
 *
 * The cookie is tried first, so a browser request behaves EXACTLY as before and the header path is
 * reached only when there is no session to find.
 *
 * Scope: this applies to every surface that mounts `requireAdminSession`, which today is
 * `/api/admin` (`modules/core.ts`) AND `/api/assistant/chats` (`modules/assistant-chats.ts`) — not
 * `/api/admin` alone. Both are admin-authenticated surfaces whose per-route authorization is
 * unchanged, so a key reaches exactly the routes its snapshotted permissions already allow;
 * `openapi/006-identity-and-authorization.yaml` documents the `/api/admin` half.
 *
 * Architectural role:
 * `requireAdminSession`/`registerAuthRoutes` are middleware/route factories
 * that close over the identity repos + hasher + the `identityReady` seed
 * promise (`registerAuthRoutes` still takes the full `RouteDeps` bag it's
 * registered against; `requireAdminSession`/`currentPrincipal` take only
 * `SessionAuthDeps` — see that type's own doc) — the composition roots
 * (`apps/website/src/server/runtime/composition/app.ts`) pass `routeDeps` in either way, since `RouteDeps` is a
 * strict superset of `SessionAuthDeps`. Not a port (ADR-006): one real
 * session/credential implementation.
 */
const SESSION_COOKIE = "tovu_session";

// The extracted minter keeps the 32-byte hex bearer and SHA-256 digest in
// Jini packages/user-management/src/server/session-tokens.ts; binding it preserves existing session rows.
const sessionTokens = new NodeSessionTokens({});
// Tovu's absolute 30-day lifetime is product policy, passed explicitly to both minting paths.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * `Bearer <raw-key>` or `ApiKey <raw-key>`, case-insensitive on the scheme. The captured group is
 * a live credential: it is passed straight to `authenticateApiKey` and is never logged, echoed in
 * an error body, or attached to `res.locals`.
 */
const API_KEY_AUTHORIZATION_PATTERN = /^(?:Bearer|ApiKey)[ \t]+(\S+)$/i;

/** How the current request authenticated. Route families that must not be reachable by a machine
 *  credential (see `routes/admin/api-keys/*`) branch on this.
 *
 * `"publish_key"` is resolved by `publish-trust-auth.ts`'s `requirePublishTrust`, NOT by
 * `currentCredential` below — a publishing session token is never a credential this file can
 * issue or validate, and it reaches only the routes `grant.ts`'s `PUBLISH_TRUST_ROUTES` names.
 * It is listed here so the existing `rejectUnlessSessionCredential` guard (which admits only
 * `"session"`) refuses it on every machine-credential-forbidden route without a second edit. */
export type AuthCredentialKind = "session" | "api_key" | "publish_key";

/**
 * Maps how a request authenticated onto the principal class a gated ceremony records
 * (`core/gated-mutations/ports.ts`'s `PrincipalKind`).
 *
 * Exists so a route stops hardcoding `principalKind: "user"` for every caller. The mapping is
 * total and deliberately has no default arm: a new credential kind is a compile error here rather
 * than a silent re-label of automation as a human.
 *
 * `"agent"` is unreachable from this mapping because no agent authenticates through the admin HTTP
 * gate — agent-driven ceremonies pass their own kind directly from each feature's own
 * `tool-registrations.ts`.
 *
 * @complexity O(1).
 */
export function gatedPrincipalKindFor(kind: AuthCredentialKind): PrincipalKind {
  switch (kind) {
    case "session":
      return "user";
    case "api_key":
      return "api_key";
    case "publish_key":
      return "publish_key";
    // Preserve the undefined fallback for runtime inputs outside this exhaustive union.
    default: return undefined as never;
  }
}

/**
 * A principal an admin credential may resolve to: any kind but a site `member`. Members sign in on
 * the member origin with their own session (ADR-030 §3) and `authorize()` denies them every
 * operator permission (F3144); `currentCredential` also refuses an operator session or API key that
 * resolves to one, so admin routes can rely on this type.
 */
export type OperatorPrincipalRecord = PrincipalRecord & { kind: Exclude<IdentityPrincipalKind, "member"> };

function isOperatorPrincipal(principal: PrincipalRecord): principal is OperatorPrincipalRecord {
  return principal.kind !== "member";
}

/** A resolved credential: who is calling, and which of the two credential types proved it. */
export interface AuthenticatedCredential {
  principal: OperatorPrincipalRecord;
  kind: AuthCredentialKind;
}

/**
 * Deps `requireAdminSession`/`currentPrincipal` actually need: the identity repos (9 fields) plus
 * clock/idGen for `identity/*`'s `login`/`logout`/`validateSession`. Narrower than full `RouteDeps` —
 * see `routes/types.ts`'s `ClockDeps`/`IdentityDeps` doc for why this Slice-1 extraction exists.
 */
type SessionAuthDeps = IdentityDeps & ClockDeps;

/** Assemble the `IdentityRepos` bag `identity/*` functions expect from `RouteDeps`'s flat fields. */
function identityReposFrom(deps: IdentityDeps): IdentityRepos {
  return {
    transactions: deps.transactions,
    principals: deps.principalRepo,
    users: deps.userRepo,
    sessions: deps.sessionRepo,
    roles: deps.roleRepo,
    policies: deps.policyRepo,
    policyPermissions: deps.policyPermissionRepo,
    rolePolicies: deps.rolePolicyRepo,
    principalRoles: deps.principalRoleRepo,
    principalPolicies: deps.principalPolicyRepo,
  };
}

/** Bind the host's ISO clock and the required bearer strategy to Jini's auth ports. */
function authServiceDepsFrom(deps: SessionAuthDeps): AuthServiceDeps {
  return {
    repos: identityReposFrom(deps),
    ...(deps.mfaStore ? { mfaStore: deps.mfaStore } : {}),
    hasher: deps.passwordHasher,
    clock: { nowMs: () => Date.parse(deps.clock.nowIso()) },
    idGen: deps.idGen,
    tokens: sessionTokens,
  };
}

/** Assemble the `ApiKeyServiceDeps` bag `authenticateApiKey` expects from `RouteDeps`'s flat fields. */
function apiKeyServiceDepsFrom(deps: SessionAuthDeps): ApiKeyServiceDeps {
  return {
    ...authServiceDepsFrom(deps),
    apiKeys: deps.apiKeyRepo,
    secretHasher: deps.apiKeySecretHasher,
  };
}

function readSessionToken({ req, localOwnerSignIn }: { req: Request; localOwnerSignIn: LocalOwnerSignInPolicy }, _optional = {}): string | null {
  // The port cookie is a dev capability, never a second production authentication name.
  const localToken = localOwnerSignIn.enabled ? readRequestCookie({ request: req, name: localSessionCookieName(req) }) : undefined;
  return localToken ?? readRequestCookie({ request: req, name: SESSION_COOKIE }) ?? null;
}

/** Revoke only the two session cookies this listener clears, using Jini's idempotent revoker.
 * Clearing a browser cookie alone leaves a captured bearer usable until expiry.
 * @complexity O(1): at most two session lookups/revocations; other tabs' sessions stay valid.
 */
async function revokeRequestSessions({ deps, req }: { deps: SessionAuthDeps; req: Request }, _optional = {}): Promise<void> {
  const tokens = new Set([readRequestCookie({ request: req, name: SESSION_COOKIE }),
    readRequestCookie({ request: req, name: localSessionCookieName(req) })]);
  for (const rawToken of tokens) {
    if (rawToken) await logout({ deps: authServiceDepsFrom(deps), input: { workspaceId: deps.workspaceId, rawToken } });
  }
}

/** Cookies ignore ports. Local browser sites need separate names to remain signed in together. */
function localSessionCookieName(req: Request): string {
  return `${SESSION_COOKIE}_local_${req.socket?.localPort ?? 0}`;
}

/** REQ-06: `HttpOnly`, `SameSite=Strict`, `Secure`, bound to the admin origin. */
function setSessionCookie({ res, rawToken, expiresAtIso }: { res: Response; rawToken: string; expiresAtIso: string }, { name = SESSION_COOKIE }: { name?: string } = {}): void {
  const maxAge = Math.max(0, new Date(expiresAtIso).getTime() - Date.now());
  res.cookie(name, rawToken, { httpOnly: true, path: "/", maxAge, sameSite: "strict", secure: true });
  // A deliberate password sign-in supersedes local owner bootstrap, including a non-owner login.
  if (name === SESSION_COOKIE && readRequestCookie({ request: res.req, name: localSessionCookieName(res.req) })) {
    res.clearCookie(localSessionCookieName(res.req), { httpOnly: true, path: "/", sameSite: "strict", secure: true });
  }
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, path: "/", sameSite: "strict", secure: true });
  if (readRequestCookie({ request: res.req, name: localSessionCookieName(res.req) })) {
    res.clearCookie(localSessionCookieName(res.req), { httpOnly: true, path: "/", sameSite: "strict", secure: true });
  }
}

/** Pull the raw key out of an `Authorization` header, or `null` when there is no key-shaped one. */
function readApiKeyCredential(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = API_KEY_AUTHORIZATION_PATTERN.exec(header.trim());
  return match ? match[1] : null;
}

/**
 * Resolve whichever credential this request carries to its principal, applying every fail-closed
 * check for that credential type. Awaits `deps.identityReady` first so this never races first-boot
 * seeding.
 *
 * The cookie is tried first and the `Authorization` header only when no session resolved, so an
 * ordinary browser request without a local port cookie keeps its existing behavior. Local dev
 * cookies use the same validator and repos; only their browser cookie name differs.
 * Both paths are all-or-nothing: `validateSession` and `authenticateApiKey` each return `null` for
 * every rejection reason (missing, invalid, expired, revoked, disabled principal) rather than a
 * distinguishable error, so the 401 below cannot be used as an oracle either way.
 *
 * @returns the principal plus WHICH credential proved it, or `null`.
 * @complexity O(1) — one cookie parse plus one session lookup, or one header parse plus one
 *   indexed api-key lookup and one key derivation.
 * @overallScore 100
 */
export async function currentCredential({ deps, req }: { deps: SessionAuthDeps; req: Request }, { localOwnerSignIn = bootLocalOwnerSignIn }: { localOwnerSignIn?: LocalOwnerSignInPolicy } = {}): Promise<AuthenticatedCredential | null> {
  const rawToken = readSessionToken({ req, localOwnerSignIn });
  if (rawToken) {
    await deps.identityReady;
    const resolved = await validateSession({
      deps: authServiceDepsFrom(deps),
      input: { workspaceId: deps.workspaceId, rawToken },
    });
    // A member principal is refused like a missing session (no oracle): only a hand-minted row
    // could pair one with an operator session.
    if (resolved?.principal && isOperatorPrincipal(resolved.principal)) return { principal: resolved.principal, kind: "session" };
  }

  const rawKey = readApiKeyCredential(req);
  if (!rawKey) return null;

  await deps.identityReady;
  const authenticated = await authenticateApiKey({
    deps: apiKeyServiceDepsFrom(deps),
    input: { workspaceId: deps.workspaceId, rawKey },
  });
  return authenticated && isOperatorPrincipal(authenticated.principal)
    ? { principal: authenticated.principal, kind: "api_key" }
    : null;
}

/**
 * Resolve the current request's credential to its principal, discarding which credential it was.
 * Thin wrapper over `currentCredential` — kept because callers that only ever needed "who is
 * calling" should not have to destructure a shape they ignore.
 *
 * @complexity O(1) — see `currentCredential`.
 * @overallScore 100
 */
export async function currentPrincipal({ deps, req }: { deps: SessionAuthDeps; req: Request }, options: { localOwnerSignIn?: LocalOwnerSignInPolicy } = {}): Promise<OperatorPrincipalRecord | null> {
  return (await currentCredential({ deps, req }, options))?.principal ?? null;
}

/**
 * Read the principal `requireAdminSession` attached to this request. Route
 * handlers under `/api/admin` call this instead of re-parsing the cookie.
 * Throws if called on a request that didn't pass through
 * `requireAdminSession` first — a wiring bug, not a runtime auth outcome.
 */
export function getAuthedPrincipal(res: Response): OperatorPrincipalRecord {
  const principal = res.locals.principal as OperatorPrincipalRecord | undefined;
  if (!principal) {
    throw new Error(
      "getAuthedPrincipal: no principal on res.locals — requireAdminSession must run before this route"
    );
  }
  return principal;
}

/**
 * Read HOW the current request authenticated (SPEC-006 REQ-08). Route families that must stay
 * out of reach of a machine credential call this and refuse anything but `"session"` — the
 * spec-level rule that an API key can never mint, issue, or revoke another API key, which is what
 * keeps key issuance from being a privilege-escalation primitive.
 *
 * Throws if called on a request that didn't pass through `requireAdminSession` first — a wiring
 * bug, not a runtime auth outcome (same contract as `getAuthedPrincipal`).
 */
export function getAuthedCredentialKind(res: Response): AuthCredentialKind {
  const kind = res.locals.authCredentialKind as AuthCredentialKind | undefined;
  if (!kind) {
    throw new Error(
      "getAuthedCredentialKind: no credential kind on res.locals — requireAdminSession must run before this route"
    );
  }
  return kind;
}

/** What every route family that refuses a machine credential sends — identical shape whether the
 *  refusal came from `routes/api-keys/*` or `routes/system/site-key.ts`, so a caller can branch
 *  on `code`/`details.reason` without knowing which family answered. */
export interface CredentialKindForbiddenBody {
  error: string;
  code: "FORBIDDEN";
  details: { permission: string; reason: "credential_kind_not_permitted" };
}

/**
 * The shared "this action must stay out of reach of a machine credential" guard
 * (`getAuthedCredentialKind`'s own doc names the rule). Two route families call this today:
 * `routes/api-keys/deps.ts`'s `rejectApiKeyCredential` (an api_key may never mint, issue, or
 * revoke another key — SPEC-006 REQ-08) and `routes/system/site-key.ts` (an api_key may never
 * read or mint the site key, since a leaked key would then expose every other stored
 * credential). Both need the identical 403 shape, so this is the one place that shape is spelled
 * out; each caller supplies only the wording and the permission name its own 403 body should carry.
 *
 * Runs before any body read or existence check that route performs, so an api_key caller learns
 * nothing beyond "this credential type is not permitted here."
 *
 * @returns `true` when the request may proceed. On `false` the 403 has already been sent.
 * @complexity O(1).
 */
export function rejectUnlessSessionCredential(
  { res, message, permission }: { res: Response; message: string; permission: string },
  _optional: Record<string, never> = {}
): boolean {
  if (getAuthedCredentialKind(res) === "session") return true;

  const body: CredentialKindForbiddenBody = {
    error: message,
    code: "FORBIDDEN",
    details: { permission, reason: "credential_kind_not_permitted" },
  };
  res.status(403).json(body);
  return false;
}

/**
 * Express middleware factory: reject unauthenticated /api/admin requests; attach the principal,
 * then parse the JSON body at the authenticated limit (`json-body-parsers.ts`).
 *
 * Steps aside for a request `publish-trust-auth.ts`'s `requirePublishTrust` already resolved. That
 * gate mounts immediately before this one and only ever reaches `next()` with a credential
 * attached when it has verified the token's MAC, its audience, its expiry, its grant AND that the
 * request is on a route `grant.ts`'s `PUBLISH_TRUST_ROUTES` names — so by the time this sees the
 * marker, every check this middleware would perform has a stricter counterpart that already ran.
 * `res.locals` is server-side and per-request: no client can set the marker.
 * Credential-store failures go to Express's error handler through `next(error)`.
 */
export function requireAdminSession(deps: SessionAuthDeps,
  { localOwnerSignIn = bootLocalOwnerSignIn }: { localOwnerSignIn?: LocalOwnerSignInPolicy } = {},
) {
  return async function requireAdminSessionMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (res.locals.authCredentialKind === "publish_key") {
        parseAuthenticatedJsonBody(req, res, next);
        return;
      }

      const credential = await currentCredential({ deps, req }, { localOwnerSignIn });
      if (!credential) {
        res.status(401).json({ error: "unauthenticated", code: "UNAUTHENTICATED" });
        return;
      }
      res.locals.principal = credential.principal;
      res.locals.authCredentialKind = credential.kind;
      // The app-level parser leaves gated paths unparsed, so an anonymous body is never read.
      parseAuthenticatedJsonBody(req, res, next);
    } catch (error) {
      // Forward failed credential resolution; Express 4 drops rejected middleware promises.
      next(error);
    }
  };
}

/**
 * Loopback peer addresses. IPv4-mapped IPv6 (`::ffff:127.0.0.1`) is what Node reports for an IPv4
 * client on a dual-stack listener, so it belongs here; `localhost` deliberately does not, because
 * this is compared against a resolved socket address, never a name.
 */
const IPV4_LOOPBACK = "127.0.0.1";
const LOOPBACK_PEERS = new Set([IPV4_LOOPBACK, "::1", `::ffff:${IPV4_LOOPBACK}`]);

/**
 * Whether this request came from this machine.
 *
 * Proven from the SOCKET, not inferred from the bind address: `serve.ts` binds `127.0.0.1` by
 * default (LAN-bind plan, 2026-09-23), but `TOVU_HOST` can widen that, and `index.ts` still binds
 * every interface by default — so a remote client is possible on either boot path and this check
 * stays regardless of what either one is currently bound to.
 * `req.ip`/`X-Forwarded-For` are deliberately not consulted — a header is attacker-controlled, and
 * this is the check that stands between a boot token and the network.
 *
 * @complexity O(1).
 */
function isLoopbackPeer(req: Request): boolean {
  const peer = req.socket.remoteAddress;
  return typeof peer === "string" && LOOPBACK_PEERS.has(peer);
}

/**
 * Mint a session row for an already-identified principal and return its raw token.
 *
 * Thin wrapper over `@jini-ai/user-management/server`'s `createSessionForPrincipal` (2026-09-06) — the
 * library's own password-free session minter, factored out of `login()` so this route no longer
 * has to hand-roll session construction. This used to duplicate `auth-service.ts`'s private
 * `hashToken`/token-generation inline (with its own base64url encoding, diverging from the
 * library's hex) because `login()` was the only minter and hard-requires a password; that
 * duplication, and the encoding drift it carried, is gone now that both paths share one minter.
 * The caller still VERIFIES the result through the library's own `validateSession` before handing
 * the cookie out — that check is what would have caught the old drift, and stays as defense in
 * depth even though the shared minter removes the drift's actual cause.
 *
 * @complexity O(1) — one session write (inside the shared minter).
 */
async function mintSessionForPrincipal({ deps, principalId }: { deps: SessionAuthDeps; principalId: string }, _optional = {}): Promise<{ mfaRequired: true; pendingToken: string } | { rawToken: string; expiresAt: string }> {
  if (deps.mfaStore) {
    const result = await beginPrincipalSignIn({ deps: await ownerMfaDepsFrom({ deps }),
      input: { workspaceId: deps.workspaceId, principalId } }, { sessionTtlMs: SESSION_TTL_MS });
    if ("mfaRequired" in result) return result;
    return { rawToken: result.rawToken, expiresAt: result.session.expiresAt };
  }
  const { session, rawToken } = await createSessionForPrincipal({
    deps: authServiceDepsFrom(deps),
    input: { workspaceId: deps.workspaceId, principalId },
  }, { sessionTtlMs: SESSION_TTL_MS });
  return { rawToken, expiresAt: session.expiresAt };
}

/** Resolve the seeded boot owner only after identity initialization, refusing non-operators. */
async function resolveBootOwner(
  { deps }: { deps: SessionAuthDeps },
  _optional = {},
): Promise<{ principalId: string; principal: OperatorPrincipalRecord } | null> {
  await deps.identityReady;
  const principalId = await deps.ownerPrincipalId;
  const principal = await deps.principalRepo.findById({ workspaceId: deps.workspaceId, id: principalId });
  if (!principal || principal.status !== "active" || !isOperatorPrincipal(principal)) return null;
  return { principalId, principal };
}

/** Anonymous auth replies disclose only the operation, recovery action and incident ID.
 * Wrap the cause so the shared helper's domain-specific refusals cannot disclose backend facts.
 * Diagnostics retain the cause through the shared redactor; no credentials enter the reply.
 * @complexity O(diagnostic length) redaction, one log and at most one configured tracker event.
 */
function sendAuthFailure(
  { res, error, operation }: { res: Response; error: unknown; operation: "login" | "logout" | "boot-session" },
  _options = {},
): void {
  const signingOut = operation === "logout";
  sendAdminFailure({ res, error: new Error("Admin session handling stopped", { cause: error }) }, {
    operation: `auth-${operation}`,
    message: signingOut ? "Sign-out could not finish." : "Sign-in could not finish.",
    failure: {
      step: `auth-${operation}`,
      action: signingOut ? "Try signing out again. If it still fails, copy details and report this problem." : "Try signing in again. If it still fails, copy details and report this problem.",
    },
  });
}

type BootRedeemOptions = { redeem?: (required: { rawToken: unknown }) => boolean; cookieName?: string };
/** A redemption whose session arm carries the host's principal record (still a `BootRedemption`). */
type OwnerBootRedemption = Exclude<BootRedemption, { kind: "session" }> | { kind: "session"; principal: OperatorPrincipalRecord; setCookies: readonly string[] };

/** Shared desktop/browser exchange: consume once, verify the real session, then set its cookie.
 * Rejections come back as a `BootRedemption` for the K1 boot routes to answer. Repository failures propagate.
 * @complexity O(1): a bounded number of principal/session lookups and one session write.
 */
async function ownerBootRedemption(
  { deps, res, token }: { deps: SessionAuthDeps; res: Response; token: unknown },
  { redeem = redeemBootSessionToken, cookieName = SESSION_COOKIE }: BootRedeemOptions = {},
): Promise<OwnerBootRedemption> {
  if (!redeem({ rawToken: token })) return { kind: "refused" };
  const owner = await resolveBootOwner({ deps });
  if (!owner) return { kind: "failure", error: new Error("Boot owner is unavailable") };
  const { principalId, principal } = owner;
  const minted = await mintSessionForPrincipal({ deps, principalId });
  if ("mfaRequired" in minted) return { kind: "mfa", body: minted };
  const { rawToken, expiresAt } = minted;
  // The fork guard promised in `mintSessionForPrincipal`'s doc: prove the row this route just
  // wrote is one the library itself will accept, BEFORE setting a cookie on it. Without this, a
  // future change to the library's private token hashing would leave every desktop launch
  // silently unauthenticated with nothing pointing at the cause.
  const confirmed = await validateSession({
    deps: authServiceDepsFrom(deps), input: { workspaceId: deps.workspaceId, rawToken },
  });
  if (!confirmed?.principal) return { kind: "failure", error: new Error("Boot session confirmation failed") };
  // The ordinary desktop cookie also replaces/clears local bootstrap; revoke what it supersedes.
  if (cookieName === SESSION_COOKIE) await revokeRequestSessions({ deps, req: res.req });
  setSessionCookie({ res, rawToken, expiresAtIso: expiresAt }, { name: cookieName });
  return { kind: "session", principal, setCookies: setCookieValues(res) };
}

/** The exchange answered directly on `res`: resolves null after sending the rejection body. */
export async function redeemOwnerBootSession(
  { deps, res, token }: { deps: SessionAuthDeps; res: Response; token: unknown }, options: BootRedeemOptions = {},
): Promise<OperatorPrincipalRecord | null> {
  const redemption = await ownerBootRedemption({ deps, res, token }, options);
  if (redemption.kind === "session") return redemption.principal;
  if (redemption.kind === "refused") res.status(401).json({ error: "invalid or spent boot token", code: "UNAUTHENTICATED" });
  else if (redemption.kind === "mfa") { res.setHeader("Cache-Control", "no-store"); res.json(redemption.body); }
  else sendAuthFailure({ res, error: redemption.error, operation: "boot-session" });
  return null;
}

/** The `Set-Cookie` values written so far, in order. */
function setCookieValues(res: Response): readonly string[] {
  const header = res.getHeader?.("set-cookie");
  return header === undefined ? [] : Array.isArray(header) ? header.map(String) : [String(header)];
}

/** Told after an owner or admin signs in. Only the serving app passes one (its automatic form pull);
 * `signedIn` must return at once: it runs after the session cookie is set and is never awaited. */
export interface AdminSignInPort {
  signedIn(required?: Record<string, never>, optional?: Record<string, never>): void;
}

/** The site's owner (an unconstrained `*` holder) or a holder of the built-in `admin` role — the
 * identity feature's two role classifiers, never a permission string, so a custom role that was
 * granted broad permissions does not count. @complexity Owner check first; role lookup only if not.
 */
async function isOwnerOrBuiltinAdmin({ deps, principalId }: { deps: SessionAuthDeps; principalId: string }, _optional = {}): Promise<boolean> {
  const authDeps = authServiceDepsFrom(deps);
  if (await principalHoldsOwnerWildcard({ deps: authDeps, workspaceId: deps.workspaceId, principalId })) return true;
  return principalHoldsBuiltinAdminRole({ deps: authDeps, workspaceId: deps.workspaceId, principalId });
}

/** After a successful sign-in, tells `port` when the principal is the owner or an admin. Returns at
 * once: the role lookup runs in the background, and its failure (or the port's) is logged without
 * any identity detail and never reaches the sign-in response. @complexity O(1) here. */
function signalAdminSignIn({ deps, principalId, port }: { deps: SessionAuthDeps; principalId: string; port: AdminSignInPort | undefined }, _optional = {}): void {
  if (!port) return;
  void isOwnerOrBuiltinAdmin({ deps, principalId })
    .then((eligible) => { if (eligible) port.signedIn(); })
    .catch((err: unknown) => console.warn("[admin-auth] post-sign-in form pull check failed; sign-in is unaffected", describeErrorForLog({ err })));
}

/** Shared request metadata for every ordinary owner session. O(1), no I/O. */
function sessionRequestOptions({ req }: { req: Request }) {
  return { ip: req.ip, userAgent: req.get("user-agent") ?? undefined, sessionTtlMs: SESSION_TTL_MS };
}

/** Registers login/logout/me and the loopback boot exchange before the admin session gate.
 * `onAdminSignIn` hears every owner/admin sign-in: password login and both boot-session exchanges. */
export function registerAuthRoutes({ app, deps }: { app: Express; deps: RouteDeps }, { localOwnerSignIn = bootLocalOwnerSignIn, onAdminSignIn }: { localOwnerSignIn?: LocalOwnerSignInPolicy; onAdminSignIn?: AdminSignInPort } = {}): void {
  // REQ-14/AC-18: LOGIN_STRICT (10 req/60s per client IP) brute-force guard on
  // AUTH_LOGIN. One limiter instance per `registerAuthRoutes` call, so each
  // `createApp()`/`createRouteDeps()` pair (and therefore each test's server)
  // gets an isolated counter store rather than sharing process-wide state.
  const loginRateLimiter = createRateLimiter({ profile: LOGIN_STRICT, clock: { nowMs: () => Date.parse(deps.clock.nowIso()) } });

  registerOwnerRecoveryRoutes({ app, deps, limiter: loginRateLimiter,
    authenticate: ({ req }) => currentPrincipal({ deps, req }, { localOwnerSignIn }),
    desktopOwnerReset: localOwnerSignIn.enabled && !!localOwnerSignIn.acceptsCapability,
    ...(localOwnerSignIn.acceptsCapability ? { acceptsDesktopCapability: localOwnerSignIn.acceptsCapability } : {}) });

  registerOwnerMfaRoutes({ app, deps, limiter: loginRateLimiter,
    authenticate: ({ req }) => currentCredential({ deps, req }, { localOwnerSignIn }) });
  registerOwnerPasskeyRoutes({ app, deps, limiter: loginRateLimiter,
    authenticate: ({ req }) => currentCredential({ deps, req }, { localOwnerSignIn }),
    signedIn: async (req, res, result) => {
      await revokeRequestSessions({ deps, req });
      setSessionCookie({ res, rawToken: result.rawToken, expiresAtIso: result.session.expiresAt });
      const user = await deps.userRepo.findByPrincipalId({ workspaceId: deps.workspaceId, principalId: result.principal.id });
      signalAdminSignIn({ deps, principalId: result.principal.id, port: onAdminSignIn });
      res.json({ user: { id: result.principal.id, username: user?.username ?? result.principal.displayName } });
    },
  });
  mountOwnerAuthRoutes({ app, deps }, { loginRateLimiter, localOwnerSignIn, onAdminSignIn });
}

interface OwnerAuthMountOptions { loginRateLimiter: ReturnType<typeof createRateLimiter>; localOwnerSignIn: LocalOwnerSignInPolicy; onAdminSignIn: AdminSignInPort | undefined }

/** The K1 `AuthRequest` for one request: Tovu's cookie, cache-header, limiter, revocation and
 * sign-in policy, bound to the original Express request through `res.req`. Request facts are read
 * lazily, when a route asks for them, exactly where the pre-K1 handlers read them. */
function authRequestFor({ deps, res, options }: { deps: RouteDeps; res: Response; options: OwnerAuthMountOptions }): AuthRequest {
  const req = res.req;
  const { localOwnerSignIn } = options;
  return {
    // Client-IP resolution (api.spec §3): no explicit trusted-proxy list is supplied here.
    // resolveClientIp falls back to Express's req.ip under the host's trust-proxy policy,
    // or the socket peer; an untrusted X-Forwarded-For is never honored.
    get clientKey() { return resolveClientIp(req); },
    sessionOptions: (): AuthSessionOptions => sessionRequestOptions({ req }),
    rateLimit: { check: async () => {
      const rate = await options.loginRateLimiter.check({ key: resolveClientIp(req) });
      return rate.allowed ? { allowed: true, retryAfterSeconds: 0 } : rate;
    } },
    currentPrincipal: () => currentPrincipal({ deps, req }, { localOwnerSignIn }),
    revokeSessions: () => revokeRequestSessions({ deps, req }),
    cookies: {
      replaceSession: ({ rawToken, expiresAtIso }, { name } = {}) => { setSessionCookie({ res, rawToken, expiresAtIso }, name ? { name } : {}); return setCookieValues(res); },
      clearSessions: () => { clearSessionCookie(res); return setCookieValues(res); },
    },
    noStore: () => { res.setHeader("Cache-Control", "no-store"); },
    retryAfter: (seconds) => { res.setHeader("Retry-After", String(seconds)); },
    signedIn: ({ principalId }) => signalAdminSignIn({ deps, principalId, port: options.onAdminSignIn }),
    get loopback() { return isLoopbackPeer(req); },
    localOwnerSignIn: {
      enabled: localOwnerSignIn.enabled,
      acceptsCapability: () => !localOwnerSignIn.acceptsCapability || localOwnerSignIn.acceptsCapability({ capability: req.get("x-tovu-desktop-owner-signin") }),
      allowsRequest: () => allowsLocalOwnerSignInRequest({
        host: req.headers.host, origin: req.get("origin"), fetchSite: req.get("sec-fetch-site"),
        fetchMode: req.get("sec-fetch-mode"), headers: req.headers,
      }),
    },
    redeemBootSession: ({ token }, { mintLocal } = {}) => {
      if (!mintLocal) return ownerBootRedemption({ deps, res, token });
      // Separate stores prevent concurrent tabs, or the desktop's still-armed token, burning each other.
      const store = createBootSessionTokenStore();
      return ownerBootRedemption({ deps, res, token: store.mint() }, { redeem: store.redeem, cookieName: localSessionCookieName(req) });
    },
  };
}

/** Writes a K1 refusal verbatim. Login and logout answer any other failure with their redacted auth
 * envelope; the boot and `/auth/me*` routes hand it to Express's error chain (OD-2), as their
 * pre-K1 `next(error)` / `asyncRoute` did. */
function ownerAuthErrorPort({ operation }: { operation?: "login" | "logout" }) {
  return ({ res, error }: { res: Response; error: unknown }): void => {
    if (error instanceof RouteRefusalError) { res.status(error.response.status).json(error.response.body); return; }
    // The boot redemption is the only route that throws `OwnerAuthFailure` (`operation: "boot-session"`).
    if (error instanceof OwnerAuthFailure) { sendAuthFailure({ res, error: error.cause, operation: "boot-session" }); return; }
    if (operation) { sendAuthFailure({ res, error, operation }); return; }
    (res.req.next as NextFunction)(error);
  };
}

/** Mounts the seven `@jini-ai/user-management` owner-auth K1 routes, in their pre-K1 order and
 * position (ahead of the session gate). Deps are read per request, as the inline handlers did. */
function mountOwnerAuthRoutes({ app, deps }: { app: Express; deps: RouteDeps }, options: OwnerAuthMountOptions): void {
  const authenticate = ({ res }: { res: Response }) => authRequestFor({ deps, res, options });
  const ports = (operation?: "login" | "logout") => ({ authenticate, onError: ownerAuthErrorPort({ operation }) });
  const findUserByPrincipalId = (query: { workspaceId: string; principalId: string }) => deps.userRepo.findByPrincipalId(query);
  mountJsonRoute({ app, spec: { ...passwordLoginRoute, ports: ports("login") }, deps: {
    get identityReady() { return deps.identityReady; }, get mfaStore() { return deps.mfaStore; }, workspaceId: deps.workspaceId,
    login: (required, sessionOptions) => login({ deps: authServiceDepsFrom(deps), ...required }, sessionOptions),
    beginOwnerLogin: async (required, sessionOptions) => beginOwnerLogin({ deps: await ownerMfaDepsFrom({ deps }), ...required }, sessionOptions),
  } });
  mountJsonRoute({ app, spec: { ...mfaLoginRoute, ports: ports("login") }, deps: {
    workspaceId: deps.workspaceId, findUserByPrincipalId,
    completeOwnerLogin: async (required, sessionOptions) => completeOwnerLogin({ deps: await ownerMfaDepsFrom({ deps }), ...required }, sessionOptions),
  } });
  mountJsonRoute({ app, spec: { ...logoutRoute, ports: ports("logout") }, deps: { get identityReady() { return deps.identityReady; } } });
  mountJsonRoute({ app, spec: { ...bootSessionRoute, ports: ports() }, deps: {} });
  mountJsonRoute({ app, spec: { ...localBootSessionRoute, ports: ports() }, deps: {} });
  mountJsonRoute({ app, spec: { ...currentUserRoute, ports: ports() }, deps: {
    workspaceId: deps.workspaceId, findUserByPrincipalId,
    effectivePermissions: ({ workspaceId, principalId }) => getEffectivePermissions({ deps: identityReposFrom(deps), input: { workspaceId, principalId } }),
    callerMayManageUserTrash: ({ workspaceId, callerPrincipalId }) => callerMayManageUserTrash({ deps: authServiceDepsFrom(deps), workspaceId, callerPrincipalId }),
    canPublishToLive: () => canPublishToLive({ resolveRuntimeMode }),
  } });
  mountJsonRoute({ app, spec: { ...createPasswordStatusRoute(), ports: ports() }, deps: {
    workspaceId: deps.workspaceId, findUserByPrincipalId, defaultOwnerPassword: DEFAULT_OWNER_PASSWORD,
    verifyPassword: ({ hash, password }) => deps.passwordHasher.verify({ hash, password }),
  } });
}
