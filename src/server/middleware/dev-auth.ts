import type { Express, NextFunction, Request, Response } from "express";

import {
  AuthInvalidCredentialsError,
  getEffectivePermissions,
  login,
  logout,
  validateSession,
  type IdentityRepos,
  type PrincipalRecord,
} from "@jini-ai/cms/identity";
import type { ClockDeps, IdentityDeps, RouteDeps } from "../routes/types.js";
import { authenticateApiKey, type ApiKeyServiceDeps } from "#src/identity/api-key-service";
import { createRateLimiter, LOGIN_STRICT, resolveClientIp } from "#src/core/rate-limit/rate-limit";

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
 * - Registered by `server/app.ts` ahead of admin routes.
 * - `TOVU_ADMIN_USER`/`TOVU_ADMIN_PASSWORD` still set the *seeded* owner's
 *   username/password at first boot (`identity/seed.ts`) — same env vars as
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
 * `SessionAuthDeps` — see that type's own doc, the first slice of the
 * `RouteDeps` decomposition, 2026-08-18) — the composition roots
 * (`server/app.ts`) pass `routeDeps` in either way, since `RouteDeps` is a
 * strict superset of `SessionAuthDeps`. Not a port (ADR-006): one real
 * session/credential implementation.
 */
const SESSION_COOKIE = "tovu_session";

/**
 * `Bearer <raw-key>` or `ApiKey <raw-key>`, case-insensitive on the scheme. The captured group is
 * a live credential: it is passed straight to `authenticateApiKey` and is never logged, echoed in
 * an error body, or attached to `res.locals`.
 */
const API_KEY_AUTHORIZATION_PATTERN = /^(?:Bearer|ApiKey)[ \t]+(\S+)$/i;

/** How the current request authenticated. Route families that must not be reachable by a machine
 *  credential (see `routes/admin/api-keys/*`) branch on this. */
export type AuthCredentialKind = "session" | "api_key";

