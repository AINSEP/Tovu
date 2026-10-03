import assert from "node:assert/strict";
import test from "node:test";
import { ToolInputError } from "@jini-ai/core";
import { EgressRefusedError, type HttpRequest } from "#src/platform/http/index";

let resolvedAddress = "8.8.8.8";
let dnsLookups = 0;
const dns = { resolve: async () => { dnsLookups++; return [resolvedAddress]; } };
const { createHttpClient } = await import("#src/platform/http/client");
const { createPublicDnsResolver, createTlsProbe, listSavedHostingHosts, DOMAIN_DNS_EGRESS_POLICY } = await import("../domain-dns-adapters.js");

function clientReturning(body: unknown, status = 200, truncated = false) {
  const requests: HttpRequest[] = [];
  return { requests, client: { send: async (request: HttpRequest) => { requests.push(request); return { status, headers: {}, bodyText: JSON.stringify(body), bodyTruncated: truncated }; } } };
}
test("public resolver sends only a bounded GET to its fixed DoH endpoint and keeps requested records", async () => {
  const h = clientReturning({ Status: 0, Answer: [{ name: "example.com.", type: 1, TTL: 120, data: "8.8.8.8" }, { name: "example.com.", type: 5, TTL: 30, data: "alias.example.com." }] });
  const signal = new AbortController().signal;
  assert.deepEqual(await createPublicDnsResolver(h.client, { createDeadline: () => signal }).query({ domain: "example.com", type: "A" }), { type: "A", status: "ok", records: [{ value: "8.8.8.8", ttl: 120 }] });
  assert.deepEqual(h.requests, [{ method: "GET", url: "https://cloudflare-dns.com/dns-query?name=example.com&type=A", headers: { Accept: "application/dns-json" }, timeoutMs: 15000, signal, maxResponseBytes: 65536 }]);
});
test("ACME DNS owner names reach only the fixed public resolver, never an HTTPS target", async () => {
  const h = clientReturning({ Status: 0, Answer: [{ name: "_acme-challenge.example.com.", type: 5, TTL: 60, data: "validation.host.com." }] });
  assert.deepEqual(await createPublicDnsResolver(h.client).query({ domain: "_acme-challenge.example.com", type: "CNAME" }), {
    type: "CNAME", status: "ok", records: [{ value: "validation.host.com.", ttl: 60 }],
  });
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0]!.url, "https://cloudflare-dns.com/dns-query?name=_acme-challenge.example.com&type=CNAME");
  await assert.rejects(createTlsProbe(h.client)({ domain: "_acme-challenge.example.com" }), {
    name: "ToolInputError", message: "domain_tls_status: pass a public DNS hostname such as 'example.com', without a URL, IP address, path, or port.",
  });
  assert.equal(h.requests.length, 1);
});
for (const [type, code, data] of [["AAAA", 28, "2606:4700::1111"], ["MX", 15, "10 mail.example.com."], ["TXT", 16, '"v=spf1 -all"'], ["NS", 2, "ns1.example.com."], ["CNAME", 5, "app.host.com."]] as const) {
  test(`DoH supports ${type}`, async () => {
    const h = clientReturning({ Status: 0, Answer: [{ name: "example.com.", type: code, TTL: 60, data }] });
    assert.deepEqual(await createPublicDnsResolver(h.client).query({ domain: "example.com", type }), { type, status: "ok", records: [{ value: data, ttl: 60 }] });
  });
}
for (const [body, expected] of [[{ Status: 3 }, "not-found"], [{ Status: 0 }, "no-data"]] as const) {
  test(`DNS ${expected} is not a transport failure`, async () => {
    assert.deepEqual(await createPublicDnsResolver(clientReturning(body).client).query({ domain: "example.com", type: "A" }), { type: "A", status: expected, records: [] });
  });
}
for (const [body, status, truncated] of [[{ Status: 0, TC: true }, 200, false], [{ Status: 2 }, 200, false], [{ Status: 0 }, 503, false], [{ Status: 0 }, 200, true], [{}, 200, false], [{ Status: 0, Answer: "bad" }, 200, false], [{ Status: 0, Answer: [{ name: "example.com.", type: 1, TTL: 60, data: "bad" }] }, 200, false]] as const) {
  test(`unusable DNS reply ${JSON.stringify(body)} refuses instead of claiming no records`, async () => {
    await assert.rejects(createPublicDnsResolver(clientReturning(body, status, truncated).client).query({ domain: "example.com", type: "A" }), { name: "ToolInputError", message: "domain_lookup_dns: the public DNS resolver could not answer. Try again later; no DNS conclusion was reached." });
  });
}
for (const data of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "100.64.0.1", "224.0.0.1", "::1", "0:0:0:0:0:0:0:1", "fc00::1", "::ffff:127.0.0.1"]) {
  test(`DNS refuses non-public address ${data} without reflecting it`, async () => {
    const type = data.includes(":") ? "AAAA" : "A";
    const h = clientReturning({ Status: 0, Answer: [{ name: "example.com.", type: type === "A" ? 1 : 28, TTL: 60, data }] });
    await assert.rejects(createPublicDnsResolver(h.client).query({ domain: "example.com", type }), { name: "ToolInputError", message: "domain_lookup_dns: public DNS returned a non-public address. Internal addresses cannot be inspected with this tool." });
  });
}
test("DNS response caps refuse excess records and record values", async () => {
  for (const answers of [Array.from({ length: 51 }, () => ({ name: "example.com.", type: 16, TTL: 60, data: '"txt"' })), [{ name: "example.com.", type: 16, TTL: 60, data: "x".repeat(4097) }]]) {
    await assert.rejects(createPublicDnsResolver(clientReturning({ Status: 0, Answer: answers }).client).query({ domain: "example.com", type: "TXT" }), {
      name: "ToolInputError", message: "domain_lookup_dns: the public DNS resolver could not answer. Try again later; no DNS conclusion was reached.",
    });
  }
});
test("HTTPS probe sends a credential-free HEAD and treats 404 as successful certificate validation", async () => {
  const h = clientReturning({}, 404);
  const signal = new AbortController().signal;
  assert.deepEqual(await createTlsProbe(h.client, { createDeadline: () => signal })({ domain: "example.com" }), { status: "verified", httpStatus: 404 });
  assert.deepEqual(h.requests, [{ method: "HEAD", url: "https://example.com/", headers: {}, timeoutMs: 15000, signal, maxResponseBytes: 65536 }]);
});
for (const [code, status] of [["CERT_HAS_EXPIRED", "invalid"], ["ERR_TLS_CERT_ALTNAME_INVALID", "invalid"], ["ECONNRESET", "unavailable"], [undefined, "unavailable"]] as const) {
  test(`TLS failure ${code} is sanitized and accurately classified`, async () => {
    const client = { send: async () => { throw Object.assign(new Error("secret internal details"), { code }); } };
    assert.deepEqual(await createTlsProbe(client)({ domain: "example.com" }), { status, httpStatus: null });
  });
}
test("egress refusal uses only the caller-safe message", async () => {
  const client = { send: async () => { throw new EgressRefusedError({ message: "private address 10.2.3.4" }, { callerSafeMessage: "non-public destination refused" }); } };
  await assert.rejects(createTlsProbe(client)({ domain: "example.com" }), { name: "ToolInputError", message: "domain_tls_status: non-public destination refused" });
});
test("production policy blocks all non-public addresses before transport and rechecks subsequent lookups", async () => {
  let connected = 0;
  const client = createHttpClient({ policy: DOMAIN_DNS_EGRESS_POLICY, transport: { requestPinned: async (request, peer) => { connected++; assert.equal(peer.ip, "8.8.8.8"); return { status: 302, headers: { location: "https://other.example/" }, bodyText: "" }; } } }, { dns });
  assert.deepEqual(DOMAIN_DNS_EGRESS_POLICY, { allowedSchemes: ["https"], denyPrivateAddresses: true, devHostAllowlist: [], maxRedirects: 0, connectTimeoutMs: 15000, maxResponseBytes: 65536, maxDecompressedBytes: 65536 });
  resolvedAddress = "8.8.8.8";
  assert.deepEqual(await createTlsProbe(client)({ domain: "example.com" }), { status: "verified", httpStatus: 302 });
  assert.equal(connected, 1);
  for (const address of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "100.64.0.1", "224.0.0.1", "::1", "fc00::1", "ff02::1"]) {
    resolvedAddress = address;
    await assert.rejects(createTlsProbe(client)({ domain: "example.com" }), ToolInputError);
    assert.equal(connected, 1);
  }
  resolvedAddress = "8.8.8.8";
});
test("known hosting addresses are workspace scoped, credential-free HTTPS URLs from current peers and latest successful target publishes", async () => {
  const calls: unknown[] = [];
  const deps = {
    workspaceId: "ws", publishContentPeerRepo: { listByWorkspace: async input => { calls.push(input); return [{ baseUrl: "https://app.fly.dev" }, { baseUrl: "http://private.local" }, { baseUrl: "https://user:secret@leak.com" }]; } },
    publishHistoryStore: { list: async input => { calls.push(input); return [{ target: "netlify", url: "https://new.netlify.app", reachable: true }, { target: "netlify", url: "https://old.netlify.app", reachable: true }, { target: "s3", url: "https://unverified.com", reachable: false }]; } },
  };
  assert.deepEqual(await listSavedHostingHosts(deps), ["app.fly.dev", "new.netlify.app"]);
  assert.deepEqual(calls, [{ workspaceId: "ws" }, { workspaceId: "ws", limit: 100 }]);
});
test("an unconfirmed upload cannot erase the last confirmed hosting address", async () => {
  const deps = {
    workspaceId: "ws", publishContentPeerRepo: { listByWorkspace: async () => [] },
    publishHistoryStore: { list: async () => [
      { target: "s3", url: "https://unconfirmed.host.com", reachable: false },
      { target: "s3", url: "https://confirmed.host.com", reachable: true },
      { target: "s3", url: "https://older.host.com", reachable: true },
    ] },
  };
  assert.deepEqual(await listSavedHostingHosts(deps), ["confirmed.host.com"]);
});
test("resolver transport failures never become a false empty DNS answer", async () => {
  await assert.rejects(createPublicDnsResolver({ send: async () => { throw new Error("secret network detail"); } }).query({ domain: "example.com", type: "A" }), { name: "ToolInputError", message: "domain_lookup_dns: the public DNS resolver could not answer. Try again later; no DNS conclusion was reached." });
});
test("one bad answer rejects the entire DNS response instead of returning the good subset", async () => {
  const h = clientReturning({ Status: 0, Answer: [{ name: "example.com.", type: 1, TTL: 60, data: "8.8.8.8" }, { name: "example.com.", type: 1, TTL: -1, data: "1.1.1.1" }] });
  await assert.rejects(createPublicDnsResolver(h.client).query({ domain: "example.com", type: "A" }), { name: "ToolInputError", message: "domain_lookup_dns: the public DNS resolver could not answer. Try again later; no DNS conclusion was reached." });
});
test("wrapped certificate errors still classify invalid without raw error text", async () => {
  const client = { send: async () => { throw new Error("request failed", { cause: Object.assign(new Error("secret"), { code: "DEPTH_ZERO_SELF_SIGNED_CERT" }) }); } };
  assert.deepEqual(await createTlsProbe(client)({ domain: "example.com" }), { status: "invalid", httpStatus: null });
});
test("outbound diagnostics report successful and failed outcomes without DNS/certificate payloads", async () => {
  const events: unknown[] = [];
  const options = { observe: (event: unknown) => { events.push(event); } };
  await createPublicDnsResolver(clientReturning({ Status: 0 }).client, options).query({ domain: "example.com", type: "A" });
  await createTlsProbe(clientReturning({}, 200).client, options)({ domain: "example.com" });
  await createTlsProbe({ send: async () => { throw Object.assign(new Error("secret"), { code: "CERT_HAS_EXPIRED" }); } }, options)({ domain: "example.com" });
  assert.deepEqual(events, [{ operation: "dns", outcome: "no-data" }, { operation: "tls", outcome: "verified" }, { operation: "tls", outcome: "invalid" }]);
});

test("an expired injected deadline stops the guarded TLS probe before DNS or transport", async () => {
  let connections = 0;
  const client = createHttpClient({ policy: DOMAIN_DNS_EGRESS_POLICY, transport: { requestPinned: async () => { connections++; throw new Error("must not connect"); } } }, { dns });
  const signal = AbortSignal.abort(new Error("deadline"));
  const lookupsBefore = dnsLookups;
  assert.deepEqual(await createTlsProbe(client, { createDeadline: () => signal })({ domain: "example.com" }), { status: "unavailable", httpStatus: null });
  assert.equal(connections, 0);
  assert.equal(dnsLookups, lookupsBefore);
});
