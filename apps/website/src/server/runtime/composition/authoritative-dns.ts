/**
 * @file The production `AuthoritativeDnsPort` (Jini `@jini-ai/devops/dns`): thin wiring of Jini's
 * `node:dns` resolver (`@jini-ai/devops/dns/node`) with this host's address policy.
 *
 * The resolver itself (record queries asked of the zone's own nameserver, the delegation read from
 * the parent's servers, the result convention) is generic and lives in Jini. What is Tovu's is the
 * policy: a nameserver whose only addresses are not `public` by the host's HTTP address classifier
 * is refused as `unknown`, so a hostile zone cannot point the probe at internal port 53.
 */
import {
  AUTHORITATIVE_DNS_TIMEOUT_MS,
  createNodeAuthoritativeDnsResolver,
  type DnsResolverLike,
  type NodeAuthoritativeDnsResolverOptions,
} from "@jini-ai/devops/dns/node";
import type { AuthoritativeDnsPort } from "@jini-ai/devops/dns";
import { classifyAddress } from "#src/platform/http/client";

export { AUTHORITATIVE_DNS_TIMEOUT_MS, type DnsResolverLike };

/** The host policy: only addresses the HTTP client would call public may be queried. */
export const isPublicDnsAddress = ({ address }: { address: string }): boolean => classifyAddress(address) === "public";

/**
 * Build the adapter.
 * @param optional - Passed through to Jini (resolver factory, bootstrap servers, timeout, exchange).
 * @complexity O(1) setup; see Jini's resolver for per-query cost.
 * @example createAuthoritativeDnsResolver({})
 */
export function createAuthoritativeDnsResolver(
  _required: Record<string, never> = {},
  optional: NodeAuthoritativeDnsResolverOptions = {},
): AuthoritativeDnsPort {
  return createNodeAuthoritativeDnsResolver({ isPublicAddress: isPublicDnsAddress }, optional);
}
