import assert from "node:assert/strict";
import test from "node:test";
import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";
import type { DomainRequirement } from "@jini-ai/core/provider-registry";
import { createDnsProviderRegistry, type AuthoritativeDnsPort } from "@jini-ai/devops/dns";
import type { SenderDomainVerification } from "../../../platform/mail/sender-domain-verification.js";
import type { DomainBinding } from "../binding.repo.js";
import { inspectDomainDns } from "../dns-changes.js";
import type { DnsChangeToolDeps } from "../dns-tools.js";
import { DMARC_HINT_VALUE } from "../mail-requirements.js";
import { mailDnsRecordStatus, readMailDnsStatus, verifyMailDnsStatus, type MailDnsRecordView, type MailDnsStatusPorts } from "../mail-dns-status.js";
import { buildMailDnsRegistrations, mailDnsAgentToolCatalog, mailDnsDerivedRisk, mailDnsPorts } from "../mail-dns-tools.js";
import { context, fakeAuthoritative, memoryBindings } from "./dns-fakes.js";

/**
 * @file The Email page's mail DNS status over the REAL Jini kernel (manual provider, planner,
 * verifier) with an in-memory authoritative resolver: the record-by-record status vocabulary, the
 * provider verdict kept apart, every "no table" state, the saved check, and the two tools.
 */

