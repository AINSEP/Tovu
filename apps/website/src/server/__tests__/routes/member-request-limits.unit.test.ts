import assert from "node:assert/strict";
import test from "node:test";
import type { Request } from "express";

import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { checkMemberRequestLimits, type MemberPublicRouteDeps } from "../../inbound/public-http/routes/members/deps.js";
import { createCapturingResponse } from "../helpers/http-test-server.js";
import { portFake } from "../helpers/port-fake.js";

type LimitRequest = Omit<Parameters<typeof checkMemberRequestLimits>[0], "req" | "res" | "deps">;

async function checkLimits(required: LimitRequest & { ip: string }, _options = {}) {
  const { ip, ...limits } = required;
  const req = portFake<Request>({ ip, headers: {}, socket: { remoteAddress: ip } });
  const { res, capture } = createCapturingResponse();
  const headers = new Map<string, string>();
  res.setHeader = (name, value) => { headers.set(name.toLowerCase(), String(value)); return res; };
  const allowed = await checkMemberRequestLimits({ ...limits, req, res, deps: portFake<MemberPublicRouteDeps>({}) });
  return { allowed, capture, headers };
}

test("T30: an already limited IP cannot consume a victim's email or identity budget", async () => {
  const clock = createFakeClock({ startIso: "2026-10-26T12:00:00.000Z" });
  const profile = { windowSeconds: 60, max: 1, burst: 0 };
  const ipLimiter = createRateLimiter({ profile, clock });
  const emailLimiter = createRateLimiter({ profile, clock });
  const identityLimiter = createRateLimiter({ profile, clock });
  const attackerIp = "203.0.113.10";
  const email = "victim@example.test";
  const identity = { key: "victim-member", limiter: identityLimiter };
  assert.deepEqual(await ipLimiter.check({ key: attackerIp }), { allowed: true });

  const blocked = await checkLimits({ ip: attackerIp, ipLimiter, emailLimiter, email, identity });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.capture.statusCode, 429);
  assert.deepEqual(blocked.capture.jsonBody, { error: "too many member authentication requests",
    code: "RATE_LIMIT_EXCEEDED", details: { retryAfterSeconds: 60 } });

  // The same real counters must still admit the victim from a different IP.
  const victim = await checkLimits({ ip: "203.0.113.20", ipLimiter, emailLimiter, email, identity });
  assert.equal(victim.allowed, true, "the blocked IP must leave both victim budgets unspent");
});

test("T30: Retry-After and its JSON detail report the longest applicable wait", async () => {
  // Keep the IP allowed: its denial must short-circuit without charging other counters.
  // Reverse the downstream waits so choosing either the first or last denial is insufficient.
  for (const [emailWait, identityWait] of [[15, 90], [90, 15]] as const) {
    const clock = createFakeClock({ startIso: "2026-10-26T12:00:00.000Z" });
    const ipLimiter = createRateLimiter({ profile: { windowSeconds: 60, max: 1, burst: 0 }, clock });
    const emailLimiter = createRateLimiter({ profile: { windowSeconds: emailWait, max: 1, burst: 0 }, clock });
    const identityLimiter = createRateLimiter({ profile: { windowSeconds: identityWait, max: 1, burst: 0 }, clock });
    const email = "victim@example.test";
    const identity = { key: "victim-member", limiter: identityLimiter };
    assert.deepEqual(await emailLimiter.check({ key: email }), { allowed: true });
    assert.deepEqual(await identityLimiter.check({ key: identity.key }), { allowed: true });

    const result = await checkLimits({ ip: "203.0.113.20", ipLimiter, emailLimiter, email, identity });
    assert.equal(result.allowed, false);
    assert.equal(result.capture.statusCode, 429);
    assert.equal(result.headers.get("retry-after"), "90");
    assert.deepEqual(result.capture.jsonBody, { error: "too many member authentication requests",
      code: "RATE_LIMIT_EXCEEDED", details: { retryAfterSeconds: 90 } });
  }
});
