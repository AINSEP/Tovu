import assert from "node:assert/strict";
import test from "node:test";
import { isReadOnlyTool, type ToolExecutionContext } from "@jini-ai/core";
import { ForbiddenError } from "@jini-ai/cms/core";
import { createDnsProviderRegistry } from "@jini-ai/devops/dns";
import { buildDnsChangeRegistrations, contributeDomainDnsAndChangeTools, dnsChangeDerivedRisk, readDnsChangeInput, type DnsChangeToolDeps } from "../dns-tools.js";
import { context, fakeAuthoritative, memoryBindings } from "./dns-fakes.js";

/**
 * @file The `dns_plan` / `dns_instructions` / `dns_verify` tools: input is validated before any
 * authorization or DNS read, each tool checks its own permission first, `dns_verify` is the only
 * one that saves state, and both tool sets share the one `domain-dns` contributor.
 */

const NS = ["ns1.dns.test"];
const T0 = Date.parse("2026-10-21T12:00:00.000Z");
const ctx = (input: unknown): ToolExecutionContext => ({ executionId: "e", principal: { id: "p" }, run: { id: "r" }, input, signal: new AbortController().signal });
const site = { purpose: "site", records: [{ type: "A", name: "www.example.com", value: "203.0.113.10" }] };

function harness(optional: { denied?: string; bindings?: boolean; zones?: Record<string, string[]>; records?: Record<string, string[]> } = {}) {
  const calls: string[] = [];
  const resolver = fakeAuthoritative({ zones: optional.zones ?? { "example.com": NS }, records: optional.records ?? {} });
  const bindings = memoryBindings();
  const deps: DnsChangeToolDeps = {
    workspaceId: "ws",
    authorize: async ({ permission, workspaceId, principalId, entityType }) => {
      assert.deepEqual([workspaceId, principalId, entityType], ["ws", "p", "domain-dns"]);
      calls.push(`auth:${permission}`);
      return { allowed: optional.denied !== permission, reason: optional.denied === permission ? "insufficient_permission" : "matched" };
    },
    registry: createDnsProviderRegistry({ resolver }), resolver, context,
    ...(optional.bindings === false ? {} : { bindings }),
    now: () => T0,
  };
  const registrations = buildDnsChangeRegistrations(deps);
  const call = (id: string, input: unknown) => registrations.find(registration => registration.descriptor.id === id)!.handler(ctx(input)) as Promise<Record<string, unknown>>;
  return { calls, resolver, bindings, registrations, call };
}

test("input: a full requirement is normalized, defaults fill domain and providerId, and optional fields are kept", () => {
  const full = { purpose: "mail", domain: "Example.COM", providerId: "mailer", caa: { issuer: "letsencrypt.org" }, records: [{ type: "MX", name: "EXAMPLE.com.", value: "mx.test", ttl: 3600, priority: 10, note: "inbound" }] };
  assert.deepEqual(readDnsChangeInput({ input: { hostname: "WWW.Example.com", requirements: [full, site] }, errorPrefix: "dns_plan" }), {
    hostname: "www.example.com",
    requirements: [
      { purpose: "mail", domain: "example.com", providerId: "mailer", caa: { issuer: "letsencrypt.org" }, records: [{ type: "MX", name: "example.com", value: "mx.test", ttl: 3600, priority: 10, note: "inbound" }] },
      { purpose: "site", domain: "www.example.com", providerId: "site", records: [{ type: "A", name: "www.example.com", value: "203.0.113.10" }] },
    ],
  });
  assert.deepEqual(readDnsChangeInput({ input: { hostname: "example.com" }, errorPrefix: "dns_plan" }), { hostname: "example.com" });
});

const REQUIREMENT_REFUSALS: Array<[string, unknown]> = [
  ["requirements not a list", "x"], ["no requirements", []], ["eleven requirements", Array.from({ length: 11 }, () => site)],
  ["requirement not an object", ["x"]], ["requirement is a list", [[]]], ["unknown purpose", [{ ...site, purpose: "web" }]],
  ["records not a list", [{ ...site, records: "x" }]], ["no records", [{ ...site, records: [] }]], ["51 records", [{ ...site, records: Array.from({ length: 51 }, () => site.records[0]) }]],
  ["providerId not text", [{ ...site, providerId: 7 }]], ["providerId too long", [{ ...site, providerId: "p".repeat(65) }]],
  ["caa not an object", [{ ...site, caa: "x" }]], ["caa issuer not text", [{ ...site, caa: { issuer: 1 } }]],
  ["caa issuer empty", [{ ...site, caa: { issuer: "" } }]], ["caa issuer too long", [{ ...site, caa: { issuer: "a".repeat(254) } }]],
];
for (const [label, requirements] of REQUIREMENT_REFUSALS) {
  test(`input: ${label} is refused with the requirement shape`, () => {
    assert.throws(() => readDnsChangeInput({ input: { hostname: "example.com", requirements }, errorPrefix: "dns_plan" }), { name: "ToolInputError", message: /^dns_plan: requirements must be 1-10 objects/ });
  });
}

