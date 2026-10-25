import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { DeployError, safeDnsLabel } from "@jini-ai/devops/deploy";

import { DEPLOY_FETCH_TIMEOUTS, createDeployHostKit } from "../host-kit.js";
import { createInMemoryOtel } from "#src/platform/observability/__tests__/fixtures/in-memory-otel";

test("probe operations close owned dispatchers while sharing one during a candidate sweep", async () => {
  const dispatchers: Array<{ closed: boolean }> = [];
  const kit = createDeployHostKit({ fetchFn: async (url, init) => {
    dispatchers.push((init as RequestInit & { dispatcher: { closed: boolean } }).dispatcher);
    return new Response(null, { status: String(url).includes("/ready") ? 200 : 503 });
  } });
  const result = await kit.waitForReachableDeploymentUrl(["https://8.8.8.8/wait", "https://8.8.8.8/ready"]);
  assert.equal(result.status, "ready");
  assert.equal(dispatchers.length, 3);
  assert.equal(new Set(dispatchers).size, 1);
  assert.equal(dispatchers[0]!.closed, true);
  await kit.checkDeploymentUrl("https://8.8.8.8/ready");
  assert.notEqual(dispatchers[3], dispatchers[0]);
  assert.equal(dispatchers[3]!.closed, true);
});

test("probe operations close owned dispatchers after transport refusal", async () => {
  const dispatchers: Array<{ closed: boolean }> = [];
  const kit = createDeployHostKit({ fetchFn: async (_url, init) => {
    dispatchers.push((init as RequestInit & { dispatcher: { closed: boolean } }).dispatcher);
    throw new Error("network refused");
  } });
  const result = await kit.checkDeploymentUrl("https://8.8.8.8/refused");
  assert.equal(result.reachable, false);
  assert.equal(result.statusMessage, "Public link is not reachable yet: network refused");
  assert.equal(dispatchers.length, 2);
  assert.equal(dispatchers[0], dispatchers[1]);
  assert.equal(dispatchers[0]!.closed, true);
});

/**
 * @file `host-kit.ts` — what a plugin deploy module gets instead of npm imports. The one piece with
 * logic of its own is `fetch`'s timeout; the rest adapts devops' generic helpers to the installed plugin ABI.
 */

