/**
 * @file The production `AuthoritativeDnsPort` (Jini `@jini-ai/devops/dns`) over `node:dns`.
 *
 * `query` asks the zone's OWN nameserver (its hostname resolved to an address, then a fresh
 * `Resolver` pointed at it with `setServers`), so "propagated" means the source of truth answers,
 * not a recursive cache. `queryNs` reads the NS set through the bootstrap (recursive) resolver: it
 * reports what the delegated servers publish, a close stand-in for the parent's delegation.
 *
 * Every failure maps onto the kernel's result convention and never throws: NXDOMAIN → rejected
 * `not_found`, NODATA → ok with no answers, anything else (timeout, refused, SERVFAIL) → `unknown`.
 * A nameserver whose only addresses are non-public is refused as `unknown`, so a hostile zone
 * cannot point the probe at internal port 53.
 */
import { isIP } from "node:net";
import { Resolver } from "node:dns/promises";
import { providerOk, providerRejected, providerUnknown, type ProviderResult } from "@jini-ai/core/provider-registry";
import type { AuthoritativeDnsPort, DnsRecordType } from "@jini-ai/devops/dns";
import { classifyAddress } from "#src/platform/http/client";

/** The `node:dns/promises` Resolver surface this adapter uses; tests inject a fake. */
export type DnsResolverLike = Pick<Resolver, "setServers" | "resolve4" | "resolve6" | "resolveCname" | "resolveTxt" | "resolveMx" | "resolveCaa" | "resolveNs" | "resolveSrv">;

/** One c-ares try per query: a slow server is `unknown` quickly and the verifier retries later. */
export const AUTHORITATIVE_DNS_TIMEOUT_MS = 5_000;

type Answers = { answers: string[]; ttl?: number };
type Reader = (resolver: DnsResolverLike, name: string) => Promise<Answers>;

const minTtl = (records: readonly { ttl: number }[]): number | undefined => (records.length === 0 ? undefined : Math.min(...records.map(record => record.ttl)));
const quote = (chunk: string): string => `"${chunk.replace(/(["\\])/g, "\\$1")}"`;
const CAA_TAGS = ["issue", "issuewild", "iodef"] as const;

/** Presentation-format answers per type, the format the kernel's parsers read. */
const READERS: Readonly<Record<Exclude<DnsRecordType, "ALIAS">, Reader>> = {
  A: async (resolver, name) => { const records = await resolver.resolve4(name, { ttl: true }); return { answers: records.map(record => record.address), ttl: minTtl(records) }; },
  AAAA: async (resolver, name) => { const records = await resolver.resolve6(name, { ttl: true }); return { answers: records.map(record => record.address), ttl: minTtl(records) }; },
  CNAME: async (resolver, name) => ({ answers: await resolver.resolveCname(name) }),
  // Character-strings stay quoted so the kernel re-joins a long (chunked) TXT value exactly.
  TXT: async (resolver, name) => ({ answers: (await resolver.resolveTxt(name)).map(chunks => chunks.map(quote).join(" ")) }),
  MX: async (resolver, name) => ({ answers: (await resolver.resolveMx(name)).map(record => `${record.priority} ${record.exchange}`) }),
  CAA: async (resolver, name) => ({
    answers: (await resolver.resolveCaa(name)).flatMap(record => CAA_TAGS.filter(tag => record[tag] !== undefined).map(tag => `${record.critical} ${tag} ${quote(record[tag] as string)}`)),
  }),
  NS: async (resolver, name) => ({ answers: await resolver.resolveNs(name) }),
  SRV: async (resolver, name) => ({ answers: (await resolver.resolveSrv(name)).map(record => `${record.priority} ${record.weight} ${record.port} ${record.name}`) }),
};

/** NXDOMAIN / NODATA / transport failure, per the port's result convention. */
async function settle<T>(call: () => Promise<T>, empty: T): Promise<ProviderResult<T>> {
  try {
    return providerOk({ value: await call() });
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === "ENODATA") return providerOk({ value: empty });
    if (code === "ENOTFOUND") return providerRejected({ code: "not_found", message: "The name does not exist." });
    if (code === "ETIMEOUT") return providerUnknown({ code: "timeout", message: "The DNS server did not answer in time." });
    return providerUnknown({ code: "network", message: "The DNS query failed before an answer arrived." });
  }
}

const publicOnly = (addresses: readonly string[]): string[] => addresses.filter(address => classifyAddress(address) === "public");

/**
 * Build the adapter.
 * @param optional.createResolver - Resolver factory (default `new Resolver(options)`).
 * @param optional.bootstrapServers - Recursive servers for NS reads; default the system's.
 * @param optional.timeoutMs - Per-query timeout; default {@link AUTHORITATIVE_DNS_TIMEOUT_MS}.
 * @complexity O(1) setup; each `query` is ≤ 3 DNS round trips (NS address A + AAAA, then the record).
 * @example createAuthoritativeDnsResolver({})
 */
export function createAuthoritativeDnsResolver(
  _required: Record<string, never> = {},
  optional: { createResolver?: (options: { timeout: number; tries: number }) => DnsResolverLike; bootstrapServers?: string[]; timeoutMs?: number } = {},
): AuthoritativeDnsPort {
  const options = { timeout: optional.timeoutMs ?? AUTHORITATIVE_DNS_TIMEOUT_MS, tries: 1 };
  const create = optional.createResolver ?? (resolverOptions => new Resolver(resolverOptions));
  const bootstrap = create(options);
  if (optional.bootstrapServers !== undefined) bootstrap.setServers(optional.bootstrapServers);

  /** The nameserver's first public address (an address literal is used as given, if public). */
  const nameserverAddress = async (nameserver: string): Promise<string | undefined> => {
    if (isIP(nameserver) !== 0) return publicOnly([nameserver])[0];
    const [v4, v6] = await Promise.all([settle(() => bootstrap.resolve4(nameserver), []), settle(() => bootstrap.resolve6(nameserver), [])]);
    const addresses = [v4, v6].flatMap(result => (result.status === "ok" ? result.value : []));
    return publicOnly(addresses)[0];
  };

  return {
    queryNs: ({ zone }) => settle(() => bootstrap.resolveNs(zone), []),
    query: async ({ name, type, nameserver }) => {
      if (type === "ALIAS") return providerRejected({ code: "unsupported", message: "ALIAS is a DNS-host feature, not a record type a nameserver serves." });
      const address = await nameserverAddress(nameserver);
      if (address === undefined) return providerUnknown({ code: "network", message: `The nameserver ${nameserver} has no public address.` });
      const resolver = create(options);
      resolver.setServers([address]);
      return settle(() => READERS[type](resolver, name), { answers: [] });
    },
  };
}
