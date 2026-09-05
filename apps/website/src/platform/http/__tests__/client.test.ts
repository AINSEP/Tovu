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

// -------------------------------------------------------------------------------------------
// Characterization tests for `classifyIpv4`'s exact range boundaries, pinned before an internal
// refactor of that function (extraction only, no ranges added/removed/reordered).
// -------------------------------------------------------------------------------------------

test("classifyAddress: RFC1918 172.16/12 boundaries are exact, not off-by-one", () => {
  assert.equal(classifyAddress("172.15.255.255"), "public"); // just below the private block
  assert.equal(classifyAddress("172.16.0.0"), "private"); // first private address
  assert.equal(classifyAddress("172.31.255.255"), "private"); // last private address
  assert.equal(classifyAddress("172.32.0.0"), "public"); // just above the private block
});

test("classifyAddress: CGNAT (RFC 6598 100.64.0.0/10) is treated as private, exact boundaries", () => {
  // Shared/carrier-grade-NAT space is not globally routable — blocked like the RFC1918 ranges.
  assert.equal(classifyAddress("100.63.255.255"), "public"); // just below the CGNAT block
  assert.equal(classifyAddress("100.64.0.0"), "private"); // first CGNAT address
  assert.equal(classifyAddress("100.100.0.1"), "private");
  assert.equal(classifyAddress("100.127.255.255"), "private"); // last CGNAT address
  assert.equal(classifyAddress("100.128.0.0"), "public"); // just above the CGNAT block
});

test("classifyAddress: reserved and multicast IPv4 ranges fail closed", () => {
  assert.equal(classifyAddress("0.0.0.0"), "reserved");
  assert.equal(classifyAddress("0.1.2.3"), "reserved");
  assert.equal(classifyAddress("223.255.255.255"), "public"); // just below multicast
  assert.equal(classifyAddress("224.0.0.1"), "reserved"); // multicast
  assert.equal(classifyAddress("239.255.255.255"), "reserved"); // end of multicast
  assert.equal(classifyAddress("240.0.0.1"), "reserved"); // reserved/future
  assert.equal(classifyAddress("255.255.255.255"), "reserved"); // limited broadcast
});

test("classifyAddress: malformed input fails closed to reserved, never public", () => {
  assert.equal(classifyAddress("not-an-ip"), "reserved");
  assert.equal(classifyAddress("999.999.999.999"), "reserved");
  assert.equal(classifyAddress(""), "reserved");
  assert.equal(classifyAddress("10.0.0"), "reserved"); // incomplete IPv4
});

// -------------------------------------------------------------------------------------------
// Characterization tests for `classifyIpv6`'s exact range boundaries, pinned before an internal
// refactor of that function (extraction only, no ranges added/removed/reordered — mirrors
// `classifyIpv4`'s own boundary tests above).
// -------------------------------------------------------------------------------------------

test("classifyAddress: IPv6 loopback and unspecified are exact single addresses, not ranges", () => {
  assert.equal(classifyAddress("::1"), "loopback");
  assert.equal(classifyAddress("::"), "reserved"); // unspecified address
  assert.equal(classifyAddress("::0"), "reserved");
  assert.equal(classifyAddress("::0.0.0.0"), "reserved"); // deprecated IPv4-compatible notation
  assert.equal(classifyAddress("::2"), "public"); // one past unspecified/loopback — not special
});

test("classifyAddress: IPv6 link-local fe80::/10 boundaries are exact, not off-by-one", () => {
  assert.equal(classifyAddress("fe7f::1"), "public"); // just below the link-local block
  assert.equal(classifyAddress("fe80::1"), "link-local"); // first address of the block
  assert.equal(classifyAddress("febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff"), "link-local"); // last address
  assert.equal(classifyAddress("fec0::1"), "public"); // just above the link-local block
});

test("classifyAddress: IPv6 unique-local fc00::/7 covers both the fc and fd halves, with exact boundaries", () => {
  assert.equal(classifyAddress("fbff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"), "public"); // just below
  assert.equal(classifyAddress("fc00::1"), "private"); // first address of the fc half
  assert.equal(classifyAddress("fcff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"), "private"); // last of fc half
  assert.equal(classifyAddress("fd00::1"), "private"); // first address of the fd half
  assert.equal(classifyAddress("fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"), "private"); // last address of the block
  assert.equal(classifyAddress("fe00::1"), "public"); // just above
});

test("classifyAddress: IPv4-mapped IPv6 (dotted-decimal form) is normalized before classification", () => {
  assert.equal(classifyAddress("::ffff:127.0.0.1"), "loopback");
  assert.equal(classifyAddress("::ffff:10.0.0.1"), "private");
  assert.equal(classifyAddress("::ffff:8.8.8.8"), "public");
});

test("classifyAddress: IPv4-mapped IPv6 written in HEX form (not dotted-decimal) is normalized the same as the dotted spelling", () => {
  // `::ffff:a00:1` and `::ffff:10.0.0.1` name the SAME address (10.0.0.1 mapped into IPv6) — both
  // must classify identically. A URL target of `https://[::ffff:a00:1]/` reaches this exact path
  // (the hostname is a literal IPv6 address, so `resolveHostAddresses` never touches DNS), so the
  // hex spelling must not be a bypass of the dotted-decimal one.
  assert.equal(classifyAddress("::ffff:a00:1"), "private"); // hex form of 10.0.0.1
  assert.equal(classifyAddress("::ffff:7f00:1"), "loopback"); // hex form of 127.0.0.1
  assert.equal(classifyAddress("::ffff:c0a8:1"), "private"); // hex form of 192.168.0.1
  assert.equal(classifyAddress("::ffff:808:808"), "public"); // hex form of 8.8.8.8
});

