import assert from "node:assert/strict";
import test from "node:test";
import { providerOk, providerRejected } from "@jini-ai/core/provider-registry";
import { createDnsProviderRegistry, type AuthoritativeDnsPort, type DnsProvider } from "@jini-ai/devops/dns";
import type { DomainBinding } from "../binding.repo.js";
import { domainDnsInstructions, planDomainDns, VERIFY_WRITE_ATTEMPTS, verifyDomainDns, verifyDueDomainBindings, type DnsChangePorts } from "../dns-changes.js";
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
function customProvider(optional: { list?: "rejected" | "ancestors" } = {}): DnsProvider {
  return {
    id: "custom", label: "Custom", credentialKeys: [],
    capabilities: { automatic: false, recordTypes: ["A", "TXT", "MX"], apexFlattening: true, proxy: false },
    findZone: async () => providerOk({ value: { zone: "example.com", ref: "zone-1" } }),
    listRecords: async (_ctx, { names }) => (optional.list === "rejected" || (optional.list === "ancestors" && names.includes("example.com")) ? providerRejected({ code: "forbidden", message: "no" }) : providerOk({ value: { records: [], inventory: "complete" as const } })),
  };
}

const binding = (overrides: Partial<DomainBinding> = {}): DomainBinding => ({
  hostname: "www.example.com", providerId: "manual", zone: "example.com", requirements: [siteRequirement()], status: "pending",
  delegation: "delegated", attempt: 0, startedAt: iso(T0), nextCheckAt: iso(T0 + 30_000), lastCheckedAt: iso(T0), lastResult: null, version: 1, ...overrides,
});

test("plan: the manual provider finds the zone past a non-delegated host, reads current records and keeps a conflicting A it does not own", async () => {
  const resolver = fakeAuthoritative({ zones: { "example.com": NS }, records: { "www.example.com|A": ["198.51.100.1"] } });
  const planned = await planDomainDns({ hostname: "www.example.com", requirements: [siteRequirement()] }, portsFor(resolver));
  assert.equal(planned.providerId, "manual");
  assert.equal(planned.zone, "example.com");
  assert.equal(planned.zoneFound, true);
  assert.equal(planned.delegation?.state, "delegated");
  assert.equal(planned.plan.inventory, "complete");
  // The manual provider reads records it did not create, so replacing one is a person's decision (13-dns #2).
  assert.deepEqual(planned.blockers.map(blocker => blocker.code), ["record_not_owned"]);
  assert.deepEqual(planned.plan.changes, []);
  assert.deepEqual(planned.plan.preserved.map(record => record.values), [["198.51.100.1"]]);
  assert.match(planned.plan.fingerprint, /^[0-9a-f]{64}$/);
  assert.ok(resolver.calls.includes("ns:www.example.com"), "the most specific candidate is tried first");
});

// Regression (review 13-dns #4): only the requirement names were read, so a CAA set at an
// ancestor (here the zone apex, and a parent zone above a delegated child) was never seen.
test("plan: an ancestor CAA restriction, in the zone or in a parent zone, blocks the required issuer", async () => {
  const caaSite = { ...siteRequirement(), caa: { issuer: "letsencrypt.org" } };
  const apex = fakeAuthoritative({ zones: { "example.com": NS }, records: { "example.com|CAA": ['0 issue "other-ca.test"'] } });
  const planned = await planDomainDns({ hostname: "www.example.com", requirements: [caaSite] }, portsFor(apex));
  assert.deepEqual(planned.blockers.map(blocker => [blocker.code, blocker.name]), [["caa_excludes_issuer", "www.example.com"]]);
  assert.ok(!planned.plan.preserved.some(record => record.name === "example.com" && record.type !== "CAA"), "ancestors contribute only their CAA sets");

  const child = { purpose: "site" as const, domain: "app.dev.example.com", providerId: "host", records: [{ type: "A" as const, name: "app.dev.example.com", value: "203.0.113.10" }], caa: { issuer: "letsencrypt.org" } };
  const parent = fakeAuthoritative({ zones: { "dev.example.com": ["ns.child.test"], "example.com": NS }, records: { "ns1.dns.test|example.com|CAA": ['0 issue "other-ca.test"'] } });
  const inherited = await planDomainDns({ hostname: "app.dev.example.com", requirements: [child] }, portsFor(parent));
  assert.equal(inherited.zone, "dev.example.com");
  assert.deepEqual(inherited.blockers.map(blocker => blocker.code), ["caa_excludes_issuer"]);

  const allowed = fakeAuthoritative({ zones: { "example.com": NS }, records: { "example.com|CAA": ['0 issue "letsencrypt.org"'] } });
  assert.deepEqual((await planDomainDns({ hostname: "www.example.com", requirements: [caaSite] }, portsFor(allowed))).blockers, []);
});

test("plan: an unreadable ancestor CAA set makes the inventory incomplete; a name no zone serves has none", async () => {
  const caaSite = { ...siteRequirement(), caa: { issuer: "letsencrypt.org" } };
  const unreadable = fakeAuthoritative({ zones: { "example.com": NS }, records: { "example.com|CAA": "unknown" } });
  const planned = await planDomainDns({ hostname: "www.example.com", requirements: [caaSite] }, portsFor(unreadable));
  assert.equal(planned.plan.inventory, "unknown");
  const lostParent = fakeAuthoritative({ zones: { "dev.example.com": NS, "example.com": "unknown" } });
  const child = { purpose: "site" as const, domain: "app.dev.example.com", providerId: "host", records: [{ type: "A" as const, name: "app.dev.example.com", value: "203.0.113.10" }], caa: { issuer: "letsencrypt.org" } };
  assert.equal((await planDomainDns({ hostname: "app.dev.example.com", requirements: [child] }, portsFor(lostParent))).plan.inventory, "unknown");
  const orphan = fakeAuthoritative({ zones: { "dev.example.com": NS } });
  const free = await planDomainDns({ hostname: "app.dev.example.com", requirements: [child] }, portsFor(orphan));
  assert.equal(free.plan.inventory, "complete");
  assert.deepEqual(free.blockers, []);
  const listingFails = await planDomainDns({ hostname: "www.example.com", requirements: [caaSite] }, portsFor(fakeAuthoritative({ zones: { "example.com": NS } }), { seed: [customProvider({ list: "ancestors" })], bindings: memoryBindings([binding({ providerId: "custom" })]) }));
  assert.equal(listingFails.plan.inventory, "unknown", "a refused ancestor listing is not an empty CAA set");
});

