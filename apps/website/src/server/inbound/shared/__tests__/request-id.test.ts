import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { applyRequestTracking } from "../observability-middleware.js";
import { REQUEST_ID_HEADER, resolveRequestId } from "../request-id.js";
import { startTestServer } from "../../../__tests__/helpers/http-test-server.js";
import type { ObservabilityPort, RequestTrackingOptions } from "#src/platform/observability/index";

/**
 * @file Request IDs (Reliability: structured logging + request IDs): every response carries an
 * `x-request-id`, reusing a well-formed inbound one (a proxy's or the caller's) and minting one
 * otherwise, and the same id reaches `ObservabilityPort.trackRequest` so a log line, a trace and
 * the response a user reports can be joined on it.
 */

function spyPort(): { port: ObservabilityPort; options: RequestTrackingOptions[] } {
  const options: RequestTrackingOptions[] = [];
  const port: ObservabilityPort = {
    trackRequest(_input, opts = {}) {
      options.push(opts);
      return { end() {} };
    },
  };
  return { port, options };
}

async function serve(t: test.TestContext) {
  const { port, options } = spyPort();
  const app = express();
  applyRequestTracking(app, { observability: port });
  app.get("/welcome", (_req, res) => res.status(200).send("ok"));
  return { baseUrl: await startTestServer(app, t), options };
}

test("a well-formed inbound x-request-id is echoed on the response and handed to trackRequest", async (t) => {
  const { baseUrl, options } = await serve(t);
  const res = await fetch(`${baseUrl}/welcome`, { headers: { [REQUEST_ID_HEADER]: "edge-7f3a.42" } });
  assert.equal(res.headers.get(REQUEST_ID_HEADER), "edge-7f3a.42");
  assert.deepEqual(options, [{ requestId: "edge-7f3a.42" }]);
});

test("without an inbound id, one is minted, returned, and is the same id trackRequest saw", async (t) => {
  const { baseUrl, options } = await serve(t);
  const res = await fetch(`${baseUrl}/welcome`);
  const returned = res.headers.get(REQUEST_ID_HEADER);
  assert.match(returned ?? "", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.deepEqual(options, [{ requestId: returned }]);
});

test("unmatched routes (Express's own 404) still carry the id", async (t) => {
  const { baseUrl } = await serve(t);
  const res = await fetch(`${baseUrl}/nope`, { headers: { [REQUEST_ID_HEADER]: "abc" } });
  assert.equal(res.status, 404);
  assert.equal(res.headers.get(REQUEST_ID_HEADER), "abc");
});

test("resolveRequestId keeps only a bounded, log-safe inbound id and mints otherwise", () => {
  const mint = () => "minted";
  assert.equal(resolveRequestId({ header: "abc-123_X.y:z" }, { mint }), "abc-123_X.y:z");
  assert.equal(resolveRequestId({ header: undefined }, { mint }), "minted");
  assert.equal(resolveRequestId({ header: "" }, { mint }), "minted");
  // Spaces/newlines/quotes would let a caller forge or split log lines keyed on this id.
  assert.equal(resolveRequestId({ header: "a b" }, { mint }), "minted");
  assert.equal(resolveRequestId({ header: 'a"b' }, { mint }), "minted");
  assert.equal(resolveRequestId({ header: "x".repeat(129) }, { mint }), "minted");
  assert.equal(resolveRequestId({ header: "x".repeat(128) }, { mint }), "x".repeat(128));
  // Node joins a repeated header into an array for unknown names; ambiguous, so mint.
  assert.equal(resolveRequestId({ header: ["a", "b"] }, { mint }), "minted");
});
