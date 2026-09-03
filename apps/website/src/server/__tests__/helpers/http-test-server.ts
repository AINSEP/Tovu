import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type test from "node:test";

import type express from "express";

/** The narrow slice `loginAsBarePrincipal` below needs — satisfied structurally by `RouteDeps`
 *  (and by any `Pick<RouteDeps, ...>` narrowing, since every field listed here is also on
 *  `RouteDeps`), so callers pass their real route deps object straight through with no adapter. */
interface BarePrincipalDeps {
  identityReady: Promise<unknown>;
  workspaceId: string;
  clock: { nowIso(): string };
  passwordHasher: { hash(password: string): Promise<string> };
  principalRepo: {
    save(record: {
      id: string;
      workspaceId: string;
      kind: "user";
      displayName: string;
      status: "active";
      createdAt: string;
    }): Promise<unknown>;
  };
  userRepo: {
    save(record: { principalId: string; workspaceId: string; username: string; passwordHash: string }): Promise<unknown>;
  };
}

/**
 * ADR-042 item 5: the single boot-a-real-http-server-on-a-random-port routine that
 * every `src/server/__tests__/**` route test previously hand-rolled (byte-identical
 * in 10+ files). Registers `t.after` teardown so callers never leak listeners.
 */
export async function startTestServer(
  app: express.Express,
  t: import("node:test").TestContext
): Promise<string> {
  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

/** Logs in as the seeded dev owner (`admin`/`tovu-dev`) and returns the session cookie. */
export async function loginAsOwner(baseUrl: string): Promise<string> {
  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

/** `startTestServer` + `loginAsOwner`, combined — the common case for admin route tests. */
export async function bootAuthenticated(
  app: express.Express,
  t: import("node:test").TestContext
): Promise<{ baseUrl: string; cookie: string }> {
  const baseUrl = await startTestServer(app, t);
  const cookie = await loginAsOwner(baseUrl);
  return { baseUrl, cookie };
}

/**
 * Registers a principal with a login but no role/policy grants at all — `authorize()` returns
 * `no_grant` for any permission it is checked against. Proves the denied side of a permission gate
 * with a REAL identity-stack login (real password hash, real session), not a stubbed
 * `res.locals.principal` — the shape integration-tier tests need. At least 25 route test files in
 * this directory already hand-roll a byte-for-byte copy of this exact helper (grep
 * `loginAsBarePrincipal` in `src/server/__tests__/**`); consolidated here for new tests rather than
 * adding a 26th copy — existing copies are left untouched (out of scope for this change).
 */
export async function loginAsBarePrincipal(
  deps: BarePrincipalDeps,
  baseUrl: string,
  options: { username?: string; password?: string } = {}
): Promise<string> {
  await deps.identityReady;
  const username = options.username ?? `bare-principal-${Math.random().toString(36).slice(2, 10)}`;
  const password = options.password ?? "bare-pw";
  const bareId = `bare-${username}`;

  await deps.principalRepo.save({
    id: bareId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "No Grants",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId: bareId,
    workspaceId: deps.workspaceId,
    username,
    passwordHash: await deps.passwordHasher.hash(password),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

/** Express's actual (untyped) router-stack shape — same narrow slice `route-class-precedence.
 *  unit.test.ts` already reaches into, extended with `route.stack[0].handle` to get at the real
 *  registered per-route handler function itself. */
interface ExpressAppWithRouter {
  _router: {
    stack: Array<{
      route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: Array<{ handle: (req: unknown, res: unknown) => unknown }>;
      };
    }>;
  };
}

/**
 * Pulls a route's real, registered handler directly out of Express's router stack, bypassing real
 * HTTP routing entirely. Exists for exactly one purpose: Express guarantees a matched `:param`
 * route segment's `req.params.<name>` is always a populated string for any request that reaches
 * the handler at all (a route with an unfilled named segment simply never matches, so the handler
 * never runs) -- yet several routes defensively write `req.params.<name> ?? ""` anyway. That
 * fallback is therefore unreachable through any real HTTP request, the same shape of "TypeScript
 * (here, Express's own routing contract) proves this branch impossible for well-formed input" as a
 * `default: throw` exhaustiveness guard. The fix is the same one used there: deliberately violate
 * the contract by calling the handler directly with a hand-built `req` whose `params` object omits
 * or nulls the field, so the branch actually executes for real instead of being left undertested.
 * Only ever use this for that one narrow purpose -- every other branch in these route files is
 * reachable through a normal request and should be tested that way instead.
 */
export function extractRouteHandler(
  app: express.Express,
  method: "get" | "post" | "put" | "patch" | "delete",
  path: string
): (req: unknown, res: unknown) => unknown {
  const stack = (app as unknown as ExpressAppWithRouter)._router.stack;
  for (const layer of stack) {
    if (layer.route && layer.route.path === path && layer.route.methods[method]) {
      return layer.route.stack[0].handle;
    }
  }
  throw new Error(`extractRouteHandler: no ${method.toUpperCase()} route registered for path "${path}"`);
}

/** What `createCapturingResponse` recorded from the handler's `res.status()`/`res.json()` calls. */
export interface DirectInvokeCapture {
  statusCode: number;
  jsonBody: unknown;
}

/** A minimal `res` stand-in for {@link extractRouteHandler} callers -- only `status().json()` and
 *  `locals` are ever used by this codebase's route handlers' synchronous response path, so this
 *  intentionally does not implement the rest of Express's `Response` surface. `statusCode` starts
 *  at 200 (real Express's own default when a handler calls `res.json()` without ever calling
 *  `res.status()` first, e.g. every one of these routes' success paths). */
export function createCapturingResponse(): { res: express.Response; capture: DirectInvokeCapture } {
  const capture: DirectInvokeCapture = { statusCode: 200, jsonBody: undefined };
  const res = {
    locals: {} as Record<string, unknown>,
    status(code: number) {
      capture.statusCode = code;
      return res;
    },
    json(body: unknown) {
      capture.jsonBody = body;
      return res;
    },
  } as unknown as express.Response;
  return { res, capture };
}
