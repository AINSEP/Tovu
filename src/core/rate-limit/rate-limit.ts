import type { ClockPort } from "@jini-ai/cms/core";

/**
 * @file In-memory fixed-window rate limiter (SPEC-006 REQ-14 / api.spec §3).
 *
 * Purpose:
 * Provides the counting primitive behind the `LOGIN_STRICT` profile
 * (`AUTH_LOGIN`, 10 requests / 60s / client IP) and the client-IP resolution
 * rule that keys it. Structured so `WRITE_STANDARD`/`READ_STANDARD` (out of
 * scope this pass — see api.spec §3) can reuse the same primitive later with
 * a different `RateLimitProfile` and key function; only `LOGIN_STRICT` is
 * wired to a route today.
 *
 * How it relates to the project:
 * - `server/middleware/dev-auth.ts`'s login route calls `loginRateLimiter.check(...)`
 *   before calling `identity.login()`, keyed by `resolveClientIp(req)`.
 * - Reuses the repo's injectable `ClockPort` (`{ nowIso(): ISODateTime }`,
 *   `core/ports.ts`) instead of `Date.now()` directly, matching the pattern
 *   `identity/auth-service.ts` and its tests already use — so tests can fake
 *   the window boundary without real sleeps.
 *
 * Why it lives in `core/rate-limit` rather than `server/middleware` (where it used to be):
 * a policy primitive (fixed-window counting + client-IP resolution), not a piece of transport —
 * it takes a minimal structural `ClientIpSource`, not an Express `Request`, and returns plain data.
 * It was the single import edge that made `assistant`, `comments`, and `forms` each depend back on
 * the composition root, closing three separate module cycles simultaneously (2026-08-02 module-graph
 * analysis, Phase 3) — the same "domain importing its host's transport module" misplacement
 * `widgets/where-used.ts` and `core/entry-refs/repo.sqlite.ts` (now `db/sqlite/entry-refs-repo.sqlite.ts`)
 * were each relocated for.
 *
 * Architectural role:
 * A generic, framework-adjacent policy helper (structural `ClientIpSource` in, plain data out) —
 * not a port (ADR-006): one rate-limiter implementation, no swappable backends in v1. REQ-14's
 * Article I "Library-First" compliance note flags this as intentionally hand-rolled (Red-Team
 * RT-006, deferred to Architect) rather than pulled from an npm package.
 *
 * Disclosed simplification:
 * Single-process, in-memory only (no Redis/distributed store) — acceptable
 * per REQ-14's note that this only needs to survive one process in v1;
 * multiple instances behind a load balancer each get their own budget
 * (SPEC-046 §4 "Disclosed limitation" — noted, not fixed, fine for today's
 * deployment).
 *
 * Stale per-key windows ARE evicted as of SPEC-046 REQ-8: `createRateLimiter`
 * sweeps expired windows out of its map at most once per `windowSeconds`
 * (amortized — see that function's doc for why this isn't a scan on every
 * `check()` call), which bounds memory to roughly "distinct keys active
 * within the trailing window" instead of "every distinct key ever seen."
 * This was acceptable debt while every consumer was an authenticated login
 * route (bounded, trusted key space); SPEC-046 wires this same primitive to
 * an anonymous public endpoint (`SITE_ASSISTANT_PER_IP`), where key growth
 * is attacker-controlled — a caller rotating source IPs would otherwise grow
 * the map without bound, a real memory-exhaustion path rather than a
 * cosmetic one.
 */

/** A single rate-limit profile (api.spec §3): window, ceiling, and burst allowance. */
export interface RateLimitProfile {
  /** Rolling window length in seconds. */
  windowSeconds: number;
  /** Requests allowed per window before the burst allowance. */
  max: number;
  /** Additional requests tolerated on top of `max` within the same window. */
  burst: number;
}

/** api.spec §3: `LOGIN_STRICT` — brute-force guard on `AUTH_LOGIN`, keyed by client IP. */
export const LOGIN_STRICT: RateLimitProfile = {
  windowSeconds: 60,
  max: 10,
  burst: 0,
};