// Regression (review 13-dns #7): the zone came from the hostname alone, so a requirement in
// another zone (or in a delegated child) was read from and rendered against the wrong servers.
test("plan, instructions and verify refuse requirement names outside the hostname's zone or in a delegated child", async () => {
  const resolver = fakeAuthoritative({ zones: { "example.com": NS, "dev.example.com": ["ns.child.test"] } });
  const foreign = { ...siteRequirement(), records: [{ type: "A" as const, name: "www.other.org", value: "203.0.113.10" }] };
  await assert.rejects(planDomainDns({ hostname: "www.example.com", requirements: [foreign] }, portsFor(resolver)), { name: "ToolInputError", message: /dns_plan: .*www\.other\.org.*not in the zone example\.com/ });
  const delegated = { ...siteRequirement(), records: [{ type: "TXT" as const, name: "_v.app.dev.example.com", value: "x" }] };
  await assert.rejects(domainDnsInstructions({ hostname: "www.example.com", requirements: [delegated] }, portsFor(resolver)), { name: "ToolInputError", message: /_v\.app\.dev\.example\.com.*dev\.example\.com/ });
  const bindings = memoryBindings();
  await assert.rejects(verifyDomainDns({ hostname: "www.example.com", requirements: [foreign] }, { ...portsFor(resolver, { bindings }), bindings, now: () => T0 }), { name: "ToolInputError" });
  assert.deepEqual(bindings.writes, [], "nothing is saved for a mixed-zone request");
  const sameZone = { ...siteRequirement(), records: [{ type: "TXT" as const, name: "_verify.www.example.com", value: "x" }, { type: "A" as const, name: "example.com", value: "203.0.113.10" }] };
  assert.equal((await planDomainDns({ hostname: "www.example.com", requirements: [sameZone] }, portsFor(resolver))).zone, "example.com");
  const unreadable = fakeAuthoritative({ zones: { "example.com": NS, "_verify.www.example.com": "unknown" } });
  assert.equal((await planDomainDns({ hostname: "www.example.com", requirements: [sameZone] }, portsFor(unreadable))).zone, "example.com", "an unreadable authority lookup is not proof of a different zone");
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

// Regression (review 13-dns #8): the save was an unconditional upsert after slow DNS reads, so a
// background re-check could overwrite the requirements a newer dns_verify had just saved.
test("verify: a sweep whose binding changed during its DNS reads discards its stale observation", async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const base = fakeAuthoritative({ zones: { "example.com": NS }, records: { "www.example.com|A": ["203.0.113.10"] } });
  // The old (site) requirement's A query waits; the new (mail) requirements answer at once.
  const resolver: AuthoritativeDnsPort = { queryNs: base.queryNs, query: async request => { if (request.type === "A") await gate; return base.query(request); } };
  const bindings = memoryBindings([binding({ nextCheckAt: iso(T0 - 1) })]);
  const ports = { ...portsFor(resolver, { bindings }), bindings, now: () => T0 };
  const sweep = verifyDueDomainBindings({ limit: 10 }, ports);
  await new Promise(resolve => setImmediate(resolve));
  const explicit = await verifyDomainDns({ hostname: "www.example.com", requirements: [mailRequirement] }, ports);
  assert.equal(explicit.binding.version, 2);
  release();
  assert.deepEqual(await sweep, [], "the stale sweep result is not saved and not reported as checked");
  assert.deepEqual(bindings.rows.get("www.example.com")?.requirements, [mailRequirement], "the newer requirements stand");
  assert.equal(bindings.rows.get("www.example.com")?.version, 2);
  assert.deepEqual(bindings.refused.map(refused => refused.requirements), [[siteRequirement()]]);
});

test("verify: dns_verify recomputes from the newer binding after losing a race, and gives up after repeated losses", async () => {
  const resolver = fakeAuthoritative({ zones: { "example.com": NS }, records: { "www.example.com|A": ["203.0.113.10"] } });
  const store = memoryBindings([binding()]);
  let interleave = 1;
  const racing = {
    ...store,
    put: async (request: Parameters<typeof store.put>[0]) => {
      // A concurrent writer saves just before this one, once.
      if (interleave-- > 0) store.rows.set("www.example.com", binding({ attempt: 4, version: 2 }));
      return store.put(request);
    },
  };
  const ports = { ...portsFor(resolver, { bindings: racing }), bindings: racing, now: () => T0 };
  const result = await verifyDomainDns({ hostname: "www.example.com" }, ports);
  assert.equal(store.refused.length, 1);
  assert.deepEqual([result.binding.version, result.binding.attempt], [3, 5], "the retry continued from the newer binding");

  const losing = { ...store, put: async () => false };
  const losingPorts = { ...portsFor(resolver, { bindings: losing }), bindings: losing, now: () => T0 };
  await assert.rejects(verifyDomainDns({ hostname: "www.example.com" }, losingPorts), { name: "ToolInputError", message: new RegExp(`kept changing .*${VERIFY_WRITE_ATTEMPTS} attempts`) });
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
