import assert from "node:assert/strict";
import test from "node:test";

import {
  createRateLimiter,
  LOGIN_STRICT,
  MAGIC_LINK_COMPLETE_ATTEMPT,
  MAGIC_LINK_PER_EMAIL,
  MAGIC_LINK_PER_IP,
  resolveClientIp,
  type RateLimitProfile,
} from "../rate-limit";

/**
 * @file Unit coverage for the REQ-14/AC-18 `LOGIN_STRICT` rate-limit
 * primitive: the fixed-window counter (`createRateLimiter`) and the
 * client-IP resolution rule (`resolveClientIp`), tested in isolation from
 * Express/HTTP. Route-level wiring (429 shape, real request flow) is covered
 * separately in `server/__tests__/login-rate-limit.test.ts`.
 */

/** Fake `ClockPort` so window-boundary tests move time forward without sleeping. */
function fakeClock(startIso: string) {
  let currentIso = startIso;
  return {
    clock: { nowIso: () => currentIso },
    advanceMs(ms: number) {
      currentIso = new Date(new Date(currentIso).getTime() + ms).toISOString();
    },
  };
}

test("createRateLimiter: requests under the max all pass", () => {
  const { clock } = fakeClock("2026-01-01T00:00:00.000Z");
  const limiter = createRateLimiter({ profile: LOGIN_STRICT, clock });

  for (let i = 0; i < LOGIN_STRICT.max; i++) {
    const result = limiter.check("1.2.3.4");
    assert.equal(result.allowed, true, `request ${i + 1} should pass`);
  }
});

test("createRateLimiter: the (max+1)th request in the window is rejected with a positive integer retryAfterSeconds", () => {
  const { clock } = fakeClock("2026-01-01T00:00:00.000Z");
  const limiter = createRateLimiter({ profile: LOGIN_STRICT, clock });

  for (let i = 0; i < LOGIN_STRICT.max; i++) {
    assert.equal(limiter.check("1.2.3.4").allowed, true);
  }

  const eleventh = limiter.check("1.2.3.4");
  assert.equal(eleventh.allowed, false);
  if (eleventh.allowed) throw new Error("unreachable");
  assert.ok(Number.isInteger(eleventh.retryAfterSeconds), "retryAfterSeconds must be an integer");
  assert.ok(eleventh.retryAfterSeconds > 0, "retryAfterSeconds must be positive");
  assert.ok(
    eleventh.retryAfterSeconds <= LOGIN_STRICT.windowSeconds,
    "retryAfterSeconds must not exceed the window length"
  );
});

test("createRateLimiter: different IPs have independent counters", () => {
  const { clock } = fakeClock("2026-01-01T00:00:00.000Z");
  const limiter = createRateLimiter({ profile: LOGIN_STRICT, clock });

  for (let i = 0; i < LOGIN_STRICT.max; i++) {
    assert.equal(limiter.check("1.1.1.1").allowed, true);
  }
  // 1.1.1.1 is now exhausted...
  assert.equal(limiter.check("1.1.1.1").allowed, false);
  // ...but a different key starts with a fresh window.
  assert.equal(limiter.check("2.2.2.2").allowed, true);
});

test("createRateLimiter: the window resets once windowSeconds elapses", () => {
  const { clock, advanceMs } = fakeClock("2026-01-01T00:00:00.000Z");
  const limiter = createRateLimiter({ profile: LOGIN_STRICT, clock });

  for (let i = 0; i < LOGIN_STRICT.max; i++) {
    assert.equal(limiter.check("1.2.3.4").allowed, true);
  }
  assert.equal(limiter.check("1.2.3.4").allowed, false);

  // Just under the window boundary: still blocked.
  advanceMs(LOGIN_STRICT.windowSeconds * 1000 - 1);
  assert.equal(limiter.check("1.2.3.4").allowed, false);

  // At/after the window boundary: a fresh window starts.
  advanceMs(1);
  assert.equal(limiter.check("1.2.3.4").allowed, true);
});

test("createRateLimiter: a profile's burst allowance extends the effective ceiling (forward-compat shape for WRITE_STANDARD/READ_STANDARD)", () => {
  const { clock } = fakeClock("2026-01-01T00:00:00.000Z");
  const profileWithBurst: RateLimitProfile = { windowSeconds: 60, max: 2, burst: 1 };
  const limiter = createRateLimiter({ profile: profileWithBurst, clock });

  assert.equal(limiter.check("k").allowed, true);
  assert.equal(limiter.check("k").allowed, true);
  assert.equal(limiter.check("k").allowed, true, "3rd request consumes the burst allowance");
  assert.equal(limiter.check("k").allowed, false, "4th request exceeds max+burst");
});