const record = site.records[0]!;
const RECORD_REFUSALS: Array<[string, unknown]> = [
  ["record not an object", "x"], ["unknown type", { ...record, type: "SOA" }], ["value not text", { ...record, value: 1 }],
  ["empty value", { ...record, value: "" }], ["value too long", { ...record, value: "v".repeat(4097) }],
  ["ttl too low", { ...record, ttl: 59 }], ["ttl not an integer", { ...record, ttl: 300.5 }], ["ttl too high", { ...record, ttl: 86401 }],
  ["priority too high", { ...record, priority: 65536 }], ["note too long", { ...record, note: "n".repeat(201) }], ["note not text", { ...record, note: 1 }],
];
for (const [label, bad] of RECORD_REFUSALS) {
  test(`input: ${label} is refused with the record shape`, () => {
    assert.throws(() => readDnsChangeInput({ input: { hostname: "example.com", requirements: [{ ...site, records: [bad] }] }, errorPrefix: "dns_verify" }), { name: "ToolInputError", message: /^dns_verify: each requirement record needs type/ });
  });
}

test("input: hostnames, record names and requirement domains go through the public-name validators", () => {
  const refuse = (input: unknown) => assert.throws(() => readDnsChangeInput({ input, errorPrefix: "dns_plan" }), { name: "ToolInputError", message: /^dns_plan: pass a public DNS hostname/ });
  refuse({ hostname: "https://example.com" });
  refuse({ hostname: "example.com", requirements: [{ ...site, domain: "localhost" }] });
  refuse({ hostname: "example.com", requirements: [{ ...site, records: [{ ...record, name: "10.0.0.1" }] }] });
  assert.equal(readDnsChangeInput({ input: { hostname: "example.com", requirements: [{ ...site, records: [{ ...record, type: "TXT", name: "_dmarc.example.com" }] }] }, errorPrefix: "dns_plan" }).requirements?.[0]?.records[0]?.name, "_dmarc.example.com");
});

test("dns_plan authorizes with deployments.read after validation and returns the plan without saving anything", async () => {
  const h = harness({ records: { "www.example.com|A": ["198.51.100.1"] } });
  await assert.rejects(h.call("dns_plan", { hostname: "bad host" }), { name: "ToolInputError" });
  assert.deepEqual(h.calls, [], "invalid input is refused before authorization");
  const result = await h.call("dns_plan", { hostname: "www.example.com", requirements: [site] });
  assert.equal(h.calls[0], "auth:deployments.read");
  assert.deepEqual({ ...result, changes: undefined, preserved: undefined, fingerprint: undefined }, {
    hostname: "www.example.com", providerId: "manual", zone: "example.com", zoneFound: true,
    delegation: { state: "delegated", nameservers: NS, reason: "example.com is delegated to ns1.dns.test." },
    inventory: "complete", changes: undefined, preserved: undefined, blockers: [], fingerprint: undefined, untrusted: true,
    next: "Nothing is applied automatically: use dns_instructions for the rows to enter, then dns_verify.",
  });
  assert.equal((result.changes as unknown[]).length, 1);
  assert.deepEqual(h.bindings.writes, []);
});

test("dns_plan with blockers says to resolve them first and reports a null delegation when no zone is found", async () => {
  const h = harness({ zones: {} });
  const result = await h.call("dns_plan", { hostname: "www.example.com", requirements: [site] });
  assert.equal(result.delegation, null);
  assert.equal(result.next, "Resolve the blockers first; dns_instructions still lists the required records.");
});

