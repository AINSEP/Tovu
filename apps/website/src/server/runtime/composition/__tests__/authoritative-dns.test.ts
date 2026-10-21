import assert from "node:assert/strict";
import test from "node:test";
import { AUTHORITATIVE_DNS_TIMEOUT_MS, createAuthoritativeDnsResolver, type DnsResolverLike } from "../authoritative-dns.js";

/**
 * @file The `node:dns` authoritative adapter with a fake Resolver factory (no network): answers are
 * rendered in the presentation format the Jini kernel parses, the record query goes to the
 * nameserver's own public address via `setServers`, and every failure maps onto the port's result
 * convention instead of throwing.
 */

const dnsError = (code: string) => Object.assign(new Error(code), { code });

/** Per-instance fake: `answers[server][method:name]` is a value, or an Error to reject with. */
function fakeFactory(answers: Record<string, Record<string, unknown>>) {
  const created: Array<{ options: { timeout: number; tries: number }; servers: string[] }> = [];
  const factory = (options: { timeout: number; tries: number }): DnsResolverLike => {
    const state = { options, servers: ["system"] };
    created.push(state);
    const answer = (method: string) => async (name: string, ...rest: unknown[]) => {
      if (method === "resolve4" || method === "resolve6") assert.ok(rest.length === 0 || (rest[0] as { ttl: boolean }).ttl === true);
      const value = answers[state.servers.join(",")]?.[`${method}:${name}`];
      if (value instanceof Error) throw value;
      if (value === undefined) throw dnsError("ENODATA");
      return value;
    };
    return {
      setServers: (servers: readonly string[]) => { state.servers = [...servers]; },
      resolve4: answer("resolve4"), resolve6: answer("resolve6"), resolveCname: answer("resolveCname"), resolveTxt: answer("resolveTxt"),
      resolveMx: answer("resolveMx"), resolveCaa: answer("resolveCaa"), resolveNs: answer("resolveNs"), resolveSrv: answer("resolveSrv"),
    } as unknown as DnsResolverLike;
  };
  return { created, factory };
}

const NS_ADDRESS = { "resolve4:ns1.dns.test": ["203.0.113.53"], "resolve6:ns1.dns.test": ["2001:db8::53"] };

test("each record type is asked of the nameserver's public address and rendered in presentation format", async () => {
  const { created, factory } = fakeFactory({
    system: NS_ADDRESS,
    "203.0.113.53": {
      "resolve4:example.com": [{ address: "203.0.113.10", ttl: 600 }, { address: "203.0.113.11", ttl: 300 }],
      "resolve6:example.com": [{ address: "2001:db8::10", ttl: 120 }],
      "resolveCname:www.example.com": ["target.host.test"],
      "resolveTxt:example.com": [["v=spf1 ", "include:\"x\" ~all"], ["plain"]],
      "resolveMx:example.com": [{ priority: 10, exchange: "mx.example.com" }],
      "resolveCaa:example.com": [{ critical: 0, issue: "letsencrypt.org" }, { critical: 128, issuewild: ";" }, { critical: 0, iodef: "mailto:a@example.com" }, { critical: 0, contactemail: "a@example.com" }],
      "resolveNs:example.com": ["ns1.dns.test"],
      "resolveSrv:_sip._tcp.example.com": [{ priority: 1, weight: 5, port: 5060, name: "sip.example.com" }],
    },
  });
  const port = createAuthoritativeDnsResolver({}, { createResolver: factory });
  const ask = (name: string, type: Parameters<typeof port.query>[0]["type"]) => port.query({ name, type, nameserver: "ns1.dns.test" });
  assert.deepEqual(await ask("example.com", "A"), { status: "ok", value: { answers: ["203.0.113.10", "203.0.113.11"], ttl: 300 } });
  assert.deepEqual(await ask("example.com", "AAAA"), { status: "ok", value: { answers: ["2001:db8::10"], ttl: 120 } });
  assert.deepEqual(await ask("www.example.com", "CNAME"), { status: "ok", value: { answers: ["target.host.test"] } });
  assert.deepEqual(await ask("example.com", "TXT"), { status: "ok", value: { answers: ['"v=spf1 " "include:\\"x\\" ~all"', '"plain"'] } });
  assert.deepEqual(await ask("example.com", "MX"), { status: "ok", value: { answers: ["10 mx.example.com"] } });
  assert.deepEqual(await ask("example.com", "CAA"), { status: "ok", value: { answers: ['0 issue "letsencrypt.org"', '128 issuewild ";"', '0 iodef "mailto:a@example.com"'] } });
  assert.deepEqual(await ask("nocaa.example.com", "CAA"), { status: "ok", value: { answers: [] } }, "NODATA for CAA is an empty set");
  assert.deepEqual(await ask("example.com", "NS"), { status: "ok", value: { answers: ["ns1.dns.test"] } });
  assert.deepEqual(await ask("_sip._tcp.example.com", "SRV"), { status: "ok", value: { answers: ["1 5 5060 sip.example.com"] } });
  assert.deepEqual(created[0]!.options, { timeout: AUTHORITATIVE_DNS_TIMEOUT_MS, tries: 1 });
  assert.ok(created.slice(1).every(entry => entry.servers.join() === "203.0.113.53"), "every record query goes to the nameserver itself");
});