test("classifyAddress: IPv4-mapped IPv6 normalizes regardless of ::-compression, not just the two documented spellings", () => {
  // Same value (127.0.0.1 mapped), three different valid ways to write it: fully expanded with no
  // compression at all, fully expanded but with the low 32 bits still in dotted form, and the
  // ordinary compressed hex form already covered above. All three must agree.
  assert.equal(classifyAddress("0:0:0:0:0:ffff:7f00:1"), "loopback"); // fully expanded, hex tail
  assert.equal(classifyAddress("0:0:0:0:0:ffff:127.0.0.1"), "loopback"); // fully expanded, dotted tail
});

test("classifyAddress: a near-miss IPv6 literal that merely resembles a mapped address is NOT force-mapped", () => {
  // `::ffff:0:7f00:1` looks superficially like another spelling of `::ffff:7f00:1` (127.0.0.1
  // mapped), but per RFC 4291 group expansion it is a genuinely different 128-bit value: the
  // explicit "0" group after "ffff" pushes "ffff" itself to group index 4, not the index-5 position
  // the ::ffff:0:0/96 prefix requires. Blindly pattern-matching on the "::ffff:" substring would
  // wrongly force-map this to 127.0.0.1; the group-based parser must reject it and fall through to
  // ordinary (non-special) classification instead.
  assert.equal(classifyAddress("::ffff:0:7f00:1"), "public");
});

test("classifyAddress: IPv6 multicast ff00::/8 is treated as reserved (blocked), mirroring IPv4 multicast, exact boundaries", () => {
  assert.equal(classifyAddress("feff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"), "public"); // just below the block
  assert.equal(classifyAddress("ff00::1"), "reserved"); // first address of the block
  assert.equal(classifyAddress("ff02::1"), "reserved"); // all-nodes link-local multicast
  assert.equal(classifyAddress("ffff::1"), "reserved"); // last address of the block
});

test("classifyAddress: malformed IPv6-shaped input fails closed to reserved, never public", () => {
  assert.equal(classifyAddress("gggg::1"), "reserved"); // invalid hex digit
  assert.equal(classifyAddress("fe80:::1"), "reserved"); // malformed double "::"
  assert.equal(classifyAddress("1:2:3:4:5:6:7:8:9"), "reserved"); // too many groups
});

test("rejects/permits egress consistently with classifyAddress for a raw-IP CGNAT target", async () => {
  // End-to-end through resolvePinnedPeer (not just the classifier). CGNAT is private, so this must
  // be rejected pre-connect, same as any other private-range target below.
  const transport = new ScriptedTransport([{ status: 200, headers: {}, bodyText: "ok" }]);
  const client = createHttpClient({ transport, policy: makePolicy() });

  await assert.rejects(() => client.send(makeRequest({ url: "https://100.64.0.1/" })));
  assert.equal(transport.calls.length, 0, "transport must never be reached for a rejected target");
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

// -------------------------------------------------------------------------------------------
// Default User-Agent (2026-09-03) — GitHub rejects every request with no `User-Agent` header
// with a bare 403; this seam is the ONE place a default is added so every consumer (custom
// credentials, the Resend mailer, comment spam checks, webhook delivery, deploy/lipay plugins)
// gets one automatically. See `features/custom-credentials/credentialed-request.ts`'s header,
// "Authentication-failure diagnostics" / "401 vs 403", for the live incident this fixes.
// -------------------------------------------------------------------------------------------

test("adds a non-empty default User-Agent when the caller sends none", async () => {
  const transport = new ScriptedTransport([{ status: 200, headers: {}, bodyText: "ok" }]);
  const client = createHttpClient({ transport, policy: makePolicy() });

  await client.send(makeRequest({ url: "https://example.com/", headers: {} }));

  const sentHeaders = transport.calls[0].req.headers;
  assert.ok(sentHeaders["User-Agent"], "expected a non-empty User-Agent to be added");
  assert.equal(typeof sentHeaders["User-Agent"], "string");
});

test("never overrides a caller-supplied User-Agent, regardless of header-name casing", async () => {
  const transport = new ScriptedTransport([{ status: 200, headers: {}, bodyText: "ok" }]);
  const client = createHttpClient({ transport, policy: makePolicy() });

  await client.send(
    makeRequest({ url: "https://example.com/", headers: { "user-agent": "MyOwnClient/2.0" } })
  );

  const sentHeaders = transport.calls[0].req.headers;
  assert.equal(sentHeaders["user-agent"], "MyOwnClient/2.0");
  assert.equal(sentHeaders["User-Agent"], undefined, "must not add a second, differently-cased header");
});

test("the default User-Agent survives a cross-origin redirect (not a sensitive header)", async () => {
  const transport = new ScriptedTransport([
    { status: 302, headers: { location: "https://8.8.8.8/next" }, bodyText: "" },
    { status: 200, headers: {}, bodyText: "final" },
  ]);
  const client = createHttpClient({ transport, policy: makePolicy() });

  await client.send(makeRequest({ url: "https://example.com/", headers: {} }));

  assert.equal(transport.calls.length, 2);
  assert.ok(transport.calls[0].req.headers["User-Agent"]);
  assert.equal(transport.calls[1].req.headers["User-Agent"], transport.calls[0].req.headers["User-Agent"]);
});
