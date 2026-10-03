import assert from "node:assert/strict";
import test from "node:test";
import { isReadOnlyTool, type ToolExecutionContext } from "@jini-ai/core";
import { ForbiddenError } from "@jini-ai/cms/core";
import { buildDomainDnsRegistrations, domainDnsDerivedRisk, type DomainDnsToolDeps } from "../tools.js";
import type { DnsQuery, TlsStatus } from "@jini-ai/diagnostics/domain-dns";

const context = (input: unknown): ToolExecutionContext => ({ executionId: "e", principal: { id: "p" }, run: { id: "r" }, input, signal: new AbortController().signal });
function harness(options: { denied?: string; hosts?: string[]; answers?: Record<string, DnsQuery>; tlsStatus?: TlsStatus } = {}) {
  const calls: string[] = [];
  const deps: DomainDnsToolDeps = {
    workspaceId: "ws",
    authorize: async ({ permission, workspaceId, principalId, entityType }) => { assert.equal(workspaceId, "ws"); assert.equal(principalId, "p"); assert.equal(entityType, "domain-dns"); calls.push(`auth:${permission}`); return { allowed: options.denied !== permission, reason: options.denied === permission ? "insufficient_permission" : "matched" }; },
    resolver: { query: async ({ domain, type }) => { calls.push(`dns:${domain}:${type}`); return options.answers?.[`${domain}:${type}`] ?? { type, status: "no-data", records: [] }; } },
    listExpectedHosts: async () => { calls.push("hosts"); return options.hosts ?? []; },
    probeTls: async ({ domain }) => { calls.push(`tls:${domain}`); return options.tlsStatus ?? { status: "verified", httpStatus: 301 }; },
  };
  const registrations = buildDomainDnsRegistrations(deps);
  return { calls, registrations, call: (id: string, input: unknown) => registrations.find(r => r.descriptor.id === id)!.handler(context(input)) };
}
const a = (value: string): DnsQuery => ({ type: "A", status: "ok", records: [{ value, ttl: 300 }] });