test("dns_instructions returns copyable rows, notes, blockers and the plan fingerprint", async () => {
  const h = harness();
  const result = await h.call("dns_instructions", { hostname: "www.example.com", requirements: [site] });
  assert.equal(h.calls[0], "auth:deployments.read");
  assert.deepEqual(result.rows, [{ action: "add", type: "A", name: "www.example.com", host: "www", value: "203.0.113.10", ttl: 300 }]);
  assert.deepEqual([result.hostname, result.zone, result.blockers, result.untrusted], ["www.example.com", "example.com", [], true]);
  assert.match(String(result.fingerprint), /^[0-9a-f]{64}$/);
  assert.ok(Array.isArray(result.notes));
});

test("dns_verify authorizes with deployments.publish, saves the binding and reports per-nameserver evidence", async () => {
  const h = harness({ records: { "www.example.com|A": ["203.0.113.10"] } });
  const result = await h.call("dns_verify", { hostname: "www.example.com", requirements: [site] });
  assert.equal(h.calls[0], "auth:deployments.publish");
  assert.deepEqual({ ...result, records: undefined }, {
    hostname: "www.example.com", zone: "example.com", status: "propagated", attempt: 0, startedAt: new Date(T0).toISOString(), nextCheckAt: null,
    delegation: { state: "delegated", reason: "example.com is delegated to ns1.dns.test." }, nameservers: NS, records: undefined, untrusted: true,
  });
  assert.deepEqual(result.records, [{ type: "A", name: "www.example.com", value: "203.0.113.10", state: "propagated", byNameserver: [{ nameserver: "ns1.dns.test", state: "propagated", answers: ["203.0.113.10"] }] }]);
  assert.equal(h.bindings.rows.get("www.example.com")?.status, "propagated");
});

test("dns_verify keeps the reason when the zone's nameservers cannot be read", async () => {
  const h = harness({ zones: {} });
  const result = await h.call("dns_verify", { hostname: "www.example.com", requirements: [site] });
  assert.deepEqual([result.status, result.reason], ["unknown", "The nameservers of www.example.com could not be read."]);
});

test("dns_verify refuses without a content database, after authorization and before any DNS read", async () => {
  const h = harness({ bindings: false });
  await assert.rejects(h.call("dns_verify", { hostname: "www.example.com", requirements: [site] }), { name: "ToolInputError", message: "dns_verify: this site has no content database to keep the domain's tracking state in." });
  assert.deepEqual(h.resolver.calls, []);
});

for (const [id, permission] of [["dns_plan", "deployments.read"], ["dns_instructions", "deployments.read"], ["dns_verify", "deployments.publish"]] as const) {
  test(`${id}: permission denial prevents every DNS read and write`, async () => {
    const h = harness({ denied: permission });
    await assert.rejects(h.call(id, { hostname: "www.example.com", requirements: [site] }), ForbiddenError);
    assert.deepEqual([h.calls, h.resolver.calls, h.bindings.writes], [[`auth:${permission}`], [], []]);
  });
}

test("only dns_verify is a durable write; plan and instructions are read-only", () => {
  const h = harness();
  const readOnly = Object.fromEntries(h.registrations.map(registration => [registration.descriptor.id, isReadOnlyTool({ descriptor: registration.descriptor })]));
  assert.deepEqual(readOnly, { dns_plan: true, dns_instructions: true, dns_verify: false });
  assert.deepEqual([...dnsChangeDerivedRisk], [["dns_plan", "none"], ["dns_instructions", "none"], ["dns_verify", "mutates-durable-state"]]);
});

test("one domain-dns contributor builds the diagnostics and the DNS change tools with a merged risk map", () => {
  const h = harness();
  const dnsDeps = { ...h, workspaceId: "ws" };
  void dnsDeps;
  const contributor = contributeDomainDnsAndChangeTools({
    createDeps: () => ({ workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "matched" }), resolver: { query: async ({ type }) => ({ type, status: "no-data", records: [] }) }, listExpectedHosts: async () => [], probeTls: async () => ({ status: "verified", httpStatus: 200 }) }),
    createDnsDeps: () => ({ workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "matched" }), registry: createDnsProviderRegistry({ resolver: h.resolver }), resolver: h.resolver, context, now: () => T0 }),
  });
  assert.equal(contributor.domain, "domain-dns");
  const ids = contributor.build({} as never, {} as never).map(registration => registration.descriptor.id);
  assert.deepEqual(ids, ["domain_lookup_dns", "domain_check_dns", "domain_tls_status", "dns_plan", "dns_instructions", "dns_verify"]);
  assert.deepEqual([...contributor.risk.keys()], ids);
});
