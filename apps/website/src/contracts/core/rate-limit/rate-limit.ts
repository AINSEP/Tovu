/**
 * @file Tovu policy adapter for the async fixed-window rate limiter (SPEC-006 REQ-14 / api.spec §3).
 *
 * Purpose:
 * Provides the counting primitive behind the `LOGIN_STRICT` profile
 * (`AUTH_LOGIN`, 10 requests / 60s / client IP) and the client-IP resolution
 * rule that keys it. Structured so `WRITE_STANDARD`/`READ_STANDARD` (out of
 * scope this pass — see api.spec §3) can reuse the same primitive later with
 * a different `RateLimitProfile` and key function; the profiles below now cover
 * login, magic-link, anonymous assistant and outbound-service routes.
 *
 * How it relates to the project:
 * - `server/inbound/admin-http/dev-auth.ts`'s login route calls `loginRateLimiter.check(...)`
 *   before calling `identity.login()`, keyed by `resolveClientIp(req)`.
 * - Reuses the repo's injectable `Clock` (`{ nowMs(): number }`,
 *   `@jini-ai/core/primitives`) instead of `Date.now()` directly, matching the pattern
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
 * Tovu retains profiles and proxy policy; generic counting and its rationale now live in
 * `@jini-ai/http-kit/rate-limit`, over a required clock and async CounterStore port. ADR-006's
 * original single in-memory implementation and RT-006 Library-First concern predate extraction;
 * the default remains in-memory, while a dedicated store can now be injected.
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

// Implementation: /Users/la/Programming/Jini/packages/http-kit/src/rate-limit.ts
import type { Clock as ClockPort } from "@jini-ai/core/primitives";
import {
  createMemoryCounterStore,
  createRateLimiter as createHttpRateLimiter,
  resolveClientIp as resolveHttpClientIp,
  type ClientIpSource,
  type CounterStore,
  type RateLimiter as HttpRateLimiter,
  type RateLimitProfile,
} from "@jini-ai/http-kit/rate-limit";

/** Tovu profiles and proxy policy; fixed-window counting is owned by HTTP-kit. */
export type { ClientIpSource, RateLimitProfile, RateLimitResult } from "@jini-ai/http-kit/rate-limit";

/**
 * A `RateLimitProfile` bound to one in-memory counter store. Call `check` once
 * per incoming request using `await check({ key })`; it both evaluates and records the attempt (there is no
 * separate "commit" step — every checked request counts against the window,
 * matching AC-18's "11th attempt" framing).
 *
 * size is optional so check-only doubles remain sufficient: it exists purely to observe
 * eviction shrinking storage (SPEC-046 REQ-8), never as a route capability.
 * @complexity O(1) amortized time per `check()` call (an eviction sweep costs
 * O(distinct keys) but runs at most once per `windowSeconds`, see
 * `createRateLimiter`); space bounded to roughly one map entry per distinct
 * key active within the trailing window (SPEC-046 REQ-8 — no longer "one
 * entry per key ever seen").
 */
export type RateLimiter = Pick<HttpRateLimiter, "check"> & Partial<Pick<HttpRateLimiter, "size">>;

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
 * Admin routes that make a real outbound call to a third-party service on every hit, today the
 * external-MCP probe (`routes/admin/external-mcp/probe.ts`). Session auth alone does not bound how
 * often they can be called, and a retry storm (a double-clicked button, a buggy client retry loop)
 * can get the workspace's own credential rate-limited or blocked provider-side: a self-inflicted
 * denial of service against every admin, not just the caller. Keyed by `resolveClientIp(req)`,
 * matching every other limiter in this file.
 */
export const OUTBOUND_CALL_PER_IP: RateLimitProfile = {
  windowSeconds: 60,
  max: 10,
  burst: 2,
};

/**
 * `POST .../mcp-servers/:serverId/oauth/connect` and its device-poll sibling
 * (`routes/admin/external-mcp/oauth-connect.ts`, `.../oauth-device-poll.ts`).
 *
 * Same self-DoS class {@link OUTBOUND_CALL_PER_IP} closes, with one addition specific to OAuth:
 * every hit mints a pending `state` (or starts a device authorization) and makes a real outbound
 * call to a third-party authorization server using the workspace's own client id. A double-clicked
 * Connect button therefore accumulates pending authorizations AND can get the client id
 * rate-limited or provisionally blocked provider-side — a self-inflicted denial of service against
 * every admin in the workspace, not just the caller who caused it.
 *
 * Deliberately more generous than {@link OUTBOUND_CALL_PER_IP}: device-grant polling is a
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
 * The route is anonymous by necessity (a `SameSite=Strict` cookie cannot survive the cross-site redirect that
 * reaches it), and each hit can cost an outbound token exchange. The single-use 24-byte `state` is
 * the real control; this is defence in depth, generous enough that a human retrying a flaky
 * authorization never trips it.
 */
export const EXTERNAL_MCP_OAUTH_CALLBACK_PER_IP: RateLimitProfile = {
  windowSeconds: 60,
  max: 20,
  burst: 5,
};

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
 * preserves the budget decisions of every existing consumer (login, magic-link, forms).
 * Checks now await the injected async store and use `{ key }` objects.
 *
 * Tovu's profiles/proxy policy stay here; the implementation and eviction rationale now live in
 * Jini/packages/http-kit/src/rate-limit.ts. The optional store defaults to a fresh memory store.
 * @returns An async limiter; storage failures reject checks, never authorize a request.
 * @complexity O(1) amortized per `check` call; see the eviction note above
 * for the worst-case sweep cost.
 */
export function createRateLimiter(
  { profile, clock }: { profile: RateLimitProfile; clock: ClockPort },
  { store = createMemoryCounterStore({}) }: { store?: CounterStore } = {},
): HttpRateLimiter {
  return createHttpRateLimiter({ profile, clock, store });
}

// Keep this policy outside the server composition root: assistant, comments and forms once
// imported its transport module for IP resolution, creating three module cycles. The structural
// request shape keeps those domains independent of Express; trust-proxy policy remains host-owned.
/**
 * Keeps Tovu's request-facing port and Express trust-proxy fallback policy.
 * The socket peer is the trust boundary: only an explicitly trusted immediate peer may supply
 * the first forwarded hop. Otherwise use Express's req.ip, which honors X-Forwarded-For only
 * according to inbound/shared/trust-proxy.ts (Fly's edge hop, TOVU_TRUST_PROXY, or none).
 * The structural source avoids importing Express's full socket type into domain callers.
 * @param req - Request's socket, headers and framework-resolved IP.
 * @param trustedProxies - Explicit peers allowed to supply the first forwarded hop.
 * @returns A trusted forwarded IP, otherwise Express's resolved IP or socket peer.
 * @complexity O(p) time for p explicit proxy addresses; O(1) extra space.
 */
export function resolveClientIp(req: ClientIpSource, trustedProxies: readonly string[] = []): string {
  return resolveHttpClientIp({
    source: req,
    policy: {
      unknownAddress: "unknown",
      isTrustedProxy: ({ address }) => trustedProxies.includes(address),
      fallbackAddress: ({ source, socketPeer }) => source.ip || socketPeer,
    },
  });
}