const NS = ["ns1.dns.test", "ns2.dns.test"];
const T0 = Date.parse("2026-10-22T10:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const VERIFIED: SenderDomainVerification = { state: "verified", domain: "example.com", providerId: "mailer" };

const MAIL: DomainRequirement = {
  purpose: "mail", domain: "Example.com", providerId: "mailer",
  records: [
    { type: "MX", name: "example.com", value: "mx.mailer.test", priority: 10 },
    { type: "TXT", name: "example.com", value: "v=spf1 include:mailer.test ~all", ttl: 3600, note: "SPF" },
    { type: "TXT", name: "k1._domainkey.example.com", value: "p=GOOD" },
    { type: "CNAME", name: "em.example.com", value: "track.mailer.test" },
  ],
};

/** MX matches everywhere; SPF on one nameserver only; DKIM wrong; CNAME unanswered; no DMARC. */
const MIXED = {
  "example.com|MX": ["10 mx.mailer.test."],
  "ns1.dns.test|example.com|TXT": ['"v=spf1 include:mailer.test ~all"'],
  "k1._domainkey.example.com|TXT": ['"p=OTHER"'],
  "em.example.com|CNAME": "unknown" as const,
};

function portsFor(optional: { resolver?: AuthoritativeDnsPort; requirement?: DomainRequirement | null | Error | "throw-value"; verdict?: SenderDomainVerification | null; bindings?: ReturnType<typeof memoryBindings> } = {}): MailDnsStatusPorts & { bindings?: ReturnType<typeof memoryBindings> } {
  const resolver = optional.resolver ?? fakeAuthoritative({ zones: { "example.com": NS }, records: MIXED });
  const requirement = optional.requirement === undefined ? MAIL : optional.requirement;
  const verdict = optional.verdict === undefined ? VERIFIED : optional.verdict;
  return {
    registry: createDnsProviderRegistry({ resolver }), resolver, context, now: () => T0,
    mailRequirements: async () => {
      if (requirement instanceof Error) throw requirement;
      if (requirement === "throw-value") throw "boom";
      return requirement;
    },
    ...(verdict === null ? {} : { senderDomainVerification: async () => verdict }),
    ...(optional.bindings ? { bindings: optional.bindings } : {}),
  };
}

const byName = (records: readonly MailDnsRecordView[]) => Object.fromEntries(records.map(record => [`${record.type} ${record.host}`, record]));

test("read: every record gets its own status from the authoritative nameservers, nothing is saved", async () => {
  const bindings = memoryBindings();
  const status = await readMailDnsStatus({}, portsFor({ bindings }));
  assert.equal(status.state, "checked");
  assert.deepEqual([status.senderDomain, status.providerId, status.providerVerification, status.untrusted], ["example.com", "mailer", VERIFIED, true]);
  const dns = status.dns!;
  assert.deepEqual([dns.hostname, dns.zone, dns.delegation?.state, dns.nameservers, dns.persisted, dns.tracking, dns.checkedAt], ["example.com", "example.com", "delegated", NS, false, null, iso(T0)]);
  const records = byName(dns.records);
  assert.deepEqual(Object.fromEntries(Object.entries(records).map(([key, record]) => [key, record.status])), {
    "MX @": "Matches", "TXT @": "Pending", "TXT k1._domainkey": "Mismatch", "CNAME em": "Unknown", "TXT _dmarc": "Missing",
  });
  assert.equal(dns.overall, "Mismatch");
  assert.deepEqual(records["TXT k1._domainkey"]!.observed, ['"p=OTHER"']);
  assert.deepEqual(records["TXT @"]!.byNameserver.map(observation => observation.status), ["Matches", "Missing"]);
  assert.deepEqual([records["MX @"]!.priority, records["TXT @"]!.ttl, records["TXT @"]!.note, "priority" in records["CNAME em"]!], [10, 3600, "SPF", false]);
  // The provider's records and the DMARC hint the planner adds are both the mail purpose.
  assert.deepEqual([records["TXT _dmarc"]!.expected, records["TXT _dmarc"]!.purpose, records["MX @"]!.purpose], [DMARC_HINT_VALUE, "mail", "mail"]);
  assert.ok(dns.rows!.length > 0);
  assert.ok(Array.isArray(dns.notes) && Array.isArray(dns.blockers));
  assert.equal(bindings.writes.length, 0);
});

test("read: all records matching is Matches; a saved timed-out window turns unpropagated records into TimedOut", async () => {
  const all = { ...MIXED, "example.com|TXT": ['"v=spf1 include:mailer.test ~all"'], "k1._domainkey.example.com|TXT": ['"p=GOOD"'], "em.example.com|CNAME": ["track.mailer.test."], "_dmarc.example.com|TXT": [`"${DMARC_HINT_VALUE}"`] };
  const matched = await readMailDnsStatus({}, portsFor({ resolver: fakeAuthoritative({ zones: { "example.com": NS }, records: all }) }));
  assert.equal(matched.dns!.overall, "Matches");
  const site = { purpose: "site" as const, domain: "example.com", providerId: "host", records: [{ type: "A" as const, name: "example.com", value: "203.0.113.10" }, { type: "TXT" as const, name: "_dmarc.example.com", value: "v=DMARC1; p=reject" }, { type: "TXT" as const, name: "x.example.com", value: "y" }] };
  const timedOut: DomainBinding = { hostname: "example.com", providerId: "manual", zone: "example.com", requirements: [site], status: "timeout", delegation: "delegated", attempt: 9, startedAt: iso(T0 - 50 * 3_600_000), nextCheckAt: null, lastCheckedAt: iso(T0 - 1000), lastResult: null, version: 3 };
  const status = await readMailDnsStatus({}, portsFor({ bindings: memoryBindings([timedOut]) }));
  const records = byName(status.dns!.records);
  assert.deepEqual([records["A @"]!.purpose, records["A @"]!.status, records["TXT x"]!.purpose], ["other", "TimedOut", "other"]);
  assert.equal(status.dns!.records.find(record => record.expected === "v=DMARC1; p=reject")!.purpose, "other");
  assert.equal(status.dns!.overall, "Mismatch");
  assert.deepEqual(status.dns!.tracking, { status: "timeout", attempt: 9, startedAt: timedOut.startedAt, nextCheckAt: null, lastCheckedAt: timedOut.lastCheckedAt });
});

test("read: no zone found means every record is Unknown with the reason, never Missing", async () => {
  const extra: DomainRequirement = { ...MAIL, records: [...MAIL.records, { type: "TXT", name: "x.other.test", value: "z" }] };
  const status = await readMailDnsStatus({}, portsFor({ resolver: fakeAuthoritative({ zones: {} }), requirement: extra }));
  const dns = status.dns!;
  assert.deepEqual([dns.overall, dns.delegation, dns.nameservers], ["Unknown", null, []]);
  assert.match(dns.reason!, /No DNS zone serving example\.com could be found/);
  assert.ok(dns.records.every(record => record.status === "Unknown"));
  assert.ok(dns.records.some(record => record.host === "x.other.test"));
  assert.equal(dns.blockers![0]!.code, "zone_not_found");
});

test("no record table: each reason is its own state, and the provider verdict still shows", async () => {
  const cases: [SenderDomainVerification | null, string][] = [
    [{ state: "no_sender", providerId: "mailer" }, "no_sender"],
    [{ state: "no_provider", domain: "example.com", providerId: null }, "no_provider"],
    [{ state: "unknown", domain: "example.com", providerId: "mailer", reason: "the provider's key is not saved" }, "requirements_unavailable"],
    [{ state: "unsupported", domain: "example.com", providerId: "plain" }, "verification_unavailable"],
    [null, "verification_unavailable"],
  ];
  for (const [verdict, state] of cases) {
    const status = await readMailDnsStatus({}, portsFor({ requirement: null, verdict }));
    assert.equal(status.state, state, JSON.stringify(verdict));
    assert.equal(status.providerVerification, verdict);
    assert.ok(status.message && status.message.length > 0);
    assert.equal(status.dns, undefined);
  }
  assert.deepEqual(await readMailDnsStatus({}, portsFor({ requirement: null, verdict: { state: "no_sender", providerId: null } })), { senderDomain: null, providerId: null, providerVerification: { state: "no_sender", providerId: null }, untrusted: true, state: "no_sender", message: "Set the site's sender address first; its domain is the one that needs mail DNS records." });
  assert.equal((await readMailDnsStatus({}, portsFor({ requirement: null, verdict: { state: "unsupported", domain: "example.com", providerId: "plain" } }))).senderDomain, "example.com");
});

test("no record table: no port is unavailable; provider errors and non-errors share safe failure copy", async () => {
  const { mailRequirements: _drop, ...noPort } = portsFor();
  assert.deepEqual([(await readMailDnsStatus({}, noPort)).state, (await readMailDnsStatus({}, noPort)).message], ["requirements_unavailable", "This server cannot report its mail provider's DNS records."]);
  const failed = await readMailDnsStatus({}, portsFor({ requirement: new Error("private provider response") }));
  assert.deepEqual([failed.state, failed.message], ["requirements_failed", "The mail provider could not list its required DNS records."]);
  assert.equal((await readMailDnsStatus({}, portsFor({ requirement: "throw-value" }))).message, "The mail provider could not list its required DNS records.");
});

test("a DNS-layer refusal becomes check_failed; any other fault propagates", async () => {
  const foreign: DomainBinding = { hostname: "example.com", providerId: "vendor-dns", zone: "example.com", requirements: [], status: "pending", delegation: null, attempt: 0, startedAt: iso(T0), nextCheckAt: null, lastCheckedAt: null, lastResult: null, version: 1 };
  const refused = await readMailDnsStatus({}, portsFor({ bindings: memoryBindings([foreign]) }));
  assert.deepEqual([refused.state, refused.senderDomain], ["check_failed", "example.com"]);
  assert.match(refused.message!, /DNS provider 'vendor-dns' saved for example\.com is not installed/);
  const broken = { ...memoryBindings(), get: async () => { throw new Error("disk"); } };
  await assert.rejects(readMailDnsStatus({}, portsFor({ bindings: broken as never })), /disk/);
});

test("verify: saves the check through verifyDomainDns and reports it as persisted with its tracking", async () => {
  const bindings = memoryBindings();
  const status = await verifyMailDnsStatus({}, portsFor({ bindings }));
  assert.equal(status.state, "checked");
  const dns = status.dns!;
  assert.deepEqual([dns.persisted, dns.tracking?.status, dns.tracking?.attempt, dns.checkedAt, dns.overall, dns.rows], [true, "mismatch", 0, iso(T0), "Mismatch", undefined]);
  assert.equal(bindings.writes.length, 1);
  assert.equal(byName(dns.records)["MX @"]!.status, "Matches");
});

test("verify: no tracking store is check_failed; no records stops before any DNS read", async () => {
  const resolver = fakeAuthoritative({ zones: { "example.com": NS } });
  const missing = await verifyMailDnsStatus({}, portsFor({ resolver }));
  assert.deepEqual([missing.state, missing.message], ["check_failed", "this site has no content database to keep the domain's tracking state in."]);
  const none = await verifyMailDnsStatus({}, portsFor({ resolver, requirement: null, verdict: { state: "no_sender", providerId: null } }));
  assert.equal(none.state, "no_sender");
});

test("mailDnsRecordStatus: kernel pending splits into Missing and Pending, and TimedOut only past the window", () => {
  const pending = { state: "pending" as const, byNameserver: [{ nameserver: "a", state: "pending" as const, answers: [] }] };
  assert.equal(mailDnsRecordStatus({ record: pending, timedOut: false }), "Missing");
  assert.equal(mailDnsRecordStatus({ record: pending, timedOut: true }), "TimedOut");
  assert.equal(mailDnsRecordStatus({ record: { state: "mismatch", byNameserver: [] }, timedOut: true }), "Mismatch");
  assert.equal(mailDnsRecordStatus({ record: { state: "unknown", byNameserver: [] }, timedOut: false }), "Unknown");
});

test("inspectDomainDns is read-only and returns the saved binding beside the live check", async () => {
  const resolver = fakeAuthoritative({ zones: { "example.com": NS }, records: MIXED });
  const bindings = memoryBindings();
  const inspected = await inspectDomainDns({ hostname: "example.com", requirements: [{ ...MAIL, domain: "example.com", records: [...MAIL.records] }] }, { registry: createDnsProviderRegistry({ resolver }), resolver, context, bindings });
  assert.equal(inspected.binding, null);
  assert.equal(inspected.verification!.records.length, 4);
  assert.equal(bindings.writes.length, 0);
  await assert.rejects(inspectDomainDns({ hostname: "example.com" }, { registry: createDnsProviderRegistry({ resolver }), resolver, context }), (err: unknown) => err instanceof ToolInputError && /^dns_status: no DNS requirements are saved/.test(err.message));
});

// ---------------------------------------------------------------------------------------------
// mail_dns_status / mail_dns_verify: same operations, own permissions.
// ---------------------------------------------------------------------------------------------

const ctx: ToolExecutionContext = { executionId: "e", principal: { id: "p" }, run: { id: "r" }, input: {}, signal: new AbortController().signal };

function toolDeps(granted: string[], optional: { bindings?: boolean; verdict?: boolean } = {}): DnsChangeToolDeps & { asked: string[] } {
  const asked: string[] = [];
  const ports = portsFor();
  return {
    asked, workspaceId: "ws", registry: ports.registry, resolver: ports.resolver, context, now: () => T0,
    authorize: async ({ permission, entityType }) => { asked.push(`${permission}:${entityType}`); return { allowed: granted.includes(permission), reason: "fixture" }; },
    mailRequirements: ports.mailRequirements!,
    ...(optional.verdict === false ? {} : { senderDomainVerification: ports.senderDomainVerification! }),
    ...(optional.bindings === false ? {} : { bindings: memoryBindings() }),
  };
}

test("mail_dns_status reads with deployments.read; mail_dns_verify saves with deployments.publish", async () => {
  const deps = toolDeps(["deployments.read", "deployments.publish"]);
  const [read, verify] = ["mail_dns_status", "mail_dns_verify"].map(id => buildMailDnsRegistrations(deps).find(registration => registration.descriptor.id === id)!);
  assert.equal(((await read!.handler(ctx)) as { dns: { persisted: boolean } }).dns.persisted, false);
  assert.equal(((await verify!.handler(ctx)) as { dns: { persisted: boolean } }).dns.persisted, true);
  assert.deepEqual(deps.asked, ["deployments.read:domain-dns", "deployments.publish:domain-dns"]);
  assert.equal(read!.descriptor.readOnly, true);
  assert.equal(verify!.descriptor.readOnly, false);
  assert.deepEqual([...mailDnsDerivedRisk], [["mail_dns_status", "none"], ["mail_dns_verify", "mutates-durable-state"]]);
  assert.deepEqual(mailDnsAgentToolCatalog.map(tool => tool.authorization.permission), ["deployments.read", "deployments.publish"]);
});

test("the mail DNS tools refuse without their permission and reject unexpected input", async () => {
  const deps = toolDeps(["deployments.read"]);
  const verify = buildMailDnsRegistrations(deps).find(registration => registration.descriptor.id === "mail_dns_verify")!;
  await assert.rejects(verify.handler(ctx), /not authorized for 'deployments.publish'/);
  const read = buildMailDnsRegistrations(toolDeps([])).find(registration => registration.descriptor.id === "mail_dns_status")!;
  await assert.rejects(read.handler(ctx), /not authorized for 'deployments.read'/);
  await assert.rejects(read.handler({ ...ctx, input: [] }));
});

test("mailDnsPorts carries only the seams the composition supplied", () => {
  const bare = mailDnsPorts(toolDeps([], { bindings: false, verdict: false }));
  assert.deepEqual(["bindings" in bare, "senderDomainVerification" in bare, "mailRequirements" in bare], [false, false, true]);
  const { mailRequirements: _drop, ...noMail } = toolDeps([]);
  assert.equal("mailRequirements" in mailDnsPorts(noMail as DnsChangeToolDeps), false);
});

test("signin-lab: DNS status exposes safe provider code and message without the generic unknown overwrite", async () => {
  const verdict: SenderDomainVerification = { state: "unknown", domain: "example.com", providerId: "mailer", reason: "forbidden: Sending-only keys cannot list domains" };
  const failed = await readMailDnsStatus({}, portsFor({ verdict, requirement: new ToolInputError({ message: "restricted_api_key: Use a full-access key" }) }));
  assert.equal(failed.state, "requirements_failed");
  assert.equal(failed.message, "restricted_api_key: Use a full-access key");
  const unavailable = await readMailDnsStatus({}, portsFor({ verdict, requirement: null }));
  assert.equal(unavailable.message, verdict.reason);
});
