import { createHmac, timingSafeEqual } from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";

/**
 * @file Dev-grade session auth for the local admin.
 *
 * Purpose:
 * Gates /api/admin/* behind a cookie session so the admin shell has a real
 * login flow before the permissions feature lands.
 *
 * How it relates to the project:
 * - Registered by `server/app.ts` ahead of admin routes.
 * - Credentials come from TOVU_ADMIN_USER / TOVU_ADMIN_PASSWORD
 *   (default `admin` / `tovu-dev`) — local development only.
 *
 * Architectural role:
 * Placeholder for the permissions feature (named actions, real identity).
 * Sessions are stateless signed cookies (HMAC over `{userId, exp}`), so they
 * survive `tsx watch` restarts and browser/tab close — no server-side store.
 * Not a port (ADR-006): one implementation, dev-only.
 */
const SESSION_COOKIE = "tovu_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
/** Dev-only default; override via env for anything shared. */
const SESSION_SECRET = process.env.TOVU_SESSION_SECRET ?? "tovu-dev-session-secret";

function adminCredentials(): { username: string; password: string } {
  return {
    username: process.env.TOVU_ADMIN_USER ?? "admin",
    password: process.env.TOVU_ADMIN_PASSWORD ?? "tovu-dev",
  };
}

/** Signs `{userId, exp}` into a stateless `<payload>.<hmac>` token. */
function signSession(userId: string): string {
  const payload = { userId, exp: Date.now() + SESSION_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Verifies signature + expiry, returning the session or null. */
function verifySession(token: string): { userId: string } | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as {
      userId?: unknown;
      exp?: unknown;
    };
    if (typeof payload.userId !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp < Date.now()) return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
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

/** Resolves the logged-in session, or null. */
export function currentSession(req: Request): { userId: string } | null {
  const token = readSessionToken(req);
  if (!token) return null;
  return verifySession(token);
}

/** Express middleware: reject unauthenticated /api/admin requests. */
export function requireAdminSession(req: Request, res: Response, next: NextFunction): void {
  if (currentSession(req)) {
    next();
    return;
  }
  res.status(401).json({ error: "unauthenticated", code: "UNAUTHENTICATED" });
}

/** Registers login/logout/me routes. Login is the only ungated admin route. */
export function registerAuthRoutes(app: Express): void {
  app.post("/api/admin/v1/auth/login", (req, res) => {
    const { username, password } = adminCredentials();
    const bodyUser = String(req.body?.username ?? "");
    const bodyPass = String(req.body?.password ?? "");

    if (bodyUser !== username || bodyPass !== password) {
      res.status(401).json({ error: "invalid credentials", code: "INVALID_CREDENTIALS" });
      return;
    }

    const token = signSession("user-local");
    const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`
    );
    res.json({ user: { id: "user-local", username } });
  });

  app.post("/api/admin/v1/auth/logout", (_req, res) => {
    res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
    res.json({ ok: true });
  });

  app.get("/api/admin/v1/auth/me", (req, res) => {
    const session = currentSession(req);
    if (!session) {
      res.status(401).json({ error: "unauthenticated", code: "UNAUTHENTICATED" });
      return;
    }
    res.json({ user: { id: session.userId, username: adminCredentials().username } });
  });
}
