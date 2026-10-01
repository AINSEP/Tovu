import { randomBytes, timingSafeEqual } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

import { RUN_PRINCIPAL_HEADER } from "./run-ownership.js";
import type { RunScopedCaller } from "./run-scoped-credential.js";

/**
 * @file Tovu's own bearer gate for the standalone agent daemon
 * (`src/assistant/agent-daemon-server.ts`), plus the token-minting helper `src/index.ts` calls at
 * the very top of `main()`.
 *
 * Purpose:
 * The daemon owns the real `RunLifecycle` + `ToolExecutor` and executes tools against Tovu's real
 * `content.db`. It binds to `127.0.0.1`, but a loopback bind is NOT an authentication story: every
 * other process running as this user can reach `127.0.0.1:<port>` and start real agent runs or
 * execute real tools. Until this gate existed the daemon mounted `@jini-ai/http-kit`'s three route
 * registrars with no caller check of any kind.
 *
 * Why not `@jini-ai/http-kit`'s own `registerApiBearerAuthMiddleware`:
 * it short-circuits (`next()`) for ANY loopback peer address before it ever looks at the
 * `Authorization` header — a deliberate affordance for Jini's own desktop UI/local CLI. That
 * exemption is exactly the hole being closed here (the threat is "another local process", not "a
 * remote attacker"), so reusing it would be a no-op. {@link requireAgentDaemonToken} therefore has
 * NO peer-address exemption of any kind: a request from `127.0.0.1` is gated exactly like any
 * other. The only exemptions it supports are explicit, exact-match request paths the mount site
 * opts into. Tovu no longer exempts delegated calls: its bridges now receive their own bearer.
 *
 * Fail-closed contract (the whole point of this module):
 * - token env var unset/empty -> **503**, never a silent pass-through. A misconfigured daemon
 *   refuses to serve rather than serving unauthenticated callers.
 * - missing / malformed / wrong token -> **401**.
 * - exact match -> `next()`.
 * - a live run's own credential (`run-scoped-credential.ts`, when the mount site opts in) -> `next()`
 *   on the bridge's own routes only, with the principal header overwritten server-side; **404**
 *   for another run, **403** for a mismatched delegated runId or any other route.
 *
 * How it relates to the project:
 * `src/index.ts`'s `main()` calls {@link ensureAgentDaemonToken} as its first statement, so the
 * token exists in `process.env` long before `spawnAgentDaemon()` runs from inside `app.listen()`'s
 * callback; the child inherits it through the existing `child_process.spawn` (full parent env).
 * `src/server/modules/assistant.ts`'s proxy attaches the matching `Authorization: Bearer <token>`
 * header on every forwarded request — read at request time, never at module scope (see that file).
 *
 * Architectural role:
 * A pure middleware factory + a pure env helper, deliberately split out of
 * `agent-daemon-server.ts` (a top-level side-effecting script that opens a real port and a real DB
 * connection on import, and so cannot be imported by a test). Mirrors `server/middleware/*.ts`'s
 * factory-returning-middleware shape.
 */

/** The single env var this gate reads. Operators may set it themselves; otherwise `src/index.ts` mints one per boot. */
export const AGENT_DAEMON_TOKEN_ENV_VAR = "TOVU_AGENT_DAEMON_TOKEN";

/** `Authorization: Bearer <token>`. The scheme is case-insensitive per RFC 7235 §2.1; the token itself is not. */
const BEARER_PATTERN = /^Bearer[ \t]+(\S+)[ \t]*$/i;

/**
 * Constant-time string comparison. Length is compared first and non-constant-time — that leaks
 * only the token's length, which is fixed and public (64 hex chars), never its contents.
 *
 * @complexity O(n) in the token length.
 * @overallScore 100
 */
