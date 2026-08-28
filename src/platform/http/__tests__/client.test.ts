import assert from "node:assert/strict";
import test from "node:test";

import { classifyAddress, createHttpClient } from "../client.js";
import type { EgressPolicy, HttpRequest, HttpResponse, PinnedPeer } from "../ports.js";
import type { HttpTransportAdapter } from "../ports.js";

function makePolicy(overrides: Partial<EgressPolicy> = {}): EgressPolicy {
  return {
    allowedSchemes: ["https"],
    denyPrivateAddresses: true,
    devHostAllowlist: [],
    maxRedirects: 3,
    connectTimeoutMs: 5000,
    maxResponseBytes: 1_000_000,
    maxDecompressedBytes: 1_000_000,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return {
    method: "GET",
    url: "https://example.com/",
    headers: {},
    timeoutMs: 1000,
    ...overrides,
  };
}

class ScriptedTransport implements HttpTransportAdapter {
  calls: Array<{ req: HttpRequest; peer: PinnedPeer }> = [];
  private responses: HttpResponse[];
  private cursor = 0;

  constructor(responses: HttpResponse[]) {
    this.responses = responses;
  }

  async requestPinned(req: HttpRequest, peer: PinnedPeer): Promise<HttpResponse> {
    this.calls.push({ req, peer });
    const response = this.responses[Math.min(this.cursor, this.responses.length - 1)];
    this.cursor += 1;
    return response;
  }
}

test("classifyAddress: private/loopback/link-local/metadata/public per address family", () => {
  assert.equal(classifyAddress("10.1.2.3"), "private");
  assert.equal(classifyAddress("172.16.0.5"), "private");
  assert.equal(classifyAddress("192.168.1.1"), "private");
  assert.equal(classifyAddress("127.0.0.1"), "loopback");
  assert.equal(classifyAddress("169.254.169.254"), "link-local"); // cloud metadata
  assert.equal(classifyAddress("8.8.8.8"), "public");

  assert.equal(classifyAddress("::1"), "loopback");
  assert.equal(classifyAddress("fe80::1"), "link-local");
  assert.equal(classifyAddress("fd00::1"), "private");
  assert.equal(classifyAddress("2001:4860:4860::8888"), "public");

  // IPv4-mapped IPv6, normalized before classification (ADR-038 amendment 2).
  assert.equal(classifyAddress("::ffff:127.0.0.1"), "loopback");
  assert.equal(classifyAddress("::ffff:10.0.0.1"), "private");
});

test("rejects a private/loopback/link-local target pre-connect for each address family", async () => {
  const transport = new ScriptedTransport([{ status: 200, headers: {}, bodyText: "" }]);
  const client = createHttpClient({ transport, policy: makePolicy() });

  await assert.rejects(() => client.send(makeRequest({ url: "https://127.0.0.1/" })));
  await assert.rejects(() => client.send(makeRequest({ url: "https://10.0.0.1/" })));
  await assert.rejects(() => client.send(makeRequest({ url: "https://169.254.169.254/" })));
  await assert.rejects(() => client.send(makeRequest({ url: "https://[::1]/" })));
  assert.equal(transport.calls.length, 0, "transport must never be reached for a rejected target");
});

test("devHostAllowlist permits an otherwise-private target for that exact host", async () => {
  const transport = new ScriptedTransport([{ status: 200, headers: {}, bodyText: "ok" }]);
  const client = createHttpClient({
    transport,
    policy: makePolicy({ devHostAllowlist: ["127.0.0.1"] }),
  });

  const response = await client.send(makeRequest({ url: "https://127.0.0.1/" }));
  assert.equal(response.bodyText, "ok");
  assert.equal(transport.calls.length, 1);
});

test("a cross-origin redirect strips auth headers and is re-verified against policy", async () => {
  const transport = new ScriptedTransport([
    { status: 302, headers: { location: "https://169.254.169.254/steal" }, bodyText: "" },
  ]);
  const client = createHttpClient({ transport, policy: makePolicy() });

  await assert.rejects(
    () =>
      client.send(
        makeRequest({
          url: "https://example.com/",
          headers: { Authorization: "Bearer secret" },
        })
      ),
    /rejected/
  );
});

test("a cross-origin redirect to an allowed host strips Authorization/Cookie before following", async () => {
  const transport = new ScriptedTransport([
    { status: 302, headers: { location: "https://8.8.8.8/next" }, bodyText: "" },
    { status: 200, headers: {}, bodyText: "final" },
  ]);
  const client = createHttpClient({ transport, policy: makePolicy() });

  const response = await client.send(
    makeRequest({
      url: "https://example.com/",
      headers: { Authorization: "Bearer secret", "X-Kept": "yes" },
    })
  );

  assert.equal(response.bodyText, "final");
  assert.equal(transport.calls.length, 2);
  assert.equal(transport.calls[1].req.headers.Authorization, undefined);
  assert.equal(transport.calls[1].req.headers["X-Kept"], "yes");
});

test("stops following redirects once maxRedirects is exhausted", async () => {
  const transport = new ScriptedTransport([
    { status: 302, headers: { location: "https://8.8.8.8/1" }, bodyText: "" },
  ]);
  const client = createHttpClient({ transport, policy: makePolicy({ maxRedirects: 0 }) });

  const response = await client.send(makeRequest({ url: "https://example.com/" }));
  assert.equal(response.status, 302);
  assert.equal(transport.calls.length, 1);
});

test("response body is truncated to the smaller of maxResponseBytes/maxDecompressedBytes", async () => {
  const transport = new ScriptedTransport([{ status: 200, headers: {}, bodyText: "0123456789" }]);
  const client = createHttpClient({
    transport,
    policy: makePolicy({ maxResponseBytes: 4, maxDecompressedBytes: 100 }),
  });

  const response = await client.send(makeRequest({ url: "https://example.com/" }));
  assert.equal(response.bodyText, "0123");
});

test("connectTimeoutMs caps a caller-supplied timeout that exceeds it", async () => {
  const transport = new ScriptedTransport([{ status: 200, headers: {}, bodyText: "ok" }]);
  const client = createHttpClient({ transport, policy: makePolicy({ connectTimeoutMs: 500 }) });

  await client.send(makeRequest({ url: "https://example.com/", timeoutMs: 60_000 }));
  assert.equal(transport.calls[0].req.timeoutMs, 500);
});

test("rejects a scheme not in the policy's allowedSchemes", async () => {
  const transport = new ScriptedTransport([{ status: 200, headers: {}, bodyText: "" }]);
  const client = createHttpClient({ transport, policy: makePolicy({ allowedSchemes: ["https"] }) });

  await assert.rejects(() => client.send(makeRequest({ url: "http://example.com/" })));
});

test("rejects a target URL carrying embedded credentials", async () => {
  const transport = new ScriptedTransport([{ status: 200, headers: {}, bodyText: "" }]);
  const client = createHttpClient({ transport, policy: makePolicy() });

  await assert.rejects(() => client.send(makeRequest({ url: "https://user:pass@example.com/" })));
});
