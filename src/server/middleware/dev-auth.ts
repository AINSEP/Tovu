import { randomUUID } from "node:crypto";
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
 * Sessions are in-memory and reset on restart, matching every other adapter
 * in the local runtime. Not a port (ADR-006): one implementation, dev-only.
 */
const SESSION_COOKIE = "tovu_session";
const sessions = new Map<string, { userId: string; createdAt: string }>();

function adminCredentials(): { username: string; password: string } {
  return {
    username: process.env.TOVU_ADMIN_USER ?? "admin",
    password: process.env.TOVU_ADMIN_PASSWORD ?? "tovu-dev",
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

/** Resolves the logged-in session, or null. */
export function currentSession(req: Request): { userId: string } | null {
  const token = readSessionToken(req);
  if (!token) return null;
  return sessions.get(token) ?? null;
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

    const token = randomUUID();
    sessions.set(token, { userId: "user-local", createdAt: new Date().toISOString() });
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`
    );
    res.json({ user: { id: "user-local", username } });
  });

  app.post("/api/admin/v1/auth/logout", (req, res) => {
    const token = readSessionToken(req);
    if (token) sessions.delete(token);
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