function tokensMatch(presented: string, expected: string): boolean {
  const presentedBytes = Buffer.from(presented, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (presentedBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(presentedBytes, expectedBytes);
}

/**
 * Mints a fresh 32-byte hex token into `env[TOVU_AGENT_DAEMON_TOKEN]` unless the operator already
 * set a non-empty one, and returns the effective token either way. Idempotent: a second call
 * returns the first call's value rather than rotating it (rotating mid-boot would invalidate a
 * token the daemon child may already hold).
 *
 * Must be called before the daemon child process is spawned — the child inherits the parent's env
 * at `spawn()` time, so a token minted afterwards would never reach it.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function ensureAgentDaemonToken(env: NodeJS.ProcessEnv = process.env): string {
  const existing = env[AGENT_DAEMON_TOKEN_ENV_VAR];
  if (typeof existing === "string" && existing.length > 0) return existing;
  const minted = randomBytes(32).toString("hex");
  env[AGENT_DAEMON_TOKEN_ENV_VAR] = minted;
  return minted;
}

/**
 * `POST /api/delegated-tool-calls` (`@jini-ai/http-kit`'s `registerDelegatedToolRoutes`).
 * No longer exempt: Tovu's `mcp-injection.ts` supplies a per-run credential, delivered by
 * `@jini-ai/daemon` as `JINI_DAEMON_TOKEN` for both Claude and Codex CLI runs. The current
 * `@jini-ai/mcp` serve/delegated-tool pipeline sends that bearer on every callback. Tovu's proxy
 * does not expose this route (and sends its boot token on forwarded routes); BYOK calls its
 * in-process executor directly (`byok-tool-surface.ts`), so needs no daemon credential.
 *
 * Authentication runs before JSON parsing. A second gate mounted on this POST after parsing
 * sets `validateDelegatedRunId`, binding the body to the credential's run before tool execution.
 * The existing live-run principal lookup remains a final liveness check inside the route.
 */
export const DELEGATED_TOOL_CALLS_PATH = "/api/delegated-tool-calls";

/**
 * The routes a spawned `jini-mcp` bridge calls (`@jini-ai/mcp`'s run, tool-catalog, component-
 * catalog and active-context tools), and so the only ones a run-scoped credential may reach. Every
 * other route stays proxy-only: run start (a bridge must not start runs, least of all under a
 * principal it wrote into `contextRef`), the full event stream, the unscoped run list, federation
 * reload/admissions, and the browser-facing frontend/MCP-UI/A2UI channels.
 */
const RUN_SCOPED_ROUTES: readonly { method: string; path: RegExp }[] = [
  { method: "GET", path: /^\/api\/runs\/[^/]+$/ },
  { method: "POST", path: /^\/api\/runs\/[^/]+\/cancel$/ },
  { method: "GET", path: /^\/api\/tools\/[^/]+$/ },
  { method: "GET", path: /^\/api\/components\/[^/]+$/ },
  { method: "GET", path: /^\/api\/active$/ },
  { method: "GET", path: /^\/api\/agents$/ },
  { method: "POST", path: /^\/api\/delegated-tool-calls$/ },
];

/** Whether a run-scoped credential may call `method path`. `path` is Express's `req.path`: no query string. */
export function isRunScopedRoute(method: string, path: string): boolean {
  return RUN_SCOPED_ROUTES.some((route) => route.method === method && route.path.test(path));
}

/** Resolves a run-scoped bearer to the live run and principal it was minted for (`run-scoped-credential.ts`). */
export interface RunScopedCallerResolver {
  resolveCaller(token: string): RunScopedCaller | undefined;
}

export interface AgentDaemonTokenGateOptions {
  /** Defaults to `process.env`. Injected only so tests can drive the gate without mutating real process env. */
  env?: NodeJS.ProcessEnv;
  /**
   * Exact request paths this gate does not apply to. Defaults to none — the middleware is a
   * gate-everything primitive, and each exemption must be opted into explicitly at the mount site
   * with a stated reason. Matched by exact equality, never by prefix, so a longer path that merely
   * starts with an exempt one stays gated. Applies only without an Authorization header:
   * presenting a credential always opts into validation, even on an exempt path.
   */
  exemptPaths?: readonly string[];
  /**
   * Accepts per-run credentials besides the proxy token. A caller presenting one is a run's own
   * `jini-mcp` bridge: it may reach only {@link isRunScopedRoute} routes (403 elsewhere), and its
   * `x-tovu-principal-id` is overwritten with the principal the credential resolves to, so the
   * ownership checks downstream never see a caller-chosen value. Omitted = proxy token only.
   */
  runScopedCallers?: RunScopedCallerResolver;
  /** Mount a second gate on the delegated POST after express.json() to require body.runId === the credential's runId. */
  validateDelegatedRunId?: boolean;
}

/**
 * Express middleware factory: the agent daemon's global caller gate. Mount it with `app.use(...)`
 * BEFORE any route registrar (and before `express.json()`, so an unauthenticated caller's body is
 * never parsed).
 *
 * The env var is read on every request, not captured at factory time — the daemon's own module
 * graph is evaluated before `src/index.ts` can mint a token in a same-process test, and re-reading
 * costs one property lookup.
 *
 * @complexity O(1) per request plus O(n) in the token length for the comparison.
 * @overallScore 100
 */
export function requireAgentDaemonToken(options: AgentDaemonTokenGateOptions = {}) {
  const env = options.env ?? process.env;
  const exempt = new Set(options.exemptPaths ?? []);

  return function requireAgentDaemonTokenMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (exempt.has(req.path) && req.get("authorization") === undefined) {
      next();
      return;
    }

    const expected = env[AGENT_DAEMON_TOKEN_ENV_VAR];
    if (typeof expected !== "string" || expected.length === 0) {
      // Fail CLOSED. An unconfigured daemon is a deployment fault, not an open door.
      res.status(503).json({
        error: `the agent daemon is not configured: ${AGENT_DAEMON_TOKEN_ENV_VAR} is unset`,
        code: "AGENT_DAEMON_UNCONFIGURED",
      });
      return;
    }

    // Deliberately no loopback/peer-address exemption — see this file's header.
    const presented = BEARER_PATTERN.exec(req.get("authorization") ?? "");
    if (presented && tokensMatch(presented[1], expected)) {
      next();
      return;
    }

    const caller = presented ? options.runScopedCallers?.resolveCaller(presented[1]) : undefined;
    if (caller === undefined) {
      res.status(401).json({
        error: `Authorization: Bearer <${AGENT_DAEMON_TOKEN_ENV_VAR}> is required`,
        code: "UNAUTHENTICATED",
      });
      return;
    }
    admitRunScopedCaller(req, res, next, caller, options.validateDelegatedRunId === true);
  };
}

/**
 * Binds a resolved credential to its own run, then applies the route allowlist and replaces the
 * caller's principal header. Other run targets use http-kit's exact not-found body without a lookup.
 * URL decoding matches Express path parameters; malformed encodings receive HTTP 400.
 * @complexity O(path length); O(1) additional space apart from decoded strings.
 */
function admitRunScopedCaller(req: Request, res: Response, next: NextFunction, caller: RunScopedCaller, validateDelegatedRunId: boolean): void {
  const runPath = /^\/api\/runs\/([^/]+)(?:\/|$)/i.exec(req.path);
  if (runPath !== null) {
    let targetRunId: string;
    try {
      targetRunId = decodeURIComponent(runPath[1]!);
    } catch (error) {
      if (!(error instanceof URIError)) throw error;
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "runId is not valid URL encoding" } });
      return;
    }
    if (targetRunId !== caller.runId) {
      const message = /\/events\/?$/i.test(req.path) ? "run was not found" : `run "${targetRunId}" was not found`;
      res.status(404).json({ error: { code: "NOT_FOUND", message } });
      return;
    }
  }
  if (!isRunScopedRoute(req.method, req.path)) {
    res.status(403).json({ error: `a run-scoped credential cannot call ${req.method} ${req.path}`, code: "FORBIDDEN" });
    return;
  }
  if (validateDelegatedRunId && req.body?.runId !== caller.runId) {
    res.status(403).json({ error: "a run-scoped credential requires body.runId to match its own run", code: "FORBIDDEN" });
    return;
  }
  req.headers[RUN_PRINCIPAL_HEADER] = caller.principalId;
  next();
}