test("resolveClientIp: with no trusted-proxy list configured, always uses the socket peer address", () => {
  const req = {
    socket: { remoteAddress: "203.0.113.9" },
    headers: { "x-forwarded-for": "9.9.9.9" },
  };
  assert.equal(resolveClientIp(req), "203.0.113.9");
});

test("resolveClientIp: an untrusted peer's X-Forwarded-For header is never honored", () => {
  const req = {
    socket: { remoteAddress: "203.0.113.9" },
    headers: { "x-forwarded-for": "9.9.9.9" },
  };
  assert.equal(resolveClientIp(req, ["10.0.0.1"]), "203.0.113.9");
});

test("resolveClientIp: a trusted peer's X-Forwarded-For header is honored (first hop)", () => {
  const req = {
    socket: { remoteAddress: "10.0.0.1" },
    headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" },
  };
  assert.equal(resolveClientIp(req, ["10.0.0.1"]), "9.9.9.9");
});

test("resolveClientIp: a trusted peer with no forwarded-for header falls back to the socket peer address", () => {
  const req = {
    socket: { remoteAddress: "10.0.0.1" },
    headers: {},
  };
  assert.equal(resolveClientIp(req, ["10.0.0.1"]), "10.0.0.1");
});

/**
 * @file FEAT-013 Phase 2 (ADR-PIPE-013 Decision §2-3, ADR-030 OQ-8) — the
 * three new magic-link rate-limit profiles. Boundary behavior only
 * (Nth request denied, window reset); the profiles are plain
 * `RateLimitProfile` data constants, so `createRateLimiter` itself (already
 * covered above) does all the real work.
 */

test("T010: MAGIC_LINK_PER_EMAIL — the 6th request within the window for the same email is denied with retryAfterSeconds", () => {
  const { clock } = fakeClock("2026-01-01T00:00:00.000Z");
  const limiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock });

  for (let i = 0; i < MAGIC_LINK_PER_EMAIL.max; i++) {
    assert.equal(limiter.check("jane@example.com").allowed, true, `request ${i + 1} should pass`);
  }

  const sixth = limiter.check("jane@example.com");
  assert.equal(sixth.allowed, false);
  if (sixth.allowed) throw new Error("unreachable");
  assert.ok(Number.isInteger(sixth.retryAfterSeconds));
  assert.ok(sixth.retryAfterSeconds > 0);
});

test("T010: MAGIC_LINK_PER_EMAIL — the window resets correctly", () => {
  const { clock, advanceMs } = fakeClock("2026-01-01T00:00:00.000Z");
  const limiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock });

  for (let i = 0; i < MAGIC_LINK_PER_EMAIL.max; i++) {
    assert.equal(limiter.check("jane@example.com").allowed, true);
  }
  assert.equal(limiter.check("jane@example.com").allowed, false);

  advanceMs(MAGIC_LINK_PER_EMAIL.windowSeconds * 1000 - 1);
  assert.equal(limiter.check("jane@example.com").allowed, false);

  advanceMs(1);
  assert.equal(limiter.check("jane@example.com").allowed, true);
});

test("T011: MAGIC_LINK_PER_IP — the 21st request within the window for the same IP is denied", () => {
  const { clock } = fakeClock("2026-01-01T00:00:00.000Z");
  const limiter = createRateLimiter({ profile: MAGIC_LINK_PER_IP, clock });

  for (let i = 0; i < MAGIC_LINK_PER_IP.max; i++) {
    assert.equal(limiter.check("203.0.113.9").allowed, true, `request ${i + 1} should pass`);
  }

  const twentyFirst = limiter.check("203.0.113.9");
  assert.equal(twentyFirst.allowed, false);
});

test("T012: MAGIC_LINK_COMPLETE_ATTEMPT — the 26th attempt within 60s from one IP is denied", () => {
  const { clock } = fakeClock("2026-01-01T00:00:00.000Z");
  const limiter = createRateLimiter({ profile: MAGIC_LINK_COMPLETE_ATTEMPT, clock });

  const effectiveMax = MAGIC_LINK_COMPLETE_ATTEMPT.max + MAGIC_LINK_COMPLETE_ATTEMPT.burst;
  assert.equal(effectiveMax, 25, "sanity: max+burst should be 25 so the 26th attempt is the first denial");

  for (let i = 0; i < effectiveMax; i++) {
    assert.equal(limiter.check("203.0.113.9").allowed, true, `attempt ${i + 1} should pass`);
  }

  const twentySixth = limiter.check("203.0.113.9");
  assert.equal(twentySixth.allowed, false);
});