/** A resolved credential: who is calling, and which of the two credential types proved it. */
export interface AuthenticatedCredential {
  principal: PrincipalRecord;
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

/** Assemble the `ApiKeyServiceDeps` bag `authenticateApiKey` expects from `RouteDeps`'s flat fields. */
function apiKeyServiceDepsFrom(deps: SessionAuthDeps): ApiKeyServiceDeps {
  return {
    repos: identityReposFrom(deps),
    hasher: deps.passwordHasher,
    clock: deps.clock,
    idGen: deps.idGen,
    apiKeys: deps.apiKeyRepo,
    secretHasher: deps.apiKeySecretHasher,
  };
}

function readSessionToken(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** REQ-06: `HttpOnly`, `SameSite=Strict`, `Secure`, bound to the admin origin. */
function setSessionCookie(res: Response, rawToken: string, expiresAtIso: string): void {
  const maxAgeSeconds = Math.max(0, Math.floor((new Date(expiresAtIso).getTime() - Date.now()) / 1000));
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(rawToken)}; HttpOnly; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Strict; Secure`
  );
}

function clearSessionCookie(res: Response): void {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict; Secure`);
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
 * existing browser request's behavior is bit-for-bit what it was before Bearer support landed.
 * Both paths are all-or-nothing: `validateSession` and `authenticateApiKey` each return `null` for
 * every rejection reason (missing, invalid, expired, revoked, disabled principal) rather than a
 * distinguishable error, so the 401 below cannot be used as an oracle either way.
 *
 * @returns the principal plus WHICH credential proved it, or `null`.
 * @complexity O(1) — one cookie parse plus one session lookup, or one header parse plus one
 *   indexed api-key lookup and one key derivation.
 * @overallScore 100
 */
export async function currentCredential(
  deps: SessionAuthDeps,
  req: Request
): Promise<AuthenticatedCredential | null> {
  const rawToken = readSessionToken(req);
  if (rawToken) {
    await deps.identityReady;
    const resolved = await validateSession({
      deps: { repos: identityReposFrom(deps), hasher: deps.passwordHasher, clock: deps.clock, idGen: deps.idGen },
      input: { workspaceId: deps.workspaceId, rawToken },
    });
    if (resolved?.principal) return { principal: resolved.principal, kind: "session" };
  }

  const rawKey = readApiKeyCredential(req);
  if (!rawKey) return null;

  await deps.identityReady;
  const authenticated = await authenticateApiKey({
    deps: apiKeyServiceDepsFrom(deps),
    input: { workspaceId: deps.workspaceId, rawKey },
  });
  return authenticated ? { principal: authenticated.principal, kind: "api_key" } : null;
}

/**
 * Resolve the current request's credential to its principal, discarding which credential it was.
 * Thin wrapper over `currentCredential` — kept because callers that only ever needed "who is
 * calling" should not have to destructure a shape they ignore.
 *
 * @complexity O(1) — see `currentCredential`.
 * @overallScore 100
 */
export async function currentPrincipal(deps: SessionAuthDeps, req: Request): Promise<PrincipalRecord | null> {
  return (await currentCredential(deps, req))?.principal ?? null;
}

/**
 * Read the principal `requireAdminSession` attached to this request. Route
 * handlers under `/api/admin` call this instead of re-parsing the cookie.
 * Throws if called on a request that didn't pass through
 * `requireAdminSession` first — a wiring bug, not a runtime auth outcome.
 */
export function getAuthedPrincipal(res: Response): PrincipalRecord {
  const principal = res.locals.principal as PrincipalRecord | undefined;
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

/** Express middleware factory: reject unauthenticated /api/admin requests; attach the principal. */
export function requireAdminSession(deps: SessionAuthDeps) {
  return async function requireAdminSessionMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const credential = await currentCredential(deps, req);
    if (!credential) {
      res.status(401).json({ error: "unauthenticated", code: "UNAUTHENTICATED" });
      return;
    }
    res.locals.principal = credential.principal;
    res.locals.authCredentialKind = credential.kind;
    next();
  };
}

/** Registers login/logout/me routes. Login is the only ungated admin route. */
export function registerAuthRoutes(app: Express, deps: RouteDeps): void {
  // REQ-14/AC-18: LOGIN_STRICT (10 req/60s per client IP) brute-force guard on
  // AUTH_LOGIN. One limiter instance per `registerAuthRoutes` call, so each
  // `createApp()`/`createRouteDeps()` pair (and therefore each test's server)
  // gets an isolated counter store rather than sharing process-wide state.
  const loginRateLimiter = createRateLimiter({ profile: LOGIN_STRICT, clock: deps.clock });

  app.post("/api/admin/v1/auth/login", async (req, res) => {
    await deps.identityReady;

    // Client-IP resolution (api.spec §3): no trusted-proxy list is configured
    // anywhere in this repo, so `resolveClientIp` always falls back to the
    // socket peer address — an untrusted X-Forwarded-For is never honored.
    const clientIp = resolveClientIp(req);
    const rateLimitResult = loginRateLimiter.check(clientIp);
    if (!rateLimitResult.allowed) {
      res.setHeader("Retry-After", String(rateLimitResult.retryAfterSeconds));
      res.status(429).json({
        error: "too many login attempts",
        code: "RATE_LIMIT_EXCEEDED",
        details: { retryAfterSeconds: rateLimitResult.retryAfterSeconds },
      });
      return;
    }

    const username = String(req.body?.username ?? "");
    const password = String(req.body?.password ?? "");

    try {
      const { principal, session, rawToken } = await login({
        deps: { repos: identityReposFrom(deps), hasher: deps.passwordHasher, clock: deps.clock, idGen: deps.idGen },
        input: {
          workspaceId: deps.workspaceId,
          username,
          password,
          ip: req.ip,
          userAgent: req.get("user-agent") ?? undefined,
        },
      });

      setSessionCookie(res, rawToken, session.expiresAt);
      res.json({ user: { id: principal.id, username } });
    } catch (err) {
      if (err instanceof AuthInvalidCredentialsError) {
        res.status(401).json({ error: "invalid username or password", code: "UNAUTHENTICATED" });
        return;
      }
      res.status(500).json({ error: "internal error" });
    }
  });

  app.post("/api/admin/v1/auth/logout", async (req, res) => {
    await deps.identityReady;
    const rawToken = readSessionToken(req);
    if (rawToken) {
      await logout({
        deps: { repos: identityReposFrom(deps), hasher: deps.passwordHasher, clock: deps.clock, idGen: deps.idGen },
        input: { workspaceId: deps.workspaceId, rawToken },
      });
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get("/api/admin/v1/auth/me", async (req, res) => {
    const principal = await currentPrincipal(deps, req);
    if (!principal) {
      res.status(401).json({ error: "unauthenticated", code: "UNAUTHENTICATED" });
      return;
    }

    const userRow = await deps.userRepo.findByPrincipalId({
      workspaceId: deps.workspaceId,
      principalId: principal.id,
    });
    const effectivePermissions = await getEffectivePermissions({
      deps: identityReposFrom(deps),
      input: { workspaceId: deps.workspaceId, principalId: principal.id },
    });

    res.json({
      user: { id: principal.id, username: userRow?.username ?? principal.displayName },
      effectivePermissions,
    });
  });
}
