import assert from "node:assert/strict";
import test from "node:test";

import { buildFormsRateLimitKey, FORMS_SUBMIT_PROFILE } from "../rate-limit-profile";
import { createRateLimiter } from "#src/core/rate-limit/rate-limit";

/**
 * @file Unit tests for `buildFormsRateLimitKey`/`FORMS_SUBMIT_PROFILE` (C-010/C-011, REQ-09,
 * INV-09). Composite `${sourceIp}:${formDefinitionId}` key; two different forms from the same IP
 * get independent windows.
 */

test("FORMS_SUBMIT_PROFILE: 5 requests / 60s / 0 burst (api.spec.md §3, behavior.spec.md §3)", () => {
  assert.equal(FORMS_SUBMIT_PROFILE.max, 5);
  assert.equal(FORMS_SUBMIT_PROFILE.windowSeconds, 60);
  assert.equal(FORMS_SUBMIT_PROFILE.burst, 0);
});

test("buildFormsRateLimitKey: composes `${sourceIp}:${formDefinitionId}`", () => {
  assert.equal(buildFormsRateLimitKey({ sourceIp: "1.2.3.4", formDefinitionId: "def-1" }), "1.2.3.4:def-1");
});

test("buildFormsRateLimitKey: INV-09 — two different forms from the same IP get independent windows", () => {
  const clock = { nowIso: () => "2026-07-13T00:00:00.000Z" };
  const limiter = createRateLimiter({ profile: FORMS_SUBMIT_PROFILE, clock });

  const keyA = buildFormsRateLimitKey({ sourceIp: "1.2.3.4", formDefinitionId: "form-a" });
  const keyB = buildFormsRateLimitKey({ sourceIp: "1.2.3.4", formDefinitionId: "form-b" });

  for (let i = 0; i < 5; i++) {
    assert.equal(limiter.check(keyA).allowed, true, `form-a request ${i + 1} should be allowed`);
  }
  assert.equal(limiter.check(keyA).allowed, false, "form-a's 6th request should be rejected");

  // form-b, same IP, must not be cross-throttled by form-a's exhausted window.
  assert.equal(limiter.check(keyB).allowed, true, "form-b's first request must still be allowed");
});

test("AC-14/behavior.spec.md §7 — the 5th submission in-window is accepted, the 6th is rejected", () => {
  const clock = { nowIso: () => "2026-07-13T00:00:00.000Z" };
  const limiter = createRateLimiter({ profile: FORMS_SUBMIT_PROFILE, clock });
  const key = buildFormsRateLimitKey({ sourceIp: "9.9.9.9", formDefinitionId: "form-x" });

  const results = Array.from({ length: 6 }, () => limiter.check(key));
  assert.deepEqual(
    results.map((r) => r.allowed),
    [true, true, true, true, true, false]
  );
});