test("DNS lookup returns all six requested types with exact values and authorizes before network", async () => {
  const h = harness({ answers: { "example.com:A": a("8.8.8.8"), "example.com:TXT": { type: "TXT", status: "ok", records: [{ value: '"verification=abc"', ttl: 60 }] } } });
  assert.deepEqual(await h.call("domain_lookup_dns", { domain: "EXAMPLE.COM." }), { domain: "example.com", resolver: "public-dns", untrusted: true, queries: [a("8.8.8.8"), ...["AAAA", "CNAME", "MX"].map(type => ({ type, status: "no-data", records: [] })), { type: "TXT", status: "ok", records: [{ value: '"verification=abc"', ttl: 60 }] }, { type: "NS", status: "no-data", records: [] }] });
  assert.deepEqual(h.calls, ["auth:content.read", ...["A", "AAAA", "CNAME", "MX", "TXT", "NS"].map(type => `dns:example.com:${type}`)]);
});
test("DNS type subset is preserved and NXDOMAIN is distinct from no-data", async () => {
  const h = harness({ answers: { "example.com:MX": { type: "MX", status: "not-found", records: [] } } });
  assert.deepEqual(await h.call("domain_lookup_dns", { domain: "example.com", types: ["MX"] }), { domain: "example.com", resolver: "public-dns", untrusted: true, queries: [{ type: "MX", status: "not-found", records: [] }] });
});
for (const domain of ["https://example.com", "example.com:443", "127.0.0.1", "localhost", "foo.local", "foo.internal", "a..com", "-bad.com", "example.com/path", "foo.com?x=1", "a".repeat(64) + ".com", "_acme-challenge.local", "_dmarc.example.com/path", "_acme-challenge.example._com"]) {
  test(`invalid domain ${domain} is refused without I/O`, async () => {
    const h = harness();
    await assert.rejects(h.call("domain_lookup_dns", { domain }), { name: "ToolInputError", message: "domain_lookup_dns: pass a public DNS hostname such as 'example.com', without a URL, IP address, path, or port." });
    assert.deepEqual(h.calls, []);
  });
}
for (const types of [[], ["SOA"], ["A", "A"], "A"]) {
  test(`invalid record types ${JSON.stringify(types)} refused`, async () => {
    const h = harness();
    await assert.rejects(h.call("domain_lookup_dns", { domain: "example.com", types }), { name: "ToolInputError", message: "domain_lookup_dns: types must be a non-empty list of distinct A, AAAA, CNAME, MX, TXT, or NS record types." });
    assert.deepEqual(h.calls, []);
  });
}
for (const id of ["domain_lookup_dns", "domain_check_dns", "domain_tls_status"]) {
  test(`${id} is read-only and permission denial prevents effects`, async () => {
    const permission = id === "domain_check_dns" ? "deployments.read" : "content.read";
    const h = harness({ denied: permission });
    for (const registration of h.registrations) { assert.equal(isReadOnlyTool({ descriptor: registration.descriptor }), true); assert.equal(domainDnsDerivedRisk.get(registration.descriptor.id), "none"); }
    await assert.rejects(h.call(id, { domain: "example.com" }), ForbiddenError);
    assert.deepEqual(h.calls, [`auth:${permission}`]);
  });
}
test("host comparison gates peer permission too", async () => {
  const h = harness({ denied: "publish_content.read" });
  await assert.rejects(h.call("domain_check_dns", { domain: "example.com" }), ForbiddenError);
  assert.deepEqual(h.calls, ["auth:deployments.read", "auth:publish_content.read"]);
});
test("missing independent host reports unknown without resolving anything", async () => {
  const h = harness({ hosts: ["example.com"] });
  assert.deepEqual(await h.call("domain_check_dns", { domain: "example.com" }), { domain: "example.com", status: "unknown", expectedHost: null, reason: "No independent hosting hostname is saved. Connect a publish destination or publish the site first.", untrusted: true });
  assert.deepEqual(h.calls, ["auth:deployments.read", "auth:publish_content.read", "hosts"]);
});
test("ambiguous or unsaved hosting hostname is refused before DNS", async () => {
  const h = harness({ hosts: ["one.host.com", "two.host.com"] });
  const message = "domain_check_dns: choose expectedHost from the saved hosting hostnames: one.host.com, two.host.com.";
  await assert.rejects(h.call("domain_check_dns", { domain: "example.com" }), { name: "ToolInputError", message });
  await assert.rejects(h.call("domain_check_dns", { domain: "example.com", expectedHost: "other.host.com" }), { name: "ToolInputError", message });
  assert.equal(h.calls.some(c => c.startsWith("dns:")), false);
});
test("matching host DNS exposes expected and observed records, with a routing limitation", async () => {
  const h = harness({ hosts: ["app.host.com"], answers: { "example.com:A": a("8.8.8.8"), "app.host.com:A": a("8.8.8.8") } });
  assert.deepEqual(await h.call("domain_check_dns", { domain: "example.com" }), { domain: "example.com", expectedHost: "app.host.com", status: "matches-host-dns", expectationSource: "host-dns", expected: { A: ["8.8.8.8"], AAAA: [] }, observed: { A: ["8.8.8.8"], AAAA: [], CNAME: [] }, unexpected: { A: [], AAAA: [] }, missing: { A: [], AAAA: [] }, untrusted: true, limitation: "Compares current public DNS, not provider-required records. Shared/CDN addresses do not prove that traffic reaches the correct app." });
});
test("one matching A cannot hide a wrong AAAA or an extra wrong A", async () => {
  const h = harness({ hosts: ["app.host.com"], answers: { "example.com:A": { ...a("8.8.8.8"), records: [{ value: "8.8.8.8", ttl: 300 }, { value: "1.1.1.1", ttl: 300 }] }, "example.com:AAAA": { type: "AAAA", status: "ok", records: [{ value: "2606:4700::1111", ttl: 300 }] }, "app.host.com:A": a("8.8.8.8") } });
  const result = await h.call("domain_check_dns", { domain: "example.com" });
  assert.ok(typeof result === "object" && result !== null && "status" in result && "unexpected" in result);
  assert.equal(result.status, "mismatch");
  assert.deepEqual(result.unexpected, { A: ["1.1.1.1"], AAAA: ["2606:4700::1111"] });
});
test("host without address answers remains unknown, even when both have no records", async () => {
  const h = harness({ hosts: ["app.host.com"] });
  const result = await h.call("domain_check_dns", { domain: "example.com" });
  assert.ok(typeof result === "object" && result !== null && "status" in result);
  assert.equal(result.status, "unknown");
});
test("TLS tool reports verification and explicitly unavailable certificate metadata", async () => {
  const h = harness();
  assert.deepEqual(await h.call("domain_tls_status", { domain: "example.com" }), { domain: "example.com", status: "verified", httpStatus: 301, certificate: { expiresAt: null, issuer: null }, limitation: "Checks certificate trust, hostname, and validity through HTTPS. Certificate issuer and expiry date are not exposed by this client." });
  assert.deepEqual(h.calls, ["auth:content.read", "tls:example.com"]);
});
test("DNS input uses IDNA without silently accepting URL separators", async () => {
  const h = harness();
  const result = await h.call("domain_lookup_dns", { domain: "bücher.de", types: ["NS"] });
  assert.ok(typeof result === "object" && result !== null && "domain" in result);
  assert.equal(result.domain, "xn--bcher-kva.de");
  assert.deepEqual(h.calls, ["auth:content.read", "dns:xn--bcher-kva.de:NS"]);
});
test("DNS lookup supports ACME and mail-verification owner names from the chat evidence", async () => {
  for (const domain of ["_acme-challenge.www.example.com", "selector._domainkey.example.com", "_dmarc.example.com"]) {
    const answer: DnsQuery = { type: "TXT", status: "ok", records: [{ value: '"verification=abc"', ttl: 60 }] };
    const h = harness({ answers: { [`${domain}:TXT`]: answer } });
    assert.deepEqual(await h.call("domain_lookup_dns", { domain: domain.toUpperCase() + ".", types: ["TXT"] }), {
      domain, resolver: "public-dns", untrusted: true, queries: [answer],
    });
    assert.deepEqual(h.calls, ["auth:content.read", `dns:${domain}:TXT`]);
  }
});
test("underscore DNS owners cannot become TLS or custom-domain hostnames", async () => {
  for (const id of ["domain_check_dns", "domain_tls_status"]) {
    const h = harness();
    await assert.rejects(h.call(id, { domain: "_acme-challenge.example.com" }), {
      name: "ToolInputError", message: `${id}: pass a public DNS hostname such as 'example.com', without a URL, IP address, path, or port.`,
    });
    assert.deepEqual(h.calls, []);
  }
});
test("invalid domain on host and TLS tools is rejected before effects", async () => {
  for (const id of ["domain_check_dns", "domain_tls_status"]) {
    const h = harness();
    await assert.rejects(h.call(id, { domain: "https://example.com" }), { name: "ToolInputError", message: `${id}: pass a public DNS hostname such as 'example.com', without a URL, IP address, path, or port.` });
    assert.deepEqual(h.calls, []);
  }
});
test("independent host can be chosen among several saved hosts, normalizing input", async () => {
  const h = harness({ hosts: ["app.host.com", "second.host.com"], answers: { "example.com:A": a("8.8.8.8"), "app.host.com:A": a("8.8.8.8") } });
  const result = await h.call("domain_check_dns", { domain: "example.com", expectedHost: "APP.HOST.COM." });
  assert.ok(typeof result === "object" && result !== null && "expectedHost" in result);
  assert.equal(result.expectedHost, "app.host.com");
  assert.equal(h.calls.some(call => call.includes("second.host.com")), false);
});
test("equivalent IPv6 spelling compares equally and a missing address is exposed", async () => {
  const h = harness({ hosts: ["app.host.com"], answers: {
    "example.com:AAAA": { type: "AAAA", status: "ok", records: [{ value: "2606:4700:0000:0000:0000:0000:0000:1111", ttl: 60 }] },
    "app.host.com:AAAA": { type: "AAAA", status: "ok", records: [{ value: "2606:4700::1111", ttl: 60 }] },
    "app.host.com:A": a("8.8.8.8"),
  } });
  const result = await h.call("domain_check_dns", { domain: "example.com" });
  assert.ok(typeof result === "object" && result !== null && "status" in result && "missing" in result && "unexpected" in result);
  assert.equal(result.status, "mismatch");
  assert.deepEqual(result.missing, { A: ["8.8.8.8"], AAAA: [] });
  assert.deepEqual(result.unexpected, { A: [], AAAA: [] });
});

for (const status of ["invalid", "unavailable"] as const) {
  test(`TLS handler preserves ${status} as a distinct certificate outcome`, async () => {
    const h = harness({ tlsStatus: { status, httpStatus: null } });
    assert.deepEqual(await h.call("domain_tls_status", { domain: "example.com" }), { domain: "example.com", status, httpStatus: null, certificate: { expiresAt: null, issuer: null }, limitation: "Checks certificate trust, hostname, and validity through HTTPS. Certificate issuer and expiry date are not exposed by this client." });
  });
}
