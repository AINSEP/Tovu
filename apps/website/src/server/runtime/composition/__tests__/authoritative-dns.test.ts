import assert from "node:assert/strict";
import test from "node:test";
import { AUTHORITATIVE_DNS_TIMEOUT_MS, createAuthoritativeDnsResolver, isPublicDnsAddress, type DnsResolverLike } from "../authoritative-dns.js";

/**
 * @file The host wiring of Jini's `node:dns` resolver: Tovu's address policy is what decides which
 * nameserver addresses may be queried. The resolver's own behaviour is tested in Jini
 * (`packages/devops/src/dns/node/__tests__`).
 */

const enodata = () => Object.assign(new Error("ENODATA"), { code: "ENODATA" });

/** A fake Resolver: `answers[server][method:name]`; anything else is NODATA. */
function fakeFactory(answers: Record<string, Record<string, unknown>>) {
  const created: Array<{ options: { timeout: number; tries: number }; servers: string[] }> = [];
  const factory = (options: { timeout: number; tries: number }): DnsResolverLike => {
    const state = { options, servers: ["system"] };
    created.push(state);
    const answer = (method: string) => async (name: string) => {
      const value = answers[state.servers.join(",")]?.[`${method}:${name}`];
      if (value === undefined) throw enodata();
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

test("the host policy: public addresses only", () => {
  assert.equal(isPublicDnsAddress({ address: "8.8.8.8" }), true);
  assert.equal(isPublicDnsAddress({ address: "10.0.0.53" }), false);
  assert.equal(isPublicDnsAddress({ address: "::1" }), false);
});

test("a nameserver with only non-public addresses is refused; a public one is queried at its own address", async () => {
  const { created, factory } = fakeFactory({
    system: { "resolve4:internal.dns.test": ["10.0.0.53"], "resolve4:ns1.dns.test": ["8.8.4.4"] },
    "8.8.4.4": { "resolveCname:www.example.com": ["target.host.test"] },
  });
  const port = createAuthoritativeDnsResolver({}, { createResolver: factory, timeoutMs: 1234 });
  assert.deepEqual(await port.query({ name: "example.com", type: "A", nameserver: "internal.dns.test" }), { status: "unknown", error: { code: "network", message: "The nameserver internal.dns.test has no public address." } });
  assert.deepEqual(await port.query({ name: "www.example.com", type: "CNAME", nameserver: "ns1.dns.test" }), { status: "ok", value: { answers: ["target.host.test"] } });
  assert.deepEqual(created[0]!.options, { timeout: 1234, tries: 1 });
  assert.deepEqual(created.at(-1)!.servers, ["8.8.4.4"]);
  assert.equal(AUTHORITATIVE_DNS_TIMEOUT_MS, 5_000);
});

test("the default factory builds a real node:dns Resolver without sending anything", () => {
  const port = createAuthoritativeDnsResolver();
  assert.equal(typeof port.query, "function");
  assert.equal(typeof port.queryNs, "function");
});
