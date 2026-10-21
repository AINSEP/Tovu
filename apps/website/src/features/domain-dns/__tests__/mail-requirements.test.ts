import assert from "node:assert/strict";
import test from "node:test";
import { providerOk, providerRejected } from "@jini-ai/core/provider-registry";
import { createManualDnsProvider, type DnsPlanRequirement, type DnsProvider, type DnsRecord } from "@jini-ai/devops/dns";
import { DMARC_HINT_PROVIDER_ID, DMARC_HINT_VALUE, withMailRequirements, type MailRequirementsPort } from "../mail-requirements.js";
import { context, fakeAuthoritative, siteRequirement } from "./dns-fakes.js";

/**
 * @file `include: ["mail"]`: the mail port's records join a hostname's requirements, a refresh
 * replaces the earlier copy, and DMARC is reconciled against the zone through the REAL manual
 * provider over an in-memory authoritative resolver (never a second DMARC, never an overwrite).
 */

const NS = ["ns1.dns.test"];
const DKIM = { type: "TXT" as const, name: "resend._domainkey.example.com", value: "p=MIGf" };
const SPF = { type: "TXT" as const, name: "send.example.com", value: "v=spf1 include:amazonses.com ~all" };
const PROVIDER_DMARC = { type: "TXT" as const, name: "_dmarc.example.com", value: "v=DMARC1; p=none; rua=mailto:dmarc@resend.test" };
const resend = (records: DnsPlanRequirement["records"] = [DKIM, SPF], domain = "Example.com"): DnsPlanRequirement => ({ purpose: "mail", domain, providerId: "resend", records });
const port = (value: DnsPlanRequirement | null): MailRequirementsPort & { asked: string[] } => {
  const asked: string[] = [];
  return Object.assign(async ({ workspaceId }: { workspaceId: string }) => { asked.push(workspaceId); return value; }, { asked });
};
const manual = (records: Record<string, string[] | "unknown"> = {}, zones: Record<string, string[] | "unknown"> = { "example.com": NS }) =>
  createManualDnsProvider({ resolver: fakeAuthoritative({ zones, records }) });
const run = (hostname: string, provider: DnsProvider, mailRequirements?: MailRequirementsPort, requirements: DnsPlanRequirement[] = []) =>
  withMailRequirements({ hostname, requirements, errorPrefix: "dns_plan" }, { provider, context, ...(mailRequirements ? { mailRequirements } : {}) });

test("no DMARC anywhere: the provider's records plus a monitoring-only DMARC hint, asked for this workspace", async () => {
  const mail = port(resend());
  const out = await run("www.example.com", manual(), mail, [siteRequirement()]);
  assert.deepEqual(mail.asked, ["ws"]);
  assert.deepEqual(out.map(requirement => [requirement.purpose, requirement.providerId, requirement.domain]), [["site", "host", "www.example.com"], ["mail", "resend", "example.com"], ["mail", DMARC_HINT_PROVIDER_ID, "example.com"]]);
  assert.deepEqual(out[2]!.records.map(record => [record.type, record.name, record.value]), [["TXT", "_dmarc.example.com", DMARC_HINT_VALUE]]);
});

test("an existing DMARC record is kept: no hint, and the provider's own DMARC is dropped rather than added beside it", async () => {
  const zone = manual({ "_dmarc.example.com|TXT": ['"v=DMARC1; p=reject"'] });
  assert.deepEqual(await run("example.com", zone, port(resend())), [resend([DKIM, SPF], "example.com")]);
  const withProviderDmarc = await run("example.com", zone, port(resend([DKIM, PROVIDER_DMARC])));
  assert.deepEqual(withProviderDmarc.map(requirement => requirement.records), [[DKIM]]);
  assert.deepEqual(await run("example.com", zone, port(resend([PROVIDER_DMARC]))), [], "nothing left to require");
});

test("a non-DMARC TXT at _dmarc does not count as DMARC; the provider's own DMARC means no hint", async () => {
  const zone = manual({ "_dmarc.example.com|TXT": ['"v=DMARC10 nonsense"'] });
  assert.deepEqual((await run("example.com", zone, port(resend()))).map(requirement => requirement.providerId), ["resend", DMARC_HINT_PROVIDER_ID]);
  assert.deepEqual((await run("example.com", zone, port(resend([DKIM, PROVIDER_DMARC])))).map(requirement => requirement.providerId), ["resend"]);
});

test("DMARC existence that cannot be read adds no hint: transport failure, no zone, unreadable records", async () => {
  const unreadable = manual({ "_dmarc.example.com|TXT": "unknown" });
  const noZone = manual({}, {});
  const slowZone = manual({}, { "_dmarc.example.com": "unknown" });
  const rejected: DnsProvider = { ...manual(), listRecords: async () => providerRejected({ code: "forbidden", message: "no" }) };
  const partial: DnsProvider = { ...manual(), findZone: async () => providerOk({ value: { zone: "example.com", ref: "z" } }), listRecords: async () => providerOk({ value: { records: [] as DnsRecord[], inventory: "partial" as const } }) };
  for (const provider of [unreadable, noZone, slowZone, rejected, partial]) {
    assert.deepEqual((await run("example.com", provider, port(resend()))).map(requirement => requirement.providerId), ["resend"]);
  }
});

test("a refresh replaces the earlier mail copy and hint for that domain, keeping other providers and domains", async () => {
  const stale = resend([{ ...DKIM, value: "p=OLD" }], "example.com");
  const staleHint: DnsPlanRequirement = { purpose: "mail", domain: "example.com", providerId: DMARC_HINT_PROVIDER_ID, records: [{ type: "TXT", name: "_dmarc.example.com", value: DMARC_HINT_VALUE }] };
  const otherProvider: DnsPlanRequirement = { ...stale, providerId: "postmark" };
  const otherDomain: DnsPlanRequirement = { ...stale, domain: "shop.example.com" };
  const siteSameDomain: DnsPlanRequirement = { ...siteRequirement(), domain: "example.com", providerId: "resend" };
  const out = await run("example.com", manual(), port(resend()), [stale, staleHint, otherProvider, otherDomain, siteSameDomain]);
  assert.deepEqual(out.map(requirement => [requirement.providerId, requirement.domain, requirement.records[0]!.value]), [
    ["postmark", "example.com", "p=OLD"], ["resend", "shop.example.com", "p=OLD"], ["resend", "example.com", "203.0.113.10"],
    ["resend", "example.com", "p=MIGf"], [DMARC_HINT_PROVIDER_ID, "example.com", DMARC_HINT_VALUE],
  ]);
});

test("the sender domain may be the hostname, its parent or below it; anything else is a caller error", async () => {
  const sub = resend([{ type: "MX", name: "send.example.com", value: "feedback.test" }], "send.example.com");
  assert.equal((await run("example.com", manual(), port(sub)))[0]!.domain, "send.example.com");
  await assert.rejects(run("www.example.com", manual(), port(resend([DKIM], "mail.example.com"))), { name: "ToolInputError", message: "dns_plan: the sender domain mail.example.com is outside www.example.com; plan it with hostname mail.example.com instead." });
  await assert.rejects(run("notexample.com", manual(), port(resend())), /outside notexample\.com/);
});

test("no mail port, or nothing configured behind it, is a caller error naming what to set up", async () => {
  await assert.rejects(run("example.com", manual()), { name: "ToolInputError", message: "dns_plan: this site cannot report its mail provider's DNS records." });
  await assert.rejects(run("example.com", manual(), port(null)), { name: "ToolInputError", message: /^dns_plan: no mail DNS records are available: .*mail_set_provider.*core\.mail\.senderEmail/ });
});