test("NODATA is an empty answer, NXDOMAIN is not_found, a timeout or other failure is unknown — never a throw", async () => {
  const { factory } = fakeFactory({
    system: NS_ADDRESS,
    "203.0.113.53": { "resolve4:gone.example.com": dnsError("ENOTFOUND"), "resolve4:slow.example.com": dnsError("ETIMEOUT"), "resolve4:broken.example.com": dnsError("ESERVFAIL"), "resolve4:weird.example.com": null, "resolve4:bare.example.com": [] },
  });
  const port = createAuthoritativeDnsResolver({}, { createResolver: factory });
  const ask = (name: string) => port.query({ name, type: "A", nameserver: "ns1.dns.test" });
  assert.deepEqual(await ask("empty.example.com"), { status: "ok", value: { answers: [] } });
  assert.deepEqual(await ask("gone.example.com"), { status: "rejected", error: { code: "not_found", message: "The name does not exist." } });
  assert.deepEqual(await ask("slow.example.com"), { status: "unknown", error: { code: "timeout", message: "The DNS server did not answer in time." } });
  assert.deepEqual(await ask("broken.example.com"), { status: "unknown", error: { code: "network", message: "The DNS query failed before an answer arrived." } });
  assert.equal((await ask("weird.example.com")).status, "unknown", "a malformed driver answer is a transport failure");
  assert.deepEqual(await ask("bare.example.com"), { status: "ok", value: { answers: [], ttl: undefined } }, "an empty address list carries no TTL");
});

test("a nameserver without a public address is refused as unknown before any record query; ALIAS is not a wire type", async () => {
  const { created, factory } = fakeFactory({ system: { "resolve4:internal.dns.test": ["10.0.0.53"], "resolve6:internal.dns.test": ["::1"] } });
  const port = createAuthoritativeDnsResolver({}, { createResolver: factory });
  assert.deepEqual(await port.query({ name: "example.com", type: "A", nameserver: "internal.dns.test" }), { status: "unknown", error: { code: "network", message: "The nameserver internal.dns.test has no public address." } });
  assert.deepEqual(await port.query({ name: "example.com", type: "A", nameserver: "192.168.1.1" }), { status: "unknown", error: { code: "network", message: "The nameserver 192.168.1.1 has no public address." } });
  assert.equal(created.length, 1, "no resolver is pointed at a private address");
  assert.deepEqual(await port.query({ name: "example.com", type: "ALIAS", nameserver: "ns1.dns.test" }), { status: "rejected", error: { code: "unsupported", message: "ALIAS is a DNS-host feature, not a record type a nameserver serves." } });
});

test("a public address literal is used as given, and a nameserver whose IPv4 lookup fails still answers over IPv6", async () => {
  const { factory } = fakeFactory({
    system: { "resolve6:v6.dns.test": ["2001:db8::53"], "resolve4:v6.dns.test": dnsError("ETIMEOUT") },
    "198.51.100.53": { "resolveNs:example.com": ["a.test"] },
    "2001:db8::53": { "resolveNs:example.com": ["b.test"] },
  });
  const port = createAuthoritativeDnsResolver({}, { createResolver: factory });
  assert.deepEqual(await port.query({ name: "example.com", type: "NS", nameserver: "198.51.100.53" }), { status: "ok", value: { answers: ["a.test"] } });
  assert.deepEqual(await port.query({ name: "example.com", type: "NS", nameserver: "v6.dns.test" }), { status: "ok", value: { answers: ["b.test"] } });
});

test("queryNs reads through the bootstrap resolver, honouring configured servers and timeout", async () => {
  const { created, factory } = fakeFactory({ "9.9.9.9": { "resolveNs:example.com": ["ns1.dns.test", "ns2.dns.test"], "resolveNs:nx.test": dnsError("ENOTFOUND") } });
  const port = createAuthoritativeDnsResolver({}, { createResolver: factory, bootstrapServers: ["9.9.9.9"], timeoutMs: 1234 });
  assert.deepEqual(await port.queryNs({ zone: "example.com" }), { status: "ok", value: ["ns1.dns.test", "ns2.dns.test"] });
  assert.deepEqual(await port.queryNs({ zone: "nodata.test" }), { status: "ok", value: [] });
  assert.equal((await port.queryNs({ zone: "nx.test" })).status, "rejected");
  assert.deepEqual(created[0]!.options, { timeout: 1234, tries: 1 });
});

test("the default factory builds a real node:dns Resolver without sending anything", () => {
  const port = createAuthoritativeDnsResolver();
  assert.equal(typeof port.query, "function");
  assert.equal(typeof port.queryNs, "function");
});
