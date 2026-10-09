/**
 * @file The ONE way an end-to-end harness lets a guarded outbound client reach a fixture server on
 * this machine, without weakening any production path.
 *
 * Every assistant-supplied URL (`web_fetch_page`, `media_import_from_url`) goes through a guarded
 * client that refuses loopback, and media import also refuses plain `http:`. A site-import journey
 * needs a whole fixture website, and an offline one can only live on `127.0.0.1`. So this module
 * opens exactly the origins a harness names, and nothing else:
 *
 * - **Exact origins only.** Scheme + loopback literal + explicit port (`http://127.0.0.1:41234`).
 *   Another port on the same loopback host, `localhost` (DNS-resolved, so rebindable), or any other
 *   private address is still refused.
 * - **Checked on every hop.** The guard calls the transport once per hop with the hop's own URL and
 *   pinned peer, so the check lives there: a redirect from an allowed origin to another loopback
 *   port, or a non-allowed `http:` hop, is refused at the hop that introduces it. Other private
 *   ranges never reach the transport at all (the guard's own address check still runs for them).
 * - **Injected, never read from env.** A composition root receives the list from a harness-only
 *   entrypoint (`development/e2e/support/site-import-api.ts`). `apps/website/src/index.ts` and
 *   `tovu serve` pass none, and with none {@link createTestOriginHttpClientFactory} returns
 *   `createDefaultHttpClient` itself, so production builds exactly the clients it built before.
 *
 * Architectural role: `platform/http` Tier-2 library, composition-root-facing, like `client.ts`.
 */
import { createNodeGuardedHttpPorts, EgressRefusedError, type DnsResolver, type EgressPolicy } from "@jini-ai/platform/http/guarded";
import { classifyAddress, createDefaultHttpClient, createHttpClient, type HttpClientOptions } from "./client.js";
import type { HttpClientPort, HttpTransportAdapter } from "./ports.js";

/** Same shape as `createDefaultHttpClient`, so a composition root can take either. */
export type EgressHttpClientFactory = (policy: EgressPolicy, options?: HttpClientOptions) => HttpClientPort;

const LOOPBACK_LITERALS = new Set(["127.0.0.1", "[::1]"]);
const REFUSED_HOP_MESSAGE = "egress to the requested host was refused by this site's outbound network policy";

/**
 * Validates and normalizes harness-supplied origins. Throws on anything that is not
 * `http(s)://<loopback literal>:<explicit port>` with no path, so a typo fails the harness loudly
 * instead of silently opening (or silently not opening) a host.
 * @returns The normalized `URL.origin` strings.
 * @complexity O(n) in the number of origins.
 */
export function parseTestOrigins({ origins }: { origins: readonly string[] }): ReadonlySet<string> {
  const parsed = new Set<string>();
  for (const raw of origins) {
    let url: URL;
    try { url = new URL(raw); } catch { throw new TypeError(`test origin '${raw}' is not a URL`); }
    const exact = (url.protocol === "http:" || url.protocol === "https:") && LOOPBACK_LITERALS.has(url.hostname)
      && url.port !== "" && raw.replace(/\/$/, "") === url.origin && !url.username && !url.password;
    if (!exact) throw new TypeError(`test origin '${raw}' must be http(s)://127.0.0.1:<port> or http(s)://[::1]:<port>, nothing more`);
    parsed.add(url.origin);
  }
  return parsed;
}

/**
 * Per-hop check over the policy the caller asked for: an allowed origin passes; any other hop must
 * satisfy that ORIGINAL policy's scheme list and private-address rule, which the widened policy
 * handed to the guard no longer enforces for loopback.
 */
function refuseUnlistedHop(
  { allowed, policy, transport }: { allowed: ReadonlySet<string>; policy: EgressPolicy; transport: HttpTransportAdapter },
): HttpTransportAdapter {
  return {
    requestPinned(request, peer) {
      const url = new URL(request.url);
      if (!allowed.has(url.origin)) {
        const host = url.hostname.replace(/^\[|\]$/g, "");
        const schemeRefused = !policy.allowedSchemes.includes(url.protocol.slice(0, -1));
        const addressRefused = policy.denyPrivateAddresses && !policy.devHostAllowlist.includes(host) && classifyAddress(peer.ip) !== "public";
        if (schemeRefused || addressRefused) {
          throw new EgressRefusedError({ message: `egress to '${url.origin}' rejected: not an allowed test origin` }, { callerSafeMessage: REFUSED_HOP_MESSAGE });
        }
      }
      return transport.requestPinned(request, peer);
    },
  };
}

/**
 * Builds the client factory a composition root uses for assistant-supplied URLs.
 * @param required.allowedOrigins - Harness-supplied exact loopback origins; empty in production.
 * @param optional.transport/dns - Test seams; default to the native pinned transport and resolver.
 * @returns `createDefaultHttpClient` when the list is empty; otherwise a factory whose clients may
 *   also reach exactly those origins (plain `http:` included) and nothing else the policy refuses.
 * @complexity O(1) per hop (set lookup + address classification).
 */
export function createTestOriginHttpClientFactory(
  { allowedOrigins }: { allowedOrigins: readonly string[] },
  { transport, dns }: { transport?: HttpTransportAdapter; dns?: DnsResolver } = {},
): EgressHttpClientFactory {
  if (allowedOrigins.length === 0) return createDefaultHttpClient;
  const allowed = parseTestOrigins({ origins: allowedOrigins });
  const origins = [...allowed].map((origin) => new URL(origin));
  return (policy, options = {}) => {
    const native = createNodeGuardedHttpPorts({});
    const widened: EgressPolicy = {
      ...policy,
      allowedSchemes: [...new Set([...policy.allowedSchemes, ...origins.map((url) => url.protocol.slice(0, -1))])],
      devHostAllowlist: [...new Set([...policy.devHostAllowlist, ...origins.map((url) => url.hostname.replace(/^\[|\]$/g, ""))])],
    };
    const base: HttpTransportAdapter = transport ?? { requestPinned: (request, peer) => native.transport.requestPinned({ request, peer }) };
    return createHttpClient(
      { transport: refuseUnlistedHop({ allowed, policy, transport: base }), policy: widened },
      { dns: dns ?? native.dns, clock: native.clock, ...options },
    );
  };
}