/**
 * ADR-PIPE-013 Decision §2-3 (FEAT-013 Phase 2) — magic-link rate limiting,
 * the hard pre-launch precondition ADR-030 OQ-8 names. Keyed by the
 * normalized target email; bounds spam to one inbox regardless of source IP.
 * Consulted by both the new public sign-in-request route and (defense in
 * depth) the existing admin-triggered request-magic-link route.
 */
export const MAGIC_LINK_PER_EMAIL: RateLimitProfile = {
  windowSeconds: 3600,
  max: 5,
  burst: 0,
};

/**
 * ADR-PIPE-013 Decision §2-3 — keyed by `resolveClientIp(req)`, public sign-in
 * route only. Bounds a single attacker's ability to enumerate many emails.
 */
export const MAGIC_LINK_PER_IP: RateLimitProfile = {
  windowSeconds: 3600,
  max: 20,
  burst: 0,
};

/**
 * ADR-PIPE-013 Decision §2-3 — lighter defense-in-depth profile on the public
 * complete-sign-in route, keyed by IP. The 256-bit raw token makes brute
 * force computationally infeasible regardless; this is a secondary control.
 */
export const MAGIC_LINK_COMPLETE_ATTEMPT: RateLimitProfile = {
  windowSeconds: 60,
  max: 20,
  burst: 5,
};

/**
 * SPEC-046 REQ-7 — `POST /api/site-assistant/chat` is anonymous, unauthenticated, and sits in
 * front of a paid model API, so this is the only thing standing between an anonymous caller and
 * unbounded provider spend. Keyed by `resolveClientIp(req)`, same per-IP shape as
 * `MAGIC_LINK_PER_IP`. Starts strict per the spec's suggestion (10 requests / 5 minutes / IP) with
 * the numbers isolated here, not inlined at the call site, so loosening this later is a one-line
 * change.
 */
export const SITE_ASSISTANT_PER_IP: RateLimitProfile = {
  windowSeconds: 300,
  max: 10,
  burst: 0,
};

/**
 * The public Composio OAuth callback (`routes/connectors/composio-callback.ts`) is anonymous by
 * necessity — a `SameSite=Strict` cookie cannot survive the cross-site redirect that reaches it —
 * and each hit can cost outbound requests to Composio. Keyed by `resolveClientIp(req)`.
 *
 * The 24-byte single-use `state` is the real control and makes guessing infeasible; this is
 * secondary, the same defence-in-depth role {@link MAGIC_LINK_COMPLETE_ATTEMPT} plays for its own
 * unguessable token. Generous enough that a human retrying a flaky authorization never trips it.
 */
export const CONNECTOR_CALLBACK_PER_IP: RateLimitProfile = {
  windowSeconds: 60,
  max: 20,
  burst: 5,
};

/**
 * `POST .../connectors/:connectorId/connect` (`routes/admin/connectors/connect.ts`) requires an
 * admin session, but session auth alone does not bound how often it can be called: every hit
 * prunes the provider's pending-state map and then makes a REAL outbound call to Composio
 * (`ComposioConnectorProvider.connect`, minting/looking up an auth config and creating a connected-
 * account link) before this process ever sees a callback. A retry storm — a double-clicked
 * "Connect" button, a buggy client-side retry loop, or a misbehaving script reusing a valid session
 * — can drive an unbounded burst of these against Composio's own API using the workspace's single
 * shared project key. Composio rate-limiting or provisionally blocking that key in response would
 * be a self-inflicted denial of service against every admin in the workspace, not just the caller
 * who triggered it — the same class of harm {@link CONNECTOR_CALLBACK_PER_IP} was already guarding
 * on the public callback side, just unguarded here because this route sits behind
 * `requireAdminSession` and was assumed safe on that basis alone. Keyed by `resolveClientIp(req)`,
 * matching every other limiter in this file; an authenticated caller does not need a higher-fidelity
 * key (e.g. principal id) for this to be effective, since the abuse shape is "one client hammering
 * one connection attempt," not cross-admin collision.
 */
export const CONNECTOR_CONNECT_PER_IP: RateLimitProfile = {
  windowSeconds: 60,
  max: 10,
  burst: 2,
};

