import type { ClockPort } from "../../core/ports";

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
 * - `middleware/dev-auth.ts`'s login route calls `loginRateLimiter.check(...)`
 *   before calling `identity.login()`, keyed by `resolveClientIp(req)`.
 * - Reuses the repo's injectable `ClockPort` (`{ nowIso(): ISODateTime }`,
 *   `core/ports.ts`) instead of `Date.now()` directly, matching the pattern
 *   `identity/auth-service.ts` and its tests already use — so tests can fake
 *   the window boundary without real sleeps.
 *
 * Architectural role:
 * Ordinary framework-adjacent middleware helper (Express `Request` in, plain
 * data out) — not a port (ADR-006): one rate-limiter implementation, no
 * swappable backends in v1. REQ-14's Article I "Library-First" compliance
 * note flags this as intentionally hand-rolled (Red-Team RT-006, deferred to
 * Architect) rather than pulled from an npm package.
 *
 * Disclosed simplification:
 * Single-process, in-memory only (no Redis/distributed store) — acceptable
 * per REQ-14's note that this only needs to survive one process in v1. Stale
 * per-key windows are never evicted, so long-lived processes accumulate one
 * map entry per distinct key (IP) ever seen; acceptable for a walking
 * skeleton, called out as tech debt for a real deployment (see repo memory /
 * handoff notes) rather than fixed here to keep this slice minimal.
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
 * @complexity O(1) time and one map entry per distinct key ever seen (space);
 * no eviction (see file-level disclosed simplification).
 * @overallScore 100
 */
export interface RateLimiter {
  check(key: string): RateLimitResult;
}

/**
 * Build a fixed-window counter for `profile`, driven by `clock` instead of
 * `Date.now()` so tests can move time forward deterministically instead of
 * sleeping. A fresh `createRateLimiter()` call means a fresh, isolated
 * counter store — callers that want isolated limiters per app instance
 * (e.g. one per test's `createRouteDeps()`/`createApp()`) get that for free
 * by constructing a new instance rather than sharing a module-level singleton.
 *
 * @complexity O(1) per `check` call.
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

  return {
    check(key: string): RateLimitResult {
      const nowMs = new Date(clock.nowIso()).getTime();
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
