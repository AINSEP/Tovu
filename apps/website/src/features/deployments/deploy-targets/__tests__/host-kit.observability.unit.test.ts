import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { SpanKind, SpanStatusCode } from "@opentelemetry/api";

import { createDeployHostKit } from "../host-kit.js";
import { assertSpanOmits, createInMemoryOtel } from "#src/platform/observability/__tests__/fixtures/in-memory-otel";

/**
 * @file Every egress a deploy plugin makes through the kit — `kit.fetch`, the reachability probes and
 * the SigV4 client — is one outbound span when an observability port is injected. The SDK is real
 * (in-memory exporter); the transport is an injected `fetchFn` or a loopback server, never the network.
 */

const TOKEN = "dep-tok-7f3a";

test("kit.fetch is one CLIENT span with the status, and no path, query or credential", async () => {
  const { exporter, port } = createInMemoryOtel();
  const kit = createDeployHostKit({ observability: port, fetchFn: async () => new Response("created", { status: 201 }) });
  const response = await kit.fetch(`https://api.deploy.example/v1/sites/acme/deploys?access_token=${TOKEN}`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}` } }, { timeoutMs: 1_000 });
  assert.equal(response.status, 201);
  const [span] = exporter.getFinishedSpans();
  assert.equal(span.name, "POST api.deploy.example");
  assert.equal(span.kind, SpanKind.CLIENT);
  assert.equal(span.attributes["http.response.status_code"], 201);
  assert.equal(span.status.code, SpanStatusCode.UNSET);
  assertSpanOmits(span, [TOKEN, "acme", "/v1"]);
});

test("a kit.fetch transport failure exports ERROR status and the error type only", async () => {
  const { exporter, port } = createInMemoryOtel();
  const kit = createDeployHostKit({ observability: port, fetchFn: async () => { throw Object.assign(new Error(`socket hang up for ${TOKEN}`), { code: "ECONNRESET" }); } });
  await assert.rejects(kit.fetch("https://api.deploy.example/", {}, { timeoutMs: 1_000 }), /socket hang up/);
  const [span] = exporter.getFinishedSpans();
  assert.equal(span.status.code, SpanStatusCode.ERROR);
  assert.equal(span.attributes["error.type"], "ECONNRESET");
  assertSpanOmits(span, [TOKEN]);
});

test("a reachability probe is traced through the same fetch", async () => {
  const { exporter, port } = createInMemoryOtel();
  const kit = createDeployHostKit({ observability: port, fetchFn: async () => new Response("ok", { status: 200 }) });
  assert.equal((await kit.checkDeploymentUrl("https://8.8.8.8/private-preview")).reachable, true);
  const [span] = exporter.getFinishedSpans();
  assert.equal(span.name, "HEAD 8.8.8.8");
  assertSpanOmits(span, ["private-preview"]);
});

test("a SigV4 client call is one span with the response status, never the signature or object key", async () => {
  const server: Server = createServer((_req, res) => { res.statusCode = 403; res.end("denied"); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { exporter, port } = createInMemoryOtel();
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const client = createDeployHostKit({ observability: port }).createSigV4Client({ accessKeyId: "AKIAFIXTURE", secretAccessKey: TOKEN, service: "s3", region: "us-east-1" });
    assert.equal((await client.fetch(`${origin}/fixture-bucket/secret-key.html`, { method: "PUT", body: "x" })).status, 403);
    const [span] = exporter.getFinishedSpans();
    assert.equal(span.name, "PUT 127.0.0.1");
    assert.equal(span.status.code, SpanStatusCode.ERROR);
    assert.equal(span.attributes["http.response.status_code"], 403);
    assertSpanOmits(span, [TOKEN, "AKIAFIXTURE", "fixture-bucket", "secret-key"]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("without an observability port the kit records nothing and still sends", async () => {
  const { exporter } = createInMemoryOtel();
  const kit = createDeployHostKit({ fetchFn: async () => new Response("ok", { status: 200 }) });
  assert.equal((await kit.fetch("https://api.deploy.example/", {}, { timeoutMs: 1_000 })).status, 200);
  assert.equal(exporter.getFinishedSpans().length, 0);
});
