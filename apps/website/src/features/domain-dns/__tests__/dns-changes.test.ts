import assert from "node:assert/strict";
import test from "node:test";
import { providerOk, providerRejected } from "@jini-ai/core/provider-registry";
import { createDnsProviderRegistry, type AuthoritativeDnsPort, type DnsProvider } from "@jini-ai/devops/dns";
import type { DomainBinding } from "../binding.repo.js";
import { domainDnsInstructions, planDomainDns, verifyDomainDns, verifyDueDomainBindings, type DnsChangePorts } from "../dns-changes.js";
import { context, fakeAuthoritative, mailRequirement, memoryBindings, siteRequirement } from "./dns-fakes.js";

/**
 * @file The DNS change service over the REAL Jini kernel (planner, delegation, verifier, manual
 * provider) with an in-memory authoritative resolver: plan → instructions → verify, the status
 * state machine, the backoff schedule and the 48 h cap.
 */

const NS = ["ns1.dns.test", "ns2.dns.test"];
const T0 = Date.parse("2026-10-21T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

function portsFor(resolver: AuthoritativeDnsPort, optional: { seed?: DnsProvider[]; bindings?: ReturnType<typeof memoryBindings> } = {}): DnsChangePorts {
  return { registry: createDnsProviderRegistry({ resolver }, { seed: optional.seed ?? [] }), resolver, context, ...(optional.bindings ? { bindings: optional.bindings } : {}) };
}

/** A provider with a fixed zone and scripted listRecords; no instructions of its own. */
function customProvider(optional: { list?: "rejected" } = {}): DnsProvider {
  return {
    id: "custom", label: "Custom", credentialKeys: [],
    capabilities: { automatic: false, recordTypes: ["A", "TXT", "MX"], apexFlattening: true, proxy: false },
    findZone: async () => providerOk({ value: { zone: "example.com", ref: "zone-1" } }),
    listRecords: async () => (optional.list === "rejected" ? providerRejected({ code: "forbidden", message: "no" }) : providerOk({ value: { records: [], inventory: "complete" as const } })),
  };
}

const binding = (overrides: Partial<DomainBinding> = {}): DomainBinding => ({
  hostname: "www.example.com", providerId: "manual", zone: "example.com", requirements: [siteRequirement()], status: "pending",
  delegation: "delegated", attempt: 0, startedAt: iso(T0), nextCheckAt: iso(T0 + 30_000), lastCheckedAt: iso(T0), lastResult: null, ...overrides,
});

test("plan: the manual provider finds the zone past a non-delegated host, reads current records and replaces a conflicting A", async () => {
  const resolver = fakeAuthoritative({ zones: { "example.com": NS }, records: { "www.example.com|A": ["198.51.100.1"] } });
  const planned = await planDomainDns({ hostname: "www.example.com", requirements: [siteRequirement()] }, portsFor(resolver));
  assert.equal(planned.providerId, "manual");
  assert.equal(planned.zone, "example.com");
  assert.equal(planned.zoneFound, true);
  assert.equal(planned.delegation?.state, "delegated");
  assert.deepEqual(planned.blockers, []);
  assert.equal(planned.plan.inventory, "complete");
  assert.deepEqual(planned.plan.changes.map(change => [change.op, change.after?.values]), [["update", ["203.0.113.10"]]]);
  assert.match(planned.plan.fingerprint, /^[0-9a-f]{64}$/);
  assert.ok(resolver.calls.includes("ns:www.example.com"), "the most specific candidate is tried first");
});

test("plan: requirements and provider come from the saved binding when the caller passes none", async () => {
  const resolver = fakeAuthoritative({ zones: { "example.com": NS } });
  const bindings = memoryBindings([binding({ requirements: [mailRequirement] })]);
  const planned = await planDomainDns({ hostname: "www.example.com" }, portsFor(resolver, { bindings }));
  assert.deepEqual(planned.plan.changes.map(change => [change.op, change.after?.type]), [["create", "MX"], ["create", "TXT"]]);
  assert.deepEqual(bindings.writes, [], "planning never writes the binding");
});

test("plan: no requirements anywhere, or a saved provider that is not installed, is a caller error before any DNS read", async () => {
  const resolver = fakeAuthoritative({ zones: {} });
  await assert.rejects(planDomainDns({ hostname: "www.example.com" }, portsFor(resolver)), { name: "ToolInputError", message: /^dns_plan: no DNS requirements are saved for www\.example\.com/ });
  const bindings = memoryBindings([binding({ providerId: "gone" })]);
  await assert.rejects(planDomainDns({ hostname: "www.example.com" }, portsFor(resolver, { bindings })), { name: "ToolInputError", message: "dns_plan: the DNS provider 'gone' saved for www.example.com is not installed." });
  assert.deepEqual(resolver.calls, []);
});

test("plan: no zone found falls back to the saved zone (or the hostname) with zero changes and a zone_not_found blocker", async () => {
  const resolver = fakeAuthoritative({ zones: {} });
  const bare = await planDomainDns({ hostname: "www.example.com", requirements: [siteRequirement()] }, portsFor(resolver));
  assert.equal(bare.zone, "www.example.com");
  assert.equal(bare.zoneFound, false);
  assert.equal(bare.delegation, null);
  assert.deepEqual(bare.blockers.map(blocker => blocker.code), ["zone_not_found", "inventory_incomplete"]);
  assert.deepEqual(bare.plan.changes, []);
  const saved = await planDomainDns({ hostname: "www.example.com" }, portsFor(resolver, { bindings: memoryBindings([binding({ zone: "example.com" })]) }));
  assert.equal(saved.zone, "example.com");
});

test("plan: an unreadable NS answer during zone lookup is not a zone", async () => {
  const resolver = fakeAuthoritative({ zones: { "www.example.com": "unknown", "example.com": NS } });
  const planned = await planDomainDns({ hostname: "www.example.com", requirements: [siteRequirement()] }, portsFor(resolver));
  assert.equal(planned.zoneFound, false);
  assert.equal(planned.blockers[0]?.code, "zone_not_found");
});

test("plan: a zone not delegated in its parent, or whose delegation cannot be read, is blocked without listing records", async () => {
  const notDelegated = await planDomainDns({ hostname: "www.example.com", requirements: [siteRequirement()] }, portsFor(fakeAuthoritative({ zones: {} }), { seed: [customProvider()], bindings: memoryBindings([binding({ providerId: "custom", requirements: [siteRequirement()] })]) }));
  assert.equal(notDelegated.providerId, "custom");
  assert.deepEqual(notDelegated.blockers.map(blocker => [blocker.code, blocker.name]), [["not_delegated", "example.com"], ["inventory_incomplete", "example.com"]]);
  const unreadable = await planDomainDns({ hostname: "www.example.com", requirements: [siteRequirement()] }, portsFor(fakeAuthoritative({ zones: { "example.com": "unknown" } }), { seed: [customProvider()], bindings: memoryBindings([binding({ providerId: "custom" })]) }));
  assert.equal(unreadable.blockers[0]?.code, "delegation_unknown");
  assert.equal(unreadable.plan.inventory, "unknown");
});

test("plan: a provider that refuses to list records yields an unknown inventory, never an empty zone", async () => {
  const planned = await planDomainDns({ hostname: "www.example.com", requirements: [siteRequirement()] }, portsFor(fakeAuthoritative({ zones: { "example.com": NS } }), { seed: [customProvider({ list: "rejected" })], bindings: memoryBindings([binding({ providerId: "custom" })]) }));
  assert.equal(planned.plan.inventory, "unknown");
  assert.deepEqual(planned.blockers.map(blocker => blocker.code), ["inventory_incomplete"]);
});

test("instructions: the manual provider renders copyable rows; a provider without its own renderer uses the kernel's", async () => {
  const resolver = fakeAuthoritative({ zones: { "example.com": NS } });
  const manual = await domainDnsInstructions({ hostname: "www.example.com", requirements: [siteRequirement()] }, portsFor(resolver));
  assert.deepEqual(manual.instructions.rows, [{ action: "add", type: "A", name: "www.example.com", host: "www", value: "203.0.113.10", ttl: 300 }]);
  assert.equal(manual.planned.zone, "example.com");
  const custom = await domainDnsInstructions({ hostname: "www.example.com", requirements: [mailRequirement] }, portsFor(resolver, { seed: [customProvider()], bindings: memoryBindings([binding({ providerId: "custom" })]) }));
  assert.deepEqual(custom.instructions.rows.map(row => [row.type, row.host, row.priority]), [["MX", "@", 10], ["TXT", "@", undefined]]);
  await assert.rejects(domainDnsInstructions({ hostname: "www.example.com" }, portsFor(resolver)), { message: /^dns_instructions: / });
});

test("verify: first check is pending with a 30 s re-check, the next one propagates and stops scheduling", async () => {
  const records: Record<string, string[]> = {};
  const resolver = fakeAuthoritative({ zones: { "example.com": NS }, records });
  const bindings = memoryBindings();
  let now = T0;
  const ports = { ...portsFor(resolver), bindings, now: () => now };
  const first = await verifyDomainDns({ hostname: "www.example.com", requirements: [siteRequirement()] }, ports);
  assert.deepEqual({ ...first.binding, lastResult: undefined }, { ...binding({ delegation: "delegated", lastCheckedAt: iso(T0) }), lastResult: undefined });
  assert.deepEqual(first.binding.lastResult, { state: "pending", nameservers: NS, delegation: "example.com is delegated to ns1.dns.test, ns2.dns.test.", records: [{ type: "A", name: "www.example.com", value: "203.0.113.10", state: "pending" }] });
  records["www.example.com|A"] = ["203.0.113.10"];
  now = T0 + 31_000;
  const second = await verifyDomainDns({ hostname: "www.example.com" }, ports);
  assert.equal(second.binding.status, "propagated");
  assert.equal(second.binding.attempt, 1);
  assert.equal(second.binding.startedAt, iso(T0), "the window keeps its start");
  assert.equal(second.binding.nextCheckAt, null);
  assert.equal(bindings.writes.length, 2);
});

test("verify: a nameserver answering something else is a mismatch, and backoff doubles per attempt", async () => {
  const resolver = fakeAuthoritative({ zones: { "example.com": NS }, records: { "www.example.com|A": ["198.51.100.1"] } });
  const bindings = memoryBindings([binding({ attempt: 2 })]);
  const result = await verifyDomainDns({ hostname: "www.example.com" }, { ...portsFor(resolver), bindings, now: () => T0 + 60_000 });
  assert.equal(result.binding.status, "mismatch");
  assert.equal(result.binding.attempt, 3);
  assert.equal(result.binding.nextCheckAt, iso(T0 + 60_000 + 240_000));
});

test("verify: past 48 h an unpropagated binding times out; verifying a timed-out binding again starts a new window", async () => {
  const resolver = fakeAuthoritative({ zones: { "example.com": NS } });
  const late = T0 + 48 * 60 * 60 * 1000;
  const bindings = memoryBindings([binding({ attempt: 40 })]);
  const ports = { ...portsFor(resolver), bindings, now: () => late };
  const timedOut = await verifyDomainDns({ hostname: "www.example.com" }, ports);
  assert.deepEqual([timedOut.binding.status, timedOut.binding.nextCheckAt, timedOut.binding.attempt], ["timeout", null, 41]);
  const again = await verifyDomainDns({ hostname: "www.example.com" }, ports);
  assert.deepEqual([again.binding.status, again.binding.attempt, again.binding.startedAt], ["pending", 0, iso(late)]);
});

test("verify: new requirements or a moved zone restart the propagation window", async () => {
  const resolver = fakeAuthoritative({ zones: { "example.com": NS } });
  const changed = memoryBindings([binding({ attempt: 5, startedAt: iso(T0 - 1000) })]);
  const ports = { ...portsFor(resolver), now: () => T0 };
  const restarted = await verifyDomainDns({ hostname: "www.example.com", requirements: [siteRequirement("203.0.113.99")] }, { ...ports, bindings: changed });
  assert.deepEqual([restarted.binding.attempt, restarted.binding.startedAt], [0, iso(T0)]);
  const moved = memoryBindings([binding({ attempt: 5, zone: "old.test" })]);
  assert.equal((await verifyDomainDns({ hostname: "www.example.com" }, { ...ports, bindings: moved })).binding.attempt, 0);
});

test("verify: unreadable nameservers are unknown (retried), never failed, and the reason is kept", async () => {
  const resolver = fakeAuthoritative({ zones: {} });
  const bindings = memoryBindings();
  const result = await verifyDomainDns({ hostname: "www.example.com", requirements: [siteRequirement()] }, { ...portsFor(resolver), bindings, now: () => T0 });
  assert.equal(result.binding.status, "unknown");
  assert.equal(result.binding.delegation, "not_delegated");
  assert.equal(result.binding.zone, "www.example.com");
  assert.equal(result.binding.nextCheckAt, iso(T0 + 30_000));
  assert.equal((result.binding.lastResult as { reason: string }).reason, "The nameservers of www.example.com could not be read.");
});

test("due sweep: only bindings whose next check is due are re-verified, earliest first, up to the limit", async () => {
  const resolver = fakeAuthoritative({ zones: { "example.com": NS } });
  const bindings = memoryBindings([
    binding({ hostname: "b.example.com", nextCheckAt: iso(T0 - 1) }),
    binding({ hostname: "a.example.com", nextCheckAt: iso(T0 - 2) }),
    binding({ hostname: "later.example.com", nextCheckAt: iso(T0 + 1) }),
    binding({ hostname: "done.example.com", nextCheckAt: null, status: "propagated" }),
  ]);
  const ports = { ...portsFor(resolver), bindings, now: () => T0 };
  assert.deepEqual(await verifyDueDomainBindings({ limit: 10 }, ports), ["a.example.com", "b.example.com"]);
  assert.deepEqual(bindings.writes.map(write => write.hostname), ["a.example.com", "b.example.com"]);
  assert.deepEqual(await verifyDueDomainBindings({ limit: 1 }, { ...ports, now: () => T0 + 1 }), ["later.example.com"]);
});

test("include mail: plan merges the provider's SPF into the existing one; verify saves the mail records with the binding", async () => {
  const resolver = fakeAuthoritative({ zones: { "example.com": NS }, records: { "example.com|TXT": ['"v=spf1 include:old.test -all"'] } });
  const bindings = memoryBindings();
  const asked: string[] = [];
  const mailRequirements = async ({ workspaceId }: { workspaceId: string }) => { asked.push(workspaceId); return mailRequirement; };
  const ports = { ...portsFor(resolver, { bindings }), mailRequirements };
  const planned = await planDomainDns({ hostname: "example.com", include: ["mail"] }, ports);
  const txt = planned.plan.changes.filter(change => change.after?.type === "TXT").map(change => [change.op, change.after?.name, change.after?.values]);
  assert.deepEqual(txt, [
    ["update", "example.com", ["v=spf1 include:old.test include:mailer.test -all"]],
    ["create", "_dmarc.example.com", ["v=DMARC1; p=none"]],
  ], "one SPF, merged; DMARC only as a hint because none exists");
  const { binding: saved } = await verifyDomainDns({ hostname: "example.com", include: ["mail"] }, { ...ports, bindings, now: () => T0 });
  assert.deepEqual(saved.requirements.map(requirement => requirement.providerId), ["mailer", "dmarc-hint"]);
  assert.deepEqual(asked, ["ws", "ws"]);
  const again = await planDomainDns({ hostname: "example.com" }, ports);
  assert.equal(again.plan.fingerprint, planned.plan.fingerprint, "the saved requirements replan identically without include");
});
