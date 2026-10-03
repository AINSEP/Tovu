// Jini implementation: packages/platform/src/http/guarded/client.ts
/** Tovu HTTP wiring: Jini owns address checks, deadlines, redirects, and response bounds. */
import {
  classifyAddress as classifyGuardedAddress,
  createHttpClient as createGuardedHttpClient,
  createNodeGuardedHttpPorts,
  defaultPlatformMessages,
  EgressRefusedError,
  type AddressClass,
  type GuardedClock,
  type DnsResolver,
  type EgressPolicy,
} from "@jini-ai/platform/http/guarded";
import type { HttpClientPort as JiniHttpClientPort } from "@jini-ai/core/primitives";
import type { HttpClientPort, HttpTransportAdapter } from "./ports.js";

export type { AddressClass } from "@jini-ai/platform/http/guarded";
// GitHub rejects otherwise valid authenticated requests without a User-Agent with a bare 403.
// Keep an honest product identifier here; a live package-version read adds filesystem/layout
// coupling to every outbound request for a header that can be bumped with the package version.
const DEFAULT_USER_AGENT = "Tovu/0.1.0";
const EGRESS_REFUSED_MESSAGE = "egress to the requested host was refused by this site's outbound network policy";

/** Keeps the existing request ABI and host refusal copy without exposing internal DNS details.
 * Only the neutral fallback is replaced; explicit safe hostname/classification messages survive.
 * Operational errors propagate unchanged, and the refusal keeps Jini's exported class identity.
 */
function toTovuHttpClient({ client }: { client: JiniHttpClientPort }): HttpClientPort {
  return {
    async send(request) {
      try {
        return await client.send({ request });
      } catch (error) {
        if (error instanceof EgressRefusedError && error.callerSafeMessage === defaultPlatformMessages.egressRefused()) {
          throw new EgressRefusedError({ message: error.message }, { callerSafeMessage: EGRESS_REFUSED_MESSAGE });
        }
        throw error;
      }
    },
  };
}

/** Preserves the host DNS diagnostic contract; malformed addresses fail closed in Jini. */
export function classifyAddress(ip: string): AddressClass {
  return classifyGuardedAddress({ ip });
}

/** Adapts existing transport/consumer contracts without exposing an unguarded client.
 * Inject DNS and clock ports for deterministic guard checks; native defaults perform no I/O here.
 * @example createHttpClient({ transport, policy }, { dns, clock })
 */
export function createHttpClient(
  { transport, policy }: { transport: HttpTransportAdapter; policy: EgressPolicy },
  optional: { dns?: DnsResolver; clock?: GuardedClock } = {}
): HttpClientPort {
  const native = createNodeGuardedHttpPorts({});
  const client = createGuardedHttpClient({
    transport: { requestPinned: ({ request, peer }) => transport.requestPinned(request, peer) },
    policy,
    dns: optional.dns ?? native.dns,
    clock: optional.clock ?? native.clock,
    userAgent: DEFAULT_USER_AGENT,
  });
  return toTovuHttpClient({ client });
}

/** Binds Tovu's egress policy and user agent to the native pinned transport. */
export function createDefaultHttpClient(policy: EgressPolicy): HttpClientPort {
  const native = createNodeGuardedHttpPorts({});
  const client = createGuardedHttpClient({ ...native, policy, userAgent: DEFAULT_USER_AGENT });
  return toTovuHttpClient({ client });
}
