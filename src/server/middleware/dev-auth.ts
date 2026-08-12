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
import type { RouteDeps } from "../routes/types";
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
 * Architectural role:
 * `requireAdminSession`/`registerAuthRoutes` are middleware/route factories
 * that close over `RouteDeps` (repos + hasher + the `identityReady` seed
 * promise) — the composition roots (`server/app.ts`) pass `routeDeps` in, the
 * same pattern every other admin route registrar already uses. Not a port
 * (ADR-006): one real session/credential implementation.
 */
const SESSION_COOKIE = "tovu_session";

/** Assemble the `IdentityRepos` bag `identity/*` functions expect from `RouteDeps`'s flat fields. */
function identityReposFrom(deps: RouteDeps): IdentityRepos {
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

/**
 * Resolve the current request's session cookie to its principal, applying
 * every fail-closed check (EC-02/EC-03/EC-13) via `identity.validateSession`.
 * Awaits `deps.identityReady` first so this never races first-boot seeding.
 *
 * @complexity O(1) — one cookie parse, one session/principal lookup.
 * @overallScore 100
 */
export async function currentPrincipal(deps: RouteDeps, req: Request): Promise<PrincipalRecord | null> {
  const rawToken = readSessionToken(req);
  if (!rawToken) return null;

  await deps.identityReady;
  const resolved = await validateSession({
    deps: { repos: identityReposFrom(deps), hasher: deps.passwordHasher, clock: deps.clock, idGen: deps.idGen },
    input: { workspaceId: deps.workspaceId, rawToken },
  });
  return resolved?.principal ?? null;
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

/** Express middleware factory: reject unauthenticated /api/admin requests; attach the principal. */
export function requireAdminSession(deps: RouteDeps) {
  return async function requireAdminSessionMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const principal = await currentPrincipal(deps, req);
    if (!principal) {
      res.status(401).json({ error: "unauthenticated", code: "UNAUTHENTICATED" });
      return;
    }
    res.locals.principal = principal;
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