/**
 * Same self-DoS class {@link CONNECTOR_CONNECT_PER_IP} closes for the `connect` route, extended to
 * the other authenticated connector routes that also trigger a real outbound Composio call using
 * the workspace's single shared project key:
 * - `POST .../connectors/:connectorId/disconnect` (revokes the account at Composio)
 * - `GET .../connectors/:connectorId?hydrateTools=1` (paginated tool-preview fetch)
 * - `GET .../connectors?refresh=1` (re-fetches the catalog from Composio)
 * - `PUT .../connectors/config` (verifies a candidate API key against Composio before persisting)
 *
 * `connect`'s own limiter is left as its own instance/profile rather than reused here, so a burst
 * on one action never eats another action's budget. Keyed by `resolveClientIp(req)`, same shape as
 * every other limiter in this file.
 */
export const CONNECTOR_OUTBOUND_PER_IP: RateLimitProfile = {
  windowSeconds: 60,
  max: 10,
  burst: 2,
};

/**
 * `POST .../mcp-servers/:serverId/oauth/connect` and its device-poll sibling
 * (`routes/admin/external-mcp/oauth-connect.ts`, `.../oauth-device-poll.ts`).
 *
 * Same self-DoS class {@link CONNECTOR_CONNECT_PER_IP} closes, with one addition specific to OAuth:
 * every hit mints a pending `state` (or starts a device authorization) and makes a real outbound
 * call to a third-party authorization server using the workspace's own client id. A double-clicked
 * Connect button therefore accumulates pending authorizations AND can get the client id
 * rate-limited or provisionally blocked provider-side — a self-inflicted denial of service against
 * every admin in the workspace, not just the caller who caused it.
 *
 * Deliberately more generous than {@link CONNECTOR_CONNECT_PER_IP}: device-grant polling is a
 * legitimate repeated call, driven by the provider's own `interval`, and a limiter tight enough for
 * a one-shot connect would strangle a normal five-second poll over a two-minute approval. Keyed by
 * `resolveClientIp(req)`, matching every other limiter in this file.
 */
export const EXTERNAL_MCP_OAUTH_PER_IP: RateLimitProfile = {
  windowSeconds: 60,
  max: 40,
  burst: 10,
};

/**
 * The PUBLIC external-MCP OAuth callback (`routes/external-mcp/oauth-callback.ts`).
 *
 * Same role as {@link CONNECTOR_CALLBACK_PER_IP} on the other public callback: the route is
 * anonymous by necessity (a `SameSite=Strict` cookie cannot survive the cross-site redirect that
 * reaches it), and each hit can cost an outbound token exchange. The single-use 24-byte `state` is
 * the real control; this is defence in depth, generous enough that a human retrying a flaky
 * authorization never trips it.
 */
export const EXTERNAL_MCP_OAUTH_CALLBACK_PER_IP: RateLimitProfile = {
  windowSeconds: 60,
  max: 20,
  burst: 5,
};

/** Outcome of a single `checkRateLimit` call. */
export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

interface WindowState {
  /** Epoch ms when the current fixed window started. */
  windowStartMs: number;
  /** Requests counted in the current window so far (including this one, once allowed). */
  count: number;
}

/**
 * A `RateLimitProfile` bound to one in-memory counter store. Call `check` once
 * per incoming request; it both evaluates and records the attempt (there is no
 * separate "commit" step — every checked request counts against the window,
 * matching AC-18's "11th attempt" framing).
 *
 * @complexity O(1) amortized time per `check()` call (an eviction sweep costs
 * O(distinct keys) but runs at most once per `windowSeconds`, see
 * `createRateLimiter`); space bounded to roughly one map entry per distinct
 * key active within the trailing window (SPEC-046 REQ-8 — no longer "one
 * entry per key ever seen").
 * @overallScore 100
 */
export interface RateLimiter {
  check(key: string): RateLimitResult;
  /**
   * Number of distinct keys currently tracked. Optional so existing hand-written test doubles
   * (e.g. `comments/__tests__/ingress.test.ts`'s `alwaysAllowRateLimiter`) that implement only
   * `check` keep satisfying this interface unmodified — this exists purely so tests of the real
   * `createRateLimiter` can observe eviction actually shrinking the store (SPEC-046 REQ-8), not as
   * a capability any route or caller needs.
   */
  size?(): number;
}

