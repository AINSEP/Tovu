/**
 * @file Composition of the DNS change tools' ports (domains & DNS lots D1–D3).
 *
 * One authoritative resolver and one DNS provider registry per process: Jini's
 * `createDnsProviderRegistry` seeds the built-in `manual` provider as the default. Vendor providers
 * (plugin `tovu-dns-providers.json` contributions) are a later lot; nothing contributes one yet.
 * The binding store is per workspace and exists only where the composition has a content database.
 */
import type { HttpClientPort } from "#src/platform/http/index";
import { createDnsProviderRegistry, type AuthoritativeDnsPort } from "@jini-ai/devops/dns";
import { createDomainBindingStore, type DnsChangeToolDeps } from "#src/features/domain-dns/index";
import type { RouteDeps } from "../../routes/types.js";
import { createAuthoritativeDnsResolver } from "./authoritative-dns.js";

type DnsRouteDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "contentKernel">;

/**
 * Build the per-request deps factory; the resolver and registry are shared across requests.
 * @param required.httpClient - The guarded Tovu client a vendor provider would call (unused by `manual`),
 *   adapted to Jini's object-shaped `send({ request })`.
 * @param optional.resolver - Authoritative resolver; default the `node:dns` adapter.
 * @param optional.now - Clock; default `Date.now`.
 * @complexity O(1) per call; no I/O until a tool runs.
 * @example createDnsChangeDepsFactory({ httpClient })(routeDeps)
 */
export function createDnsChangeDepsFactory(
  required: { httpClient: HttpClientPort },
  optional: { resolver?: AuthoritativeDnsPort; now?: () => number } = {},
): (routeDeps: DnsRouteDeps) => DnsChangeToolDeps {
  const resolver = optional.resolver ?? createAuthoritativeDnsResolver();
  const registry = createDnsProviderRegistry({ resolver });
  const now = optional.now ?? Date.now;
  const httpClient = { send: ({ request }: { request: Parameters<HttpClientPort["send"]>[0] }) => required.httpClient.send(request) };
  return routeDeps => ({
    workspaceId: routeDeps.workspaceId,
    authorize: routeDeps.authorize,
    registry,
    resolver,
    // Vendor credentials are resolved per provider in a later lot; `manual` needs none.
    context: { workspaceId: routeDeps.workspaceId, mode: "live", credentials: {}, httpClient, now },
    ...(routeDeps.contentKernel ? { bindings: createDomainBindingStore({ kernel: routeDeps.contentKernel, workspaceId: routeDeps.workspaceId }) } : {}),
    now,
  });
}
