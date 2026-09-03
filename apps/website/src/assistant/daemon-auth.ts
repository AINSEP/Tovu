import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

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
 * opts into — see {@link DELEGATED_TOOL_CALLS_PATH} for the single one Tovu uses and why it is
 * unavoidable.
 *
 * Fail-closed contract (the whole point of this module):
 * - token env var unset/empty -> **503**, never a silent pass-through. A misconfigured daemon
 *   refuses to serve rather than serving unauthenticated callers.
 * - missing / malformed / wrong token -> **401**.
 * - exact match -> `next()`.
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
 * only the token's length, which is fixed and public (64 hex chars), never its contents. Exported
 * so {@link requireDelegatedToolCredential} reuses this exact comparison instead of a second,
 * hand-rolled one that could reintroduce a timing side-channel.
 *
 * @complexity O(n) in the token length.
 * @overallScore 100
 */
export function tokensMatch(presented: string, expected: string): boolean {
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
 * `POST /api/delegated-tool-calls` (`@jini-ai/http-kit`'s `registerDelegatedToolRoutes`). The ONE
 * route {@link requireAgentDaemonToken} cannot cover, for a structural reason worth stating in
 * full — and, since this fix, the one covered by its own separate gate instead of nothing at all.
 *
 * Its only legitimate caller is not Tovu's proxy but the `jini-mcp` stdio server that the run's own
 * spawned coding-agent CLI launches as an MCP subprocess. `@jini-ai/daemon` writes that
 * subprocess's `.mcp.json` entry with `JINI_RUN_ID`/`JINI_DAEMON_URL` (`agent-executor.ts`'s
 * `McpJsonServerEntry`) and, now that `mcp-injection.ts` supplies a `credential` resolver,
 * `JINI_DAEMON_TOKEN` too.
 *
 * **This comment previously said** `@jini-ai/mcp`'s `delegated-tool.ts` posts here with no
 * `Authorization` header at all and no env var from which it could read one, and that Tovu could
 * not hand it a token without changing Jini. That was true only while `credential` was unset —
 * `packages/mcp/src/bin/serve.ts` already reads `JINI_DAEMON_TOKEN` and attaches
 * `Authorization: Bearer <value>` on every daemon call once one is present, delegated-tool-calls
 * included (verified directly against that file). A stale comment asserting a now-false invariant
 * is its own bug, so this one was rewritten rather than left to mislead the next reader.
 *
 * `requireAgentDaemonToken` still cannot be the one to check that header, though: what arrives here
 * is `deriveDelegatedToolCredential(TOVU_AGENT_DAEMON_TOKEN, runId)` — a per-run value that is
 * never equal to the boot-wide token that gate expects (see `mcp-injection.ts`'s header for why the
 * credential is derived rather than reused verbatim). Hence {@link requireDelegatedToolCredential},
 * a second, narrower gate scoped to exactly this path, which recomputes and compares that same
 * derivation.
 *
 * The route was never ungated even before that, and still isn't reduced to only the new gate: the
 * request body must also name a `runId` that `agent-daemon-server.ts`'s `resolvePrincipal`
 * currently tracks, and it throws rather than fabricating a principal for an unknown one. Run ids
 * are `randomUUID()` (`@jini-ai/daemon`'s `run-lifecycle.ts`) — 122 bits of entropy — and an id only
 * resolves while that run is actually in flight. That liveness check runs exactly as it did before
 * this fix, downstream of the new credential gate.
 */
export const DELEGATED_TOOL_CALLS_PATH = "/api/delegated-tool-calls";

/**
 * Derives the per-run bearer credential a spawned run's `jini-mcp` subprocess presents on its
 * {@link DELEGATED_TOOL_CALLS_PATH} callbacks — `HMAC-SHA256(secret, runId)`, hex-encoded.
 * `secret` is the boot-wide `TOVU_AGENT_DAEMON_TOKEN`; the derived value is what actually reaches
 * the child (via `mcp-injection.ts`'s `credential` resolver) — never `secret` itself. This is the
 * one place both the minting side (`mcp-injection.ts`) and the checking side
 * ({@link requireDelegatedToolCredential}) compute the value, so the two can never drift apart.
 *
 * Stateless and deterministic on purpose: the daemon does not need to remember which credential it
 * handed out per run — given a claimed `runId` it can always recompute the expected value from the
 * one secret it already holds, no storage or expiry bookkeeping required. Liveness (has this run
 * actually started, is it still in flight) is enforced separately, by `resolvePrincipal`'s
 * `principalByRunId` lookup, not by this function.
 *
 * @param secret - The boot-wide `TOVU_AGENT_DAEMON_TOKEN`. Never sent to a child directly.
 * @param runId - The run this credential is scoped to. A credential derived for one `runId` does
 * not verify against any other.
 * @returns 64 lowercase hex characters (a SHA-256 HMAC digest).
 * @complexity O(n) in `secret` and `runId` length.
 */
export function deriveDelegatedToolCredential(secret: string, runId: string): string {
  return createHmac("sha256", secret).update(runId).digest("hex");
}

export interface AgentDaemonTokenGateOptions {
  /** Defaults to `process.env`. Injected only so tests can drive the gate without mutating real process env. */
  env?: NodeJS.ProcessEnv;
  /**
   * Exact request paths this gate does not apply to. Defaults to none — the middleware is a
   * gate-everything primitive, and each exemption must be opted into explicitly at the mount site
   * with a stated reason. Matched by exact equality, never by prefix, so a longer path that merely
   * starts with an exempt one stays gated.
   */
  exemptPaths?: readonly string[];
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
    if (exempt.has(req.path)) {
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
    if (!presented || !tokensMatch(presented[1], expected)) {
      res.status(401).json({
        error: `Authorization: Bearer <${AGENT_DAEMON_TOKEN_ENV_VAR}> is required`,
        code: "UNAUTHENTICATED",
      });
      return;
    }

    next();
  };
}

export interface DelegatedToolCredentialGateOptions {
  /** Defaults to `process.env`. Injected only so tests can drive the gate without mutating real process env. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Express middleware factory: the path-scoped gate for {@link DELEGATED_TOOL_CALLS_PATH} —
 * {@link requireAgentDaemonToken}'s global gate exempts this one path (see that constant's own
 * doc for the full reasoning), so this is what actually authenticates a caller here instead of
 * leaving the job to `resolvePrincipal`'s liveness check alone.
 *
 * Mount it path-scoped (`app.use(DELEGATED_TOOL_CALLS_PATH, requireDelegatedToolCredential())`),
 * AFTER `express.json()` so `req.body.runId` is already parsed, and BEFORE
 * `registerDelegatedToolRoutes` so a rejected caller never reaches `resolvePrincipal` or the tool
 * executor — the same ordering `agent-daemon-server.ts` already uses for
 * `requireRunOwnership`.
 *
 * Reads `runId` off the body itself rather than depending on `@jini-ai/http-kit`'s own parsing —
 * this gate must run before that package's route handler does, so it cannot reuse the already-
 * validated `DelegatedToolExecuteRequest` that handler builds. A body with no usable `runId`
 * string is waved through unauthenticated ON PURPOSE, not by oversight: `@jini-ai/http-kit`'s own
 * `parseDelegatedToolExecute` (the very next thing in the chain) refuses that same request with
 * its own validation error before `resolvePrincipal` — or any tool — is ever reached, so there is
 * nothing here yet for this gate to protect. Rejecting it here first would only swap one safe
 * refusal for a different one, one path earlier.
 *
 * @complexity O(1) per request plus one HMAC computation over `runId`'s length.
 */
export function requireDelegatedToolCredential(options: DelegatedToolCredentialGateOptions = {}) {
  const env = options.env ?? process.env;

  return function requireDelegatedToolCredentialMiddleware(req: Request, res: Response, next: NextFunction): void {
    const secret = env[AGENT_DAEMON_TOKEN_ENV_VAR];
    if (typeof secret !== "string" || secret.length === 0) {
      // Same fail-closed posture as requireAgentDaemonToken: an unconfigured daemon refuses to
      // serve rather than silently trusting a caller it has no way to verify.
      res.status(503).json({
        error: `the agent daemon is not configured: ${AGENT_DAEMON_TOKEN_ENV_VAR} is unset`,
        code: "AGENT_DAEMON_UNCONFIGURED",
      });
      return;
    }

    const body: unknown = req.body;
    const runId = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>).runId : undefined;
    if (typeof runId !== "string" || runId.length === 0) {
      // No runId to derive an expected credential from — leave the refusal to
      // parseDelegatedToolExecute's own validation error, downstream. See this function's doc.
      next();
      return;
    }

    const expected = deriveDelegatedToolCredential(secret, runId);
    const presented = BEARER_PATTERN.exec(req.get("authorization") ?? "");
    if (!presented || !tokensMatch(presented[1], expected)) {
      res.status(401).json({
        error: `Authorization: Bearer <credential for run "${runId}"> is required`,
        code: "UNAUTHENTICATED",
      });
      return;
    }

    next();
  };
}
