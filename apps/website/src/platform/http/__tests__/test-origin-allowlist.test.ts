import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import type { HttpRequest, HttpResponse, PinnedPeer } from "../ports.js";
import type { HttpTransportAdapter } from "../ports.js";
import { EgressRefusedError } from "../index.js";
import { createDefaultHttpClient } from "../client.js";
import { MEDIA_IMPORT_EGRESS_POLICY, WEB_FETCH_EGRESS_POLICY } from "../egress-policies.js";
import { createTestOriginHttpClientFactory, parseTestOrigins } from "../test-origin-allowlist.js";

/**
 * @file The harness-only loopback seam opens exactly the named origins, on every hop, and
 * production composition never supplies one. The guard, DNS classification and redirect loop are
 * the real ones; only the socket (transport) and public DNS are replaced.
 */

const FIXTURE = "http://127.0.0.1:41234";
const dns = { resolve: async ({ hostname }: { hostname: string }) => (hostname === "localhost" ? ["127.0.0.1"] : ["93.184.216.34"]) };

function recordingTransport(answer: (request: HttpRequest) => HttpResponse): HttpTransportAdapter & { hops: Array<{ url: string; peer: PinnedPeer }> } {
  const hops: Array<{ url: string; peer: PinnedPeer }> = [];
  return {
    hops,
    async requestPinned(request, peer) {
      hops.push({ url: request.url, peer });
      return answer(request);
    },
  };
}

const ok = (): HttpResponse => ({ status: 200, headers: {}, bodyText: "fixture" });
const redirectTo = (location: string) => (request: HttpRequest): HttpResponse =>
  request.url.startsWith(FIXTURE) ? { status: 302, headers: { location }, bodyText: "" } : ok();
const get = (url: string): HttpRequest => ({ method: "GET", url, headers: {}, timeoutMs: 5_000 });

function clientFor(transport: HttpTransportAdapter, policy = WEB_FETCH_EGRESS_POLICY) {
  return createTestOriginHttpClientFactory({ allowedOrigins: [FIXTURE] }, { transport, dns })(policy);
}

test("production composition: no origins means the stock factory, which refuses 127.0.0.1", async () => {
  assert.equal(createTestOriginHttpClientFactory({ allowedOrigins: [] }), createDefaultHttpClient);
  // A loopback literal is classified before any socket opens, so this makes no network call.
  await assert.rejects(createDefaultHttpClient(WEB_FETCH_EGRESS_POLICY).send(get(`${FIXTURE}/`)), EgressRefusedError);
  await assert.rejects(createDefaultHttpClient(MEDIA_IMPORT_EGRESS_POLICY).send(get(`${FIXTURE}/a.png`)), EgressRefusedError);
});

test("production entrypoints never pass test origins; only the composition seams name them", async () => {
  const src = path.resolve(import.meta.dirname, "../../..");
  for (const entry of ["index.ts", "cli/commands/serve.ts", "server/inbound/assistant/agent-daemon-server.ts"]) {
    const text = await readFile(path.join(src, entry), "utf8");
    assert.doesNotMatch(text, /outboundTestOrigins|createTestOriginHttpClientFactory/, entry);
  }
});

test("the allowlisted origin is reached over plain http, pinned to loopback", async () => {
  const transport = recordingTransport(ok);
  const response = await clientFor(transport, MEDIA_IMPORT_EGRESS_POLICY).send(get(`${FIXTURE}/a.png`));
  assert.equal(response.status, 200);
  assert.deepEqual(transport.hops.map((hop) => [hop.url, hop.peer.ip, hop.peer.port]), [[`${FIXTURE}/a.png`, "127.0.0.1", 41234]]);
});

test("another port on the same loopback host is still refused, before any socket", async () => {
  const transport = recordingTransport(ok);
  await assert.rejects(clientFor(transport).send(get("http://127.0.0.1:41235/")), EgressRefusedError);
  assert.deepEqual(transport.hops, []);
});

test("localhost is not the allowlisted origin even though it resolves to the same address", async () => {
  const transport = recordingTransport(ok);
  await assert.rejects(clientFor(transport).send(get("http://localhost:41234/")), EgressRefusedError);
  assert.deepEqual(transport.hops, []);
});

for (const target of ["http://127.0.0.1:9/", "http://10.0.0.1/", "http://169.254.169.254/latest/meta-data/", "http://localhost:41234/"]) {
  test(`a redirect from the allowlisted origin to ${target} is refused at that hop`, async () => {
    const transport = recordingTransport(redirectTo(target));
    await assert.rejects(clientFor(transport).send(get(`${FIXTURE}/start`)), EgressRefusedError);
    assert.deepEqual(transport.hops.map((hop) => hop.url), [`${FIXTURE}/start`]);
  });
}

test("a redirect to a public http host keeps the CALLER's policy: https-only media refuses it, web fetch follows it", async () => {
  const media = recordingTransport(redirectTo("http://example.com/a.png"));
  await assert.rejects(clientFor(media, MEDIA_IMPORT_EGRESS_POLICY).send(get(`${FIXTURE}/a.png`)), EgressRefusedError);
  assert.equal(media.hops.length, 1);

  const web = recordingTransport(redirectTo("http://example.com/page"));
  const response = await clientFor(web).send(get(`${FIXTURE}/page`));
  assert.equal(response.status, 200);
  assert.deepEqual(web.hops.map((hop) => [hop.url, hop.peer.ip]), [[`${FIXTURE}/page`, "127.0.0.1"], ["http://example.com/page", "93.184.216.34"]]);
});

test("only exact loopback-literal origins with an explicit port are accepted", () => {
  assert.deepEqual([...parseTestOrigins({ origins: [FIXTURE, "https://[::1]:8443"] })], [FIXTURE, "https://[::1]:8443"]);
  for (const bad of ["http://localhost:41234", "http://10.0.0.1:80", "http://127.0.0.1", "http://127.0.0.1:41234/path", "ftp://127.0.0.1:21", "http://user@127.0.0.1:1", "not a url"]) {
    assert.throws(() => parseTestOrigins({ origins: [bad] }), TypeError, bad);
  }
});
