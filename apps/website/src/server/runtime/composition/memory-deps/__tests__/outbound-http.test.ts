import assert from "node:assert/strict";
import { mock, test } from "node:test";

/**
 * @file The in-memory root's guarded outbound HTTP client (design 02, steps 5/6): the egress SECURITY
 * policy it builds the one pinned client with is part of the contract, so it is asserted whole with
 * `toEqual`-style deep equality. The platform factory is wrapped to capture its argument; the real
 * factory still runs.
 */

const guarded = await import("@jini-ai/platform/http/guarded");
const captured: Array<Record<string, unknown>> = [];
mock.module("@jini-ai/platform/http/guarded", { namedExports: {
  ...guarded,
  createHttpClient: (config: Record<string, unknown>, ...rest: never[]) => { captured.push(config); return (guarded.createHttpClient as Function)(config, ...rest); },
} });

const { composeMemoryOutboundHttp } = await import("../slices/outbound-http.js");

test("the memory root builds ONE guarded client with the exact egress policy: schemes, private addresses denied, no redirects, 10 min / 96 MiB", () => {
  captured.length = 0;
  const first = composeMemoryOutboundHttp();
  assert.equal(captured.length, 1);
  assert.equal(captured[0]!.userAgent, "Tovu/0.1.0");
  assert.deepEqual(captured[0]!.policy, {
    allowedSchemes: ["https", "http"], denyPrivateAddresses: true, devHostAllowlist: [],
    maxRedirects: 0, connectTimeoutMs: 10 * 60 * 1000,
    maxResponseBytes: 96 * 1024 * 1024, maxDecompressedBytes: 96 * 1024 * 1024,
  });
  assert.ok(first.guardedOutboundHttpClient);
  assert.ok(first.externalMcpOAuthHttpPorts);
  composeMemoryOutboundHttp();
  assert.equal(captured.length, 2, "each call builds its own client; nothing is cached across roots");
});
