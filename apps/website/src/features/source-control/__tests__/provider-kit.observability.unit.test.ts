import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { SpanKind, SpanStatusCode } from "@opentelemetry/api";

import { assertSpanOmits, createInMemoryOtel } from "#src/platform/observability/__tests__/fixtures/in-memory-otel";
import { EgressRefusedError, type HttpClientPort } from "#src/platform/http/index";

import { createSourceControlProviderKit } from "../provider-kit.js";
import type { SourceControlProviderKit, SourceControlProviderOperations } from "../provider-module.js";
import { buildSourceControlProvider, buildSourceControlProviderForApi, type SourceControlProviderRegistry } from "../provider-registry.js";

/**
 * @file A git-host provider's raw `kit.fetch` is one outbound span when the kit is built with an
 * observability port, through every build path core uses. Real SDK, in-memory exporter; the provider
 * module and its transport are hand-written fakes.
 */

const TOKEN = "ghp_fixture0123456789";
const httpClient: HttpClientPort = { send: () => Promise.reject(new Error("not used")) };

test("the provider kit retains the guarded host HTTP request contract", async () => {
  const request = { method: "GET" as const, url: "https://api.github.com/user", headers: {}, idleTimeoutMs: 1000 };
  const response = { status: 200, headers: {}, bodyText: "{}" };
  const client: HttpClientPort = { send: async actual => { assert.equal(actual, request); return response; } };
  const kit = createSourceControlProviderKit({ httpClient: client });
  assert.equal(kit.httpClient, client);
  assert.equal(await kit.httpClient.send(request), response);
});

/** A registry with one provider whose module hands its kit back to the test. */
function capturingRegistry(): { registry: SourceControlProviderRegistry; kit: () => SourceControlProviderKit } {
  let captured: SourceControlProviderKit | undefined;
  const loaded = {
    descriptor: { id: "github", label: "GitHub", apiOrigin: "https://api.github.com" },
    pluginId: "github",
    module: { create: ({ kit }: { kit: SourceControlProviderKit }) => { captured = kit; return {} as SourceControlProviderOperations; } },
  };
  const registry = { list: () => [loaded], get: (id: string) => (id === "github" ? loaded : undefined), refusals: [] } as unknown as SourceControlProviderRegistry;
  return { registry, kit: () => captured! };
}

test("kit.fetch is one CLIENT span with the status and no path, query or token", async () => {
  const { exporter, port } = createInMemoryOtel();
  const kit = createSourceControlProviderKit({ observability: port, fetchFn: async () => new Response("{}", { status: 200 }) });
  await kit.fetch(`https://api.github.com/repos/acme/site/git/refs?access_token=${TOKEN}`, { method: "GET", headers: { authorization: `token ${TOKEN}` } });
  const [span] = exporter.getFinishedSpans();
  assert.equal(span.name, "GET api.github.com");
  assert.equal(span.kind, SpanKind.CLIENT);
  assert.equal(span.attributes["http.response.status_code"], 200);
  assertSpanOmits(span, [TOKEN, "acme", "/repos"]);
});

test("a rejected kit.fetch is an ERROR span with the error type only", async () => {
  const { exporter, port } = createInMemoryOtel();
  const kit = createSourceControlProviderKit({ observability: port, fetchFn: async () => { throw Object.assign(new Error(`getaddrinfo failed ${TOKEN}`), { code: "ENOTFOUND" }); } });
  await assert.rejects(kit.fetch("https://api.github.com/user", { method: "GET" }), /getaddrinfo/);
  const [span] = exporter.getFinishedSpans();
  assert.equal(span.status.code, SpanStatusCode.ERROR);
  assert.equal(span.attributes["error.type"], "ENOTFOUND");
  assertSpanOmits(span, [TOKEN]);
});

test("buildSourceControlProvider and buildSourceControlProviderForApi hand the port to the kit they build", async () => {
  const server: Server = createServer((_req, res) => { res.statusCode = 401; res.end(); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { exporter, port } = createInMemoryOtel();
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/user`;
    const byId = capturingRegistry();
    assert.equal((await buildSourceControlProvider({ load: async () => byId.registry, workspaceId: "ws", providerId: "github", observability: port })).ok, true);
    assert.equal((await byId.kit().fetch(url, { method: "GET" })).status, 401);
    const byApi = capturingRegistry();
    assert.equal((await buildSourceControlProviderForApi({ load: async () => byApi.registry, workspaceId: "ws", baseUrl: "https://api.github.com", httpClient, observability: port })).ok, true);
    assert.equal((await byApi.kit().fetch(url, { method: "PUT" })).status, 401);
    const spans = exporter.getFinishedSpans();
    assert.deepEqual(spans.map((span) => span.name), ["GET 127.0.0.1", "PUT 127.0.0.1"]);
    assert.equal(spans[0].status.code, SpanStatusCode.ERROR, "a 401 from the git host is a failed client call");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("without a port the kit sends through fetchFn unwrapped", async () => {
  const { exporter } = createInMemoryOtel();
  const kit = createSourceControlProviderKit({ fetchFn: async () => new Response(null, { status: 204 }) });
  assert.equal((await kit.fetch("https://api.github.com/", {})).status, 204);
  assert.equal(exporter.getFinishedSpans().length, 0);
});

test("a kit built with no options refuses outbound HTTP-client calls instead of sending them", async () => {
  const kit = createSourceControlProviderKit();
  const request = { method: "GET" as const, url: "https://api.github.com/user", headers: {}, idleTimeoutMs: 1000 };
  await assert.rejects(() => kit.httpClient.send(request), { message: "no outbound HTTP client is wired for this call" });
});

test("describeTransportError relays an egress refusal's caller-safe message and keeps the resolved address for the log only", () => {
  const kit = createSourceControlProviderKit({ httpClient });
  const refusal = new EgressRefusedError(
    { message: "host 'meta.internal' resolved to 169.254.169.254 (link-local)" },
    { callerSafeMessage: "host 'meta.internal' resolves to a non-public address" },
  );
  assert.deepEqual(kit.describeTransportError(refusal), {
    refusal: "host 'meta.internal' resolves to a non-public address",
    logDetail: "host 'meta.internal' resolved to 169.254.169.254 (link-local)",
  });
  const plain = kit.describeTransportError(new TypeError("socket hang up"));
  assert.equal(plain.refusal, undefined);
  assert.equal(plain.logDetail, "TypeError", "a non-refusal logs its error type only, never its message");
});

test("fetch without an init sends an empty init, and the default sleep waits on the real timer", async () => {
  const inits: unknown[] = [];
  const kit = createSourceControlProviderKit({ fetchFn: async (_url, init) => { inits.push(init); return new Response(null, { status: 204 }); } });
  assert.equal((await kit.fetch("https://api.github.com/")).status, 204);
  assert.equal(inits.length, 1);
  const started = Date.now();
  await kit.sleep(5);
  assert.ok(Date.now() - started >= 4, "sleep resolved only after the timer fired");
});

test("an injected sleep is used as-is", async () => {
  const waits: number[] = [];
  const kit = createSourceControlProviderKit({ sleep: async ms => { waits.push(ms); } });
  await kit.sleep(250);
  assert.deepEqual(waits, [250]);
});