/**
 * Build a fixed-window counter for `profile`, driven by `clock` instead of
 * `Date.now()` so tests can move time forward deterministically instead of
 * sleeping. A fresh `createRateLimiter()` call means a fresh, isolated
 * counter store — callers that want isolated limiters per app instance
 * (e.g. one per test's `createRouteDeps()`/`createApp()`) get that for free
 * by constructing a new instance rather than sharing a module-level singleton.
 *
 * Eviction (SPEC-046 REQ-8): a full scan-and-delete of expired windows runs
 * at most once per `windowSeconds` of elapsed clock time, not on every call —
 * scanning the whole map per `check()` would trade "unbounded map growth"
 * for "O(n) latency on every request," which is not an improvement. Deleting
 * an expired entry is behavior-neutral by construction: the check below
 * already treats a missing key and an expired key identically
 * (`!existing || nowMs - existing.windowStartMs >= windowMs`), so evicting a
 * stale entry before that check can never change its outcome — this is what
 * keeps every existing consumer (login, magic-link, forms) and their tests
 * unmodified.
 *
 * @complexity O(1) amortized per `check` call; see the eviction note above
 * for the worst-case sweep cost.
 * @overallScore 100
 */
export function createRateLimiter(
  required: { profile: RateLimitProfile; clock: ClockPort },
  _optional: Record<string, never> = {}
): RateLimiter {
  const { profile, clock } = required;
  const windows = new Map<string, WindowState>();
  const windowMs = profile.windowSeconds * 1000;
  const effectiveMax = profile.max + profile.burst;

  /** Epoch ms of the last eviction sweep, or `null` before the first `check()` call. */
  let lastSweepMs: number | null = null;

  /** Deletes every window whose fixed period has fully elapsed as of `nowMs`. */
  function evictExpiredWindows(nowMs: number): void {
    for (const [key, state] of windows) {
      if (nowMs - state.windowStartMs >= windowMs) windows.delete(key);
    }
  }

  return {
    check(key: string): RateLimitResult {
      const nowMs = new Date(clock.nowIso()).getTime();

      if (lastSweepMs === null) {
        lastSweepMs = nowMs;
      } else if (nowMs - lastSweepMs >= windowMs) {
        evictExpiredWindows(nowMs);
        lastSweepMs = nowMs;
      }

      const existing = windows.get(key);

      if (!existing || nowMs - existing.windowStartMs >= windowMs) {
        windows.set(key, { windowStartMs: nowMs, count: 1 });
        return { allowed: true };
      }

      if (existing.count < effectiveMax) {
        existing.count += 1;
        return { allowed: true };
      }

      const windowEndsMs = existing.windowStartMs + windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((windowEndsMs - nowMs) / 1000));
      return { allowed: false, retryAfterSeconds };
    },
    size(): number {
      return windows.size;
    },
  };
}

/**
 * The minimal request shape `resolveClientIp` needs — deliberately narrower
 * than Express's `Request` (which pulls in the full `net.Socket` type) so the
 * function stays trivially unit-testable with plain object literals instead
 * of a mocked Express request.
 */
export interface ClientIpSource {
  socket: { remoteAddress?: string };
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Resolve the client IP for `LOGIN_STRICT` per api.spec §3's "Client-IP
 * resolution" rule: the immediate socket peer address is the source of
 * truth; a `X-Forwarded-For` header is only honored when that immediate peer
 * appears on `trustedProxies`. An untrusted peer's forwarded-for header is
 * ignored outright (no partial trust), and when `trustedProxies` is empty —
 * this repo has no trusted-proxy config surface today (confirmed: no
 * `app.set('trust proxy', ...)` anywhere) — the socket peer address is always
 * used, matching the spec's explicit fallback.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function resolveClientIp(req: ClientIpSource, trustedProxies: readonly string[] = []): string {
  const socketPeer = req.socket?.remoteAddress ?? "unknown";

  if (trustedProxies.length > 0 && trustedProxies.includes(socketPeer)) {
    const forwardedHeader = req.headers["x-forwarded-for"];
    const forwardedValue = Array.isArray(forwardedHeader) ? forwardedHeader[0] : forwardedHeader;
    const firstHop = forwardedValue?.split(",")[0]?.trim();
    if (firstHop) return firstHop;
  }

  return socketPeer;
}
