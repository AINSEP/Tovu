import { parse as parseCookie } from 'cookie';
import { resolveClientIp, type ClientIpSource, type RateLimiter } from '#src/contracts/core/rate-limit/rate-limit';

/** Only the trusted IP source and configured header lookup belong to the consent request port. */
interface ConsentRequest extends ClientIpSource {
  get(name: string): string | undefined;
}

/** Header trust is an operator/edge contract: no header is consumed unless explicitly configured.
 * A trusted proxy must strip visitor-supplied values and set ISO subdivision codes (US-CA).
 * Unknown/absent regions become opt-in in the package policy. @complexity O(1). */
export function createSiteConsentRequestPorts({ trustedRegionHeader, origin, rateLimiter, rateLimitKey = ({ address }) => address }: { trustedRegionHeader?: string; origin: (required: { request: ConsentRequest }) => string; rateLimiter: RateLimiter; rateLimitKey?: (required: { address: string }) => string }, _options = {}) {
  return {
    allowWrite: async ({ request }: { request: ConsentRequest }, _optional = {}) => (await rateLimiter.check({ key: rateLimitKey({ address: resolveClientIp(request) }) })).allowed,
    origin: (input: { request: ConsentRequest }, _optional = {}) => new URL(origin(input)).origin,
    region: ({ request }: { request: ConsentRequest }, _optional = {}): string | null => {
      if (!trustedRegionHeader) return null;
      return request.get(trustedRegionHeader) ?? null;
    },
    readReceiptId: ({ cookieHeader }: { cookieHeader: string }, _optional = {}): string | null => {
      const id = parseCookie(cookieHeader).jini_consent;
      return typeof id === 'string' && /^[a-zA-Z0-9_-]{16,128}$/.test(id) ? id : null;
    },
  };
}
