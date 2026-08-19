import assert from "node:assert/strict";
import test from "node:test";

import { CONTENT_ENTRY_MAX_BODY_BYTES, rejectOversizedJsonBody } from "../body-size-limit.js";

/**
 * @file Unit coverage for `rejectOversizedJsonBody`, the SPEC-002 api.spec.md §4 / behavior.spec.md
 * §4 route-layer 1 MiB body-size cap (Security review SEC-snapshot-and-post-create-2026-07-28,
 * Finding 1). Exercised in isolation from Express/HTTP here; route-level wiring (413 over the real
 * `/posts`/`/pages` create endpoints) is covered in `server/__tests__/packet-one-routes.test.ts`.
 */

/** Minimal fake matching the subset of Express's `Request`/`Response` this middleware reads. */
function fakeReqRes(body: unknown) {
  const req = { body } as Parameters<ReturnType<typeof rejectOversizedJsonBody>>[0];
  let statusCode: number | undefined;
  let jsonPayload: unknown;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      jsonPayload = payload;
      return this;
    },
  } as Parameters<ReturnType<typeof rejectOversizedJsonBody>>[1];
  return { req, res, getStatus: () => statusCode, getJson: () => jsonPayload };
}

test("rejectOversizedJsonBody calls next() and does not respond when the body is under the cap", () => {
  const middleware = rejectOversizedJsonBody({ maxBytes: CONTENT_ENTRY_MAX_BODY_BYTES });
  const { req, res, getStatus } = fakeReqRes({ title: "Small post" });

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(getStatus(), undefined);
});

test("rejectOversizedJsonBody responds 413 PAYLOAD_TOO_LARGE and does not call next() when the body exceeds the cap", () => {
  const middleware = rejectOversizedJsonBody({ maxBytes: 100 });
  const { req, res, getStatus, getJson } = fakeReqRes({ padding: "a".repeat(200) });

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(getStatus(), 413);
  assert.deepEqual(getJson(), { error: "Content too large to save.", code: "PAYLOAD_TOO_LARGE" });
});

test("rejectOversizedJsonBody treats an undefined body as zero-size (never throws)", () => {
  const middleware = rejectOversizedJsonBody({ maxBytes: CONTENT_ENTRY_MAX_BODY_BYTES });
  const { req, res, getStatus } = fakeReqRes(undefined);

  let nextCalled = false;
  assert.doesNotThrow(() =>
    middleware(req, res, () => {
      nextCalled = true;
    })
  );
  assert.equal(nextCalled, true);
  assert.equal(getStatus(), undefined);
});

test("rejectOversizedJsonBody accepts a body exactly at the byte boundary", () => {
  // `{"a":"..."}` where the padding is sized so the whole serialized object is exactly maxBytes.
  const maxBytes = 20;
  const middleware = rejectOversizedJsonBody({ maxBytes });
  const exact = JSON.stringify({ a: "" });
  const paddingLength = maxBytes - Buffer.byteLength(exact, "utf8");
  const { req, res, getStatus } = fakeReqRes({ a: "x".repeat(paddingLength) });

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(getStatus(), undefined);
});