async function withServer(handler: Parameters<typeof createServer>[1], fn: (url: string) => Promise<void>): Promise<void> {
  const server: Server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("kit.fetch returns the response when it arrives within the timeout", async () => {
  await withServer(
    (_req, res) => res.end("ok"),
    async (url) => {
      const response = await createDeployHostKit().fetch(url, {}, { timeoutMs: 2_000 });
      assert.equal(await response.text(), "ok");
    },
  );
});

test("kit.fetch aborts with the exact timeout message when the server is slower than timeoutMs", async () => {
  await withServer(
    () => undefined, // never responds
    async (url) => {
      await assert.rejects(createDeployHostKit().fetch(url, {}, { timeoutMs: 50 }), { message: `fetch timed out after 50ms: ${url}` });
    },
  );
});

test("kit.fetch still honours the caller's own abort signal", async () => {
  await withServer(
    () => undefined,
    async (url) => {
      const controller = new AbortController();
      const pending = createDeployHostKit().fetch(url, { signal: controller.signal }, { timeoutMs: 5_000 });
      controller.abort(new Error("caller cancelled"));
      await assert.rejects(pending, { message: "caller cancelled" });
    },
  );
});

test("the kit preserves positional plugin helpers and timeout classes", async () => {
  const kit = createDeployHostKit();
  const error = new kit.DeployError("provider refused", 502, { upstream: true });
  assert.ok(error instanceof DeployError);
  assert.equal(error.message, "provider refused");
  assert.equal(error.status, 502);
  assert.deepEqual(error.details, { upstream: true });
  assert.equal(kit.safeDnsLabel("My site!"), safeDnsLabel({ raw: "My site!" }));
  assert.equal(kit.safeProjectLabel("My site!", 2).length, 2);
  assert.equal(kit.normalizeDeploymentUrl("site.example"), "https://site.example");
  assert.equal(kit.redirectGuardInit({}).redirect, "manual");
  assert.throws(() => kit.assertNotRedirected(new Response(null, { status: 302 }), "Example"), kit.DeployError);
  assert.deepEqual(kit.timeouts, { QUICK: 15_000, DEPLOY: 30_000, UPLOAD: 120_000 });
  assert.equal(kit.timeouts, DEPLOY_FETCH_TIMEOUTS);
  const started = Date.now();
  await kit.sleep(20);
  assert.ok(Date.now() - started >= 15);
});


// REGRESSION: fails if the host omits createNodeReachabilityPorts' required guard binding.
test("reachability adapts fetch and the plugin's positional protected-response callback", async () => {
  const calls: Array<{ url: string; method?: string }> = [];
  const kit = createDeployHostKit({ fetchFn: async (url, init) => {
    calls.push({ url: String(url), method: init?.method });
    return new Response("protected", { status: 401 });
  } });
  const result = await kit.checkDeploymentUrl("https://8.8.8.8", { detectProtected: (resp, body) => {
    assert.equal(resp.status, 401);
    assert.equal(body, "protected");
    return true;
  } });
  assert.equal(result.status, "protected");
  assert.deepEqual(calls, [{ url: "https://8.8.8.8/", method: "HEAD" }]);
});


// PARITY: rejected provider URLs never reach the injected transport; public links still do.
test("deployment reachability refuses private links before fetch and probes public links", async () => {
  const urls: string[] = [];
  const kit = createDeployHostKit({ fetchFn: async (url) => {
    urls.push(String(url));
    return new Response("ok", { status: 200 });
  } });
  const refused = await kit.checkDeploymentUrl("https://127.0.0.1/internal");
  assert.equal(refused.reachable, false);
  assert.deepEqual(urls, []);
  const accepted = await kit.checkDeploymentUrl("https://8.8.8.8/public");
  assert.equal(accepted.reachable, true);
  assert.deepEqual(urls, ["https://8.8.8.8/public"]);
});


test("the kit signs an S3 request using the supplied credentials and bucket endpoint", async () => {
  const client = createDeployHostKit().createSigV4Client({ accessKeyId: "fixture-key", secretAccessKey: "fixture-secret", service: "s3", region: "us-east-1" });
  const init = { method: "GET", aws: { datetime: "20260102T030405Z" } };
  const request = await client.sign("https://fixture-bucket.s3.us-east-1.amazonaws.com/index.html", init);
  assert.equal(request.url, "https://fixture-bucket.s3.us-east-1.amazonaws.com/index.html");
  assert.equal(request.method, "GET");
  assert.equal(request.headers.get("x-amz-date"), "20260102T030405Z");
  assert.equal(request.headers.get("x-amz-content-sha256"), "UNSIGNED-PAYLOAD");
  const canonical = "GET\n/index.html\n\nhost:fixture-bucket.s3.us-east-1.amazonaws.com\nx-amz-content-sha256:UNSIGNED-PAYLOAD\nx-amz-date:20260102T030405Z\n\nhost;x-amz-content-sha256;x-amz-date\nUNSIGNED-PAYLOAD";
  let key: string | Buffer = "AWS4fixture-secret";
  for (const part of ["20260102", "us-east-1", "s3", "aws4_request"]) key = createHmac("sha256", key).update(part).digest();
  const toSign = "AWS4-HMAC-SHA256\n20260102T030405Z\n20260102/us-east-1/s3/aws4_request\n" + createHash("sha256").update(canonical).digest("hex");
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  assert.equal(request.headers.get("authorization"), `AWS4-HMAC-SHA256 Credential=fixture-key/20260102/us-east-1/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${signature}`);
});

test('content proof uses guarded HTTPS, exact bytes, bounded bodies and closes every dispatcher', async () => {
  for (const [body, status, expected] of [['digest', 200, true], ['old site', 200, false], ['x'.repeat(4097), 200, false], ['', 503, false]] as const) {
    const dispatchers: Array<{ closed: boolean }> = [];
    const kit = createDeployHostKit({ fetchFn: async (_url, init) => {
      dispatchers.push((init as RequestInit & { dispatcher: { closed: boolean } }).dispatcher);
      return new Response(body, { status });
    } });
    assert.equal(await kit.probeContent!({ url: 'https://8.8.8.8/proof.txt', expected: 'digest' }), expected);
    assert.equal(dispatchers.length, 1);
    assert.equal(dispatchers[0]!.closed, true);
  }
  const kit = createDeployHostKit({ fetchFn: async () => assert.fail('private targets must be blocked before egress') });
  assert.equal(await kit.probeContent!({ url: 'https://127.0.0.1/proof', expected: 'digest' }), false);
});

test('content proof network/stream failure and a bodyless response fail closed', async () => {
  const factories: Array<() => Response> = [
    () => new Response(null, { status: 204 }),
    () => new Response(new ReadableStream({ start(controller) { controller.error(new Error('broken stream')); } })),
    () => { throw new Error('network'); },
  ];
  for (const response of factories) {
    const kit = createDeployHostKit({ fetchFn: async () => response() });
    assert.equal(await kit.probeContent!({ url: 'https://8.8.8.8/proof', expected: 'digest' }), false);
  }
});

test("kit.now reads the wall clock and a waiting sweep sleeps between attempts", async () => {
  // One sweep may probe a candidate twice (HEAD, then GET), so only a third request can follow a sleep.
  let attempts = 0;
  const kit = createDeployHostKit({ fetchFn: async () => new Response(null, { status: attempts++ < 2 ? 503 : 200 }) });
  const before = Date.now();
  const now = kit.now!();
  assert.ok(now >= before && now <= Date.now());
  const result = await kit.waitForReachableDeploymentUrl(["https://8.8.8.8/later"], { intervalMs: 5, timeoutMs: 2_000 });
  assert.equal(result.status, "ready");
  assert.equal(attempts, 3);
});

test("a traced SigV4 client signs without sending, identically to the untraced client", async () => {
  const { exporter, port } = createInMemoryOtel();
  const clientOptions = { accessKeyId: "fixture-key", secretAccessKey: "fixture-secret", service: "s3", region: "us-east-1" };
  const init = { method: "GET", aws: { datetime: "20260102T030405Z" } };
  const traced = await createDeployHostKit({ observability: port }).createSigV4Client(clientOptions).sign("https://fixture-bucket.s3.us-east-1.amazonaws.com/index.html", init);
  const plain = await createDeployHostKit().createSigV4Client(clientOptions).sign("https://fixture-bucket.s3.us-east-1.amazonaws.com/index.html", init);
  assert.equal(traced.headers.get("authorization"), plain.headers.get("authorization"));
  assert.deepEqual(exporter.getFinishedSpans(), []);
});

// Stryker lane L14 (host-kit.ts 88.3 %): the proof-body cap boundary, multi-chunk accumulation, the
// non-ok short-circuit with a MATCHING body, the reader cancel, and the fetch init were unasserted.
test("content proof: exactly 4096 bytes is read, 4097 is refused; the cap counts bytes across chunks", async () => {
  const expected4096 = "d".repeat(4096);
  const chunked = (parts: string[]) => new ReadableStream<Uint8Array>({ start(c) { for (const p of parts) c.enqueue(new TextEncoder().encode(p)); c.close(); } });
  const cases: Array<[() => Response, string, boolean]> = [
    [() => new Response(expected4096), expected4096, true],
    [() => new Response(chunked(["d".repeat(2048), "d".repeat(2048)])), expected4096, true],
    [() => new Response(chunked(["d".repeat(3000), "d".repeat(3000)])), "d".repeat(6000), false],
    [() => new Response(chunked(["dig", "est"])), "digest", true],
    [() => new Response("digest", { status: 503 }), "digest", false],
    [() => new Response("digest", { status: 302, headers: { location: "https://8.8.8.8/x" } }), "digest", false],
  ];
  for (const [respond, expected, ok] of cases) {
    const kit = createDeployHostKit({ fetchFn: async () => respond() });
    assert.equal(await kit.probeContent!({ url: "https://8.8.8.8/proof", expected }), ok, `${expected.length} bytes → ${ok}`);
  }
});

test("content proof: the fetch refuses redirects and carries a timeout signal; the body reader is cancelled after a match", async () => {
  const inits: RequestInit[] = [];
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(new TextEncoder().encode("digest")); c.close(); },
    cancel() { cancelled = true; },
  });
  const kit = createDeployHostKit({ fetchFn: async (_url, init) => (inits.push(init as RequestInit), new Response(body)) });
  assert.equal(await kit.probeContent!({ url: "https://8.8.8.8/proof", expected: "digest" }), true);
  assert.equal(inits[0]!.redirect, "error");
  assert.ok(inits[0]!.signal instanceof AbortSignal);
  assert.equal(inits[0]!.signal!.aborted, false);
  // A fully-read stream is already closed, so cancel() is a no-op on the source; an over-cap stream is not.
  let overCapCancelled = false;
  const endless = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array(2048)); }, cancel() { overCapCancelled = true; } });
  const kit2 = createDeployHostKit({ fetchFn: async () => new Response(endless) });
  assert.equal(await kit2.probeContent!({ url: "https://8.8.8.8/proof", expected: "digest" }), false);
  assert.equal(overCapCancelled, true, "an over-cap proof body is cancelled, not left streaming");
  assert.equal(cancelled, false);
});
