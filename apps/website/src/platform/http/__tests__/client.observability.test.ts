import assert from "node:assert/strict";
import test from "node:test";

import { createHttpClient } from "../client.js";
import { EgressRefusedError } from "../index.js";
import { createNoopObservabilityPort, type ObservabilityPort } from "#src/platform/observability/index";
import type { EgressPolicy, HttpRequest, HttpResponse, HttpTransportAdapter } from "../ports.js";

/**
 * @file The guarded client is Tovu's outbound chokepoint for vetted egress (mail APIs, custom
 * credentials, media import, publish peers, deploy ops), so it is where `trackOutboundCall` is
 * recorded. DNS and transport are injected ports — no module mocks, no network.
 */

const policy: EgressPolicy = {
  allowedSchemes: ["https"], denyPrivateAddresses: true, devHostAllowlist: [], maxRedirects: 0,
  connectTimeoutMs: 5000, maxResponseBytes: 1_000_000, maxDecompressedBytes: 1_000_000,
};
const dns = { resolve: async ({ hostname }: { hostname: string }) => (hostname === "internal.example" ? ["10.0.0.5"] : ["93.184.216.34"]) };
const request = (url: string): HttpRequest => ({ method: "POST", url, headers: { authorization: "Bearer secret" }, timeoutMs: 1000 });
const transport = (status: number): HttpTransportAdapter => ({ requestPinned: async (): Promise<HttpResponse> => ({ status, headers: {}, bodyText: "" }) });

function recordingPort() {
  const calls: Array<{ method: string; url: string; outcome?: { statusCode?: number; error?: unknown } }> = [];
  const port: ObservabilityPort = {
    ...createNoopObservabilityPort({}),
    trackOutboundCall(input) {
      const call: (typeof calls)[number] = { ...input };
      calls.push(call);
      return { run: (fn) => fn(), end: (outcome) => { call.outcome = outcome; } };
    },
  };
  return { port, calls };
}

test("each send through an observed client is one tracked outbound call with the response status", async () => {
  const { port, calls } = recordingPort();
  const client = createHttpClient({ transport: transport(201), policy }, { dns, observability: port });
  assert.equal((await client.send(request("https://api.example.com/v1/send?key=k"))).status, 201);
  assert.deepEqual(calls, [{ method: "POST", url: "https://api.example.com/v1/send?key=k", outcome: { statusCode: 201 } }]);
});

test("a refused egress is tracked as a failed call and still surfaces Tovu's refusal error", async () => {
  const { port, calls } = recordingPort();
  const client = createHttpClient({ transport: transport(200), policy }, { dns, observability: port });
  await assert.rejects(client.send(request("https://internal.example/")), EgressRefusedError);
  assert.equal(calls.length, 1);
  assert.ok(calls[0]?.outcome?.error instanceof EgressRefusedError);
});

test("without an observability port the client sends exactly as before", async () => {
  const client = createHttpClient({ transport: transport(204), policy }, { dns });
  assert.equal((await client.send(request("https://api.example.com/"))).status, 204);
});
