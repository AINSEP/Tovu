import assert from "node:assert/strict";
import test from "node:test";

import { signPayload, verifySignature } from "../signing";

const secret = Buffer.from("test-signing-secret");
const rawBody = JSON.stringify({ topic: "post.published", data: { id: "post-1" } });
// verifySignature checks the header's `t=` against real wall-clock time (no injectable clock in
// its contract), so fixtures that expect a successful verify must use a timestamp close to now.
const timestampSeconds = Math.floor(Date.now() / 1000);

test("signPayload then verifySignature round-trips for the same secret and body", () => {
  const header = signPayload({ secret, rawBody, timestampSeconds });

  assert.match(header, /^t=\d+,v1=[0-9a-f]{64}$/);
  assert.equal(
    verifySignature({ secret, rawBody, header, toleranceSeconds: 300 }),
    true
  );
});

test("verifySignature rejects a tampered body", () => {
  const header = signPayload({ secret, rawBody, timestampSeconds });
  const tamperedBody = JSON.stringify({ topic: "post.published", data: { id: "post-2" } });

  assert.equal(
    verifySignature({ secret, rawBody: tamperedBody, header, toleranceSeconds: 300 }),
    false
  );
});

test("verifySignature rejects a signature made with a different secret", () => {
  const header = signPayload({ secret, rawBody, timestampSeconds });
  const otherSecret = Buffer.from("a-different-secret");

  assert.equal(
    verifySignature({ secret: otherSecret, rawBody, header, toleranceSeconds: 300 }),
    false
  );
});

test("verifySignature rejects a timestamp outside the tolerance window", () => {
  const header = signPayload({ secret, rawBody, timestampSeconds });
  const nowSeconds = Math.floor(Date.now() / 1000);

  // Force the header's timestamp far outside "now" (the function under test compares against
  // real wall-clock time), independent of the fixed timestampSeconds fixture above.
  const staleHeader = signPayload({
    secret,
    rawBody,
    timestampSeconds: nowSeconds - 10_000,
  });

  assert.equal(
    verifySignature({ secret, rawBody, header: staleHeader, toleranceSeconds: 300 }),
    false
  );
  // Sanity check: the same header verifies fine with a wide-enough tolerance.
  assert.equal(
    verifySignature({ secret, rawBody, header: staleHeader, toleranceSeconds: 20_000 }),
    true
  );
});

test("verifySignature accepts a header carrying two v1 values (rotation overlap) if either matches", () => {
  const header = signPayload({ secret, rawBody, timestampSeconds });
  const otherSecret = Buffer.from("previous-generation-secret");
  const otherHeader = signPayload({ secret: otherSecret, rawBody, timestampSeconds });
  const otherHex = otherHeader.split(",")[1];

  const combinedHeader = `${header},${otherHex}`;

  assert.equal(
    verifySignature({ secret, rawBody, header: combinedHeader, toleranceSeconds: 300 }),
    true
  );
  assert.equal(
    verifySignature({ secret: otherSecret, rawBody, header: combinedHeader, toleranceSeconds: 300 }),
    true
  );
});

test("verifySignature rejects a malformed header", () => {
  assert.equal(
    verifySignature({ secret, rawBody, header: "not-a-real-header", toleranceSeconds: 300 }),
    false
  );
  assert.equal(
    verifySignature({ secret, rawBody, header: "t=abc,v1=deadbeef", toleranceSeconds: 300 }),
    false
  );
});
